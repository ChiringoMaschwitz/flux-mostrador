// Conexión a Postgres (Supabase) con el usuario restringido alpaso_app.
// Ese usuario solo ve el esquema "alpaso": no puede leer ni tocar FLUX.
import pg from 'pg';

let pool = null;

export function db() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    const e = new Error('Falta la variable DATABASE_URL en Vercel.');
    e.status = 500; e.codigo = 'FALTA_DATABASE_URL';
    throw e;
  }
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  pool = new pg.Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10000,
    ssl: local ? false : { rejectUnauthorized: false }
  });
  return pool;
}

// Corre una función dentro de una transacción y libera la conexión siempre.
export async function enTransaccion(fn) {
  const cliente = await db().connect();
  try {
    await cliente.query('begin');
    const r = await fn(cliente);
    await cliente.query('commit');
    return r;
  } catch (e) {
    try { await cliente.query('rollback'); } catch (_) { /* la conexión ya estaba rota */ }
    throw e;
  } finally {
    cliente.release();
  }
}
