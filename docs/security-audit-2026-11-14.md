# Security Audit & Penetration Test — Badge System

**Data:** 2026-11-14
**Autore:** audit assistito (Claude Code)
**Ambito concordato:** audit a livello di codice dell'intera superficie applicativa + proof-of-concept mirati a runtime sui finding ad alta severità + ricognizione non invasiva su produzione (`api.dataxiom.it`). Nessuna modifica al codice: solo proposte (vedi §4).
**Scritto per:** Diego Falletti (titolare/sviluppatore); riutilizzabile, nella sezione Esito, come sintesi da mostrare al reparto IT/sicurezza di un cliente prospect.

---

## 0. Esito in una riga

**Nessuna vulnerabilità critica o alta.** Il nucleo di sicurezza — autenticazione, autorizzazione multi-tenant, isolamento dei dati, costruzione SQL, rate limiting, TLS — è a livello dello stato dell'arte per un MVP SaaS e regge sia all'analisi del codice sia alla verifica runtime su produzione. I finding aperti sono **5, tutti di severità medio-bassa**, nessuno sfruttabile da remoto oggi. Il più urgente è un file di configurazione frontend committato che punta all'API in HTTP in chiaro (§4.1).

---

## 1. Metodo

- **Analisi del codice** su tutta la superficie: middleware di auth, helper RBAC/ruoli, scoping tenant, costruzione delle query, validazione input, i 26 file di route (inclusi gli 8 endpoint admin), il pool DB, il wiring di `app.js`, l'error handler, il rate limiter.
- **Proof-of-concept a runtime** sul dominio di produzione (richieste singole, non invasive): verifica del gate di autenticazione e di tre attacchi classici su JWT.
- **Ricognizione infrastrutturale** su `api.dataxiom.it`: header di sicurezza, TLS, e lo stato di rete reale dell'istanza RDS (interrogato via AWS CLI).
- **Scansione di segreti** sui file tracciati da git.

---

## 2. Analisi approfondita — cosa è già robusto

Questi non sono finding: sono i controlli che ho verificato essere **corretti**, e che costituiscono la posizione di sicurezza attuale. Li elenco perché definiscono il livello di maturità del prodotto.

### Autenticazione
- **JWT RS256 asimmetrico.** Il server firma con la chiave privata, verifica con la pubblica — un token non è forgiabile senza la privata. L'algoritmo è vincolato esplicitamente (`algorithms: ['RS256']`): l'attacco di downgrade `alg=none` e la confusione di algoritmo sono bloccati. *Confermato a runtime: un token `alg=none` su `api.dataxiom.it` → 401.*
- **Fail-fast all'avvio:** il server rifiuta di partire senza `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` — niente fallback silenzioso a una chiave debole.
- **Nessuna enumerazione utenti:** login con email inesistente e con password errata restituiscono lo stesso `INVALID_CREDENTIALS`.
- **Password con bcrypt** (gli account demo `@badge.local` sono isolati per dominio e non toccano mai il DB cliente).
- **Collisione cross-tenant gestita:** se la stessa email esiste in due tenant, il login rifiuta di indovinare e richiede `client_id`.
- **Rotazione refresh token con replay-detection** (`SELECT FOR UPDATE`, revoca temporanea su replay, ordine revoke-prima-di-replay ragionato) e `DISABLE_AUTH` confinato a `NODE_ENV` development/test.

### Autorizzazione & isolamento multi-tenant
- **`client_id` sempre come primo filtro** in ogni query scoped (`buildScopedFilters`), prima di qualunque filtro di ruolo.
- **Ruoli fail-closed:** un ruolo sconosciuto vale livello -1 e viene rifiutato (`UNAUTHORIZED_ROLE`); la gerarchia è una soglia numerica, non un elenco hardcoded (lezione già pagata in Session 116).
- **`resolveTenantScope` fail-closed:** un superadmin senza `client_id` esplicito riceve un errore, mai un insert con tenant indefinito.
- *Confermato a runtime: endpoint protetto senza token → 401; con firma RS256 forgiata → 401.*

### Superficie SQL
- **Query parametrizzate ovunque** (`$1`, `$2`, … con cast `::uuid`). Nessuna concatenazione di input utente in stringhe SQL.
- **Gli unici due punti con interpolazione** (`${sets.join(', ')}` in `employeeSync/applyDiff.js`) costruiscono clausole `SET` dinamiche i cui **nomi di colonna provengono da una whitelist fissa** (`FIELD_COMPARATORS` + `site_id`/`manager_id`); l'Excel caricato controlla solo i *valori*, che passano comunque da parametri. **Non sfruttabile.**

