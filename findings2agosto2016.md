# Badge System — Findings Analisi Approfondita del Codice

**Data analisi:** 2 Agosto 2026
**Scope:** Intero progetto — backend, frontend-web, frontend-mobile
**Metodo:** 3 review agent paralleli (uno per componente) su codice sorgente reale

**Stato al 2026-08-10 (Session 99): tutti e 13 i findings chiusi**, tranne il #3 (deliberatamente non affrontato, decisione già presa in `TASKS.md` C.5.3 — Phase 2, non MVP-critical). #1 → Fase B (Session 94). #4,6,7,9,10,11,12,13 → Fase A (Session 93). #2+#5 (gli unici HIGH/MEDIUM rimasti, geofencing GPS reale + invalidazione QR) → **Fase C (Session 99)**, l'ultimo P0 aperto — vedi `TASKS.md` Session Log riga 99 e `PROJECT_DECISIONS.md` sezione Session 99 per il dettaglio completo.

---

## 1. [HIGH] Auth tokens salvati in plaintext AsyncStorage (mobile)

**File:** `frontend-mobile/src/services/authService.js:15`
**Categoria:** security
**Verdetto:** CONFIRMED

Access token, refresh token (validità 7 giorni) e oggetto utente completo sono persistiti via `@react-native-async-storage/async-storage`, non cifrato, invece di `expo-secure-store`.

**Scenario di fallimento:** Su un device rootato/jailbroken, o tramite estrazione di backup, un attaccante legge direttamente `badge_auth_token`/`badge_refresh_token` e ottiene account takeover completo per fino a 7 giorni senza bisogno di Face ID o dell'app.

---

## 2. [HIGH] Geofencing costruito ma mai applicato — nessun GPS inviato (mobile)

**File:** `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx:107`
**Categoria:** correctness
**Verdetto:** CONFIRMED

`GPSConsentDialog` e il geofencing haversine (FASE 10) esistono ma sono codice morto: nessun uso di `expo-location`, e il payload di check-in non include mai lat/lng.

**Scenario di fallimento:** Un dipendente (o chiunque abbia il QR statico fotografato/inoltrato) fa check-in da qualsiasi luogo con connessione di rete; non c'è cattura lato client della posizione per far rispettare la presenza in sede, vanificando completamente la feature di geofencing nell'app pubblicata.

---

## 3. [HIGH] JWT/refresh token/utente salvati in localStorage (web)

**File:** `frontend-web/src/services/authService.js:55`
**Categoria:** security
**Verdetto:** CONFIRMED

Access token, refresh token e oggetto utente sono salvati in `localStorage`, leggibile da qualsiasi script iniettato (nessun cookie httpOnly).

**Scenario di fallimento:** Qualsiasi XSS altrove nella dashboard (es. un campo non sanificato renderizzato da dati editabili da admin) può leggere il localStorage ed esfiltrare il refresh token per un session takeover completo.

---

## 4. [MEDIUM] Face ID è un flag lato client, non applicato dal server (mobile)

**File:** `frontend-mobile/src/screens/checkin/CheckInScreen.jsx:50`
**Categoria:** security
**Verdetto:** CONFIRMED

Se l'hardware biometrico è assente o l'utente disabilita `FACE_ID_ENABLED` nelle Impostazioni, il check-in salta completamente `FaceIDScreen`; la POST di check-in non porta alcuna attestazione biometrica.

**Scenario di fallimento:** Un utente disattiva il toggle locale nelle Impostazioni (o usa un telefono senza biometria) e fa check-in senza alcuna frizione Face ID, mentre il business crede che ogni check-in sia verificato biometricamente.

---

## 5. [MEDIUM] QR statico riutilizzabile, nessuna rotazione o binding di prossimità (mobile)

**File:** `frontend-mobile/src/screens/checkin/QRScannerScreen.jsx:15`
**Categoria:** security
**Verdetto:** CONFIRMED

Il payload del QR è una stringa statica `badge://checkin?site_id=...&client_id=...` senza nonce o rotazione.

**Scenario di fallimento:** Combinato con l'assenza del controllo GPS (finding #2), chiunque fotografi il QR stampato in sede può fare check-in da remoto in qualsiasi momento usando solo l'immagine, senza modo di rilevare che la scansione non sia avvenuta in sede.

---

## 6. [MEDIUM] `audit_log` senza colonna `client_id` — trappola futura di leak cross-tenant (backend)

**File:** `backend/src/middleware/audit.js:18`
**Categoria:** security
**Verdetto:** CONFIRMED

Il `client_id` viene accettato dall'helper di audit logging ma scartato silenziosamente prima dell'INSERT; la tabella `audit_log` non ha colonna tenant.

**Scenario di fallimento:** Quando verrà costruito un endpoint di visualizzazione audit-log per l'admin (richiesto dallo scope MVP in CLAUDE.md), una query naive tipo `SELECT * FROM audit_log ORDER BY timestamp` restituirà la storia di tutti i tenant a meno che lo sviluppatore non ri-derivi manualmente lo scoping tramite join su `entity_id` — un leak cross-tenant silenzioso e facile, senza alcun vincolo a livello schema a impedirlo.

---

## 7. [MEDIUM] Lock del refresh-token cross-tab non atomico (web)

**File:** `frontend-web/src/services/authService.js:196`
**Categoria:** correctness
**Verdetto:** CONFIRMED

