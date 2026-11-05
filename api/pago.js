// GET /api/pago?ref=… — al volver de Mercado Pago, la página pregunta si el pago entró.
import { db } from '../lib/db.js';
import { LOCAL } from '../lib/carta.js';
import { pedidoPor, confirmarPago, respuesta } from '../lib/cobro.js';
import { manejar, responder, consulta, error } from '../lib/http.js';

export default manejar(['GET'], async (req, res) => {
  const ref = String(consulta(req).ref || '').slice(0, 60);
  if (!/^[0-9a-f-]{36}$/.test(ref)) throw error(400, 'REF', 'Referencia de pago no válida.');
  const p = await pedidoPor('mp_ref', ref);
  if (!p) throw error(404, 'NO_ESTA', 'No encontramos ese pedido.');
  const estado = await confirmarPago(p);
  if (estado !== 'pagado') return responder(res, 200, { ok: true, estado });
  const l = await db().query('select whatsapp from locales where id = $1', [LOCAL]);
  const fresco = await pedidoPor('id', p.id);
  return responder(res, 200, { ok: true, estado, pedido: respuesta(fresco, l.rows[0] && l.rows[0].whatsapp) });
});
