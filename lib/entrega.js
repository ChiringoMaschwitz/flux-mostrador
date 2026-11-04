// Datos de entrega del pedido de noche (delivery o retiro): se validan acá, en el servidor.
// El costo del envío sale de la zona guardada en la base, nunca del celular.
import { error } from './http.js';

function limpio(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Celular argentino → 10 números (código de área + número), sin 0, sin 15, sin 54.
export function normalizarTelefono(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('549')) d = d.slice(3);
  else if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  // "11 15 2345 6789" → quitar el 15 que va después del código de área (área de 2, 3 o 4 números)
  if (d.length === 12) {
    for (const area of [2, 3, 4]) {
      if (d.slice(area, area + 2) === '15') { d = d.slice(0, area) + d.slice(area + 2); break; }
    }
  }
  return d.length === 10 ? d : null;
}

export function armarEntrega(b, zonas, subtotal, pagosOnline, conEnvio = true) {
  b = b && typeof b === 'object' ? b : {};
  const entrega = b.entrega === 'retiro' ? 'retiro' : b.entrega === 'delivery' ? 'delivery' : null;
  if (!entrega) throw error(400, 'ENTREGA', 'Elegí si es delivery o retiro.');
  if (entrega === 'delivery' && !conEnvio) throw error(409, 'SIN_ENVIO', 'Hoy no hacemos envíos: solo retiro en el local.');

  const c = b.cliente && typeof b.cliente === 'object' ? b.cliente : {};
  const cliente = {
    nombre: limpio(c.nombre, 40),
    telefono: normalizarTelefono(c.telefono),
    calle: limpio(c.calle, 80),
    entre: limpio(c.entre, 80),
    nota: limpio(c.nota, 140)
  };
  if (!cliente.nombre) throw error(400, 'DATOS', 'Falta tu nombre.');
  if (!cliente.telefono) throw error(400, 'DATOS', 'Revisá el celular: código de área y número, sin 0 ni 15 (ej.: 11 2345 6789).');

  let zona = null, envio = 0;
  if (entrega === 'delivery') {
    zona = zonas.find((z) => z.id === Number(b.zona_id));
    if (!zona) throw error(400, 'ZONA', 'Elegí tu zona para el envío.');
    if (!cliente.calle) throw error(400, 'DATOS', 'Falta la dirección (calle y número).');
    envio = zona.costo;
  } else {
    cliente.calle = ''; cliente.entre = '';
  }

  const pago = b.pago === 'mp' ? 'mp' : b.pago === 'efectivo' ? 'efectivo' : null;
  if (!pago) throw error(400, 'PAGO', 'Elegí cómo pagás.');
  if (pago === 'mp' && !pagosOnline) throw error(409, 'SIN_COBRO', 'El pago con Mercado Pago todavía no está habilitado. Elegí efectivo.');

  const total = subtotal + envio;
  let pagaCon = null;
  if (pago === 'efectivo' && b.paga_con !== null && b.paga_con !== undefined && b.paga_con !== '') {
    pagaCon = Number(String(b.paga_con).replace(/\D/g, ''));
    if (!Number.isInteger(pagaCon) || pagaCon <= 0 || pagaCon > 10000000) throw error(400, 'DATOS', 'Revisá con cuánto pagás.');
    if (pagaCon < total) throw error(400, 'DATOS', 'Con cuánto pagás tiene que ser igual o más que el total.');
  }

  return { entrega, zona_id: zona ? zona.id : null, zona: zona ? zona.nombre : null, envio, cliente, pago, paga_con: pagaCon, total };
}
