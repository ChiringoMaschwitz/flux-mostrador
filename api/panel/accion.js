// POST /api/panel/accion — { accion: producto_guardar | producto_agotado | producto_mover |
//                             seccion_guardar | seccion_mover | local_guardar | usuario_guardar, … }
import { manejar, responder, leerCuerpo } from '../../lib/http.js';
import { requerirSesion } from '../../lib/sesion.js';
import { hacer } from '../../lib/panel.js';

export default manejar(['POST'], async (req, res) => {
  const yo = await requerirSesion(req);
  const cuerpo = await leerCuerpo(req);
  const r = await hacer(yo, cuerpo);
  responder(res, 200, { ok: true, ...r });
});
