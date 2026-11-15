// POST /api/mp/aviso — Mercado Pago avisa que cambió una order. Se verifica la firma y se le pregunta el estado a Mercado Pago.
// Cada aviso deja un renglón en los registros de Vercel (sin claves), así se sabe por qué se aceptó o se rechazó.
import { pedidoPor, confirmarPago } from '../../lib/cobro.js';
import { firmaValida, leerOrden } from '../../lib/mp.js';
import { manejar, responder, consulta, leerCuerpo } from '../../lib/http.js';

export default manejar(['POST'], async (req, res) => {
  const q = consulta(req);
  const cuerpo = await leerCuerpo(req).catch(() => ({}));
  const tipo = q.type || cuerpo.type;
  const id = q['data.id'] || (cuerpo.data && cuerpo.data.id);
  const accion = cuerpo.action || '';
  if (tipo !== 'order' || !id) {
    console.warn('Aviso MP ignorado', JSON.stringify({ tipo: tipo || null, id: id || null, accion }));
    return responder(res, 200, { ok: true, ignorado: true });
  }
  if (!firmaValida(req.headers, id)) {
    console.warn('Aviso MP rechazado: la firma no coincide (revisar MP_WEBHOOK_SECRET)', JSON.stringify({
      id, accion, con_firma: !!req.headers['x-signature'], con_request_id: !!req.headers['x-request-id'],
      id_en_url: !!q['data.id']
    }));
    return responder(res, 401, { ok: false, error: 'FIRMA' });
  }
  let p = await pedidoPor('mp_order_id', id);
  if (!p) {
    const o = await leerOrden(id).catch(() => null);
    if (o && o.external_reference) p = await pedidoPor('mp_ref', o.external_reference);
  }
  if (!p) {
    console.warn('Aviso MP sin pedido', JSON.stringify({ id, accion }));
    return responder(res, 200, { ok: true, sin_pedido: true });
  }
  const estado = await confirmarPago(p);
  console.log('Aviso MP', JSON.stringify({ id, accion, pedido: p.id, numero: p.numero, estado }));
  return responder(res, 200, { ok: true, estado });
});
