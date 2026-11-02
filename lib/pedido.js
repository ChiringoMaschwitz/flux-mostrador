// Arma el pedido con los precios de la base: nunca se confía en los precios que manda el celular.
// También deja listo el texto de la comanda que se imprime para el pizzero.
import { error } from './http.js';

const MAX_RENGLONES = 40;
const MAX_CANT = 30;
const MAX_EMPANADAS = 120;

// Precio más barato para n empanadas combinando sueltas, medias docenas y docenas.
export function precioEmpanadas(n, precios) {
  const u = precios.unidad, m = precios.media || u * 6, d = precios.docena || u * 12;
  const costo = [0], arma = [[0, 0, 0]];
  for (let i = 1; i <= n; i++) {
    let mejor = costo[i - 1] + u, a = [arma[i - 1][0], arma[i - 1][1], arma[i - 1][2] + 1];
    if (i >= 6 && costo[i - 6] + m < mejor) { mejor = costo[i - 6] + m; a = [arma[i - 6][0], arma[i - 6][1] + 1, arma[i - 6][2]]; }
    if (i >= 12 && costo[i - 12] + d < mejor) { mejor = costo[i - 12] + d; a = [arma[i - 12][0] + 1, arma[i - 12][1], arma[i - 12][2]]; }
    costo.push(mejor); arma.push(a);
  }
  return { total: costo[n], docenas: arma[n][0], medias: arma[n][1], sueltas: arma[n][2] };
}

export function explicarEmpanadas(c) {
  const p = [];
  if (c.docenas) p.push(c.docenas === 1 ? '1 docena' : c.docenas + ' docenas');
  if (c.medias) p.push(c.medias === 1 ? '½ docena' : c.medias + ' medias docenas');
  if (c.sueltas) p.push(c.sueltas === 1 ? '1 suelta' : c.sueltas + ' sueltas');
  return p.join(' + ');
}

const primeraMinuscula = (t) => t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
const MAYUS = (t) => t.toLocaleUpperCase('es-AR');

export function nombreRenglon(p, s) {
  if (s.tipo === 'pizzas' || !p.descripcion || p.opciones) return p.nombre;
  return p.nombre + ' ' + primeraMinuscula(p.descripcion);
}

function cantidad(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > MAX_CANT) throw error(400, 'CANTIDAD', 'La cantidad no es válida.');
  return n;
}

function textoLibre(v) {
  const t = String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return t.slice(0, 30);
}

export function armarPedido(items, carta) {
  if (!Array.isArray(items) || !items.length) throw error(400, 'VACIO', 'El pedido está vacío.');
  if (items.length > MAX_RENGLONES) throw error(400, 'MUY_LARGO', 'El pedido tiene demasiados renglones.');

  const productos = {}, seccionDe = {};
  for (const s of carta.secciones) for (const p of s.productos) { productos[p.id] = p; seccionDe[p.id] = s; }
  const disponible = (id) => {
    const p = productos[Number(id)];
    if (!p) throw error(409, 'NO_DISPONIBLE', 'Algo de tu pedido ya no está en la carta. Revisalo y probá de nuevo.');
    if (p.agotado) throw error(409, 'AGOTADO', `Se terminó: ${p.nombre}. Sacalo del pedido y probá de nuevo.`, { producto_id: p.id });
    return p;
  };

  const lineas = [];
  const empanadas = {};   // seccion_id -> { producto_id: cantidad }

  for (const it of items) {
    if (!it || typeof it !== 'object') throw error(400, 'RENGLON', 'Un renglón del pedido vino mal.');

    if (it.tipo === 'producto') {
      const p = disponible(it.id), s = seccionDe[p.id];
      if (s.tipo === 'empanadas') throw error(400, 'RENGLON', 'Las empanadas van por gusto.');
      const tam = s.tipo === 'pizzas' ? Number(it.tam) : 0;
      if (tam !== 0 && tam !== 1) throw error(400, 'TAMANO', 'Elegí el tamaño.');
      const unit = tam === 1 ? p.precio_grande : p.precio;
      if (!unit) throw error(409, 'TAMANO', `${p.nombre} no viene en ese tamaño.`);
      const cant = cantidad(it.cant);
      const detalle = [];
      let opcion = null;
      if (s.tipo === 'pizzas') detalle.push(tam === 1 ? 'Grande · 8 porciones' : 'Individual');
      if (p.opciones && p.opciones.tipo === 'elegir') {
        if (!p.opciones.valores.includes(it.opcion)) throw error(400, 'OPCION', `Elegí una opción para ${p.nombre}.`);
        opcion = it.opcion;
        detalle.push(opcion);
      } else if (p.opciones && p.opciones.tipo === 'escribir') {
        opcion = textoLibre(it.opcion);
        if (!opcion) throw error(400, 'OPCION', `Falta completar: ${p.opciones.pregunta}`);
        detalle.push('Sabor: ' + opcion);
      }
      const nombre = nombreRenglon(p, s);
      lineas.push({
        tipo: 'producto', producto_id: p.id, tam, opcion,
        nombre, detalle: detalle.join(' · '), cant, unit, subtotal: unit * cant,
        comanda: [cant + '  ' + MAYUS(nombre)].concat(detalle.length ? ['   ' + MAYUS(detalle.join(' · '))] : [])
      });
      continue;
    }

    if (it.tipo === 'mitades') {
      const ids = Array.isArray(it.ids) ? it.ids.map(Number) : [];
      if (ids.length !== 2 || ids[0] === ids[1]) throw error(400, 'MITADES', 'Elegí dos gustos distintos.');
      const [a, b] = ids.map(disponible);
      for (const p of [a, b]) {
        const s = seccionDe[p.id];
        if (s.tipo !== 'pizzas' || !s.mitades || !p.precio_grande) throw error(409, 'MITADES', `${p.nombre} no se puede combinar.`);
      }
      const cant = cantidad(it.cant), unit = Math.max(a.precio_grande, b.precio_grande);
      lineas.push({
        tipo: 'mitades', producto_ids: [a.id, b.id], nombre: 'Mitad y mitad',
        detalle: 'Grande · ½ ' + a.nombre + ' · ½ ' + b.nombre, cant, unit, subtotal: unit * cant,
        comanda: [cant + '  GRANDE MITAD Y MITAD', '   1/2 ' + MAYUS(a.nombre), '   1/2 ' + MAYUS(b.nombre)]
      });
      continue;
    }

    if (it.tipo === 'empanadas') {
      const g = it.gustos && typeof it.gustos === 'object' ? it.gustos : {};
      for (const [id, v] of Object.entries(g)) {
        const n = Number(v);
        if (!n) continue;
        if (!Number.isInteger(n) || n < 0 || n > MAX_EMPANADAS) throw error(400, 'CANTIDAD', 'La cantidad de empanadas no es válida.');
        const p = disponible(id), s = seccionDe[p.id];
        if (s.tipo !== 'empanadas') throw error(400, 'RENGLON', `${p.nombre} no es un gusto de empanada.`);
        const porGusto = (empanadas[s.id] = empanadas[s.id] || {});
        porGusto[p.id] = (porGusto[p.id] || 0) + n;
      }
      continue;
    }

    throw error(400, 'RENGLON', 'Un renglón del pedido vino mal.');
  }

  for (const [sid, porGusto] of Object.entries(empanadas)) {
    const s = carta.secciones.find((x) => x.id === Number(sid));
    const n = Object.values(porGusto).reduce((a, b) => a + b, 0);
    if (!n) continue;
    if (n > MAX_EMPANADAS) throw error(400, 'CANTIDAD', 'Son demasiadas empanadas para un pedido al paso.');
    if (!s.precios || !s.precios.unidad) throw error(500, 'PRECIO', 'Falta el precio de las empanadas.');
    const c = precioEmpanadas(n, s.precios);
    const gustos = Object.entries(porGusto).map(([id, k]) => ({ producto_id: Number(id), nombre: productos[id].nombre, cant: k }));
    lineas.push({
      tipo: 'empanadas', seccion_id: s.id, nombre: n + (n === 1 ? ' empanada' : ' empanadas'),
      detalle: gustos.map((x) => x.cant + ' ' + primeraMinuscula(x.nombre)).join(' · ') + ' (' + explicarEmpanadas(c) + ')',
      gustos, cant: 1, unit: c.total, subtotal: c.total,
      comanda: [MAYUS(s.nombre) + ' x' + n].concat(gustos.map((x) => '   ' + x.cant + '  ' + MAYUS(x.nombre)))
    });
  }

  if (!lineas.length) throw error(400, 'VACIO', 'El pedido está vacío.');
  const total = lineas.reduce((a, l) => a + l.subtotal, 0);
  return { lineas, total };
}
