import { setSecurityHeaders, sendJson, readJsonBody, applyCors, handleCorsPreflight, clean, validDate } from './lib/utils.js';
import { isAuthenticated } from './lib/auth.js';
import { randomUUID } from 'node:crypto';
import { readLeads, insertLeadToSupabase } from './lib/supabase.js';

const ALLOWED_ORIGINS = new Set(
  (process.env.LEAD_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
);

export default async function handler(req, res) {
  setSecurityHeaders(res);

  // OPTIONS for CORS (public leads)
  if (req.method === 'OPTIONS') {
    return handleCorsPreflight(req, res, ALLOWED_ORIGINS);
  }

  // POST /api/leads - public (landing page)
  if (req.method === 'POST') {
    if (!applyCors(req, res, ALLOWED_ORIGINS)) {
      return sendJson(res, 403, { error: 'Origem não autorizada.' });
    }

    // Very basic rate limit per invocation (serverless limitation)
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (error) {
      return sendJson(res, error.status || 400, { error: error.message });
    }

    if (clean(payload.website, 80)) {
      return sendJson(res, 200, { ok: true });
    }

    const lead = {
      id: randomUUID(),
      name: clean(payload.nome, 120),
      email: clean(payload.email, 180).toLowerCase(),
      whatsapp: clean(payload.whatsapp, 30),
      office: clean(payload.escritorio, 160),
      cnpjs: clean(payload.quantidade_cnpjs, 30) || 'Não informado',
      interest: clean(payload.interesse, 160) || 'Falar com a equipe',
      page: clean(payload.pagina, 500),
      consent: Boolean(payload.consentimento),
      status: 'novo',
      notes: '',
      submittedAt: validDate(payload.enviado_em) || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const phoneDigits = lead.whatsapp.replace(/\D/g, '');
    if (!lead.name || !lead.email || !lead.office || phoneDigits.length < 10 || !lead.consent) {
      return sendJson(res, 422, { error: 'Preencha todos os dados obrigatórios.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
      return sendJson(res, 422, { error: 'Informe um e-mail válido.' });
    }

    try {
      await insertLeadToSupabase(lead);
    } catch (err) {
      console.error('Insert lead error:', err);
      const msg = err.message || 'Não foi possível salvar o lead.';
      return sendJson(res, err.status || 502, { error: msg });
    }

    return sendJson(res, 201, { ok: true, id: lead.id });
  }

  // GET /api/leads - protected
  if (req.method === 'GET') {
    if (!isAuthenticated(req)) {
      return sendJson(res, 401, { error: 'Sessão expirada.' });
    }

    try {
      const leads = await readLeads();
      leads.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
      return sendJson(res, 200, { leads });
    } catch (err) {
      console.error('Read leads error:', err);
      return sendJson(res, err.status || 502, { error: err.message || 'Erro ao buscar leads.' });
    }
  }

  return sendJson(res, 405, { error: 'Method not allowed' });
}
