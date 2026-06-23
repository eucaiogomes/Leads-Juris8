import { setSecurityHeaders, sendJson } from './lib/utils.js';
import { clearSessionCookie } from './lib/auth.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  clearSessionCookie(res);
  return sendJson(res, 200, { ok: true });
}
