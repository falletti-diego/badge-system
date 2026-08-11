# Documento di Contesto Marketing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this plan — ogni fase richiede revisione umana del contenuto prima di procedere, non solo compliance-review automatica) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare `.agents/product-marketing.md` pilotato sulle fonti già approvate, sottoporre positioning/pricing a verifica critica con le skill `competitor-profiling` e `pricing`, ed eventualmente produrre materiale prospect-facing (`sales-enablement`, `cold-email`).

**Architecture:** Cinque task sequenziali, ciascuno invoca una skill del plugin `marketing-skills@marketingskills` (già installato) tramite prompt conversazionale — non c'è codice da scrivere. Ogni task termina con una revisione esplicita dell'utente prima di passare al successivo, perché ogni skill successiva legge `.agents/product-marketing.md` come contesto e un errore in una fase iniziale si propagherebbe.

**Tech Stack:** Claude Code, plugin `marketing-skills@marketingskills` v2.10.0 (skill: `product-marketing`, `competitor-profiling`, `pricing`, `sales-enablement`, `cold-email`), Git.

---

## File Structure

- Create: `.agents/product-marketing.md` — documento di contesto marketing condiviso, letto da tutte le altre skill del plugin
- Modify (condizionale, solo se Task 3/4 trovano uno scostamento): `docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md` — aggiunta di una sezione `## Revisione 2026-08-11` in fondo, mai modifica delle sezioni esistenti
- Create: `docs/marketing/one-pager-badge-system.md` — one-pager vendite
- Create: `docs/marketing/cold-email-outreach-template.md` — template email di primo contatto (generico, non personalizzato)

---

## Task 1: Bozza v1 di `.agents/product-marketing.md`

**Files:**
- Create: `.agents/product-marketing.md`
- Read (fonti): `docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md`, `CLAUDE.md`, `docs/superpowers/specs/2026-07-26-tenant-branding-and-whitelabel-design.md`

- [ ] **Step 1: Invocare la skill `product-marketing`**

Nel prompt di invocazione, indicare esplicitamente le tre fonti da leggere (non lasciare che la skill "studi il codebase" genericamente — questo repo è un tool interno, non ha landing page pubblica):

```
Usa la skill product-marketing per creare .agents/product-marketing.md.
Non esiste ancora nessun documento di contesto.
Usa l'opzione "auto-draft", ma con queste fonti esplicite invece dello scan generico del codebase:
1. docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md (fonte primaria: competitor, pricing, differenziazione, messaging, target)
2. CLAUDE.md (product overview, business model, success criteria)
3. docs/superpowers/specs/2026-07-26-tenant-branding-and-whitelabel-design.md (Tier 1/Tier 2, per differenziazione)

Per le sezioni Customer Language, Brand Voice, e Proof Points: NON inventare contenuto.
Marcale esplicitamente come "Non ancora validato — zero clienti reali ad oggi" invece di lasciarle vuote o di ipotizzare contenuto plausibile.

Per Personas: la fonte esplicita solo "HR/Ops Director di catene multi-sede" come decision maker.
Le altre righe della tabella persona (User, Champion, Financial Buyer) vanno marcate come ipotesi da validare, non fatti.
```

- [ ] **Step 2: Presentare la bozza e raccogliere correzioni**

La skill presenterà la bozza e chiederà cosa correggere/manca. Rispondere con eventuali correzioni note dal contesto di sessione (es. pricing a scaglioni €8/7/6,50, target "catene multi-sede 3+", claim primario "impedire che qualcuno timbri al posto di un collega").

- [ ] **Step 3: Verificare la versione e il changelog**

Expected: `Document version: v1`, changelog `- v1 (2026-08-11) — Bozza iniziale da spec positioning/pricing 26/7 e CLAUDE.md.`

- [ ] **Step 4: Presentare il documento completo all'utente per revisione**

Non procedere al Task 2 finché l'utente non conferma che la bozza v1 è accettabile — le skill successive la useranno come contesto.

- [ ] **Step 5: Commit**

```bash
git add .agents/product-marketing.md
git commit -m "docs: add v1 product marketing context document

Auto-drafted from the approved 2026-07-26 positioning/pricing spec and
CLAUDE.md. Customer language, brand voice, and proof points explicitly
marked as unvalidated (zero paying customers to date) rather than invented."
```

