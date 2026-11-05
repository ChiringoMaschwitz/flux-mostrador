// Confirmar el pago de un pedido: se le pregunta a Mercado Pago y se exige estado aprobado + mismo monto + misma referencia.
import { db } from './db.js';
import { LOCAL } from './carta.js';
import { leerOrden, pagada, fallida } from './mp.js';

const CAMPOS = `p.id, p.numero, p.estado, p.total, p.items, p.canal, p.entrega, p.envio, p.cliente, p.pago, p.paga_con,
  p.mp_ref, p.mp_order_id, p.mp_estado, z.nombre as zona,
  to_char(p.creado_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') as hora`;

export async function pedidoPor(columna, valor) {
  const r = await db().query(`select ${CAMPOS} from pedidos p left join zonas z on z.id = p.zona_id
    where p.local_id = $1 and p.${columna} = $2`, [LOCAL, valor]);
  return r.rows[0] || null;
}

// Devuelve 'pagado' | 'esperando' | 'fallido'
export async function confirmarPago(p) {
  if (p.estado !== 'PENDIENTE_PAGO') return 'pagado';
  if (!p.mp_order_id) return 'fallido';
  const o = await leerOrden(p.mp_order_id);
  const ok = pagada(o) && o.external_reference === p.mp_ref && Math.round(Number(o.total_amount)) === p.total;
  if (ok) {
    const nuevo = p.canal === 'delivery' ? 'NUEVO' : 'PAGADO';
    // el creado_at pasa a la hora del pago, así en el panel queda como pedido recién entrado
    await db().query(`update pedidos set estado = $2, mp_estado = $3, pagado_at = now(), creado_at = now(), actualizado_at = now()
      where id = $1 and estado = 'PENDIENTE_PAGO'`, [p.id, nuevo, o.status + '/' + o.status_detail]);
    return 'pagado';
  }
  await db().query('update pedidos set mp_estado = $2 where id = $1', [p.id, (o && o.status) + '/' + (o && o.status_detail)]);
  if (pagada(o)) console.error('Pago aprobado que no coincide con el pedido', p.id, o.total_amount, o.external_reference);
  return fallida(o) ? 'fallido' : 'esperando';
}

// Lo que ve el cliente en la pantalla final (misma forma que la respuesta de /api/pedido)
export function respuesta(p, whatsapp) {
  return {
    ok: true, modo: p.canal === 'delivery' ? 'delivery' : 'ventana', prueba: false, numero: p.numero, hora: p.hora,
    subtotal: p.total - (p.envio || 0), envio: p.envio || 0, total: p.total, lineas: p.items,
    entrega: p.entrega, zona: p.zona || null, pago: p.pago, paga_con: p.paga_con,
    cliente: p.cliente ? { nombre: p.cliente.nombre } : null, whatsapp: whatsapp || null
  };
}
