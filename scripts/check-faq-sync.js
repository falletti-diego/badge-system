// Verifica che i due file dati FAQ (web e mobile, duplicati
// intenzionalmente — vedi docs/superpowers/specs/2026-08-08-pdf-export-help-faq-design.md)
// contengano lo stesso blocco FAQ_ITEMS. Confronto testuale, non esecuzione
// dei moduli: frontend-web è ESM puro ("type": "module" in package.json),
// uno script CommonJS in scripts/ non può require()/import() quei file in
// modo affidabile senza allineare i sistemi di modulo tra progetti diversi.
//
// Uso:
//   node scripts/check-faq-sync.js [pathA] [pathB]
// Default (nessun argomento): confronta i percorsi reali del repo.

const fs = require('fs');
const path = require('path');

function extractFaqItemsBlock(fileContent) {
  const startMarker = 'FAQ_ITEMS = [';
  const startIndex = fileContent.indexOf(startMarker);
  if (startIndex === -1) {
    throw new Error(`Marker "${startMarker}" non trovato nel file`);
  }
  const arrayStart = startIndex + startMarker.length - 1; // include la '['
  const endIndex = fileContent.indexOf('\n];', arrayStart);
  if (endIndex === -1) {
    throw new Error('Chiusura "];" del blocco FAQ_ITEMS non trovata');
  }
  return fileContent.slice(arrayStart, endIndex + 2); // include ']'
}

function normalize(block) {
  return block.replace(/\s+/g, ' ').trim();
}

function main() {
  const args = process.argv.slice(2);
  const pathA = args[0] || path.join(__dirname, '..', 'frontend-web', 'src', 'data', 'faq.js');
  const pathB = args[1] || path.join(__dirname, '..', 'frontend-mobile', 'src', 'data', 'faq.js');

  let contentA;
  let contentB;
  try {
    contentA = fs.readFileSync(pathA, 'utf8');
    contentB = fs.readFileSync(pathB, 'utf8');
  } catch (err) {
    console.error(`❌ Impossibile leggere uno dei due file FAQ: ${err.message}`);
    process.exit(1);
  }

  let blockA;
  let blockB;
  try {
    blockA = normalize(extractFaqItemsBlock(contentA));
    blockB = normalize(extractFaqItemsBlock(contentB));
  } catch (err) {
    console.error(`❌ Impossibile estrarre il blocco FAQ_ITEMS: ${err.message}`);
    process.exit(1);
  }

  if (blockA !== blockB) {
    console.error(`❌ FAQ content mismatch tra:\n  ${pathA}\n  ${pathB}\n`);
    console.error('I due file devono avere lo stesso blocco FAQ_ITEMS. Aggiorna entrambi allo stesso contenuto.');
    process.exit(1);
  }

  console.log(`✅ FAQ content allineato tra:\n  ${pathA}\n  ${pathB}`);
  process.exit(0);
}

main();
