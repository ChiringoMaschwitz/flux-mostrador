// Cambios desde el panel. Cada cambio queda en el historial con quién, cuándo, antes y después.
import { enTransaccion, db } from './db.js';
import { error } from './http.js';
import { LOCAL } from './carta.js';
import { limpiarHorario } from './horario.js';
import { pinValido } from './sesion.js';

const TIPOS = ['pizzas', 'grilla', 'lista', 'empanadas'];
const TEMAS = ['azulejo', 'pizarra', 'rojo', 'tiza', 'tinta', 'papel'];
const ESTADOS = ['auto', 'abierto', 'cerrado'];

function texto(v, max, campo, obligatorio) {
  const t = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (obligatorio && !t) throw error(400, 'DATOS', `Falta ${campo}.`);
  if (t.length > max) throw error(400, 'DATOS', `${campo} es muy largo (máximo ${max} letras).`);
  return t;
}
function precio(v, campo) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[.$\s]/g, '').replace(',', '.'));
  if (!Number.isInteger(n) || n <= 0 || n > 10000000) throw error(400, 'DATOS', `${campo} no es un precio válido.`);
  return n;
}
const bool = (v, def) => (v === undefined ? def : !!v);

function foto(v) {
  if (v === null || v === undefined || v === '') return null;
  const t = String(v);
  if (t.length > 500 || !(/^\/assets\/[\w./-]+$/.test(t) || /^https:\/\/[\w.-]+\.public\.blob\.vercel-storage\.com\/[\w./%-]+$/.test(t))) {
    throw error(400, 'DATOS', 'La foto no es válida. Subila de nuevo.');
  }
  return t;
}

function opciones(v) {
  if (!v) return null;
  if (v.tipo === 'elegir') {
    const valores = (Array.isArray(v.valores) ? v.valores : []).map((x) => texto(x, 30, 'Una opción')).filter(Boolean);
    if (valores.length < 2) throw error(400, 'DATOS', 'Para que elijan, cargá al menos dos opciones.');
    if (valores.length > 8) throw error(400, 'DATOS', 'Son muchas opciones (máximo 8).');
    return { tipo: 'elegir', valores: [...new Set(valores)] };
  }
  if (v.tipo === 'escribir') return { tipo: 'escribir', pregunta: texto(v.pregunta, 60, 'La pregunta', true) };
  return null;
}

// Solo lo que cambió, para que el historial se lea fácil.
function diferencia(antes, despues) {
  const a = {}, d = {};
  for (const k of Object.keys(despues)) {
    if (JSON.stringify(antes ? antes[k] : undefined) !== JSON.stringify(despues[k])) { if (antes) a[k] = antes[k]; d[k] = despues[k]; }
  }
  return { a, d, cambio: Object.keys(d).length > 0 };
}

async function anotar(q, usuario, accion, que, antes, despues) {
  await q.query('insert into historial (usuario, accion, que, antes, despues) values ($1, $2, $3, $4, $5)',
    [usuario.nombre, accion, que, antes ? JSON.stringify(antes) : null, despues ? JSON.stringify(despues) : null]);
}

async function seccionDelLocal(q, id) {
  const r = await q.query('select * from secciones where id = $1 and local_id = $2', [id, LOCAL]);
  if (!r.rows[0]) throw error(404, 'NO_EXISTE', 'Esa sección no existe.');
  return r.rows[0];
}
async function productoDelLocal(q, id) {
  const r = await q.query(
    `select p.* from productos p join secciones s on s.id = p.seccion_id where p.id = $1 and s.local_id = $2`, [id, LOCAL]);
  if (!r.rows[0]) throw error(404, 'NO_EXISTE', 'Ese producto no existe.');
  return r.rows[0];
}

