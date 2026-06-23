// Supabase helpers (adapted for serverless)

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function getKey() {
  return SUPABASE_SERVICE_KEY || SUPABASE_KEY;
}

export function mapSupabaseRowToLead(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id || `lead_${Date.now()}`,
    name: row.nome || row.name || '',
    email: row.email || '',
    whatsapp: row.whatsapp || '',
    office: row.escritorio || row.office || '',
    cnpjs: row.quantidade_cnpjs || row.cnpjs || 'Não informado',
    interest: row.interesse || row.interest || '',
    page: row.pagina || row.page || '',
    consent: Boolean(row.consentimento ?? row.consent ?? false),
    status: row.status || 'novo',
    notes: row.notes || '',
    submittedAt: row.enviado_em || row.submitted_at || row.created_at || new Date().toISOString(),
    receivedAt: row.received_at || row.created_at || row.enviado_em || new Date().toISOString(),
    updatedAt: row.updated_at || row.received_at || row.created_at || new Date().toISOString(),
  };
}

function mapLeadToSupabaseRow(lead) {
  return {
    id: lead.id,
    nome: lead.name,
    email: lead.email,
    whatsapp: lead.whatsapp,
    escritorio: lead.office,
    quantidade_cnpjs: lead.cnpjs,
    interesse: lead.interest,
    pagina: lead.page || null,
    consentimento: lead.consent,
    enviado_em: lead.submittedAt,
  };
}

export async function readLeads() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw Object.assign(new Error('Supabase não configurado.'), { status: 500 });
  }

  const url = `${SUPABASE_URL}/rest/v1/leads?select=*`;
  const keyToUse = getKey();

  const res = await fetch(url, {
    headers: {
      apikey: keyToUse,
      Authorization: `Bearer ${keyToUse}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw Object.assign(new Error('Falha ao buscar leads no Supabase.'), { status: 502, details: errText });
  }

  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) ? rows.map(mapSupabaseRowToLead).filter(Boolean) : [];
}

export async function insertLeadToSupabase(lead) {
  if (!SUPABASE_URL) {
    throw Object.assign(new Error('Supabase não configurado.'), { status: 500 });
  }

  const row = mapLeadToSupabaseRow(lead);
  const keyToUse = getKey();

  const res = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
    method: 'POST',
    headers: {
      apikey: keyToUse,
      Authorization: `Bearer ${keyToUse}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    let msg = 'Não foi possível salvar o lead no Supabase.';
    const lower = err.toLowerCase();
    if (err.includes('row-level security') || err.includes('42501')) {
      msg = 'Erro de segurança (RLS). Configure políticas ou use SUPABASE_SERVICE_ROLE_KEY.';
    } else if (lower.includes('column') && (lower.includes('does not exist') || lower.includes('could not find'))) {
      msg = 'Colunas esperadas não existem na tabela do Supabase. Rode o ALTER TABLE (veja README).';
    }
    throw Object.assign(new Error(msg), { status: 502, details: err });
  }

  const created = await res.json().catch(() => []);
  const first = Array.isArray(created) ? created[0] : created;
  const mapped = first ? mapSupabaseRowToLead(first) : { ...lead };
  if (!mapped.status) mapped.status = 'novo';
  if (!mapped.notes) mapped.notes = '';
  return mapped;
}

export async function updateLeadInSupabase(id, patch) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw Object.assign(new Error('Supabase não configurado.'), { status: 500 });
  }

  const body = {};
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.notes !== undefined) body.notes = patch.notes;
  body.updated_at = new Date().toISOString();

  const filter = `id=eq.${encodeURIComponent(id)}`;
  const keyToUse = getKey();

  const res = await fetch(`${SUPABASE_URL}/rest/v1/leads?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: keyToUse,
      Authorization: `Bearer ${keyToUse}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const lower = errText.toLowerCase();
    if (lower.includes('column') && (lower.includes('does not exist') || lower.includes('could not find') || errText.includes('PGRST204'))) {
      const hint = 'Colunas "status", "notes" ou "updated_at" não existem. Rode o ALTER TABLE no Supabase.';
      throw Object.assign(new Error(hint), { status: 422, details: errText });
    }
    throw Object.assign(new Error('Não foi possível atualizar o lead no Supabase.'), { status: 502, details: errText });
  }

  const updatedRows = await res.json().catch(() => []);
  const row = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
  return row ? mapSupabaseRowToLead(row) : null;
}
