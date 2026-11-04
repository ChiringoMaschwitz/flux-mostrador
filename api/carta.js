// GET /api/carta — la carta que ve el cliente, con el estado del local (abierto / cerrado).
import { db } from '../lib/db.js';
import { leerCarta } from '../lib/carta.js';
import { manejar, responder } from '../lib/http.js';

export default manejar(['GET', 'HEAD'], async (req, res) => {
  const carta = await leerCarta(db(), { publica: true });
  // copia corta en la red de Vercel: un agotado o un cierre se ven en segundos
  res.setHeader('Cache-Control', 'public, s-maxage=5, stale-while-revalidate=30');
  responder(res, 200, { ok: true, ...carta });
});
