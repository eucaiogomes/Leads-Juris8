import { setSecurityHeaders, sendJson, readJsonBody, clean } from './lib/utils.js';
import { isAuthenticated } from './lib/auth.js';
import { updateLeadInSupabase } from './lib/supabase.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'PATCH') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  if (!isAuthenticated(req)) {
    return sendJson(res, 401, { error: 'Sessão expirada.' });
  }

  // Get id from Vercel dynamic route param
  let id = '';
  if (req.query) {
    id = req.query.id || (Array.isArray(req.query.id) ? req.query.id[0] : '');
  }
  if (!id) {
    return sendJson(res, 400, { error: 'ID inválido.' });
  }

  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, error.status || 400, { error: error.message });
  }

  const allowedStatuses = new Set(['novo', 'contatado', 'qualificado', 'convertido', 'descartado']);
  const status = clean(payload.status, 30);
  const notes = clean(payload.notes, 2000);

  if (!allowedStatuses.has(status)) {
    return sendJson(res, 422, { error: 'Status inválido.' });
  }

  try {
    const updated = await updateLeadInSupabase(id, { status, notes });

    if (!updated) {
      return sendJson(res, 404, { error: 'Lead não encontrado.' });
    }
    return sendJson(res, 200, { lead: updated });
  } catch (err) {
    console.error('Update lead error:', err);
    const msg = err.message || 'Não foi possível atualizar o lead.';
    return sendJson(res, err.status || 502, { error: msg });
  }
}