---

## Task 2: `competitor-profiling` — verifica dati freschi sui 5 competitor

**Files:**
- Read: `.agents/product-marketing.md` (la skill lo legge automaticamente)
- No file creato da questo task di per sé — l'output confluisce nel Task 4

- [ ] **Step 1: Verificare gli URL pubblici dei 5 competitor**

Gli URL non erano linkati nello spec 26/7, solo nominati. Prima di invocare la skill, cercare/confermare l'URL corretto per: NoBadge, Zucchetti/TeamSystem HR (modulo rilevazione presenze), Factorial, Personio, Deputy.

- [ ] **Step 2: Invocare la skill `competitor-profiling`**

```
Usa la skill competitor-profiling.
Competitor URLs: [i 5 URL confermati allo Step 1]
Depth level: quick scan (non deep profile) — l'obiettivo è verificare se qualcosa è
cambiato rispetto allo spec docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md
(datato 26/7/2026), non rifare l'analisi competitiva da zero.
Focus: pricing pubblico, ed eventuali nuove feature biometriche/anti-frode
(il differenziatore Face ID di BadgeSystem è esplicitamente definito come "non
difendibile in modo permanente" nello spec — verificare se un competitor lo ha
già implementato).
```

- [ ] **Step 3: Confrontare l'output con la tabella dello spec 26/7**

Per ciascun competitor, annotare: confermato invariato, oppure scostamento trovato (con dettaglio).

- [ ] **Step 4: Presentare il confronto all'utente**

Non serve un commit separato — l'output alimenta la sintesi del Task 4.

---

## Task 3: `pricing` — stress-test del pricing a scaglioni

**Files:**
- Read: `.agents/product-marketing.md` (letto automaticamente dalla skill)
- No file creato — output confluisce nel Task 4

- [ ] **Step 1: Invocare la skill `pricing`**

```
Usa la skill pricing.
Il pricing attuale (approvato in docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md)
è a scaglioni: €8/dipendente/mese (25-99 dipendenti) → €7 (100-149) → €6,50 (150-200),
più €250/sede una tantum (sedi 1-3) → €150 (sedi 4-10) → €100 (sedi 11+).

Non ripetere il confronto tabellare con i competitor già fatto nello spec — è
già stato fatto e aggiornato nel Task 2 di questo piano. Applica invece un
framework di pricing strategy (value metric, willingness-to-pay, packaging)
per verificare se questa struttura regge sotto un'analisi più rigorosa, o se
suggerisce un aggiustamento specifico.

Dai un esito esplicito: CONFERMA (nessuna modifica) oppure AGGIUSTAMENTO
PROPOSTO (con motivazione puntuale).
```

- [ ] **Step 2: Presentare l'esito all'utente**

Se l'esito è "aggiustamento proposto", chiedere conferma esplicita che vada portato nel Task 4 come proposta di revisione (non applicarlo automaticamente allo spec 26/7).

---

## Task 4: Sintesi — aggiornamento contesto e eventuale proposta di revisione

**Files:**
- Modify: `.agents/product-marketing.md`
- Modify (condizionale): `docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md`

- [ ] **Step 1: Aggiornare `.agents/product-marketing.md` a v2**

Invocare di nuovo la skill `product-marketing` (rilegge il documento esistente, chiede quali sezioni aggiornare):

```
Usa la skill product-marketing per aggiornare .agents/product-marketing.md.
Aggiorna la sezione Competitive Landscape con l'esito del competitor-profiling
di oggi (Task 2). Aggiorna la sezione relativa al pricing/differenziazione con
l'esito della skill pricing (Task 3).
```

Expected: `Document version: v2`, nuova entry changelog che nomina le sezioni toccate, es.:
`- v2 (2026-08-11) — Aggiornato competitive landscape dopo verifica fresca (competitor-profiling); [esito pricing: confermato invariato / aggiustamento proposto].`

- [ ] **Step 2: Decidere se serve la sezione di revisione allo spec 26/7**

