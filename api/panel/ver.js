// GET /api/panel/ver?vista=carta|pedidos|historial|usuarios
import { db } from '../../lib/db.js';
import { leerCarta } from '../../lib/carta.js';
import { manejar, responder, consulta, error } from '../../lib/http.js';
import { requerirSesion } from '../../lib/sesion.js';
import { pedidosDeHoy, historial, usuarios } from '../../lib/panel.js';

export default manejar(['GET'], async (req, res) => {
  const vista = consulta(req).vista || 'carta';
  const yo = await requerirSesion(req, vista === 'usuarios' ? 'gerencia' : null);
  if (vista === 'carta') return responder(res, 200, { ok: true, yo, ...(await leerCarta(db(), { publica: false })) });
  if (vista === 'pedidos') return responder(res, 200, { ok: true, yo, pedidos: await pedidosDeHoy() });
  if (vista === 'historial') return responder(res, 200, { ok: true, yo, historial: await historial() });
  if (vista === 'usuarios') return responder(res, 200, { ok: true, yo, usuarios: await usuarios() });
  throw error(400, 'VISTA', 'Vista desconocida.');
});