// ── productos ──
async function productoGuardar(q, u, b) {
  const s = await seccionDelLocal(q, Number(b.seccion_id));
  const datos = {
    seccion_id: s.id,
    nombre: texto(b.nombre, 60, 'El nombre', true),
    descripcion: texto(b.descripcion, 120, 'La descripción'),
    precio: precio(b.precio, 'El precio'),
    precio_grande: precio(b.precio_grande, 'El precio grande'),
    foto: foto(b.foto),
    opciones: opciones(b.opciones),
    activo: bool(b.activo, true),
    al_paso: bool(b.al_paso, true),
    agotado: bool(b.agotado, false)
  };
  if (s.tipo === 'pizzas') {
    if (!datos.precio && !datos.precio_grande) throw error(400, 'DATOS', 'Cargá el precio individual, el grande o los dos.');
  } else if (s.tipo === 'empanadas') {
    datos.precio = null; datos.precio_grande = null;   // el precio sale de la sección
  } else {
    if (!datos.precio) throw error(400, 'DATOS', 'Falta el precio.');
    datos.precio_grande = null;
  }

  if (!b.id) {
    const r = await q.query(
      `insert into productos (seccion_id, nombre, descripcion, precio, precio_grande, foto, opciones, activo, al_paso, agotado, orden)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, coalesce((select max(orden) from productos where seccion_id = $1), 0) + 1)
       returning id`,
      [datos.seccion_id, datos.nombre, datos.descripcion, datos.precio, datos.precio_grande, datos.foto,
        datos.opciones ? JSON.stringify(datos.opciones) : null, datos.activo, datos.al_paso, datos.agotado]);
    await anotar(q, u, 'producto_alta', `${datos.nombre} (${s.nombre})`, null, datos);
    return { id: r.rows[0].id };
  }

  const antes = await productoDelLocal(q, Number(b.id));
  const { a, d, cambio } = diferencia(antes, datos);
  if (!cambio) return { id: antes.id, sin_cambios: true };
  await q.query(
    `update productos set seccion_id=$2, nombre=$3, descripcion=$4, precio=$5, precio_grande=$6, foto=$7, opciones=$8,
            activo=$9, al_paso=$10, agotado=$11, actualizado_at=now(),
            orden = case when seccion_id = $2 then orden else coalesce((select max(orden) from productos where seccion_id = $2), 0) + 1 end
      where id = $1`,
    [antes.id, datos.seccion_id, datos.nombre, datos.descripcion, datos.precio, datos.precio_grande, datos.foto,
      datos.opciones ? JSON.stringify(datos.opciones) : null, datos.activo, datos.al_paso, datos.agotado]);
  await anotar(q, u, 'producto_cambio', `${datos.nombre} (${s.nombre})`, a, d);
  return { id: antes.id };
}

async function productoAgotado(q, u, b) {
  const p = await productoDelLocal(q, Number(b.id));
  const agotado = !!b.agotado;
  if (p.agotado === agotado) return { id: p.id, sin_cambios: true };
  await q.query('update productos set agotado = $2, actualizado_at = now() where id = $1', [p.id, agotado]);
  await anotar(q, u, agotado ? 'agotado' : 'reactivado', p.nombre + (p.descripcion ? ' ' + p.descripcion : ''), { agotado: p.agotado }, { agotado });
  return { id: p.id };
}

async function mover(q, tabla, filtro, valores, id, dir) {
  const r = await q.query(`select id from ${tabla} where ${filtro} order by orden, id`, valores);
  const ids = r.rows.map((x) => x.id);
  const i = ids.indexOf(id), j = i + (dir < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= ids.length) return false;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  for (let k = 0; k < ids.length; k++) await q.query(`update ${tabla} set orden = $2 where id = $1`, [ids[k], k + 1]);
  return true;
}

async function productoMover(q, u, b) {
  const p = await productoDelLocal(q, Number(b.id));
  const ok = await mover(q, 'productos', 'seccion_id = $1', [p.seccion_id], p.id, Number(b.dir));
  if (ok) await anotar(q, u, 'orden', p.nombre, null, { movido: Number(b.dir) < 0 ? 'arriba' : 'abajo' });
  return { id: p.id };
}

