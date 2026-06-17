'use strict';

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'onboarding-output');

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function writeCredentials(credentials, clientName) {
  if (!credentials || credentials.length === 0) return null;
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const slug = String(clientName || 'cliente').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stamp = new Date().toISOString().slice(0, 10);
  const filePath = path.join(OUTPUT_DIR, `credenziali-${slug}-${stamp}.csv`);

  const header = 'email,nome,ruolo,password_temporanea';
  const rows = credentials.map((c) => [c.email, c.nome, c.ruolo, c.password].map(csvCell).join(','));
  fs.writeFileSync(filePath, [header, ...rows].join('\n') + '\n', { mode: 0o600 });
  return filePath;
}

module.exports = { writeCredentials };
