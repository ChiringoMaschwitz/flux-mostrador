// Mercado Pago: API de Orders (Checkout Pro). El Access Token vive en Vercel (MP_ACCESS_TOKEN); nunca llega al celular.
import crypto from 'node:crypto';
import { error } from './http.js';

const API = process.env.MP_API_BASE || 'https://api.mercadopago.com'; // MP_API_BASE solo para pruebas locales
export const MP_CONFIGURADO = () => !!process.env.MP_ACCESS_TOKEN;

async function mp(ruta, op = {}) {
  if (!MP_CONFIGURADO()) throw error(503, 'SIN_COBRO', 'El cobro con Mercado Pago no está configurado.');
  let r;
  try {
    r = await fetch(API + ruta, {
      ...op,
      headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN, 'Content-Type': 'application/json', accept: 'application/json', ...(op.headers || {}) }
    });
  } catch (e) { throw error(502, 'MP', 'No pudimos conectar con Mercado Pago. Probá de nuevo.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('Mercado Pago', ruta, r.status, JSON.stringify(j).slice(0, 800));
    throw error(502, 'MP', 'Mercado Pago no respondió bien. Probá de nuevo o elegí efectivo.');
  }
  return j;
}

// Crea la order por el monto exacto del pedido y devuelve { id, checkout_url }.
export async function crearOrden({ ref, numero, total, base }) {
  const monto = Number(total).toFixed(2);
  const titulo = 'Una Pizza · pedido #' + numero;
  const vuelta = (estado) => base + '/?pago=' + estado + '&ref=' + encodeURIComponent(ref);
  return mp('/v1/orders', {
    method: 'POST',
    headers: { 'X-Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({
      type: 'online',
      processing_mode: 'manual',
      total_amount: monto,
      external_reference: ref,
      expiration_time: 'PT30M',
      description: titulo,
      items: [{ title: titulo, unit_price: monto, quantity: 1 }],
      config: { online: { success_url: vuelta('ok'), failure_url: vuelta('no'), pending_url: vuelta('espera'), auto_return: 'approved' } }
    })
  });
}

export const leerOrden = (id) => mp('/v1/orders/' + encodeURIComponent(id));

// Firma del aviso (webhook): x-signature = "ts=…,v1=…", HMAC SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
export function firmaValida(headers, dataId) {
  const secreto = process.env.MP_WEBHOOK_SECRET;
  if (!secreto) return true; // sin clave cargada se acepta: igual se le pregunta el estado a Mercado Pago
  const partes = Object.fromEntries(String(headers['x-signature'] || '').split(',').map((p) => p.trim().split('=')));
  if (!partes.ts || !partes.v1) return false;
  const pedido = headers['x-request-id'];
  const probar = [...new Set([String(dataId || '').toLowerCase(), String(dataId || '')])];
  return probar.some((id) => {
    const manifiesto = (id ? 'id:' + id + ';' : '') + (pedido ? 'request-id:' + pedido + ';' : '') + 'ts:' + partes.ts + ';';
    const h = crypto.createHmac('sha256', secreto).update(manifiesto).digest('hex');
    return h.length === partes.v1.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(partes.v1));
  });
}

export const pagada = (o) => o && o.status === 'processed' && (o.status_detail === 'accredited' || o.status_detail === 'partially_refunded');
export const fallida = (o) => o && (o.status === 'failed' || o.status === 'canceled' || o.status === 'refunded');