// ── secciones ──
async function seccionGuardar(q, u, b) {
  const datos = {
    nombre: texto(b.nombre, 40, 'El nombre', true),
    bajada: texto(b.bajada, 140, 'La bajada'),
    tipo: String(b.tipo || ''),
    tema: String(b.tema || 'azulejo'),
    mitades: !!b.mitades,
    flotante: !!b.flotante,
    precio_unidad: precio(b.precio_unidad, 'El precio por unidad'),
    precio_media: precio(b.precio_media, 'El precio de media docena'),
    precio_docena: precio(b.precio_docena, 'El precio de la docena'),
    dentro_de: b.dentro_de ? Number(b.dentro_de) : null,
    activa: bool(b.activa, true)
  };
  if (!TIPOS.includes(datos.tipo)) throw error(400, 'DATOS', 'Elegí el tipo de sección.');
  if (!TEMAS.includes(datos.tema)) throw error(400, 'DATOS', 'Elegí un color.');
  if (datos.tipo !== 'pizzas') datos.mitades = false;
  if (datos.tipo === 'empanadas') {
    if (!datos.precio_unidad) throw error(400, 'DATOS', 'Falta el precio por unidad.');
  } else { datos.precio_unidad = datos.precio_media = datos.precio_docena = null; }

  if (datos.dentro_de) {
    const madre = await seccionDelLocal(q, datos.dentro_de);
    if (madre.dentro_de) throw error(400, 'DATOS', 'Solo se puede poner dentro de una sección principal.');
    if (b.id && Number(b.id) === madre.id) throw error(400, 'DATOS', 'Una sección no puede ir dentro de sí misma.');
  }

  if (!b.id) {
    const r = await q.query(
      `insert into secciones (local_id, nombre, bajada, tipo, tema, mitades, precio_unidad, precio_media, precio_docena, dentro_de, activa, flotante, orden)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, coalesce((select max(orden) from secciones where local_id = $1), 0) + 1)
       returning id`,
      [LOCAL, datos.nombre, datos.bajada, datos.tipo, datos.tema, datos.mitades, datos.precio_unidad, datos.precio_media, datos.precio_docena, datos.dentro_de, datos.activa, datos.flotante]);
    await anotar(q, u, 'seccion_alta', datos.nombre, null, datos);
    return { id: r.rows[0].id };
  }

  const antes = await seccionDelLocal(q, Number(b.id));
  if (antes.tipo !== datos.tipo) {
    const n = await q.query('select count(*)::int n from productos where seccion_id = $1', [antes.id]);
    if (n.rows[0].n) throw error(400, 'DATOS', 'Para cambiar el tipo, la sección tiene que estar vacía. Pasá sus productos a otra sección primero.');
  }
  if (datos.dentro_de) {
    const hijas = await q.query('select count(*)::int n from secciones where dentro_de = $1', [antes.id]);
    if (hijas.rows[0].n) throw error(400, 'DATOS', 'Esta sección tiene otras adentro: no puede ir dentro de otra.');
  }
  const { a, d, cambio } = diferencia(antes, datos);
  if (!cambio) return { id: antes.id, sin_cambios: true };
  await q.query(
    `update secciones set nombre=$2, bajada=$3, tipo=$4, tema=$5, mitades=$6, precio_unidad=$7, precio_media=$8, precio_docena=$9,
            dentro_de=$10, activa=$11, flotante=$12, actualizado_at=now() where id = $1`,
    [antes.id, datos.nombre, datos.bajada, datos.tipo, datos.tema, datos.mitades, datos.precio_unidad, datos.precio_media, datos.precio_docena, datos.dentro_de, datos.activa, datos.flotante]);
  await anotar(q, u, 'seccion_cambio', datos.nombre, a, d);
  return { id: antes.id };
}

async function seccionMover(q, u, b) {
  const s = await seccionDelLocal(q, Number(b.id));
  const filtro = s.dentro_de ? 'local_id = $1 and dentro_de = $2' : 'local_id = $1 and dentro_de is null';
  const ok = await mover(q, 'secciones', filtro, s.dentro_de ? [LOCAL, s.dentro_de] : [LOCAL], s.id, Number(b.dir));
  if (ok) await anotar(q, u, 'orden', 'Sección ' + s.nombre, null, { movido: Number(b.dir) < 0 ? 'arriba' : 'abajo' });
  return { id: s.id };
}

