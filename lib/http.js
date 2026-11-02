// Ayudas comunes para las funciones de /api.

export function error(status, codigo, mensaje, extra) {
  const e = new Error(mensaje || codigo);
  e.status = status; e.codigo = codigo; e.extra = extra;
  return e;
}

export function responder(res, status, cuerpo) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(cuerpo));
}

export async function leerCuerpo(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    const txt = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body);
    return txt ? JSON.parse(txt) : {};
  }
  const partes = [];
  for await (const p of req) partes.push(p);
  const txt = Buffer.concat(partes).toString('utf8');
  if (!txt) return {};
  try { return JSON.parse(txt); } catch (_) { throw error(400, 'JSON_INVALIDO', 'El pedido llegó mal armado.'); }
}

// Envuelve un handler: métodos permitidos y errores en JSON entendible.
export function manejar(metodos, fn) {
  return async function handler(req, res) {
    if (!metodos.includes(req.method)) {
      res.setHeader('Allow', metodos.join(', '));
      return responder(res, 405, { ok: false, error: 'METODO_NO_PERMITIDO' });
    }
    try {
      await fn(req, res);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      responder(res, status, {
        ok: false,
        error: e.codigo || 'ERROR',
        mensaje: status >= 500 && !e.codigo ? 'Algo falló del lado del servidor. Probá de nuevo.' : e.message,
        ...(e.extra || {})
      });
    }
  };
}

export function consulta(req) {
  if (req.query) return req.query;
  const u = new URL(req.url, 'http://x');
  return Object.fromEntries(u.searchParams.entries());
}
