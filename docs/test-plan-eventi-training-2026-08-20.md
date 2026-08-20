# Piano di Test — Eventi/Training

**Feature:** giustificazione giornata per eventi/congressi/training fuori sede, con approvazione manager e conteggio nelle ore lavorate/buoni pasto.

**Branch:** `worktree-eventi-training` (worktree `.claude/worktrees/eventi-training`) — non ancora mergiato su `main`.

**Ambiente:** da eseguire in locale (`npm run dev` su backend/frontend-web, Expo su frontend-mobile) o su staging se il branch viene deployato lì prima del merge. Sostituisci gli URL sotto con quelli dell'ambiente che stai usando.

- Backend: `http://localhost:3000` (o URL staging)
- Web: `http://localhost:5173` (o URL staging Netlify)
- Mobile: Expo Go / build locale, puntato allo stesso backend

**Non fondere in `main` se un punto fallisce** — segnalalo e ci fermiamo (vedi "Esito" in fondo).

---

## Esecuzione automatica (2026-08-20)

Le sezioni **0, 5, 6, 7, 8** sono state eseguite via API (curl) contro il backend del worktree, con dati reali del tenant demo (Maria/Alice/Pino/Pippo). Tutti i controlli API-verificabili sono passati — dettagli e valori osservati sono annotati inline in ogni sezione con `✅ VERIFICATO`.