// ── local: horario y abrir / cerrar (ventana = mediodía, delivery = noche) ──
async function localGuardar(q, u, b) {
  const delivery = b.que === 'delivery';
  const colH = delivery ? 'horario_delivery' : 'horario';
  const colE = delivery ? 'estado_manual_delivery' : 'estado_manual';
  const r = await q.query(`select ${colH} as horario, ${colE} as estado_manual from locales where id = $1`, [LOCAL]);
  const antes = r.rows[0];
  const datos = { horario: antes.horario || {}, estado_manual: antes.estado_manual };
  if (b.horario !== undefined) {
    const h = limpiarHorario(b.horario);
    if (!h) throw error(400, 'DATOS', 'Revisá el horario: la hora de cierre tiene que ser después de la de apertura.');
    datos.horario = h;
  }
  if (b.estado_manual !== undefined) {
    if (!ESTADOS.includes(b.estado_manual)) throw error(400, 'DATOS', 'Estado no válido.');
    datos.estado_manual = b.estado_manual;
  }
  const { a, d, cambio } = diferencia(antes, datos);
  if (!cambio) return { sin_cambios: true };
  await q.query(`update locales set ${colH} = $2, ${colE} = $3, actualizado_at = now() where id = $1`,
    [LOCAL, JSON.stringify(datos.horario), datos.estado_manual]);
  await anotar(q, u, 'local', (delivery ? 'Delivery · ' : 'Al paso · ') + (b.estado_manual !== undefined ? 'Abrir / cerrar' : 'Horario'), a, d);
  return {};
}

// ── zonas de delivery ──
async function zonaGuardar(q, u, b) {
  const datos = {
    nombre: texto(b.nombre, 40, 'El nombre de la zona', true),
    costo: b.costo === 0 || b.costo === '0' ? 0 : precio(b.costo, 'El costo del envío'),
    activa: bool(b.activa, true)
  };
  if (datos.costo === null) throw error(400, 'DATOS', 'Falta el costo del envío (poné 0 si es gratis).');
  if (!b.id) {
    const r = await q.query(
      `insert into zonas (local_id, nombre, costo, activa, orden)
       values ($1, $2, $3, $4, coalesce((select max(orden) from zonas where local_id = $1), 0) + 1) returning id`,
      [LOCAL, datos.nombre, datos.costo, datos.activa]);
    await anotar(q, u, 'zona_alta', datos.nombre, null, datos);
    return { id: r.rows[0].id };
  }
  const r0 = await q.query('select id, nombre, costo, activa from zonas where id = $1 and local_id = $2', [Number(b.id), LOCAL]);
  const antes = r0.rows[0];
  if (!antes) throw error(404, 'NO_EXISTE', 'Esa zona no existe.');
  const { a, d, cambio } = diferencia(antes, datos);
  if (!cambio) return { id: antes.id, sin_cambios: true };
  await q.query('update zonas set nombre = $2, costo = $3, activa = $4, actualizado_at = now() where id = $1',
    [antes.id, datos.nombre, datos.costo, datos.activa]);
  await anotar(q, u, 'zona_cambio', datos.nombre, a, d);
  return { id: antes.id };
}

async function zonaMover(q, u, b) {
  const r = await q.query('select id, nombre from zonas where id = $1 and local_id = $2', [Number(b.id), LOCAL]);
  if (!r.rows[0]) throw error(404, 'NO_EXISTE', 'Esa zona no existe.');
  await mover(q, 'zonas', 'local_id = $1', [LOCAL], r.rows[0].id, Number(b.dir));
  return { id: r.rows[0].id };
}

// ── estado de un pedido de noche ──
const ESTADOS_NOCHE = ['NUEVO', 'CONFIRMADO', 'EN_CAMINO', 'LISTO', 'ENTREGADO', 'CANCELADO'];
async function pedidoEstado(q, u, b) {
  if (!ESTADOS_NOCHE.includes(b.estado)) throw error(400, 'DATOS', 'Estado no válido.');
  const r = await q.query(
    `update pedidos set estado = $3, actualizado_at = now() where id = $1 and local_id = $2 and canal = 'delivery'
     returning id, numero, estado`, [Number(b.id), LOCAL, b.estado]);
  if (!r.rows[0]) throw error(404, 'NO_EXISTE', 'Ese pedido no existe.');
  return r.rows[0];
}

