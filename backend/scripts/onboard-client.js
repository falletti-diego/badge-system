'use strict';

require('../src/config-loader');
const { pool } = require('../src/db/pool');
const { parseWorkbook } = require('./onboarding/parseWorkbook');
const { validate } = require('./onboarding/validate');
const { validateAgainstDb } = require('./onboarding/validateAgainstDb');
const { apply } = require('./onboarding/apply');
const { formatPreview } = require('./onboarding/preview');
const { writeCredentials } = require('./onboarding/writeCredentials');

function parseArgs(argv) {
  const args = { file: null, dryRun: false, clientId: null, clientIdMissing: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--client-id') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) args.clientIdMissing = true;
      else { args.clientId = next; i++; }
    } else if (!a.startsWith('--')) args.file = a;
  }
  return args;
}

async function main() {
  const { file, dryRun, clientId, clientIdMissing } = parseArgs(process.argv.slice(2));
  if (clientIdMissing) {
    console.error('Errore: --client-id richiede un valore (uuid del cliente).');
    process.exit(2);
  }
  if (!file) {
    console.error('Uso: node scripts/onboard-client.js <file.xlsx> [--dry-run] [--client-id <uuid>]');
    process.exit(2);
  }

  console.log(`\n📄 Leggo ${file} ...`);
  const data = await parseWorkbook(file);

  const { errors, warnings } = validate(data);
  if (errors.length) {
    console.error('\n🔴 Validazione fallita:');
    errors.forEach((e) => console.error('  - ' + e));
    process.exit(1);
  }

  console.log('\n' + formatPreview(data, warnings));

  const year = new Date().getFullYear();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const dbErrors = await validateAgainstDb(client, data, { clientId });
    if (dbErrors.length) {
      await client.query('ROLLBACK');
      console.error('\n🔴 Conflitti col database:');
      dbErrors.forEach((e) => console.error('  - ' + e));
      process.exit(1);
    }

    const result = await apply(client, data, { clientId, year });

    if (dryRun) {
      await client.query('ROLLBACK');
      console.log('\n🟡 DRY-RUN: nessuna scrittura. Riepilogo di cosa verrebbe creato:');
      console.log('  ', JSON.stringify(result.summary));
      console.log(`   Credenziali da generare: ${result.credentials.length}`);
      return;
    }

    await client.query('COMMIT');
    const credPath = writeCredentials(result.credentials, data.azienda.ragione_sociale);
    console.log('\n✅ Onboarding completato:', JSON.stringify(result.summary));
    console.log(`   client_id: ${result.clientId}`);
    if (credPath) {
      console.log(`\n🔐 Credenziali iniziali scritte in: ${credPath}`);
      console.log('   Consegnale al cliente in modo sicuro e CANCELLA il file dopo l\'uso.');
    }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n🔴 Errore — rollback eseguito, nessuna modifica applicata:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { parseArgs };
