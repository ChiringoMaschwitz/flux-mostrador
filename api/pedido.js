// POST /api/pedido — recibe lo que eligió el cliente, recalcula los precios con la base
// y le da su número del día.
//  - Ventana (mediodía): en modo prueba queda guardado como PRUEBA (no cobra).
//  - Delivery (noche): entra como NUEVO al panel "Noche" con los datos de entrega y la forma de pago.
import { db } from '../lib/db.js';
import { leerCarta, LOCAL, MODO_PRUEBA } from '../lib/carta.js';
import { armarPedido } from '../lib/pedido.js';
import { armarEntrega } from '../lib/entrega.js';
import { manejar, responder, leerCuerpo, error } from '../lib/http.js';

export default manejar(['POST'], async (req, res) => {
  const cuerpo = await leerCuerpo(req);
  const carta = await leerCarta(db(), { publica: true });
  const modo = carta.local.modo;
  if (!modo) throw error(409, 'CERRADO', 'Ahora no estamos tomando pedidos.');

  const { lineas, total: subtotal } = armarPedido(cuerpo.items, carta);

  let fila;
  if (modo === 'ventana') {
    if (!MODO_PRUEBA) throw error(503, 'SIN_COBRO', 'El cobro todavía no está conectado.');
    fila = { canal: 'ventana', estado: 'PRUEBA', total: subtotal, entrega: null, zona_id: null, envio: 0, cliente: null, pago: null, paga_con: null };
  } else {
    const e = armarEntrega(cuerpo, carta.zonas, subtotal, carta.pagos_online, carta.local.delivery.con_envio !== false);
    if (e.pago === 'mp') throw error(503, 'SIN_COBRO', 'El pago con Mercado Pago todavía no está conectado.');
    fila = { canal: 'delivery', estado: 'NUEVO', total: e.total, entrega: e.entrega, zona_id: e.zona_id, envio: e.envio,
      cliente: e.cliente, pago: e.pago, paga_con: e.paga_con, zona: e.zona };
  }

  // número del día: el siguiente libre; si dos pedidos llegan juntos, se reintenta
  for (let intento = 0; intento < 4; intento++) {
    try {
      const r = await db().query(
        `insert into pedidos (local_id, fecha, numero, estado, total, items, canal, entrega, zona_id, envio, cliente, pago, paga_con)
         select $1, d.f, coalesce((select max(numero) from pedidos where local_id = $1 and fecha = d.f), 0) + 1,
                $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
           from (select (now() at time zone 'America/Argentina/Buenos_Aires')::date as f) d
         returning numero, to_char(creado_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') as hora`,
        [LOCAL, fila.estado, fila.total, JSON.stringify(lineas), fila.canal, fila.entrega, fila.zona_id, fila.envio,
          fila.cliente ? JSON.stringify(fila.cliente) : null, fila.pago, fila.paga_con]);
      const p = r.rows[0];
      return responder(res, 200, {
        ok: true, modo, prueba: fila.estado === 'PRUEBA', numero: p.numero, hora: p.hora,
        subtotal, envio: fila.envio, total: fila.total, lineas,
        entrega: fila.entrega, zona: fila.zona || null, pago: fila.pago, paga_con: fila.paga_con,
        cliente: fila.cliente ? { nombre: fila.cliente.nombre } : null,
        whatsapp: carta.local.whatsapp || null
      });
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  throw error(503, 'OCUPADO', 'Hay muchos pedidos juntos. Probá de nuevo en un segundo.');
});
