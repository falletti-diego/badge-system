# PDF Export Riepilogo Ore + Help/FAQ In-App (v1) — Design Spec

**Data:** 8 Agosto 2026
**Origine:** Backlog MVP Hardening (`TASKS.md`, Session 57), voci 3 e 8 — Gruppo 1 ("quick wins frontend-web") del backlog post-Fase C
**Status:** Approvato, pronto per piano di implementazione

---

## Problema

Due voci indipendenti del backlog MVP:

1. **PDF export Riepilogo Ore** — `SummaryPage.jsx` (`/summary`, ruoli admin/manager/viewer) espone oggi solo un export CSV. Un manager che deve stampare o allegare il riepilogo mensile per le buste paga non ha un formato pronto per la stampa.
2. **Help/FAQ in-app** — non esiste nessuna superficie di auto-aiuto in-app, né su web né su mobile. L'unico materiale esiste come documento HTML statico offline (`docs/guida-utente.html`), non raggiungibile da un utente reale durante l'uso dell'app. Il pubblico reale comprende sia i dipendenti (mobile, per check-in/ferie/turni) sia manager/admin (dashboard web).

Raggruppate in un'unica spec perché entrambe di sforzo contenuto e senza dipendenze reciproche, secondo la sessione di brainstorming che le ha raggruppate in un batch coerente ("Gruppo 1").

---

## Scope

