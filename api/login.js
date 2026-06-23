import { setSecurityHeaders, sendJson } from './lib/utils.js';
import { handleLogin, setSessionCookie } from './lib/auth.js';

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const result = await handleLogin(req, res);

    if (result.token) {
      setSessionCookie(res, result.token);
    }

    return sendJson(res, result.status, result.body);
  } catch (err) {
    console.error('Login error:', err);
    return sendJson(res, 500, { error: 'Erro interno no login.' });
  }
}
