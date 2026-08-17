'use strict';

// hiring_date/exit_date sono date di calendario italiane (inserite via date
// picker del browser o file xlsx, senza informazione di timezone). Confrontarle
// con `new Date().toISOString().slice(0, 10)` (UTC) le disallinea ogni notte
// nella finestra tra mezzanotte e le 1-2 ora locale (CET/CEST), dove la data
// UTC è ancora "ieri" — un dipendente assunto "oggi" (Italia) risulterebbe
// bloccato dal controllo EMPLOYMENT_NOT_STARTED. Questa funzione calcola
// "oggi" nel fuso orario italiano invece di UTC.
// Stesso ragionamento di `todayInTimeZone`, ma per un istante arbitrario
// (es. `occurred_at` di un check-in offline/backdated): il giorno di
// calendario italiano in cui quell'istante è caduto, non il suo giorno UTC.
function dateInTimeZone(date, timeZone = 'Europe/Rome') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

function todayInTimeZone(timeZone = 'Europe/Rome') {
  return dateInTimeZone(new Date(), timeZone);
}

module.exports = { todayInTimeZone, dateInTimeZone };
