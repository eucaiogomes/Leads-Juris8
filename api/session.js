import { setSecurityHeaders } from './lib/utils.js';
// import { isAuthenticated } from './lib/auth.js';  // desabilitado no modo teste

export default async function handler(req, res) {
  setSecurityHeaders(res);

  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  // MODO TESTE: sempre autenticado (sem segurança)
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ authenticated: true }));
}
