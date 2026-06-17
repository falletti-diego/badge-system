'use strict';

async function validateAgainstDb(db, data, { clientId }) {
  const errors = [];

  if (!clientId) {
    const r = await db.query('SELECT id FROM clients WHERE lower(email) = lower($1) LIMIT 1', [data.azienda.email_referente]);
    if (r.rows.length > 0) {
      errors.push(`Foglio Azienda: un cliente con email "${data.azienda.email_referente}" esiste già. Usa --client-id per aggiungere a quello esistente.`);
    }
    return errors;
  }

  const fileMatricole = data.dipendenti.filter((d) => d.matricola).map((d) => d.matricola);
  if (fileMatricole.length > 0) {
    const r = await db.query(
      'SELECT external_employee_id, lower(email) AS email FROM employees WHERE client_id = $1::uuid AND external_employee_id = ANY($2)',
      [clientId, fileMatricole]
    );
    const fileByMatricola = new Map(data.dipendenti.filter((d) => d.matricola).map((d) => [d.matricola, d.email]));
    for (const row of r.rows) {
      const fileEmail = fileByMatricola.get(row.external_employee_id);
      if (fileEmail && fileEmail !== row.email) {
        errors.push(`Matricola "${row.external_employee_id}" è già assegnata a ${row.email} per questo cliente (nel file è su ${fileEmail}).`);
      }
    }
  }
  return errors;
}

module.exports = { validateAgainstDb };