Il lock cross-tab per il refresh usa due scritture separate su localStorage senza atomicità, quindi due tab possono entrambe superare il check del lock nello stesso istante.

**Scenario di fallimento:** Due tab della dashboard aperte contemporaneamente chiamano entrambe `/auth/refresh` in concorrenza vicino alla scadenza del token; qualunque risposta arrivi per seconda invalida il token che l'altra tab sta per usare, forzando quella tab in un loop di refresh fallito e un logout forzato inatteso a metà sessione.

---

## 8. [MEDIUM] Role gating basato solo su localStorage modificabile lato client (web)

**File:** `frontend-web/src/components/ProtectedRoute.jsx:30`
**Categoria:** security
**Verdetto:** PLAUSIBLE — da verificare

I route guard leggono `user.role` dall'oggetto utente in localStorage senza alcun segnale indipendente; modificare il ruolo lì concede istantaneamente visibilità UI admin lato client.

**Scenario di fallimento:** Un utente modifica il JSON `badge_user` nei devtools impostando `role: admin` e ricarica, rivelando route/UI admin — sicuro solo se ogni endpoint backend corrispondente ri-verifica indipendentemente il ruolo lato server, cosa non verificata in questo passaggio e da confermare esplicitamente vista la storia di bug RBAC cross-tenant già occorsi in questo progetto.

---

## 9. [MEDIUM] Errori di fetch statistiche solo loggati in console, nessuno stato UI (web)

**File:** `frontend-web/src/features/dashboard/hooks/usePresences.js:44`
**Categoria:** correctness
**Verdetto:** CONFIRMED

`fetchStats` e `pollStats` inghiottono gli errori delle richieste in `console.error` senza alcuno stato di errore UI.

**Scenario di fallimento:** Una scadenza di sessione o un 500 durante un polling in background delle statistiche lascia le KPI card del manager a mostrare silenziosamente numeri stantii o azzerati, senza alcuna indicazione a schermo che l'aggiornamento dati sia fallito.

---

## 10. [LOW-MEDIUM] Check assegnazione sede senza scoping esplicito su `client_id` (backend)

**File:** `backend/src/routes/checkins.js:86`
**Categoria:** correctness
**Verdetto:** PLAUSIBLE — non sfruttabile oggi

Il controllo di assegnazione dipendente/sede interroga solo per `employee_id` e `site_id`, affidandosi al fatto che query precedenti nella stessa richiesta abbiano già verificato il `client_id`.

**Scenario di fallimento:** Non sfruttabile oggi, ma un futuro refactor che rimuove o riordina uno dei due controlli precedenti scoped su `client_id` (es. per supportare una lookup dipendenti cross-client) riaprirebbe silenziosamente un gap di isolamento tenant qui, senza alcun test attuale a protezione di questa specifica query.

---

## 11. [LOW-MEDIUM] Calcolo ore lavorate limitato alla pagina corrente (web)

**File:** `frontend-web/src/features/dashboard/components/PresencesTable.jsx:9`
**Categoria:** correctness
**Verdetto:** CONFIRMED

`computeOreMap` accoppia le righe IN/OUT solo all'interno della pagina attualmente caricata (default 50 righe).

**Scenario di fallimento:** Un dipendente il cui check-in IN cade nella pagina precedente e l'OUT nella pagina corrente vede renderizzato `—` come durata, che un manager può interpretare erroneamente come "nessun turno lavorato" invece che come artefatto di paginazione.

---

## 12. [LOW] `jti_hash` sempre null nei log di revoca token (backend)

**File:** `backend/src/middleware/checkRevoked.js:53`
**Categoria:** correctness
**Verdetto:** CONFIRMED

`req.user.jti_hash` non viene mai popolato in `middleware/auth.js`, quindi ogni riga di audit `REVOKED_TOKEN_ATTEMPT` registra `jti_hash: null` nonostante un commento nel codice affermi che venga tracciato.

**Scenario di fallimento:** Durante l'indagine su un incidente di revoca token, la revisione forense di `audit_log` non può identificare quale sessione/token specifico abbia tentato l'accesso dopo la revoca, solo che `user_id` lo abbia fatto — la revoca in sé funziona correttamente, questo indebolisce solo la traccia di audit.

---

## 13. [LOW] Troncamento export CSV a 50k righe potenzialmente silenzioso (web/backend)

**File:** `frontend-web/src/features/dashboard/components/ExportButton.jsx:174` (backend: `backend/src/routes/export.js`)
**Categoria:** correctness
**Verdetto:** PLAUSIBLE — da verificare

`backend/src/routes/export.js` tronca silenziosamente gli export oltre 50.000 righe tramite un header `X-Truncated`; non confermato se la dashboard legge e segnala questo header.

**Scenario di fallimento:** Un admin che esporta un periodo payroll ampio (es. per integrazione Zucchetti/TeamSystem) riceve un CSV incompleto senza alcun avviso visibile, se il frontend non legge l'header `X-Truncated`.

---

## Nota positiva

Il backend è risultato solido sui pattern di bug storici documentati in CLAUDE.md: nessuna regressione trovata su UUID hardcoded in mock auth, SQL costruito via interpolazione di stringhe, o isolamento multi-tenant nelle query principali. RS256 JWT, helper `buildScopedFilters`/`resolveTenantScope` fail-closed, audit logging protetto da SAVEPOINT, e `DEMO_USERS` come single source of truth sono tutti implementati correttamente.
