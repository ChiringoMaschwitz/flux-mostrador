// POST /api/panel/foto — { data: base64, tipo: 'image/jpeg' } → { url }
// El panel achica la foto en el celu antes de mandarla; acá se guarda en el almacenamiento (Blob) del proyecto.
import crypto from 'node:crypto';
import { put } from '@vercel/blob';
import { manejar, responder, leerCuerpo, error } from '../../lib/http.js';
import { requerirSesion } from '../../lib/sesion.js';

const TIPOS = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' };
const MAX_BYTES = 3 * 1024 * 1024;

export default manejar(['POST'], async (req, res) => {
  await requerirSesion(req);
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw error(500, 'FALTA_BLOB', 'Falta conectar el almacenamiento de fotos (Blob) en Vercel.');
  }
  const b = await leerCuerpo(req);
  const ext = TIPOS[b.tipo];
  if (!ext || typeof b.data !== 'string') throw error(400, 'FOTO', 'La foto tiene que ser JPG, PNG o WEBP.');
  const buf = Buffer.from(b.data, 'base64');
  if (!buf.length || buf.length > MAX_BYTES) throw error(400, 'FOTO', 'La foto es muy pesada (máximo 3 MB).');
  const nombre = `alpaso/fotos/${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const r = await put(nombre, buf, { access: 'public', contentType: b.tipo, cacheControlMaxAge: 31536000 });
  responder(res, 200, { ok: true, url: r.url });
});
