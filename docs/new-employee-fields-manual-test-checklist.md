# Campi "Nuovo Dipendente" — Checklist di Test Manuale

**Documento:** Test Plan prima del merge su `main`
**Data:** 2026-08-19 (aggiornato — un dipendente richiede sempre un manager di riferimento, vedi Sezione 1 e 4)
**Copre:** Piano `docs/superpowers/plans/2026-08-16-new-employee-fields.md` (15 task) — Sede, Matricola, Data assunzione (con blocco reale del check-in), Manager di riferimento (obbligatorio), wizard xlsx
**Durata stimata:** 25-35 minuti
**Ambiente:** **Locale**, sul worktree `worktree-new-employee-fields` (questo branch non è ancora su staging/produzione)

**Prerequisiti:**
- Due terminali disponibili (uno per il backend, uno per il frontend)
- Login admin: `pippo@badge.local` / `pippo01` (cliente "Dataxiom MVP")
- Un editor Excel (Excel, Numbers, Google Sheets) per la Sezione 6

---

## 0. Avvio ambiente locale

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 0.1 | Terminale 1: `cd backend && npm run dev` | Il server parte su `http://localhost:3000` senza errori di validazione env/demo-users | ☐ |
| 0.2 | Terminale 2: `cd frontend-web && npm run dev` | Vite parte, di solito su `http://localhost:5173` | ☐ |
| 0.3 | Apri il browser su `http://localhost:5173`, fai login con `pippo@badge.local` / `pippo01` | Login riuscito, arrivi sulla dashboard admin | ☐ |
| 0.4 | Vai su Admin → tab **Dipendenti** | Vedi la sezione "Nuovo Dipendente" e sotto la tabella dipendenti del cliente "Dataxiom MVP" | ☐ |

Il cliente "Dataxiom MVP" ha già 3 sedi pronte per i test: **Milano Store**, **Roma Store**, **Torino Store**.

---

## 1. Creazione di un Manager (prerequisito — obbligatorio per TUTTE le sezioni successive)

Dal 19 agosto un dipendente non può più essere creato senza un manager di riferimento attivo sulla sua sede: la sede deve avere già un manager prima che tu possa aggiungerci dipendenti. Questo manager è quindi un prerequisito non solo per la Sezione 4, ma per ogni sezione successiva che crea un dipendente su Torino Store (2, 3, 5, 6).

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 1.1 | Nel form "Nuovo Dipendente": Cliente = "Dataxiom MVP", Nome = "Manager Test Torino", Email = una email mai usata (es. `manager.torino.test@example.it`), Ruolo = **Manager** | Appena selezioni "Manager", il campo "Manager di riferimento" più a destra diventa **grigio/non selezionabile**, con un testo tipo "I manager non hanno un manager di riferimento" | ☐ |
| 1.2 | Seleziona Sede = "Torino Store" | — | ☐ |
| 1.3 | Lascia Matricola e Password vuote, Data assunzione sulla data di oggi (default) | — | ☐ |
| 1.4 | Clicca "Crea Dipendente" | Successo, compare la password temporanea generata (annotala se vuoi testare il login del manager in futuro) | ☐ |
| 1.5 | Controlla la tabella dipendenti sotto | Il nuovo manager compare con Ruolo "manager" e Sede "Torino Store" | ☐ |

Nota bene: i manager stessi restano l'unica eccezione alla regola — non hanno bisogno di un proprio manager di riferimento (visto al passo 1.1).

---

## 2. Sede — campo obbligatorio, sempre visibile

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 2.1 | Compila Nome + Email di un nuovo dipendente, Ruolo = "Dipendente", **non selezionare nessuna Sede** | — | ☐ |
| 2.2 | Prova a cliccare "Crea Dipendente" | Il form **non si invia** (il browser blocca la sottomissione perché Sede è obbligatoria — nessuna chiamata di rete, nessun errore server) | ☐ |
| 2.3 | Seleziona Sede = "Torino Store" (ha già un manager dalla Sezione 1), poi seleziona anche "Manager Test Torino" nel campo "Manager di riferimento" (obbligatorio, vedi Sezione 4) | Ora il form si invia normalmente | ☐ |
| 2.4 | Apri il menu a tendina "Sede" | Vedi le 3 sedi del cliente selezionato (Milano/Roma/Torino Store), nessuna sede di altri clienti | ☐ |

---