### Trasporto & infrastruttura
- **TLS** valido (Let's Encrypt, HTTP/2). Header di sicurezza presenti via `helmet`: CSP restrittiva, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`. `X-Powered-By` rimosso.
- **CORS** a whitelist esplicita, nessun wildcard.
- **Rate limiting** su login (5 tentativi/minuto per IP), export, demo, onboarding, push-token — backend Redis con fallback in memoria.
- **Error handler** che in produzione non espone mai stack o messaggi interni (`"An error occurred"`); lo stack va solo al logger.
- **RDS** con IP pubblico ma **security group che consente la 5432 solo dal security group dell'EC2** — nessun range internet (vedi §4.2 per la sfumatura).
- **Nessun segreto committato:** nessuna chiave privata, token API o credenziale AWS nei file tracciati; `.env` correttamente gitignored.

---

## 3. Finding (tabella)

| # | Severità | Area | Finding | Sfruttabile oggi? |
|---|----------|------|---------|-------------------|
| 4.1 | **Media** | Frontend/trasporto | `frontend-web/.env.production` committato punta all'API in `http://` in chiaro su IP grezzo | No (probabilmente sovrascritto da Netlify) — da confermare |
| 4.2 | Bassa | Infrastruttura | RDS `PubliclyAccessible: True` (mitigato dal security group, non raggiungibile da internet) | No |
| 4.3 | Bassa | Auth | Il cambio password non revoca le sessioni/refresh token esistenti | Solo con una sessione già compromessa |
| 4.4 | Bassa | Infrastruttura | `server: nginx/1.24.0 (Ubuntu)` — disclosure di versione | No (info disclosure) |
| 4.5 | Bassa | Trasporto | HSTS `max-age` 180 giorni, sotto la soglia di 1 anno per il preload | No (hardening) |
| — | Info | Config | `DB_SSL_REJECT_UNAUTHORIZED` in produzione da verificare (storia S.4: una volta messo `false`) | Da verificare |

Nessun finding critico o alto.

---

## 4. Proposte di miglioramento (per severità)

### 4.1 — [Media] File env frontend committato con API in HTTP chiaro
`frontend-web/.env.production` contiene `VITE_API_URL=http://34.245.145.143:3000` — HTTP in chiaro, verso l'IP EC2 grezzo invece di `https://api.dataxiom.it`.

- **Se è morto** (il build Netlify imposta `VITE_API_URL` via env del pannello, come da prassi documentata nelle sessioni di deploy): **eliminare il file**, così nessuno lo riusa per sbaglio.
- **Se è vivo** (usato davvero in un build): è un problema reale — una dashboard servita in HTTPS che chiama `http://` o viene bloccata per mixed-content, o trasmette il JWT in chiaro. **Correggere** in `https://api.dataxiom.it`.
- **Raccomandazione:** verificare il valore `VITE_API_URL` effettivo nel pannello Netlify; in ogni caso rimuovere il file committato (il valore di produzione deve vivere solo nell'ambiente di build, mai nel repo).

### 4.2 — [Bassa] RDS con accessibilità pubblica
L'istanza `badge-system-db` ha `PubliclyAccessible: True`. Oggi **non è sfruttabile**: il security group apre la 5432 solo verso il security group dell'EC2, nessun CIDR internet. Resta però un'esposizione inutile (difesa in profondità: una singola modifica errata al security group la renderebbe istantaneamente raggiungibile da internet) e comporta il costo dell'IPv4 pubblico (vedi la decisione costi AWS).
- **Raccomandazione:** impostare `PubliclyAccessible: False` (l'EC2 è nella stessa VPC, non serve l'IP pubblico). Richiede una breve finestra di manutenzione. Elimina sia il rischio sia il costo dell'IPv4.

### 4.3 — [Bassa] Il cambio password non invalida le altre sessioni
`POST /auth/change-password` aggiorna l'hash ma non inserisce nulla in `revoked_tokens` né elimina i `used_tokens` dell'utente: un refresh token rubato prima del cambio resta valido per 7 giorni.
- **Raccomandazione:** dopo l'`UPDATE` della password, eliminare gli `used_tokens` dell'utente (come fa già `revoke-session`) così le sessioni parallele decadono al primo refresh. Poche righe, nessun impatto sul percorso felice.

### 4.4 — [Bassa] Disclosure versione nginx
`server: nginx/1.24.0 (Ubuntu)` facilita il fingerprinting.
- **Raccomandazione:** `server_tokens off;` nel blocco http di nginx.

### 4.5 — [Bassa] HSTS sotto la soglia di preload
`max-age=15552000` (180 giorni). Il preload HSTS richiede ≥ 1 anno.
- **Raccomandazione:** portare a `max-age=31536000; includeSubDomains; preload` se si vuole l'idoneità al preload (hardening, non urgente).

### Info — Verificare `DB_SSL_REJECT_UNAUTHORIZED` in produzione
Il pool imposta `rejectUnauthorized: true` di default in produzione, ma c'è una scappatoia via env var, e la storia del progetto (S.4) la mise una volta a `false` per un problema di CA nel container Alpine. Con l'RDS bloccato a livello di VPC il rischio residuo è basso, ma la verifica del certificato disattivata non è l'ideale.
- **Raccomandazione:** controllare il valore SSM `/badge/production/DB_SSL_REJECT_UNAUTHORIZED`. Se `false`, valutare l'aggiunta della CA RDS al trust store del container e riportarlo a `true`.

---

## 5. Cosa NON è stato fatto (onestà sull'ambito)

- **Nessun PoC runtime distruttivo** e nessun fuzzing automatizzato (come concordato: approccio code-level + PoC mirati). I PoC runtime si sono limitati a richieste singole non invasive su produzione.
- **Nessun test attivo contro produzione** oltre al gate auth e agli header (niente brute-force, niente scritture — avrebbe fatto scattare i rate limiter e gli alarm CloudWatch).
- **Livello applicativo, non dipendenze transitive:** le 34 vulnerabilità `npm audit` di severità alta su toolchain di sviluppo (jest/nodemon) restano fuori ambito (già tracciate come backlog bassa priorità in TASKS.md); non toccano codice di produzione.
- **GDPR/compliance legale** (base giuridica consenso GPS, Statuto Lavoratori Art.4, DPIA — S.27/S.28/S.29) è un'area separata già tracciata, non ripetuta qui: è conformità normativa, non sicurezza tecnica.
