// Lee la carta del local. publica = lo que ve el cliente (solo lo activo y lo que se vende al paso).
// También dice en qué modo está la página ahora: ventana (mediodía), delivery (noche) o cerrado.
import { error } from './http.js';
import { estadoHorario } from './horario.js';

export const LOCAL = process.env.LOCAL_ID || 'PIZZERIA';
export const MODO_PRUEBA = process.env.PAGOS !== 'activo';
// VENTANA=apagada (solo en Production): la ventana no existe para el público hasta tener cobro, comandera y factura.
export const VENTANA_ACTIVA = process.env.VENTANA !== 'apagada';

export async function leerLocal(q) {
  const rl = await q.query(
    `select id, nombre, horario, estado_manual, horario_delivery, estado_manual_delivery, whatsapp
       from locales where id = $1`, [LOCAL]);
  const l = rl.rows[0];
  if (!l) throw error(500, 'SIN_LOCAL', 'Falta correr el SQL de la carta (alpaso_fase1a).');
  const ventana = { horario: l.horario, estado_manual: l.estado_manual, activa: VENTANA_ACTIVA, ...estadoHorario(l.horario, l.estado_manual) };
  if (!VENTANA_ACTIVA) ventana.abierto = false;
  const delivery = {
    horario: l.horario_delivery || {}, estado_manual: l.estado_manual_delivery || 'auto',
    ...estadoHorario(l.horario_delivery, l.estado_manual_delivery)
  };
  // si las dos están abiertas (por ejemplo, abiertas a mano para probar), manda la ventana
  const modo = ventana.abierto ? 'ventana' : delivery.abierto ? 'delivery' : null;
  return {
    id: l.id, nombre: l.nombre, whatsapp: l.whatsapp, ventana, delivery, modo, ventana_activa: VENTANA_ACTIVA,
    abierto: !!modo, hasta: modo ? (modo === 'ventana' ? ventana.hasta : delivery.hasta) : null,
    // compatibilidad con la Etapa 1
    horario: l.horario, estado_manual: l.estado_manual
  };
}

export async function leerZonas(q, { publica }) {
  const r = await q.query(
    `select id, nombre, costo, orden, activa from zonas where local_id = $1 ${publica ? 'and activa' : ''} order by orden, id`, [LOCAL]);
  return r.rows.map((z) => (publica ? { id: z.id, nombre: z.nombre, costo: z.costo } : z));
}

export async function leerCarta(q, { publica }) {
  const local = await leerLocal(q);

  const rs = await q.query(
    `select id, nombre, bajada, tipo, tema, mitades, flotante, precio_unidad, precio_media, precio_docena, dentro_de, orden, activa
       from secciones where local_id = $1 ${publica ? 'and activa' : ''} order by orden, id`, [LOCAL]);
  const rp = await q.query(
    `select p.id, p.seccion_id, p.nombre, p.descripcion, p.precio, p.precio_grande, p.foto, p.opciones,
            p.orden, p.activo, p.al_paso, p.agotado
       from productos p join secciones s on s.id = p.seccion_id
      where s.local_id = $1 ${publica ? 'and p.activo and p.al_paso' : ''}
      order by p.orden, p.id`, [LOCAL]);

  const porSeccion = {};
  for (const p of rp.rows) {
    const limpio = {
      id: p.id, nombre: p.nombre, descripcion: p.descripcion, precio: p.precio, precio_grande: p.precio_grande,
      foto: p.foto, opciones: p.opciones, agotado: p.agotado
    };
    if (!publica) Object.assign(limpio, { seccion_id: p.seccion_id, orden: p.orden, activo: p.activo, al_paso: p.al_paso });
    (porSeccion[p.seccion_id] = porSeccion[p.seccion_id] || []).push(limpio);
  }

  let secciones = rs.rows.map((s) => ({
    id: s.id, nombre: s.nombre, bajada: s.bajada, tipo: s.tipo, tema: s.tema, mitades: s.mitades, flotante: !!s.flotante,
    precios: s.tipo === 'empanadas' ? { unidad: s.precio_unidad, media: s.precio_media, docena: s.precio_docena } : null,
    dentro_de: s.dentro_de, orden: s.orden, activa: s.activa,
    productos: porSeccion[s.id] || []
  }));
  if (publica) {
    // una sección sin productos no se muestra, salvo que tenga sub-secciones con productos
    const activas = new Set(secciones.map((s) => s.id));
    const conProductos = new Set(secciones.filter((s) => s.productos.length).map((s) => s.id));
    secciones = secciones.filter((s) => s.dentro_de
      ? conProductos.has(s.id) && activas.has(s.dentro_de)
      : conProductos.has(s.id) || secciones.some((h) => h.dentro_de === s.id && conProductos.has(h.id)));
  }

  return {
    local,
    zonas: await leerZonas(q, { publica }),
    prueba: MODO_PRUEBA,
    pagos_online: !MODO_PRUEBA,
    secciones
  };
}