## 3. Matricola — solo lettere e numeri, blocco reale (non solo visivo)

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 3.1 | Compila un nuovo dipendente valido (Cliente, Nome, Email, Ruolo = Dipendente, Sede = "Torino Store", Manager di riferimento = "Manager Test Torino"), nel campo Matricola scrivi `MAT-001` (con un trattino) | Il campo si colora di rosso con un messaggio "Solo lettere e numeri" | ☐ |
| 3.2 | Prova comunque a cliccare "Crea Dipendente" | Il bottone è **disabilitato** — il form non si invia finché la Matricola non è valida | ☐ |
| 3.3 | Correggi in `MAT001` (senza trattino) | Il bottone torna cliccabile, il colore rosso sparisce | ☐ |
| 3.4 | Clicca "Crea Dipendente" | Successo | ☐ |
| 3.5 | Crea un **secondo** dipendente (email diversa, stesso Cliente, stessa Sede/Manager) con la **stessa Matricola** `MAT001` | Il server risponde con un errore chiaro tipo "Matricola già in uso per questo cliente" (non un errore generico) | ☐ |

---

## 4. Manager di riferimento — obbligatorio, filtrato per sede, grigio per i manager

Questa è la regola discussa e implementata il 19 agosto: un dipendente non può più esistere senza un manager di riferimento attivo sulla sua sede. La sede deve avere già un manager prima che tu possa aggiungerci dipendenti.

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 4.1 | Nuovo dipendente: Cliente = "Dataxiom MVP", Ruolo = "Dipendente". **Prima** di scegliere una Sede, guarda il campo "Manager di riferimento" | È grigio/non selezionabile, con un testo tipo "Seleziona prima una sede" | ☐ |
| 4.2 | Seleziona Sede = "Roma Store" (dove **non** c'è ancora nessun manager) | Il campo "Manager di riferimento" mostra un avviso tipo "Nessun manager assegnato a questa sede — crea prima un manager per questa sede", e il bottone "Crea Dipendente" è **disabilitato** — non è più possibile creare il dipendente | ☐ |
| 4.3 | Prova comunque a forzare l'invio (se il bottone risultasse per errore cliccabile) | Nessuna chiamata di rete parte; se invece parte, il server deve rispondere con un errore di validazione (400), mai con un 201 | ☐ |
| 4.4 | Cambia Sede in "Torino Store" (dove hai creato il manager alla Sezione 1) | Il campo "Manager di riferimento" ora è selezionabile, apri il menu | ☐ |
| 4.5 | Nel menu | Vedi "Manager Test Torino" come opzione | ☐ |
| 4.6 | **Non** selezionare ancora nessun manager, guarda il bottone "Crea Dipendente" | È disabilitato, con un testo "Seleziona un manager di riferimento" sotto il campo | ☐ |
| 4.7 | Selezionalo, compila Nome/Email, clicca "Crea Dipendente" | Il bottone si riabilita e il submit ha successo — questo dipendente ora ha quel manager come riferimento | ☐ |
| 4.8 | Riapri il form, questa volta imposta Ruolo = "Manager" **dopo** aver selezionato un Manager di riferimento come dipendente | Appena passi a Ruolo = "Manager", il campo Manager di riferimento si svuota automaticamente e torna grigio (un manager non può avere un proprio manager) | ☐ |

---

## 5. Data assunzione — futura, blocco reale del check-in

Questo è il punto più importante del piano: la data di assunzione deve **bloccare davvero** lo scan del QR code prima di quella data, non essere solo informativa.

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 5.1 | Nel form, guarda il campo "Data assunzione": di default è impostato su **oggi** | — | ☐ |
| 5.2 | Prova ad aprire il calendario e selezionare una data **nel passato** (es. ieri) | Il selettore di data non permette di scegliere date prima di oggi | ☐ |
| 5.3 | Crea un dipendente con Data assunzione = **domani**, Sede = "Torino Store", Manager di riferimento = "Manager Test Torino" (unica sede con un manager pronto). Annota l'`id` del dipendente creato (visibile in un secondo momento tramite la tabella, o dalla risposta di rete negli strumenti sviluppatore) | Successo | ☐ |
| 5.4 | Recupera l'`id` di quel dipendente e l'`id` della sede "Torino Store" (`550e8400-e29b-41d4-a716-446655440012`) | — | ☐ |
| 5.5 | Da terminale, prova un check-in per quel dipendente (sostituisci `<EMPLOYEE_ID>` con l'id reale annotato al passo 5.3):<br>`curl -X POST http://localhost:3000/api/checkins -H "Content-Type: application/json" -d '{"employee_id":"<EMPLOYEE_ID>","site_id":"550e8400-e29b-41d4-a716-446655440012","type":"IN"}'` | Risposta **403**, `error: "EMPLOYMENT_NOT_STARTED"`, con la data di assunzione riportata nei dettagli — il check-in è **bloccato davvero** | ☐ |
| 5.6 | Ripeti lo stesso identico test con un dipendente la cui Data assunzione è **oggi** (es. quello creato alla Sezione 2 o 3) | Risposta **201**, check-in creato normalmente | ☐ |

Il passo 5.5 usa `curl` invece del check-in via app mobile perché il blocco vive interamente lato server (`POST /api/checkins`) — è lo stesso identico codice, indipendentemente dal client che chiama. In locale, con `DISABLE_AUTH=true`, non serve nemmeno un token: la richiesta senza `Authorization` viene trattata come amministratore.

---

## 6. Wizard "Aggiorna Dipendenti" — colonna `manager_email`

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 6.1 | Nella pagina Dipendenti, sezione "Aggiorna Dipendenti", seleziona Cliente = "Dataxiom MVP", clicca "Scarica template" | Un file `.xlsx` si scarica | ☐ |
| 6.2 | Apri il file, foglio "Dipendenti" | C'è una colonna `manager_email` (ultima colonna) | ☐ |
| 6.3 | Trova la riga del dipendente creato al passo 4.7 (quello con "Manager Test Torino" come manager) | La colonna `manager_email` per quella riga contiene l'email del manager (quella usata al passo 1.1) | ☐ |
| 6.4 | Nello stesso file, aggiungi una nuova riga: nome/email nuovi, ruolo "dipendente", sede "Torino Store", stato "Attivo", e nella colonna `manager_email` scrivi l'email di "Manager Test Torino" | — | ☐ |
| 6.5 | Carica il file modificato tramite "Carica file" | L'anteprima mostra 1 riga in "Nuovi" — nessun errore sul manager | ☐ |
| 6.6 | Conferma il caricamento, poi controlla il nuovo dipendente nella tabella | Il dipendente è stato creato con il manager corretto (verificabile riscaricando di nuovo il template e controllando `manager_email`) | ☐ |
| 6.7 | **Caso limite — email sconosciuta**: scarica un template fresco, aggiungi una riga con `manager_email` = un indirizzo inventato (es. `nessuno@example.it`) | L'anteprima mostra un errore che cita esplicitamente quell'email ("non corrisponde a nessun manager esistente") — il file viene rifiutato, nessuna scrittura | ☐ |
| 6.8 | **Caso limite — auto-riferimento**: nella stessa riga di un dipendente, imposta `manager_email` uguale alla **sua stessa** email | L'anteprima mostra un errore che spiega che un dipendente non può essere manager di se stesso | ☐ |
| 6.9 | **Caso limite — nuovo dipendente senza manager_email (regola del 19 agosto)**: scarica un template fresco, aggiungi una riga per un **nuovo** dipendente (email mai usata) su una sede con manager (es. "Torino Store"), lasciando **vuota** la colonna `manager_email` | L'anteprima mostra un errore tipo "manager_email obbligatorio per i nuovi dipendenti — crea prima un manager per questa sede" — il file viene rifiutato, nessuna scrittura | ☐ |
| 6.10 | **Nessuna retroattività**: ricarica il template scaricato al passo 6.1/6.2 senza modifiche (o modificando solo un campo non-manager, es. telefono, di un dipendente storico già esistente e senza manager) | L'anteprima **non** blocca l'aggiornamento — la regola vale solo per i nuovi inserimenti, non per i dipendenti già esistenti in produzione | ☐ |

---

## Come leggere gli esiti

Ogni riga: azione → atteso → ✅/❌. Se qualcosa non corrisponde all'atteso, annota lo scostamento esatto (screenshot, messaggio di errore testuale, valori usati) prima di continuare — una ❌ senza dettaglio non è recuperabile in revisione.

**Le sezioni 2, 3, 4 e 5 sono le più importanti** (i requisiti esplicitamente richiesti: Sede obbligatoria, Matricola alfanumerica, Manager di riferimento obbligatorio, blocco reale del check-in prima della data di assunzione). Se il tempo è limitato, copri quelle per prime.

Se tutto risulta ✅, il branch `worktree-new-employee-fields` è pronto per il merge su `main`.