Le sezioni **1, 2, 3, 4** (interazione diretta con l'interfaccia web e mobile) **non sono state eseguite**: l'ambiente di esecuzione non dispone di un browser o di un simulatore mobile. Vanno completate manualmente prima del merge.

## Fix applicate dopo l'analisi critica (2026-08-20, stesso giorno)

Su richiesta esplicita, il bug preesistente trovato in sezione 5 e un secondo problema emerso da un'ulteriore analisi critica mirata sono stati corretti e verificati prima del merge (commit `d404eb6`, `f6a1b74`):

1. **Roster `/summary` manager** (bug preesistente, non introdotto da questa feature): un dipendente senza timbrature nel mese ora compare correttamente nel riepilogo del manager anche se altri dipendenti della sede hanno timbrature. Prima spariva silenziosamente.
2. **Invalidazione firma cartellino su approvazione evento** (gap introdotto da questa feature, trovato con analisi critica mirata su rate limiting / firma cartellino / GDPR / audit log): approvare un evento cambia le ore calcolate esattamente come una correzione check-in, ma — a differenza dei check-in — non invalidava una firma già apposta per quel mese. Un manager poteva quindi approvare un evento per un mese già firmato, lasciando silenziosamente non corretti i numeri firmati. Corretto specchiando `invalidateSignatureIfExists` già usato da `checkins.js`.
   - Durante la review di questa fix è emerso un ulteriore bug di timezone (colonna `event_date` interpretata come mezzanotte locale da `pg`, non UTC — un evento del 1° del mese poteva essere attribuito erroneamente al mese precedente su server non-UTC). Corretto e verificato con mutation-testing su timezone estreme (UTC+14, UTC-12).

Tutte e tre le correzioni sono coperte da test automatici dedicati e la suite completa backend (823/837, 0 regressioni) è stata rieseguita dopo ogni modifica.

**Finding emerso durante l'esecuzione (non bloccante per questa feature, ma da segnalare):** `GET /api/presences/summary` (riepilogo mensile lato manager) non elenca un dipendente che non ha alcuna timbratura quel mese, anche se ha un evento approvato (o, allo stesso modo, ferie/malattia approvate) — il fallback che dovrebbe recuperare i dipendenti "senza timbrature" scatta solo se **nessun** dipendente della sede ha timbrature quel mese, non per singolo dipendente. Confermato che il bug è **preesistente** (stesso codice, identico, prima di questo branch) e non specifico di Eventi/Training — affligge già oggi ferie/malattia/smart-working. La vista `/my-summary` del dipendente e la vista admin/viewer di `/summary` non hanno questo problema. Vale un ticket separato, non blocca questo merge.

---

## Account demo da usare

Tenant demo fisso (`badge.local`), già seedato in ogni ambiente:

| Ruolo | Email | Sede | Note |
|-------|-------|------|------|
| Dipendente | `maria@badge.local` | Milano Store | password: `DEMO_MARIA_PASSWORD` (vedi `.env` backend) |
| Manager (stessa sede di Maria) | `alice@badge.local` | Milano Store | password nota localmente — usalo per testare l'approvazione "normale" |
| Manager (sede diversa) | `pino@badge.local` | Torino Store | password: `DEMO_PINO_PASSWORD` — usalo per il test negativo "non vede richieste di altre sedi" |
| Admin | `pippo@badge.local` | — (vede tutto) | password: `DEMO_PIPPO_PASSWORD` |

Le password non sono hardcoded nel repo — recuperale da `backend/.env` / `.env.development` locale (`DEMO_*_PASSWORD`), mai da committare in questo file.

---

## 0. Prerequisiti

- [ ] Migrazione applicata: `cd backend && npm run migrations` include `041_create_event_requests.sql` senza errori
- [ ] Backend avviato e `/health` risponde `"status":"ok"`, `"database":"connected"`
- [ ] Nessuna richiesta evento pre-esistente PENDING per Maria che possa falsare i test (opzionale: verifica con `GET /api/v1/events/my-requests` come Maria)

---

## 1. Dipendente — Richiesta evento (Web)

- [ ] Login come `maria@badge.local` → naviga a `/events/request` (non c'è ancora un link in navbar/dashboard: raggiungi l'URL direttamente, oppure verifica se serve aggiungerlo — vedi nota in fondo)
- [ ] Titolo pagina "Richiedi Evento/Training" visibile
- [ ] Campo data precompilato a oggi, campi ora precompilati 08:00–18:00
- [ ] Il pulsante "Invia Richiesta" è **disabilitato** finché la descrizione ha meno di 10 caratteri
- [ ] Inserisci descrizione breve (es. "Congresso di settore a Milano"), lascia orari 08:00–18:00, data tra 3-5 giorni nel futuro → pulsante si abilita
- [ ] Imposta ora fine ≤ ora inizio (es. 08:00–08:00) → pulsante torna disabilitato
- [ ] Ripristina orari validi → Invia Richiesta → messaggio di successo (snackbar verde), form si resetta ai valori di default
- [ ] La richiesta appare nella tabella "Le Tue Richieste" sotto, con status **PENDING** (chip arancione/warning)

## 2. Dipendente — Richiesta evento (Mobile)

- [ ] Login come `maria@badge.local` sull'app mobile
- [ ] Nella schermata Badge, sotto il pulsante "Smart Working" è visibile il pulsante **"Eventi/Training"**
- [ ] Tap sul pulsante → naviga alla tab "Eventi"
- [ ] Compila: data (selettore calendario, minimo = oggi−7gg), ora inizio, ora fine, descrizione (min 10 caratteri)
- [ ] Prova a inviare con descrizione troppo corta (es. "x") → alert di errore, richiesta non inviata
- [ ] Prova con ora fine ≤ ora inizio → alert di errore, richiesta non inviata
- [ ] Invia con dati validi (usa una data diversa da quella già usata nel test Web, per evitare conflitto) → alert "✅ Richiesta inviata"
- [ ] La richiesta compare in "Ultime richieste" con status "In attesa" (arancione)
- [ ] Torna alla schermata Badge, poi torna sulla tab Eventi → la richiesta è ancora lì (persistita lato server, non solo stato locale)

## 3. Manager — Approvazione (Web)

- [ ] Login come `alice@badge.local` (manager di Milano, stessa sede di Maria) → Dashboard
- [ ] Sotto il pannello "Richieste di Ferie in Sospeso" è visibile il pannello **"Richieste Eventi/Training in Sospeso"**
- [ ] Le richieste create ai punti 1 e 2 sono entrambe visibili, con nome dipendente, data, orario e descrizione
- [ ] Clicca "Rifiuta" su una delle due → dialog "Rifiuta Richiesta" con campo motivo opzionale → conferma → la richiesta sparisce dalla lista pendenti
- [ ] Clicca "Approva" sull'altra → messaggio di successo → la richiesta sparisce dalla lista pendenti
- [ ] **Test negativo cross-sede:** login come `pino@badge.local` (manager di Torino) → il pannello Eventi mostra "Nessuna richiesta in sospeso" (non vede le richieste di Maria, che è a Milano)
- [ ] Login come `pippo@badge.local` (admin) → se ci sono altre richieste pendenti di test, l'admin le vede tutte indipendentemente dalla sede (nota: il pannello embedded in dashboard è visibile solo per `role==='manager'` — per verificare la vista admin usa direttamente `GET /api/v1/events/pending` con il token admin, vedi sezione 7)

## 4. Manager — Approvazione (Mobile)

- [ ] Crea una nuova richiesta evento come Maria (Web o mobile, vedi punti 1-2) così da avere di nuovo una richiesta PENDING
- [ ] Login come `alice@badge.local` sull'app mobile
- [ ] La tab "Ferie"/"Smart working" ora mostra **"Approva Eventi"** al posto di "Eventi" (perché il ruolo è manager)
- [ ] Il badge numerico sulla tab "Approva Eventi" mostra il conteggio corretto delle richieste pendenti
- [ ] Apri la tab → lista delle richieste pendenti con nome dipendente, data/orario, descrizione
- [ ] Pull-to-refresh funziona (tira giù la lista)
- [ ] Tap "Approva" → dialog di conferma → conferma → la richiesta sparisce dalla lista, il badge si aggiorna
- [ ] Login come `pino@badge.local` (Torino) sull'app mobile → tab "Approva Eventi" mostra "Nessuna richiesta in attesa" (stesso test cross-sede di prima, ora su mobile)

## 5. Integrazione con le presenze (ore lavorate / buoni pasto)

- [x] ✅ VERIFICATO (API) — Creata e approvata una richiesta evento per Maria con orario 08:00–13:00 (5 ore, unica finestra libera senza conflitti nel dataset demo)
- [x] ✅ VERIFICATO (API) — `GET /my-summary` per Maria mostra: `giorni_presenti: 1, ore_totali: 5, ore_ordinarie: 5, ore_straordinarie: 0, buoni_pasto: 1` — coerente con un evento di 5h (soglia buono pasto 5h)
- [ ] Login come `alice@badge.local` (o admin) → apri il Riepilogo mensile (`/summary`) per il mese in questione **— ⚠️ trovato un bug preesistente (non introdotto da questa feature): se Maria non ha ALCUNA timbratura quel mese, non compare affatto nella vista `/summary` del manager (compare invece correttamente nella vista admin/viewer e nella propria `/my-summary`). Vedi nota "Esecuzione automatica" in cima al file. Da verificare comunque manualmente con un dipendente che HA anche timbrature quel mese, per confermare che in quel caso le ore vengano sommate correttamente in tabella.**
- [x] ✅ VERIFICATO (API) — riepilogo personale di Maria (`/my-summary`) mostra i numeri corretti (vedi sopra)
- [x] ✅ VERIFICATO (API) — **no-doppio-conteggio**: inserito direttamente in DB un check-in reale (8h, 08:00-16:00) sulla stessa data dell'evento approvato (5h). Risultato `/my-summary`: `ore_totali: 8` (non 13) — il check-in ha vinto, l'evento è stato scartato dal merge come da design. Record di test rimossi a fine verifica.

## 6. Validazioni ed edge case

- [x] ✅ VERIFICATO (API) — **Descrizione troppo corta** ("corta", 5 char) → 400 `Validation Error`, "description must be at least 10 characters"
- [x] ✅ VERIFICATO (API) — **Orario invalido** (end_time 08:00 ≤ start_time 18:00) → 400 `Validation Error`, "end_time must be after start_time"
- [x] ✅ VERIFICATO (API) — **Data 10 giorni nel passato** → 400 `Validation Error`, "event_date is outside the 7-day retroactive window"
- [x] ✅ VERIFICATO (API) — **Data esattamente 7 giorni fa** → 201, richiesta creata (limite inclusivo confermato)
- [x] ✅ VERIFICATO (API) — **Conflitto stesso giorno**: seconda richiesta evento sulla stessa data di una già pendente → 409 `EVENT_DATE_CONFLICT` (testato il caso evento-su-evento; ferie/malattia/smart-working coperti dalla stessa query di conflitto, non ritestati singolarmente qui — sono nella suite automatica `events.test.js`)
- [x] ✅ VERIFICATO (API) — **Richiesta già processata**: approvata una richiesta, poi ri-approvata (stesso ID) → 400 "Event request has already been processed"

## 7. RBAC e sicurezza (verifica via API/curl se non riproducibile da UI)

- [x] ✅ VERIFICATO (API) — Maria (employee) su `GET /api/v1/events/pending` → 403 `FORBIDDEN`
- [ ] Un `viewer` che chiama `GET /api/v1/events/pending` o `PUT /:id/approve` riceve 403 — **non testato**: nessun account viewer disponibile nel tenant demo locale usato per questa run (coperto comunque dalla suite automatica backend con un token viewer sintetico)
- [x] ✅ VERIFICATO (API) — Pino (manager Torino) su `PUT /api/v1/events/:id/approve` di una richiesta di Maria (Milano) → 403 "You can only approve requests for employees in your store"; e `GET /pending` di Pino non include la richiesta di Maria
- [x] ✅ VERIFICATO (API) — `GET /api/v1/events/my-requests` con token Maria: tutte le righe (2/2) hanno `user_id` = quello di Maria
- [x] ✅ VERIFICATO (API) — Pippo (admin) su `GET /api/v1/events/pending` vede la richiesta di Maria (sede Milano) pur non avendo lui stesso una sede assegnata — conferma "admin vede tutto"

## 8. Sanity generale (nessuna regressione sulle feature esistenti)

- [x] ✅ VERIFICATO (API) — check-in QR reale (`POST /api/v1/checkins`) risponde 201, invariato
- [ ] Smart Working: il pulsante e il flusso esistente funzionano invariati — **non testato via UI**, ma la suite automatica `smartWorking`/relativa non è stata toccata da questa feature e continua a passare
- [x] ✅ VERIFICATO (API, parziale) — `POST /api/v1/leave/request` (ferie) risponde con la logica di business attesa (400 saldo non configurato — dato di ambiente, non un errore di routing), confermando che l'endpoint ferie è ancora raggiungibile e funzionante dopo le modifiche condivise a `app.js`/`validation.js`
- [ ] Richiesta Malattia: flusso invariato — non testato in questa run, nessuna modifica di codice tocca `illnesses.js`; coperto dalla suite automatica invariata
- [ ] Dashboard web carica senza errori in console — richiede un browser, non verificabile in questo ambiente
- [ ] Logout e nuovo login (con ruolo diverso) — richiede un browser/app, non verificabile in questo ambiente

**Inoltre (non nel piano originale, eseguito comunque):** le suite di test automatizzate complete sono state rieseguite su tutti e tre gli stack subito prima di questa run manuale: backend 819/833 pass, mobile 146/146 pass, web 324/324 pass — zero regressioni.

---

## Nota aperta da chiarire prima del merge

Il piano presuppone che un utente raggiunga `/events/request` sul web navigandoci direttamente (l'URL esiste ed è protetto da `ProtectedRoute requiredRole="employee"`), ma **non è stato aggiunto alcun link/pulsante visibile in dashboard o navbar** che porti l'utente lì — a differenza del mobile, dove il pulsante "Eventi/Training" in Badge è esplicito. Verifica se questo è accettabile per il rilascio (i dipendenti usano prevalentemente l'app mobile per questo flusso) o se serve aggiungere un link nella dashboard/navbar web prima di considerare la feature completa lato web.

---

## Esito

**Parziale — parte API completata, parte UI ancora da eseguire.**

- [x] Sezioni 0, 5, 6, 7, 8: eseguite via API, **nessun problema bloccante trovato**. Un bug preesistente e non correlato a questa feature è stato scoperto e documentato (roster `/summary` manager, sezione 5) — non blocca il merge, ma vale un ticket separato.
- [ ] Sezioni 1, 2, 3, 4 (interazione reale web/mobile): **ancora da eseguire manualmente** — non eseguibili in questo ambiente (nessun browser/simulatore disponibile)
- [ ] Nota aperta sul link mancante a `/events/request` in dashboard/navbar web: da decidere prima del merge

**Raccomandazione:** prima di procedere con PR/merge, qualcuno con accesso a un browser e all'app mobile dovrebbe completare le sezioni 1-4 (stima: 15-20 minuti seguendo le checklist sopra) e decidere sulla nota aperta. La parte di logica/sicurezza/dati (la più rischiosa) è già verificata.

Note:

Note:
