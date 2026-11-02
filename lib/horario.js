// Horario del local en hora argentina: si está abierto ahora y hasta qué hora.
const ZONA = 'America/Argentina/Buenos_Aires';
const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function ahoraAR(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(fecha);
  const val = (t) => partes.find((p) => p.type === t).value;
  return { dia: DIAS[val('weekday')], minutos: Number(val('hour')) * 60 + Number(val('minute')) };
}

const aMinutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

export function estadoLocal(local, fecha = new Date()) {
  const { dia, minutos } = ahoraAR(fecha);
  const r = (local.horario || {})[String(dia)];
  const enHorario = Array.isArray(r) && minutos >= aMinutos(r[0]) && minutos < aMinutos(r[1]);
  const abierto = local.estado_manual === 'abierto' ? true : local.estado_manual === 'cerrado' ? false : enHorario;
  return { abierto, en_horario: enHorario, hasta: abierto && Array.isArray(r) ? r[1] : null };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Devuelve el horario limpio o null si viene mal armado.
export function limpiarHorario(h) {
  if (!h || typeof h !== 'object' || Array.isArray(h)) return null;
  const limpio = {};
  for (const [k, v] of Object.entries(h)) {
    if (!/^[0-6]$/.test(k)) return null;
    if (v === null) continue;
    if (!Array.isArray(v) || v.length !== 2 || !HHMM.test(v[0]) || !HHMM.test(v[1])) return null;
    if (aMinutos(v[0]) >= aMinutos(v[1])) return null;
    limpio[k] = [v[0], v[1]];
  }
  return limpio;
}