### Dentro scope
- Export PDF client-side per `SummaryPage.jsx`, stesso pattern già in uso in `PlanningPage.jsx`.
- Pagina/schermata Help con FAQ statica, filtrata per ruolo, su **web e mobile**.
- Revisione dei contenuti esistenti in `docs/guida-utente.html` (8 FAQ) — inclusa la correzione di un contenuto obsoleto (risposta sulla modalità offline, scritta prima che l'Offline Mode fosse completata in Session 86).
- Alcune nuove FAQ specifiche per il dipendente mobile, assenti oggi.

### Fuori scope (v1 — deciso esplicitamente in brainstorming)
- Tour guidato interattivo (generalizzazione di `DemoTour.jsx`) — backlog futuro.
- Ricerca/filtro testuale nelle FAQ.
- PDF generato lato server (libreria PDF nel backend) — scartato a favore di `window.print()`, coerente con il pattern già in uso e con la nota già presente in `TASKS.md`.
- Traduzione multilingua dei contenuti (l'app è italiano-only oggi, nessuna infrastruttura i18n esistente).

---

## 1. PDF Export — Riepilogo Ore

### Architettura
Nessun nuovo componente: si estende `frontend-web/src/pages/SummaryPage.jsx` replicando esattamente il pattern già presente in `frontend-web/src/features/planning/pages/PlanningPage.jsx`:

- Nuovo bottone "Esporta PDF" (accanto al bottone "Esporta CSV" già esistente), `onClick={() => window.print()}`.
- CSS di stampa iniettato con `<GlobalStyles>` di MUI, scoped alla pagina:
  - `@page { size: A4 landscape; margin: 10mm; }`
  - Nasconde `.no-print` (NavBar, controlli mese/anno, entrambi i bottoni di export)
  - Comprime `TableCell` (padding e font-size ridotti, bordi sottili) per far stare più righe per pagina
  - Mostra un `.print-title` (altrimenti `display: none`) con testo `Riepilogo Ore — {nomeMese} {anno}`, visibile solo in stampa
- Il blocco `@media print` generico già presente in `frontend-web/src/index.css` (righe ~217-225, nasconde `.no-print` e forza sfondo bianco) si applica automaticamente, nessuna modifica lì necessaria.

### Comportamento
L'utente imposta mese/anno (filtro già esistente), clicca "Esporta PDF" → si apre il dialogo di stampa nativo del browser, con layout landscape A4 già pronto, salva come PDF da lì (comportamento identico a Planning, già in produzione e noto agli utenti che lo usano oggi per i turni).

### Error handling
`window.print()` è un'API browser sincrona senza path di errore azionabile dal nostro codice (stesso comportamento di Planning oggi, nessun error handling lì) — nessuna gestione errori aggiuntiva necessaria.

### File toccati
- Modifica: `frontend-web/src/pages/SummaryPage.jsx`

---

## 2. Help/FAQ In-App (v1)

### Architettura dati — fonte unica per audience, duplicata per progetto
`frontend-web` e `frontend-mobile` sono due progetti npm separati (nessun package condiviso oggi, nessuna infrastruttura di monorepo) — per un contenuto di questa dimensione (13 voci di testo), introdurre un package condiviso solo per questo sarebbe over-engineering. Il contenuto viene quindi scritto **una volta** in questa spec e duplicato in due file dati paralleli, mantenuti manualmente in sync (churn atteso basso — testo statico, non dati applicativi):

- `frontend-web/src/data/faq.js`
- `frontend-mobile/src/data/faq.js`

Entrambi esportano lo stesso array:

```javascript
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
```

`audience` può essere `'employee'` (visibile solo a `role === 'employee'`), `'staff'` (visibile a `manager`/`admin`/`viewer`), o `'all'` (visibile a chiunque, su entrambe le piattaforme).

**Filtro fail-closed, allowlist esplicita (non denylist):**

```javascript
const STAFF_ROLES = ['manager', 'admin', 'viewer'];

function isVisible(item, role) {
  if (item.audience === 'all') return true;
  if (item.audience === 'employee') return role === 'employee';
  if (item.audience === 'staff') return STAFF_ROLES.includes(role);
  return false; // audience sconosciuto/malformato → nascosto, non mostrato per default
}
```

Questa funzione (non una condizione inline ripetuta) va definita una volta in ciascun `faq.js` ed esportata insieme a `FAQ_ITEMS`, cosicché web e mobile la importino identica invece di duplicare la logica di filtro oltre ai dati. **Deliberatamente un'allowlist**: se `role` è `undefined`/`null` (es. componente montato prima che `secureAuthStorage.getUser()` o l'equivalente web abbiano risolto), nessuna delle tre condizioni matcha e l'item resta nascosto — non il contrario. Una versione a denylist (`role !== 'employee'` per mostrare i contenuti `staff`) esporrebbe contenuti riservati a manager/admin a un utente il cui ruolo non è ancora noto: scartata esplicitamente per questo motivo.

### Web — nuova pagina `/help`
- Nuovo file `frontend-web/src/pages/HelpPage.jsx`, route protetta in `App.jsx` con `<ProtectedRoute requiredRoles={['admin', 'manager', 'employee', 'viewer']}>` (tutti i ruoli — il filtro è sul contenuto, non sull'accesso alla pagina).
- Filtra `FAQ_ITEMS` con `isVisible(item, role)` (vedi sopra), `role` letto dal contesto auth già esistente (stesso hook/contesto usato dalle altre pagine per `ProtectedRoute`).
- Rendering con MUI `Accordion`/`AccordionSummary`/`AccordionDetails`, una entry per FAQ, chiuse di default.
- Nuova voce "Guida" nel menu utente di `frontend-web/src/components/NavBar.jsx` (righe 93-186, il `Popover` sull'avatar), aggiunta come `MenuItem` prima di "Cambia password", che naviga a `/help`.

### Mobile — nuova `HelpScreen.jsx`
- Nuovo file `frontend-mobile/src/screens/settings/HelpScreen.jsx`, registrata nello stack di navigazione delle Impostazioni (stesso stack di `ChangePasswordScreen`).
- Stesso filtro `isVisible(item, role)`, `role` letto da `secureAuthStorage.getUser()`. **`getUser()` può rigettare** (stessa classe di fallimento introdotta in Fase B per `SecureStorageError`) — gestito con lo stesso pattern già usato in `RootNavigator.jsx`/`MainTabs`: `.catch()` che logga con `console.warn` e imposta `role` a `null` (non un default ottimistico come `'employee'`), cosicché il filtro fail-closed nasconda tutto tranne le voci `audience: 'all'` finché il ruolo non è determinabile — invece di indovinare un ruolo e rischiare di esporre contenuti sbagliati.
- Reso con componenti nativi collassabili: un `TouchableOpacity` per domanda (toggle `expanded` in state locale) + `Text` per la risposta, mostrato/nascosto — nessuna nuova dipendenza nativa richiesta (RN base è sufficiente per un accordion semplice).
- Nuova voce "Guida" in `frontend-mobile/src/screens/settings/SettingsScreen.jsx`, che naviga a `HelpScreen`.

### Rollout — nessuna nuova build nativa richiesta
A differenza della Fase B (finding #1, `expo-secure-store`), `HelpScreen.jsx` è puro JS/React Native — **nessun modulo nativo nuovo**. È quindi distribuibile via OTA (`expo-updates`, già configurato in `app.json`) alla prossima pubblicazione di update, senza bisogno di bump `buildNumber`/Codemagic/submit TestFlight.

### Rischio di disallineamento contenuto tra i due `faq.js` — mitigazione
I due file dati sono mantenuti manualmente in sync (nessun package condiviso, per scelta esplicita — vedi sopra). Questo è un rischio reale di drift silenzioso (qualcuno aggiorna una FAQ solo lato web, mobile resta indietro). Mitigazione: **script di verifica** `scripts/check-faq-sync.js` alla radice del repo — Node puro, nessuna dipendenza da framework (non serve `jest`/React), confronta gli insiemi di `id` e il testo `question`+`answer` dei due `faq.js`, fallisce con exit code ≠0 se divergono. `.github/workflows/ci.yml` oggi ha 3 job (`backend`, `mobile`, `security-check`), nessuno dei quali è il posto naturale per un controllo che non appartiene né al backend né al mobile — va aggiunto come step extra al job `backend` (che ha già Node 20 configurato, il setup più leggero disponibile) piuttosto che creare un quarto job solo per questo. Così un PR che tocca un solo `faq.js` senza l'altro fallisce la CI invece di scoprirsi in produzione.

### Testing
- **Web**: `HelpPage.test.jsx` — matrice esplicita per tutti e 4 i ruoli (`admin`, `manager`, `employee`, `viewer`): verifica che ciascuno veda esattamente l'insieme atteso di FAQ (non solo il caso `employee`); caso `role` non definito → solo le FAQ `audience: 'all'` visibili (fail-closed, il test che avrebbe fatto fallire la logica a denylist originaria); test di espansione/collasso di una entry. `NavBar.test.jsx` — estensione per la nuova voce "Guida" (presenza + navigazione).
- **Mobile**: `HelpScreen.test.jsx` — stessa matrice di ruoli (`employee`, `manager`, più il caso `viewer` per coerenza anche se atteso raro su mobile) comportamentale (non regex sul sorgente, lezione già imparata in Fase A finding #10); **test dedicato per `secureAuthStorage.getUser()` che rigetta** — verifica che lo schermo non crashi e mostri solo le FAQ `audience: 'all'`, coerente con il pattern già testato in `RootNavigator.test.jsx` per lo stesso tipo di fallimento. `SettingsScreen.test.jsx` — estensione per la nuova voce "Guida".
- **PDF export**: `SummaryPage.test.jsx` — estensione: click su "Esporta PDF" chiama `window.print` (mock); **assert aggiuntivo** su contenuto/presenza degli elementi `.print-title` (testo `Riepilogo Ore — {mese} {anno}` corretto per il periodo filtrato corrente) e sulla classe `.no-print` applicata ai controlli di navigazione — non solo che la funzione sia stata invocata, ma che il markup di stampa sia effettivamente quello atteso.
- **Non-regressione**: suite completa `SummaryPage.test.jsx`/`NavBar.test.jsx` (web) e `SettingsScreen.test.jsx` (mobile) già esistenti devono restare verdi — nessuna delle modifiche tocca comportamento esistente, solo aggiunte.
- **`check-faq-sync.js`**: verificato manualmente rosso→verde durante l'implementazione (introdurre di proposito un `id` disallineato tra i due file, confermare che lo script lo rileva, poi correggere).

---

## File Structure (riepilogo)

**Nuovi:**
- `frontend-web/src/pages/HelpPage.jsx`
- `frontend-web/src/data/faq.js`
- `frontend-mobile/src/screens/settings/HelpScreen.jsx`
- `frontend-mobile/src/data/faq.js`
- `scripts/check-faq-sync.js` (verifica CI di allineamento contenuto tra i due `faq.js`)

**Modificati:**
- `frontend-web/src/pages/SummaryPage.jsx` (bottone + CSS export PDF)
- `frontend-web/src/App.jsx` (route `/help`)
- `frontend-web/src/components/NavBar.jsx` (voce menu "Guida")
- `frontend-mobile/src/screens/settings/SettingsScreen.jsx` (voce "Guida")
- Test: `SummaryPage.test.jsx`, `NavBar.test.jsx` (web), `SettingsScreen.test.jsx` (mobile) — estensioni
- Test: `HelpPage.test.jsx` (web), `HelpScreen.test.jsx` (mobile) — nuovi

**Non toccati:** nessun file backend, nessuna migration — entrambe le feature sono puramente frontend.

---

## Rollout complessivo

- **Web**: deploy automatico via Netlify (CI/CD già esistente), nessun passaggio manuale.
- **Mobile**: pubblicabile via OTA (`expo-updates`) — non richiede una nuova build nativa né coordinamento con Codemagic/App Store.