// ── usuarios (solo Gerencia) ──
async function usuarioGuardar(q, u, b) {
  if (u.rol !== 'gerencia') throw error(403, 'SOLO_GERENCIA', 'Los usuarios los maneja solo Gerencia.');
  const nombre = texto(b.nombre, 30, 'El nombre', true);
  const rol = b.rol === 'gerencia' ? 'gerencia' : 'controlador';
  const activo = bool(b.activo, true);
  const pin = b.pin ? String(b.pin) : '';
  if (pin && !pinValido(pin)) throw error(400, 'DATOS', 'El PIN tiene que tener de 4 a 6 números.');

  if (!b.id) {
    if (!pin) throw error(400, 'DATOS', 'Falta el PIN.');
    const ya = await q.query('select 1 from usuarios where lower(nombre) = lower($1)', [nombre]);
    if (ya.rows.length) throw error(400, 'DATOS', 'Ya hay un usuario con ese nombre.');
    const r = await q.query(
      `insert into usuarios (nombre, rol, pin_hash, activo) values ($1, $2, extensions.crypt($3, extensions.gen_salt('bf')), $4) returning id`,
      [nombre, rol, pin, activo]);
    await anotar(q, u, 'usuario_alta', nombre, null, { rol, activo });
    return { id: r.rows[0].id };
  }

  const r0 = await q.query('select id, nombre, rol, activo from usuarios where id = $1', [Number(b.id)]);
  const antes = r0.rows[0];
  if (!antes) throw error(404, 'NO_EXISTE', 'Ese usuario no existe.');
  if (antes.rol === 'gerencia' && (rol !== 'gerencia' || !activo)) {
    const n = await q.query("select count(*)::int n from usuarios where rol = 'gerencia' and activo and id <> $1", [antes.id]);
    if (!n.rows[0].n) throw error(400, 'DATOS', 'Tiene que quedar al menos un usuario de Gerencia activo.');
  }
  await q.query(
    `update usuarios set nombre = $2, rol = $3, activo = $4,
            pin_hash = case when $5 = '' then pin_hash else extensions.crypt($5, extensions.gen_salt('bf')) end,
            fallidos = case when $5 = '' and not $6 then fallidos else 0 end,
            bloqueado_hasta = case when $5 = '' and not $6 then bloqueado_hasta else null end
      where id = $1`,
    [antes.id, nombre, rol, activo, pin, !!b.desbloquear]);
  const { a, d } = diferencia(antes, { nombre, rol, activo });
  if (pin) d.pin = 'cambiado';
  if (b.desbloquear) d.desbloqueado = true;
  await anotar(q, u, 'usuario_cambio', nombre, a, d);
  return { id: antes.id };
}

const ACCIONES = {
  producto_guardar: productoGuardar,
  producto_agotado: productoAgotado,
  producto_mover: productoMover,
  seccion_guardar: seccionGuardar,
  seccion_mover: seccionMover,
  local_guardar: localGuardar,
  zona_guardar: zonaGuardar,
  zona_mover: zonaMover,
  pedido_estado: pedidoEstado,
  usuario_guardar: usuarioGuardar
};

export async function hacer(usuario, cuerpo) {
  const fn = ACCIONES[cuerpo && cuerpo.accion];
  if (!fn) throw error(400, 'ACCION', 'Acción desconocida.');
  return enTransaccion((q) => fn(q, usuario, cuerpo));
}

// ── lecturas del panel ──
// canal: 'ventana' | 'delivery'. La noche termina a las 24, así que alcanza con el día operativo.
export async function pedidosDeHoy(canal) {
  const r = await db().query(
    `select p.id, p.numero, p.estado, p.total, p.items, p.canal, p.entrega, p.envio, p.cliente, p.pago, p.paga_con,
            z.nombre as zona,
            to_char(p.creado_at at time zone 'America/Argentina/Buenos_Aires', 'HH24:MI') as hora,
            extract(epoch from p.creado_at)::bigint as creado
       from pedidos p left join zonas z on z.id = p.zona_id
      where p.local_id = $1 and p.fecha = (now() at time zone 'America/Argentina/Buenos_Aires')::date
        and ($2::text is null or p.canal = $2)
      order by p.numero desc`, [LOCAL, canal || null]);
  return r.rows;
}

export async function historial() {
  const r = await db().query(
    `select id, usuario, accion, que, antes, despues,
            to_char(at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM HH24:MI') as cuando
       from historial order by at desc limit 150`);
  return r.rows;
}

export async function usuarios() {
  const r = await db().query(
    `select id, nombre, rol, activo, (bloqueado_hasta is not null and bloqueado_hasta > now()) as bloqueado
       from usuarios order by activo desc, rol, nombre`);
  return r.rows;
}
