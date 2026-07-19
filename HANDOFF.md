# Badge System — Session 77 Handoff

**Date:** 2026-07-19
**Session:** 77 — cron GDPR verificato + screenshot reali del prodotto LIVE su /prova-demo (Parte A del piano demo-funnel)
**Status:** ✅ Tutto pushato su `main` e deployato. **Resta UN solo bloccante prospect: SES (Parte B del piano), in attesa dell'accesso DNS dell'utente.**

---

## Goal

Chiudere i bloccanti commerciali del funnel demo: screenshot reali al posto dei placeholder (fatto, LIVE) e SES produzione (pianificato, eseguibile appena l'utente ha accesso a register.it).

---

## Come riprendere (leggi in quest'ordine)

1. **Questo file**
2. **`docs/superpowers/plans/2026-07-19-demo-funnel-screenshots-ses.md`** — il piano: Parte A ✅ completata, **Parte B (Task 4-7) da eseguire**
3. **`TASKS.md`** Session Log riga 77 + **`PROJECT_DECISIONS.md`** sezione "Session 77" (gotcha Puppeteer/SES)

**Per riprendere (sessione SES, Parte B):** chiedere all'utente se ha accesso al pannello DNS register.it. Poi, dal piano: Task 4 (crea identità SES `dataxiom.it` → consegna 3 CNAME DKIM), Task 5 (verifica propagazione), Task 6 (sandbox exit via `aws sesv2 put-account-details` — testo caso d'uso GIÀ SCRITTO nel piano, farlo approvare prima), Task 7 (`MAX_ACTIVE_DEMOS` in SSM + restart container + test E2E email).

---

## Cosa è stato fatto (commits `6fd77fb`, `913eb13`, `67565a7`)

1. **Cron GDPR verificato**: primo run automatico 3:30 UTC pulito su EC2 (`/home/ubuntu/cleanup-demos.log`) — gap chiuso definitivamente.
2. **Piano demo-funnel** scritto (writing-plans + 3 decisioni grilling: DNS solo-piano, identità SES non creata in anticipo, sandbox-exit via CLI con testo pre-approvato).
3. **Script di cattura riusabile** `npm run capture-screenshots` (frontend-web): puppeteer-core sul Chrome installato, sessione demo vera, attesa sui dati renderizzati, banner/tour soppressi solo nello scatto.
4. **TryDemoPage**: 3 screenshot reali (dashboard/trend/export) al posto dei box grigi, TDD (13/13), `data-testid="trend-chart"` aggiunto.
5. **Verifiche**: backend 599/0 fail (rerun), frontend 236/237 (+1), code-review 0 Critical/High, **deploy Netlify verificato** (bundle `index-E6ISM_F5.js`, 3 immagini → 200 su badge.dataxiom.it).

## What Worked

- **Verifica visiva dei PNG prima di dichiararli buoni** — ha intercettato i 2 problemi reali (regione sbagliata, grafico vuoto) che i log non avrebbero mai mostrato.
- Sessione demo vera invece del seed statico: dati degli ultimi 30 giorni, dashboard di luglio popolata.
- `waitForFunction` sui dati renderizzati invece di timeout fissi (il timeout raceva col seeding del tenant).

## What Didn't Work / Gotcha

- Il `clip` di `page.screenshot` (Puppeteer) usa coordinate **documento**, non viewport: correggere con `window.scrollY`.
- La card "Cosa vedrai" mostra solo la striscia ALTA dell'immagine (`object-position: top`) → comporre il soggetto in cima al frame.
- Rate limit `POST /demo/start` 3/ora/IP, in-memory: riavvio backend dev lo azzera.
- **Flake NUOVO (tracciato in TASKS.md, backlog Media)**: 3 test demo falliscono con scheduling sfortunato dei worker paralleli (boundary-test cap `MAX_ACTIVE_DEMOS` vs creazioni concorrenti di un altro worker); isolati/rerun verdi. Non un bug di codice.

---

## Prossimi step

### 1. Sessione SES (Parte B del piano) — l'UNICO bloccante prospect rimasto
Serve l'accesso DNS dell'utente su register.it. Tutto il resto è pronto nel piano (comandi esatti + testo sandbox-exit). Stima: ~1h di lavoro + attese propagazione/approvazione AWS (24-48h).

### 2. Scadenza calendario
- **25 agosto**: reminder rinnovo TestFlight (Build 14 scade l'8 settembre). Valutare di includere la Build 17 (geofencing, item 10.9 mai submittato).

### 3. Quando c'è una data per il primo cliente pilota
- S.24/S.26 consenso+disclosure GPS (legale, PRIMA che un cliente chieda il geofencing)
- Ambiente staging (STG.1-6): oggi ogni push su `main` va dritto in produzione

### Backlog minor (non bloccante)
- Flake inter-worker test demo (vedi sopra, 1-2h)
- Saldi superadmin cross-tenant (~30min, pattern `resolveTenantScope` pronto)
- `logger.warn` frontend, hook `useRedirectTimeout`, ONB.2 mezze giornate, httpOnly (C.5.3)

---

## Note operative

- Ricatturare gli screenshot quando la UI cambia: stack locale attivo → `cd frontend-web && npm run capture-screenshots` → verifica visiva PNG → commit + deploy Netlify.
- Deploy frontend: SEMPRE esplicito via `netlify deploy --prod --dir dist --site 29a79b49-5571-4249-8c2b-d0813de4bf17`.
- Deploy backend: automatico al push su `main` se tocca `backend/**`.
- Cron produzione EC2: 2:00 UTC retention audit-log, 3:30 UTC cleanup demo (entrambi verificati).
- Login API: la risposta usa `data.token`, non `data.access_token`.
