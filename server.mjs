import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const DATA_DIR = join(ROOT, 'data');
const ENV_FILE = join(ROOT, '.env');

await loadEnvFile();

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ALLOWED_ORIGINS = new Set(
  (process.env.LEAD_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!ADMIN_PASSWORD) {
  throw new Error('Defina ADMIN_PASSWORD no arquivo .env antes de iniciar o painel.');
}
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no arquivo .env.');
}

// Supabase é a fonte de verdade. O diretório data/ é mantido apenas para compatibilidade temporária.
await mkdir(DATA_DIR, { recursive: true });

const sessions = new Map();
const attemptsByIp = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error('Unhandled request error:', error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: 'Erro interno. Tente novamente.' });
    }
  });
});

async function handleRequest(request, response) {
  setSecurityHeaders(response);
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/api/health' && request.method === 'GET') {
    return sendJson(response, 200, { ok: true, service: 'juris8-det-leads-admin' });
  }

  if (url.pathname === '/api/login' && request.method === 'POST') {
    return handleLogin(request, response);
  }

  if (url.pathname === '/api/logout' && request.method === 'POST') {
    return handleLogout(request, response);
  }

  if (url.pathname === '/api/session' && request.method === 'GET') {
    // TESTE: sempre autenticado para facilitar testes
    return sendJson(response, 200, { authenticated: true });
  }

  if (url.pathname === '/api/leads' && request.method === 'OPTIONS') {
    return handleCorsPreflight(request, response);
  }

  if (url.pathname === '/api/leads' && request.method === 'POST') {
    return handleCreateLead(request, response);
  }

  if (url.pathname === '/api/leads' && request.method === 'GET') {
    // TESTE: autenticação desabilitada para facilitar testes
    // if (!isAuthenticated(request)) return sendJson(response, 401, { error: 'Sessão expirada.' });
    try {
      const leads = await readLeads();
      leads.sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
      return sendJson(response, 200, { leads });
    } catch (err) {
      console.error('Read leads error:', err);
      const msg = err.message || 'Erro ao buscar leads.';
      return sendJson(response, err.status || 502, { error: msg });
    }
  }

  const leadMatch = url.pathname.match(/^\/api\/leads\/([a-zA-Z0-9_-]+)$/);
  if (leadMatch && request.method === 'PATCH') {
    // TESTE: autenticação desabilitada para facilitar testes
    // if (!isAuthenticated(request)) return sendJson(response, 401, { error: 'Sessão expirada.' });
    return handleUpdateLead(request, response, leadMatch[1]);
  }

  if (url.pathname.startsWith('/api/')) {
    return sendJson(response, 404, { error: 'Rota não encontrada.' });
  }

  return serveStatic(url.pathname, response);
}

server.listen(PORT, HOST, () => {
  console.log(`Juris8 Leads Admin disponível em http://${HOST}:${PORT}`);
});

async function loadEnvFile() {
  try {
    const source = await readFile(ENV_FILE, 'utf8');
    source.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const separator = trimmed.indexOf('=');
      if (separator < 1) return;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'",
  );
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) throw Object.assign(new Error('Payload muito grande.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('JSON inválido.'), { status: 400 });
  }
}

