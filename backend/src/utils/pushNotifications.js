/**
 * Push Notifications Helper — invia una notifica in-app (tabella
 * `notifications`, invariata) + un push Expo best-effort ai device
 * registrati del dipendente (tabella `device_push_tokens`).
 *
 * Design spec: docs/superpowers/specs/2026-08-30-push-notifications-design.md
 *
 * Contratto (decisione 9 della spec): nessun parametro `client`/connessione
 * transazionale — questo modulo importa `pool` direttamente e va sempre
 * chiamato DOPO che una eventuale withTransaction() del chiamante è già
 * tornata con successo, mai da dentro il suo callback. Un fallimento di
 * rete verso Expo non deve mai poter causare il ROLLBACK di
 * un'approvazione o di un salvataggio turno.
 *
 * Contratto (decisione 12 della spec): l'invio Expo non è mai atteso dal
 * chiamante — parte in background con un .catch() interno che logga e
 * basta, per non rallentare shifts.js quando cambiano molte celle turno in
 * una volta sola.
 */

const pino = require('pino');
const { Expo } = require('expo-server-sdk');
const { pool } = require('../db/pool');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

let expoClient = null;
function getExpoClient() {
  if (!expoClient) {
    expoClient = new Expo();
  }
  return expoClient;
}

/**
 * @param {object} params
 * @param {string} params.employeeId
 * @param {string} params.clientId
 * @param {string} params.type - es. 'shift_updated', 'leave_approved', 'leave_rejected', 'event_approved', 'event_rejected'
 * @param {string} params.inAppMessage - va nella colonna notifications.message (dettagliato, mai generico)
 * @param {string} params.pushTitle - titolo mostrato sul lock screen
 * @param {string} params.pushBody - corpo mostrato sul lock screen (generico per ferie/eventi, dettagliato per turno — vedi decisione 10 della spec)
 * @param {string} [params.shiftDate] - solo per type='shift_updated', va in notifications.shift_date
 * @param {string} [params.newShift] - solo per type='shift_updated', va in notifications.new_shift
 * @param {string} [params.siteId] - solo per type='shift_updated', va in notifications.site_id
 * @returns {Promise<void>} risolve sempre, non propaga mai un errore
 */
async function notifyEmployee({
  employeeId, clientId, type, inAppMessage, pushTitle, pushBody,
  shiftDate = null, newShift = null, siteId = null,
}) {
  try {
    await pool.query(
      `INSERT INTO notifications (employee_id, client_id, type, message, shift_date, new_shift, site_id)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7::uuid)`,
      [employeeId, clientId, type, inAppMessage, shiftDate, newShift, siteId]
    );
  } catch (err) {
    logger.warn({ action: 'notification_create_error', error: err.message, employeeId, type });
    // Un fallimento dell'INSERT in-app non deve impedire il tentativo di
    // push — i due canali sono indipendenti, prosegue comunque sotto.
  }

  let tokens;
  try {
    const tokenResult = await pool.query(
      `SELECT token FROM device_push_tokens WHERE employee_id = $1::uuid AND client_id = $2::uuid`,
      [employeeId, clientId]
    );
    tokens = tokenResult.rows.map((r) => r.token);
  } catch (err) {
    logger.warn({ action: 'push_token_lookup_error', error: err.message, employeeId });
    return;
  }

  if (tokens.length === 0) return;

  // Fire-and-forget: intenzionalmente NON await qui (decisione 12 della
  // spec) — il .catch() interno garantisce che un fallimento di rete verso
  // Expo non diventi mai una unhandled rejection.
  sendPushToTokens(tokens, { title: pushTitle, body: pushBody, type }).catch((err) => {
    logger.warn({ action: 'push_send_error', error: err.message, employeeId, type });
  });
}

// Same shape as Expo.isExpoPushToken (expo-server-sdk's ExpoClient.js) — kept
// as an inline check rather than calling the SDK's static method because the
// test suite mocks the whole `expo-server-sdk` module down to just the `Expo`
// constructor (matching only the instance methods actually used at runtime),
// so `Expo.isExpoPushToken` would be undefined there.
function isValidExpoPushToken(token) {
  return (
    typeof token === 'string' &&
    (((token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[')) && token.endsWith(']')) ||
      /^[a-z\d]{8}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{4}-[a-z\d]{12}$/i.test(token))
  );
}

async function sendPushToTokens(tokens, { title, body, type }) {
  const expo = getExpoClient();
  const messages = tokens
    .filter((token) => isValidExpoPushToken(token))
    .map((token) => ({ to: token, sound: 'default', title, body, data: { type } }));

  if (messages.length === 0) return;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    await expo.sendPushNotificationsAsync(chunk);
  }
}

module.exports = { notifyEmployee };
