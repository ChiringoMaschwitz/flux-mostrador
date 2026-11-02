// POST /api/pedido — recibe lo que eligió el cliente, recalcula los precios con la base
// y le da su número del día. En la Etapa 1 queda guardado como PRUEBA (no cobra).
import { db } from '../lib/db.js';
import { leerCarta, LOCAL, MODO_PRUEBA } from '../lib/carta.js';
import { armarPedido } from '../lib/pedido.js';
import { manejar, responder, leerCuerpo, error } from '../lib/http.js';

export default manejar(['POST'], async (req, res) => {
  const cuerpo = await leerCuerpo(req);
  const carta = await leerCarta(db(), { publica: true });
  if (!carta.local.abierto) throw error(409, 'CERRADO', 'Ahora no estamos tomando pedidos al paso.');
  if (!MODO_PRUEBA) throw error(503, 'SIN_COBRO', 'El cobro todavía no está conectado.');

  const { lineas, total } = armarPedido(cuerpo.items, carta);

  // número del día: el siguiente libre; si dos pedidos llegan juntos, se reintenta
  for (let intento = 0; intento < 4; intento++) {
    try {
      const r = await db().query(
        `insert into pedidos (local_id, fecha, numero, estado, total, items)
         select $1, d.f, coalesce((select max(numero) from pedidos where local_id = $1 and fecha = d.f), 0) + 1, 'PRUEBA', $2, $3
           from (select (now() at time zone 'America/Argentina/Buenos_Aires')::date as f) d
         returning numero, to_char(creado_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') as hora`,
        [LOCAL, total, JSON.stringify(lineas)]);
      const p = r.rows[0];
      return responder(res, 200, { ok: true, prueba: true, numero: p.numero, hora: p.hora, total, lineas });
    } catch (e) {
      if (e.code !== '23505') throw e;
    }
  }
  throw error(503, 'OCUPADO', 'Hay muchos pedidos juntos. Probá de nuevo en un segundo.');
});
