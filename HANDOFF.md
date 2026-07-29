# Badge System — Session 85 Handoff

**Date:** 2026-07-29
**Session:** 85 — Onboarding cliente self-service implementato (8/8 task) + code review finale + SES ancora bloccato
**Status:** ✅ **Piano onboarding chiuso lato codice.** Resta solo il Gate finale con SES reale, bloccato dall'approvazione AWS (ancora `DENIED`).

---

## Goal

Eseguire il piano di implementazione onboarding scritto in Session 84 (`docs/superpowers/plans/2026-07-28-onboarding-self-service.md`), mentre si attende la risposta AWS sul sandbox-exit — l'utente ha confermato che i test mockano SES quindi tutto il piano è implementabile ed eseguibile end-to-end senza email reali, tranne la verifica finale.

---

## Current Progress

**Tutti gli 8 task del piano eseguiti**, uno alla volta con conferma esplicita dell'utente dopo ciascuno (protocollo stabilito in Session 84, mantenuto):

- **Task 1** (`252c6d3`) — migration `034_create_invite_tokens.sql`.
- **Task 2** (`60e85bd`) — `backend/scripts/onboarding/*.js` spostato in `backend/src/services/onboarding/` (`git mv`, riusato da CLI e HTTP), `parseWorkbook.js` esteso ad accettare Buffer oltre a path file. Eseguito con vincolo esplicito di reversibilità richiesto dall'utente (commit isolato, verifica comportamentale prima/dopo).
- **Task 3** (`4f2ac98` + fix `6b89702`) — `inviteTokens.js`: token one-time. Code review + `/test-all` su richiesta esplicita hanno trovato un problema reale: bcrypt (pensato per segreti umani deboli) usato su un token già a 256 bit di entropia — CPU-blocking sync hashing, lookup O(n) invece di O(1), timing side-channel. Sostituito con SHA-256 + lookup diretto indicizzato.
- **Task 4** (`04f0ad1`) — invito admin automatico alla creazione client (`admin/clients.js`), email fire-and-forget dopo il commit.
- **Task 5** (`f2f1f05`) — endpoint pubblico `POST /onboarding/invite/:token/accept`: consumo atomico del token (`UPDATE...RETURNING`, chiude una race TOCTOU esplicitamente identificata in review), emette JWT come un login normale.
- **Task 6** (`57c4b7f`) — `AcceptInvitePage.jsx` (pagina pubblica, nessun `ProtectedRoute`).
- **Task 7** (`9b0948b`) — `POST /admin/onboarding/{preview,apply}`: `preview` riusa la stessa sequenza del CLI (`--dry-run` ⇔ `commit:false`), `apply` invia welcome-email ai soli dipendenti nuovi dopo il commit, mai bloccando/rollbackando per un problema SES.
- **Task 8** (`36edec0`) — `OnboardingWizardPage.jsx`: MUI Stepper 3 step (upload → anteprima/diff → riepilogo), `useOnboarding` hook. Estesa `failedEmails` con l'`id` dipendente (non solo l'email) per abilitare un'azione "Rigenera credenziali" nel riepilogo, riusando l'endpoint già esistente `POST /admin/employees/:id/reset-password` — nessuna nuova infrastruttura email.

**Code review finale + `/test-all` + `/api-test` da senior QA** (su richiesta esplicita, commit `2d6d9a7`): 3 agenti paralleli (bug-scan+CLAUDE.md, security, consistenza storica) + verifica manuale end-to-end contro il backend locale (login reale, upload `.xlsx` reale via curl, ispezione diretta del DB). **5 problemi reali trovati e risolti:**

1. Il JWT/user emesso su accept-invito non conteneva `employee_id` (a differenza di `POST /auth/login`) — un nuovo admin restava senza profilo dipendente per endpoint come `smartWorking`/`checkins`/`illnesses` fino al primo refresh (~15 min). Verificato red→green con revert temporaneo del fix.
2. Mancava il guard fail-fast su `JWT_PRIVATE_KEY` mancante (presente in `auth.js`).
3. Nessun audit log per la creazione del primo admin di un tenant — aggiunto.
4. `generateInviteToken()` chiamato fuori dal blocco try pensato per rendere l'invito best-effort in `admin/clients.js` — un suo errore avrebbe propagato `next(err)` su una response già inviata.
5. `/onboarding/invite` riusava la stessa istanza di rate-limiter di `/demo/start` (entrambi IP-keyed) — esaurire la quota su un endpoint consumava anche quella dell'altro. Creato `onboardingInviteLimiter` separato, riprodotto il bug deliberatamente prima del fix per provarlo.

**Trovato in QA manuale, non dal code review**: `POST /admin/onboarding/preview` restituiva le password temporanee **in chiaro** anche se l'operazione fa sempre `ROLLBACK` — rimosso dal payload di preview (`apply` lo mantiene, dove serve davvero).

