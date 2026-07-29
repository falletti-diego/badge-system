'use strict';

function formatPreview(data, warnings = []) {
  const lines = [];
  lines.push(`Azienda: ${data.azienda.ragione_sociale}`);
  lines.push(`Sedi: ${data.sedi.length} · Dipendenti: ${data.dipendenti.length}`);
  lines.push('');
  lines.push('Dipendenti per sede:');
  for (const s of data.sedi) {
    const inSede = data.dipendenti.filter((d) => d.sede === s.nome_sede);
    const resp = inSede.filter((d) => d.ruolo === 'responsabile').length;
    lines.push(`  • ${s.nome_sede}: ${inSede.length} (di cui ${resp} responsabile/i)`);
  }
  const orphan = data.dipendenti.filter((d) => !data.sedi.some((s) => s.nome_sede === d.sede));
  if (orphan.length) lines.push(`  • (senza sede valida): ${orphan.length}`);

  if (warnings.length) {
    lines.push('');
    lines.push('Avvisi:');
    for (const w of warnings) lines.push(`  ⚠️  ${w}`);
  }
  return lines.join('\n');
}

module.exports = { formatPreview };