**Se** Task 2 o Task 3 hanno trovato uno scostamento concreto (prezzo competitor cambiato in modo rilevante, o la skill `pricing` ha proposto un aggiustamento): procedere allo Step 3.

**Se** nessuno scostamento: skip allo Step 4.

- [ ] **Step 3 (condizionale): Aggiungere la sezione di revisione**

In fondo a `docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md`, dopo la sezione `## Changelog` esistente (se presente) o in fondo al file, aggiungere:

```markdown
---

## Revisione 2026-08-11

**Trigger:** [competitor-profiling ha trovato X / la skill pricing ha proposto Y]

**Scostamento trovato:** [descrizione puntuale, con fonte e data]

**Proposta:** [modifica specifica proposta, es. nuovo scaglione, nuovo competitor da aggiungere alla tabella]

**Stato:** Da approvare — questa sezione non modifica le conclusioni già "Approvato" sopra, resta una proposta separata finché l'utente non la conferma esplicitamente.
```

Non modificare nessuna riga delle sezioni esistenti del documento (tabella competitor, pricing definitivo, ecc.) — solo append.

- [ ] **Step 4: Presentare il risultato della sintesi all'utente**

- [ ] **Step 5: Commit**

```bash
git add .agents/product-marketing.md docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md
git commit -m "docs: refresh product marketing context with competitor/pricing verification (v2)

Ran competitor-profiling and pricing skills against the 2026-07-26 approved
spec. [Confirmed positioning unchanged / Added revision proposal section —
existing approved conclusions left untouched]."
```

(Nota: se non c'è stata modifica allo spec 26/7, rimuovere quel file dal comando `git add`.)

---

## Task 5: Materiale prospect-facing

**Precondizione:** Task 4 completato, `.agents/product-marketing.md` è a v2.

**Files:**
- Create: `docs/marketing/one-pager-badge-system.md`
- Create: `docs/marketing/cold-email-outreach-template.md`

- [ ] **Step 1: Creare la cartella se non esiste**

```bash
mkdir -p docs/marketing
```

- [ ] **Step 2: Invocare la skill `sales-enablement`**

```
Usa la skill sales-enablement.
Asset richiesto: un one-pager di vendita (non un deck multi-slide — scope minimo,
coerente con l'assenza di clienti reali: un deck completo ha senso dopo la prima
conversazione, non prima).
Usa il contesto già in .agents/product-marketing.md (la skill lo legge automaticamente).
Salva il risultato in docs/marketing/one-pager-badge-system.md.
```

- [ ] **Step 3: Presentare il one-pager e raccogliere correzioni dall'utente**

- [ ] **Step 4: Invocare la skill `cold-email`**

```
Usa la skill cold-email.
Vincolo esplicito: non esiste ancora un prospect nominato in questa sessione.
Scrivi un TEMPLATE generico per il segmento target (HR/Ops Director di catene
retail multi-sede, 3+ sedi, 25-200 dipendenti) con placeholder espliciti per
personalizzazione (nome, azienda, segnale specifico osservato) — non un'email
pronta per l'invio a una persona reale.
Usa il contesto già in .agents/product-marketing.md.
Salva il risultato in docs/marketing/cold-email-outreach-template.md.
```

- [ ] **Step 5: Presentare il template e raccogliere correzioni dall'utente**

- [ ] **Step 6: Commit**

```bash
git add docs/marketing/one-pager-badge-system.md docs/marketing/cold-email-outreach-template.md
git commit -m "docs: add sales one-pager and cold outreach email template

Both derived from .agents/product-marketing.md v2. The cold email is a
reusable template with placeholders — no named prospect identified yet."
```

---

## Task 6: Chiusura sessione

- [ ] **Step 1: Aggiornare TASKS.md**

Aggiungere una riga al Session Log che riassume: plugin marketing-skills installato, `.agents/product-marketing.md` creato (v1→v2), esito verifica competitor/pricing, materiale prospect-facing prodotto.

- [ ] **Step 2: Commit finale**

```bash
git add TASKS.md
git commit -m "docs: log product-marketing context session in TASKS.md"
```

Non è previsto un merge/PR per questo piano — tutti i commit vanno direttamente su `main`, coerente con la natura documentale/non di codice del lavoro (nessun rischio di regressione a un sistema in produzione).
