// POST /api/mp/aviso — Mercado Pago avisa que cambió una order. Se verifica la firma y se le pregunta el estado a Mercado Pago.
import { pedidoPor, confirmarPago } from '../../lib/cobro.js';
import { firmaValida, leerOrden } from '../../lib/mp.js';
import { manejar, responder, consulta, leerCuerpo } from '../../lib/http.js';

export default manejar(['POST'], async (req, res) => {
  const q = consulta(req);
  const cuerpo = await leerCuerpo(req).catch(() => ({}));
  const tipo = q.type || cuerpo.type;
  const id = q['data.id'] || (cuerpo.data && cuerpo.data.id);
  if (tipo !== 'order' || !id) return responder(res, 200, { ok: true, ignorado: true });
  if (!firmaValida(req.headers, id)) return responder(res, 401, { ok: false, error: 'FIRMA' });
  let p = await pedidoPor('mp_order_id', id);
  if (!p) {
    const o = await leerOrden(id).catch(() => null);
    if (o && o.external_reference) p = await pedidoPor('mp_ref', o.external_reference);
  }
  if (!p) return responder(res, 200, { ok: true, sin_pedido: true });
  const estado = await confirmarPago(p);
  return responder(res, 200, { ok: true, estado });
});
