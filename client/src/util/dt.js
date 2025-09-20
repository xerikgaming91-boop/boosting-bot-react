// client/src/util/dt.js
// Kleine Datums-/Zeit-Helfer, unabhängig von api.js (vermeidet Export-Konflikte)

export function toDate(x) {
  if (!x) return null;
  // akzeptiert "YYYY-MM-DD HH:mm:ss" oder ISO
  const s = String(x);
  if (s.includes(' ') && !s.endsWith('Z')) return new Date(s.replace(' ', 'T'));
  return new Date(s);
}

export function fmtDate(d, locale = 'de-DE') {
  const dt = d instanceof Date ? d : toDate(d);
  if (!dt || Number.isNaN(+dt)) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(dt);
}

export function fmtTime(d, locale = 'de-DE') {
  const dt = d instanceof Date ? d : toDate(d);
  if (!dt || Number.isNaN(+dt)) return '—';
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(dt);
}

export function fmtDateTime(d, locale = 'de-DE') {
  const dt = d instanceof Date ? d : toDate(d);
  if (!dt || Number.isNaN(+dt)) return '—';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(dt);
}
