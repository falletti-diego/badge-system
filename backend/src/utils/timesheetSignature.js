'use strict';

// Deriva mese/anno in UTC dal timestamp del check-in — stessa convenzione
// già usata da GET /presences/summary (Date.UTC(year, month-1, 1)), non un
// nuovo assunto sul fuso orario introdotto da questa feature.
async function invalidateSignatureIfExists(client, employeeId, checkinTimestamp) {
  const d = new Date(checkinTimestamp);
  const month = d.getUTCMonth() + 1;
  const year = d.getUTCFullYear();
  await client.query(
    `UPDATE timesheet_signatures
     SET status = 'invalidated', invalidated_at = NOW()
     WHERE employee_id = $1::uuid AND month = $2 AND year = $3 AND status = 'signed'`,
    [employeeId, month, year]
  );
}

module.exports = { invalidateSignatureIfExists };
