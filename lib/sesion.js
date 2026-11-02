// Sesión del panel: PIN por usuario, token firmado de 8 horas,
// bloqueo de 15 minutos después de 5 PIN incorrectos (igual que Cajas en FLUX).
import crypto from 'node:crypto';
import { db } from './db.js';
import { error } from './http.js';

const HORAS = 8;
const MAX_FALLIDOS = 5;
const MINUTOS_BLOQUEO = 15;

function secreto() {
  const s = process.env.SESION_SECRETO;
  if (!s || s.length < 32) throw error(500, 'FALTA_SESION_SECRETO', 'Falta la variable SESION_SECRETO en Vercel (32 caracteres o más).');
  return s;
}

function firmar(datos) {
  const cuerpo = Buffer.from(JSON.stringify({ ...datos, exp: Date.now() + HORAS * 3600 * 1000 })).toString('base64url');
  const firma = crypto.createHmac('sha256', secreto()).update(cuerpo).digest('base64url');
  return cuerpo + '.' + firma;
}

function leerToken(token) {
  if (!token || typeof token !== 'string' || token.indexOf('.') < 0) return null;
  const [cuerpo, firma] = token.split('.');
  const esperada = crypto.createHmac('sha256', secreto()).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma || ''), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'));
    return datos.exp > Date.now() ? datos : null;
  } catch (_) { return null; }
}

export const pinValido = (pin) => typeof pin === 'string' && /^[0-9]{4,6}$/.test(pin);

export async function usuariosParaEntrar() {
  const r = await db().query('select id, nombre, rol from usuarios where activo order by rol, nombre');
  return r.rows;
}

export async function entrar(usuarioId, pin) {
  if (!Number.isInteger(usuarioId) || !pinValido(pin)) throw error(400, 'DATOS', 'Elegí tu nombre y escribí tu PIN.');
  const r = await db().query(
    `select id, nombre, rol, activo, fallidos, bloqueado_hasta,
            ceil(extract(epoch from (bloqueado_hasta - now())) / 60) as minutos,
            (pin_hash = extensions.crypt($2, pin_hash)) as ok
       from usuarios where id = $1`, [usuarioId, pin]);
  const u = r.rows[0];
  if (!u || !u.activo) throw error(401, 'USUARIO', 'Ese usuario no está habilitado.');
  if (u.bloqueado_hasta && Number(u.minutos) > 0) {
    throw error(429, 'BLOQUEADO', `Demasiados intentos. Probá de nuevo en ${u.minutos} min.`);
  }
  if (!u.ok) {
    const fallidos = (u.bloqueado_hasta ? 0 : u.fallidos) + 1;
    if (fallidos >= MAX_FALLIDOS) {
      await db().query(`update usuarios set fallidos = 0, bloqueado_hasta = now() + interval '${MINUTOS_BLOQUEO} minutes' where id = $1`, [u.id]);
      throw error(429, 'BLOQUEADO', `Demasiados intentos. Probá de nuevo en ${MINUTOS_BLOQUEO} min.`);
    }
    await db().query('update usuarios set fallidos = $2, bloqueado_hasta = null where id = $1', [u.id, fallidos]);
    throw error(401, 'PIN_INCORRECTO', `PIN incorrecto. Te quedan ${MAX_FALLIDOS - fallidos} intentos.`);
  }
  await db().query('update usuarios set fallidos = 0, bloqueado_hasta = null where id = $1', [u.id]);
  return { token: firmar({ u: u.id }), usuario: { id: u.id, nombre: u.nombre, rol: u.rol } };
}

// Devuelve el usuario de la sesión (y verifica que siga activo). rol 'gerencia' exige Gerencia.
export async function requerirSesion(req, rol) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  const datos = leerToken(auth.replace(/^Bearer\s+/i, ''));
  if (!datos) throw error(401, 'SESION', 'Tu sesión venció. Entrá de nuevo con tu PIN.');
  const r = await db().query('select id, nombre, rol from usuarios where id = $1 and activo', [datos.u]);
  const u = r.rows[0];
  if (!u) throw error(401, 'SESION', 'Tu usuario ya no está habilitado.');
  if (rol === 'gerencia' && u.rol !== 'gerencia') throw error(403, 'SOLO_GERENCIA', 'Esto lo maneja solo Gerencia.');
  return u;
}