22 file di test che mockano `rateLimiter` sono stati aggiornati con la nuova esportazione (altrimenti l'intera app crashava in test con `Router.use() requires a middleware function but got undefined`).

**Suite finale**: backend 630/644 (14 skip pre-esistenti, 0 fallimenti — niente flakiness in quest'ultimo run, a differenza delle run precedenti), frontend-web 248/249 (1 skip pre-esistente).

**SES**: ancora `DENIED`, nessuna risposta AWS. L'utente ha chiesto canali alternativi al ticket attuale — riepilogati: upgrade temporaneo a Business Support (~$29/mese, sblocca chat/telefono), aprire un secondo caso con giustificazione più dettagliata, AWS re:Post, candidatura AWS Activate (se applicabile). Nessuna azione ancora intrapresa su questo fronte, solo consulenza.

---

## What Worked

- **Delegare il code review a 3 agenti paralleli con scope mirato per ciascuno** (bug/CLAUDE.md, security, consistenza storica) invece di un unico pass generico — ha trovato 5 problemi concreti e diversi tra loro, ognuno verificabile in isolamento.
- **QA manuale live oltre ai test automatici**: il leak di `credentials` in `preview` non era coperto da nessun test esistente (i test controllavano solo `errors`/`summary`, non l'assenza di campi extra) — solo l'ispezione diretta della risposta HTTP l'ha rivelato.
- **Riprodurre deliberatamente il bug prima del fix** (rate-limiter condiviso, `employee_id` mancante) per provare che il test scritto sia davvero un regression guard, non solo una asserzione che passa per caso.
- **Riusare l'endpoint `reset-password` già esistente invece di costruire un nuovo canale email per "Rigenera credenziali"** — ha evitato di introdurre nuova infrastruttura SES proprio nel percorso di fallback per quando SES non funziona.

## What Didn't Work / Lezioni

- **Aggiungere un nuovo export a un modulo mockato ovunque (`rateLimiter.js`) rompe silenziosamente ogni test file che lo mocka con un oggetto letterale incompleto** — 22 file da aggiornare in blocco. Da tenere presente per qualunque futura modifica a un modulo centrale ampiamente mockato: cercare tutti i `jest.mock(...)` di quel modulo PRIMA di aggiungere un export, non dopo che la suite fallisce.
- **SES sandbox-exit resta bloccato senza spiegazione visibile** — nessun avanzamento rispetto a Session 84, l'utente deve ancora controllare manualmente il Support Center o scegliere un canale alternativo (vedi sopra).

---

## Next Steps

1. **Gate finale del piano onboarding** (non ancora eseguito, per esplicita scelta): verifica manuale E2E con SES reale (creazione client → email invito arriva davvero → accept → wizard → upload Excel reale → welcome email dipendenti arrivano davvero) — bloccata finché il sandbox-exit non è approvato.
2. **SES**: l'utente valuta se tentare un canale alternativo (nuovo caso, upgrade Business Support, AWS Activate) — nessuna azione ancora presa in questa sessione.
3. Backlog invariato da Session 83/84: `ANDROID.1`/`ANDROID.1b`, `ANDROID.2`, ambiente di staging (mai avviato, dichiarato obbligatorio pre-cliente-reale).

---

## Dove sono le cose

- **Piano onboarding (8/8 task completati)**: `docs/superpowers/plans/2026-07-28-onboarding-self-service.md`
- **Spec onboarding**: `docs/superpowers/specs/2026-07-28-onboarding-self-service-design.md`
- **Nuovi file backend**: `backend/src/routes/onboardingInvite.js`, `backend/src/routes/admin/onboarding.js`, `backend/src/utils/inviteTokens.js`, `backend/src/services/onboarding/*.js` (spostati da `backend/scripts/onboarding/`), `backend/migrations/034_create_invite_tokens.sql`
- **Nuovi file frontend**: `frontend-web/src/pages/AcceptInvitePage.jsx`, `frontend-web/src/features/admin/pages/OnboardingWizardPage.jsx`, `frontend-web/src/features/admin/hooks/useOnboarding.js` — route `/accetta-invito` (pubblica) e `/admin/onboarding` (admin-only) in `App.jsx`
- **Piano SES** (Parte B, Task 6-7 ancora bloccati): `docs/superpowers/plans/2026-07-19-demo-funnel-screenshots-ses.md`
- **Case AWS Support**: displayId `178527134900387`
- **Commit Session 85**: `252c6d3`, `60e85bd`, `4f2ac98`, `6b89702`, `04f0ad1`, `f2f1f05`, `57c4b7f`, `9b0948b`, `36edec0`, `2d6d9a7` (fix code review)

## Note operative

- **Ricontrollare stato SES**: `aws sesv2 get-account --region eu-west-1 --query '{ProductionAccessEnabled: ProductionAccessEnabled, ReviewStatus: Details.ReviewDetails.Status}'`
- **DKIM già verificato** — non serve rifare Task 4/5 del piano SES, solo Task 6 (sandbox-exit) resta aperto.
- Deploy landing: SEMPRE `--site a31a2216-fb06-47e0-b632-a1193a88039a` · Deploy badge frontend: `--site 29a79b49-...` · Backend: automatico su push `main` (`backend/**`) · Mobile iOS: build via Codemagic (workflow `badge-ios-testflight`) · Mobile Android: solo build locale EAS
- **Credenziali test mobile**: `maria@badge.local` / `maria01` (employee, Torino) · `pino@badge.local` (manager, Torino, password nota all'utente)
- **Credenziali test onboarding locale**: `pippo@badge.local` / `pippo01` (admin, client "Dataxiom MVP") — usato per la QA manuale di questa sessione, nessun dato residuo lasciato nel DB locale (righe di test create e ripulite).
