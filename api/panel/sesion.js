// GET  /api/panel/sesion → quiénes pueden entrar (nombres)
// POST /api/panel/sesion → { usuario_id, pin } → token de 8 horas
import { manejar, responder, leerCuerpo } from '../../lib/http.js';
import { usuariosParaEntrar, entrar } from '../../lib/sesion.js';

export default manejar(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') return responder(res, 200, { ok: true, usuarios: await usuariosParaEntrar() });
  const b = await leerCuerpo(req);
  const r = await entrar(Number(b.usuario_id), String(b.pin || ''));
  responder(res, 200, { ok: true, ...r });
});
