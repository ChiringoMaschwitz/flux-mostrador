// Lee la carta del local. publica = lo que ve el cliente (solo lo activo y lo que se vende al paso).
import { error } from './http.js';
import { estadoLocal } from './horario.js';

export const LOCAL = process.env.LOCAL_ID || 'PIZZERIA';
export const MODO_PRUEBA = process.env.PAGOS !== 'activo';

export async function leerCarta(q, { publica }) {
  const rl = await q.query('select id, nombre, horario, estado_manual from locales where id = $1', [LOCAL]);
  const local = rl.rows[0];
  if (!local) throw error(500, 'SIN_LOCAL', 'Falta correr el SQL de la carta (alpaso_fase1a).');

  const rs = await q.query(
    `select id, nombre, bajada, tipo, tema, mitades, precio_unidad, precio_media, precio_docena, dentro_de, orden, activa
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
    id: s.id, nombre: s.nombre, bajada: s.bajada, tipo: s.tipo, tema: s.tema, mitades: s.mitades,
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
    local: { id: local.id, nombre: local.nombre, horario: local.horario, estado_manual: local.estado_manual, ...estadoLocal(local) },
    prueba: MODO_PRUEBA,
    secciones
  };
}
