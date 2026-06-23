import { randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { parseCookies, readJsonBody } from './utils.js';

const SECRET = process.env.ADMIN_PASSWORD || '';

// Stateless session using HMAC signed token
function sign(data) {
  if (!SECRET) return '';
  return createHmac('sha256', SECRET).update(data).digest('hex');
}

export function createSessionToken() {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000; // 8 hours
  const nonce = randomBytes(16).toString('hex');
  const data = `${expiresAt}:${nonce}`;
  const sig = sign(data);
  return `${data}:${sig}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string' || !SECRET) return false;

  const parts = token.split(':');
  if (parts.length !== 3) return false;

  const [expiresStr, nonce, sig] = parts;
  const data = `${expiresStr}:${nonce}`;
  const expectedSig = sign(data);

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return false;
    }
  } catch {
    return false;
  }

  const expires = Number(expiresStr);
  if (Number.isNaN(expires) || expires < Date.now()) {
    return false;
  }
  return true;
}

export function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  const token = cookies.juris8_admin;
  return verifySessionToken(token);
}

export function setSessionCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  const cookie = [
    `juris8_admin=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    'Max-Age=28800',
    isProd ? 'Secure' : '',
  ].filter(Boolean).join('; ');
  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', 'juris8_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

export async function handleLogin(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (error) {
    return { status: error.status || 400, body: { error: error.message } };
  }

  const received = Buffer.from(String(payload.password || ''));
  const expected = Buffer.from(process.env.ADMIN_PASSWORD || '');

  const valid =
    received.length === expected.length &&
    timingSafeEqual(received, expected);

  if (!valid) {
    return { status: 401, body: { error: 'Senha incorreta.' } };
  }

  const token = createSessionToken();
  // Note: caller will set the cookie on the real res
  return { status: 200, body: { ok: true }, token };
}
