// Fonte di contenuto duplicata intenzionalmente in
// frontend-mobile/src/data/faq.js (web e mobile sono due progetti npm
// separati, nessun monorepo/package condiviso — vedi
// docs/superpowers/specs/2026-08-08-pdf-export-help-faq-design.md).
// I due file vanno tenuti identici: scripts/check-faq-sync.js lo verifica
// in CI confrontando il blocco FAQ_ITEMS normalizzato tra i due file.

export const FAQ_ITEMS = [
  {
    id: 'checkin-rifiutato',
    question: 'Perché non riesco a timbrare (check-in rifiutato)?',
    answer: 'Il check-in può essere rifiutato per due motivi: non sei assegnato alla sede che hai scansionato (chiedi al tuo manager di verificare la tua sede in Admin), oppure hai già un check-in dello stesso tipo aperto (es. hai già fatto ingresso senza uscita). Se il problema persiste, contatta il tuo responsabile.',
    audience: 'employee',
  },
  {
    id: 'face-id-toggle',
    question: 'Come attivo o disattivo il Face ID per il check-in?',
    answer: 'Vai su Impostazioni → Face ID e usa l\'interruttore. Se disattivato, il check-in avviene senza richiedere l\'autenticazione biometrica.',
    audience: 'employee',
  },
  {
    id: 'ferie-malattia',
    question: 'Come richiedo ferie o segnalo una malattia?',
    answer: 'Dalla schermata principale dell\'app, usa i pulsanti "Ferie" o "Malattia" per aprire il modulo di richiesta. La richiesta viene inviata al tuo manager per l\'approvazione.',
    audience: 'employee',
  },
  {
    id: 'password-dimenticata',
    question: 'Ho dimenticato la password, cosa faccio?',
    answer: 'Contatta il tuo manager o l\'amministratore: solo un account con permessi admin può reimpostare la password di un dipendente. Al primo accesso con la nuova password ti verrà chiesto di sceglierne una tua.',
    audience: 'all',
  },
  {
    id: 'offline-banner',
    question: 'Vedo un banner "Sei offline" nell\'app — cosa significa?',
    answer: 'Significa che il telefono non ha connessione al momento. Il check-in viene comunque salvato sul dispositivo e sincronizzato automaticamente non appena torna la connessione — non serve rifare l\'operazione.',
    audience: 'employee',
  },
  {
    id: 'checkout-dimenticato',
    question: 'Un dipendente ha dimenticato di fare check-out. Come si risolve?',
    answer: 'Apri la Dashboard, trova il check-in di ingresso senza un\'uscita corrispondente e aggiungi manualmente l\'uscita tramite il pulsante di correzione ✏️. La modifica viene tracciata nel log di audit con il tuo nome.',
    audience: 'staff',
  },
  {
    id: 'qr-sede-sbagliata',
    question: 'Il dipendente ha scansionato il QR sbagliato (altra sede). Come si corregge?',
    answer: 'Puoi correggere la sede dal pannello di modifica della singola presenza. La correzione è possibile entro 7 giorni dall\'orario originale del check-in.',
    audience: 'staff',
  },
  {
    id: 'multi-sede-manager',
    question: 'Quante sedi posso gestire con un unico account manager?',
    answer: 'Un account manager può essere assegnato a una o più sedi. Per aggiungere sedi al tuo profilo, contatta il supporto Dataxiom. La dashboard mostra sempre solo i dati delle sedi di tua competenza.',
    audience: 'staff',
  },
  {
    id: 'funziona-offline',
    question: 'Il sistema funziona senza connessione internet?',
    answer: 'Sì, entro certi limiti: l\'app mobile mette in coda i check-in effettuati offline e li sincronizza automaticamente alla riconnessione. La dashboard web richiede sempre una connessione attiva.',
    audience: 'all',
  },
  {
    id: 'protezione-dati',
    question: 'Come vengono protetti i dati dei dipendenti?',
    answer: 'Tutti i dati sono cifrati in transito (HTTPS) e a riposo. I server sono in Irlanda (UE) e rispettano il GDPR. I dati biometrici (Face ID) non vengono mai inviati ai server — restano sul dispositivo.',
    audience: 'all',
  },
  {
    id: 'conservazione-dati',
    question: 'Per quanto tempo vengono conservati i dati delle presenze?',
    answer: 'Per impostazione predefinita i dati vengono conservati 12 mesi dalla data del check-in (configurabile su richiesta). Ogni cliente può richiedere l\'export completo o la cancellazione dei dati, come previsto dal GDPR.',
    audience: 'all',
  },
  {
    id: 'privacy-colleghi',
    question: 'Un dipendente può vedere le presenze di un collega?',
    answer: 'No. I dipendenti vedono solo le proprie presenze e i propri turni. Solo manager e amministratori accedono ai dati di tutti i dipendenti della sede.',
    audience: 'all',
  },
  {
    id: 'aggiungere-dipendente',
    question: 'Come posso aggiungere un nuovo dipendente?',
    answer: 'Dal pannello di amministrazione puoi aggiungere dipendenti singolarmente o tramite il wizard di import Excel, che gestisce anche trasferimenti di sede e disattivazioni.',
    audience: 'staff',
  },
];

export const STAFF_ROLES = ['manager', 'admin', 'viewer'];

export function isVisible(item, role) {
  if (item.audience === 'all') return true;
  if (item.audience === 'employee') return role === 'employee';
  if (item.audience === 'staff') return STAFF_ROLES.includes(role);
  return false; // audience sconosciuto/malformato → nascosto, non mostrato per default
}