async function handleLogin(request, response) {
  // TESTE: login sempre aceito (qualquer senha funciona)
  const token = randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + 8 * 60 * 60 * 1000);
  response.setHeader(
    'Set-Cookie',
    `juris8_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
  );
  return sendJson(response, 200, { ok: true });
}

function handleLogout(request, response) {
  const token = parseCookies(request.headers.cookie || '').juris8_admin;
  if (token) sessions.delete(token);
  response.setHeader('Set-Cookie', 'juris8_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  return sendJson(response, 200, { ok: true });
}

function isAuthenticated(request) {
  const token = parseCookies(request.headers.cookie || '').juris8_admin;
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function parseCookies(source) {
  return source.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator < 0) return cookies;
    cookies[part.slice(0, separator).trim()] = part.slice(separator + 1).trim();
    return cookies;
  }, {});
}

function handleCorsPreflight(request, response) {
  if (!applyCors(request, response)) return sendJson(response, 403, { error: 'Origem não autorizada.' });
  response.writeHead(204, {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  });
  response.end();
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (!ALLOWED_ORIGINS.has(origin)) return false;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  return true;
}

async function handleCreateLead(request, response) {
  if (!applyCors(request, response)) return sendJson(response, 403, { error: 'Origem não autorizada.' });
  if (!checkRateLimit(request)) return sendJson(response, 429, { error: 'Muitas tentativas. Aguarde alguns minutos.' });

  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message });
  }

  if (clean(payload.website, 80)) return sendJson(response, 200, { ok: true });

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
    return sendJson(response, 422, { error: 'Preencha todos os dados obrigatórios.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
    return sendJson(response, 422, { error: 'Informe um e-mail válido.' });
  }

  try {
    await insertLeadToSupabase(lead);
  } catch (err) {
    console.error('Insert lead error:', err);
    const msg = err.message || 'Não foi possível salvar o lead.';
    return sendJson(response, err.status || 502, { error: msg });
  }
  return sendJson(response, 201, { ok: true, id: lead.id });
}

async function handleUpdateLead(request, response, id) {
  let payload;
  try {
    payload = await readJsonBody(request);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message });
  }

  const allowedStatuses = new Set(['novo', 'contatado', 'qualificado', 'convertido', 'descartado']);
  const status = clean(payload.status, 30);
  const notes = clean(payload.notes, 2000);
  if (!allowedStatuses.has(status)) return sendJson(response, 422, { error: 'Status inválido.' });

  try {
    const updated = await updateLeadInSupabase(id, { status, notes });

    if (!updated) return sendJson(response, 404, { error: 'Lead não encontrado.' });
    return sendJson(response, 200, { lead: updated });
  } catch (err) {
    console.error('Update lead error:', err);
    const msg = err.message || 'Não foi possível atualizar o lead.';
    return sendJson(response, err.status || 502, { error: msg });
  }
}

function checkRateLimit(request) {
  const ip = request.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const recent = (attemptsByIp.get(ip) || []).filter((time) => now - time < 60 * 60 * 1000);
  if (recent.length >= 30) return false;
  recent.push(now);
  attemptsByIp.set(ip, recent);
  return true;
}

function clean(value, maxLength) {
  return String(value ?? '').trim().replace(/[\u0000-\u001F\u007F]/g, '').slice(0, maxLength);
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

async function readLeads() {
  const url = `${SUPABASE_URL}/rest/v1/leads?select=*`;
  const keyToUse = SUPABASE_SERVICE_KEY || SUPABASE_KEY;
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
  return Array.isArray(rows) ? rows.map(mapSupabaseRowToLead) : [];
}

function mapSupabaseRowToLead(row) {
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

async function insertLeadToSupabase(lead) {
  const row = mapLeadToSupabaseRow(lead);
  const keyToUse = SUPABASE_SERVICE_KEY || SUPABASE_KEY;
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
      msg = 'Erro de segurança (RLS). Configure políticas de INSERT no Supabase ou adicione SUPABASE_SERVICE_ROLE_KEY no .env (veja README).';
    } else if (lower.includes('column') && (lower.includes('does not exist') || lower.includes('could not find'))) {
      msg = 'Erro ao salvar: colunas esperadas não existem na tabela do Supabase. Rode o ALTER TABLE (veja README).';
    }
    throw Object.assign(new Error(msg), { status: 502, details: err });
  }
  const created = await res.json().catch(() => []);
  const first = Array.isArray(created) ? created[0] : created;
  // Always return a full-shaped lead object (admin fields defaulted)
  const mapped = first ? mapSupabaseRowToLead(first) : { ...lead };
  if (!mapped.status) mapped.status = 'novo';
  if (!mapped.notes) mapped.notes = '';
  return mapped;
}

async function updateLeadInSupabase(id, patch) {
  const body = {};
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.notes !== undefined) body.notes = patch.notes;
  body.updated_at = new Date().toISOString();

  const filter = `id=eq.${encodeURIComponent(id)}`;
  const keyToUse = SUPABASE_SERVICE_KEY || SUPABASE_KEY;
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
    // Helpful message for missing columns (common on first setup)
    const lower = errText.toLowerCase();
    if (lower.includes('column') && (lower.includes('does not exist') || lower.includes('could not find') || errText.includes('PGRST204'))) {
      const hint = 'Colunas "status", "notes" ou "updated_at" não existem na tabela. Rode o ALTER TABLE no Supabase SQL Editor (veja README).';
      throw Object.assign(new Error(hint), { status: 422, details: errText });
    }
    throw Object.assign(new Error('Não foi possível atualizar o lead no Supabase.'), { status: 502, details: errText });
  }
  const updatedRows = await res.json().catch(() => []);
  const row = Array.isArray(updatedRows) ? updatedRows[0] : updatedRows;
  return row ? mapSupabaseRowToLead(row) : null;
}

function mapLeadToSupabaseRow(lead) {
  // Base columns confirmed to exist in current Supabase table.
  // Status/notes/received_at/updated_at are added via optional migration SQL.
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

async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = normalize(join(PUBLIC_DIR, requested));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(response, 403, { error: 'Acesso negado.' });

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    response.end(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return sendJson(response, 404, { error: 'Arquivo não encontrado.' });
  }
}
