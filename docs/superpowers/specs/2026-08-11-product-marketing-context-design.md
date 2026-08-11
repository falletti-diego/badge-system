# Documento di Contesto Marketing — Design

**Data:** 11 Agosto 2026
**Status:** Approvato
**Collegato a:** `docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md` (fonte primaria), `CLAUDE.md`, plugin `marketing-skills@marketingskills` v2.10.0

---

## Contesto

Il plugin `marketing-skills` (49 skill, coreyhaines31/marketingskills) è stato installato in questa sessione. Tutte le skill del plugin leggono `.agents/product-marketing.md` come contesto condiviso — se non esiste, ogni skill lo chiede da capo, con rischio di inconsistenza rispetto alle decisioni di positioning/pricing già approvate il 26/7.

**Vincolo di realtà (invariato dallo spec del 26/7):** zero clienti paganti ad oggi. Ogni sezione del documento di contesto che richiederebbe dati da clienti reali (linguaggio verbatim, proof point, metriche) va marcata esplicitamente come non disponibile, non inventata.

**Perché ora, e perché non solo il documento di contesto:** la priorità già stabilita in questa sessione è validare positioning e pricing con un prospect reale, non continuare a costruire funzionalità. Un documento di contesto puramente interno non sposta questa priorità in avanti — va accompagnato da almeno un artefatto utilizzabile in una conversazione commerciale reale (one-pager, email di primo contatto).

---

## Obiettivo

1. Creare `.agents/product-marketing.md`, pilotato sulle fonti già approvate (non un auto-draft generico dal codebase, che per questo repo è un tool interno senza landing page pubblica).
2. Sottoporre positioning e pricing esistenti (spec 26/7) a una verifica critica di seconda mano, usando le skill dedicate del plugin appena installato (`competitor-profiling`, `pricing`), non solo il ragionamento manuale già fatto.
3. Se la verifica trova uno scostamento concreto, produrre una proposta di revisione dello spec 26/7 — mai una sovrascrittura silenziosa delle conclusioni già approvate.
4. Produrre materiale prospect-facing (one-pager + bozza email di primo contatto) che consumi il contesto appena creato, così che il lavoro di questa sessione produca qualcosa di spendibile nella prossima conversazione commerciale.

---

## Architettura del lavoro

Cinque fasi sequenziali. L'ordine non è arbitrario: `competitor-profiling`, `pricing`, `sales-enablement` e `cold-email` cercano tutte `.agents/product-marketing.md` all'avvio e lo usano come contesto — va quindi creato (anche solo in bozza v1) prima di invocarle, altrimenti ciascuna skill ripete domande già risposte nello spec 26/7.

```
Fase 1: Bozza v1 product-marketing.md (da spec 26/7 + CLAUDE.md)
    │
    ▼
Fase 2: competitor-profiling (5 competitor, verifica dati freschi)
    │
    ▼
Fase 3: pricing (stress-test del pricing a scaglioni €8/7/6,50)
    │
    ▼
Fase 4: Sintesi — bump versione product-marketing.md
         + eventuale proposta di revisione spec 26/7 (sezione aggiuntiva, mai sovrascrittura)
    │
    ▼
Fase 5: sales-enablement (one-pager) + cold-email (template outreach)
```

### Fase 1 — Bozza v1 di `.agents/product-marketing.md`

Fonti primarie, in ordine di autorevolezza:
1. `docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md` — competitor, pricing, differenziazione, messaging, target
2. `CLAUDE.md` — product overview, business model, success criteria, stack
3. `docs/superpowers/specs/2026-07-26-tenant-branding-and-whitelabel-design.md` — Tier 1/Tier 2, per la sezione differenziazione

Mappatura sezioni → fonte (dallo schema `SKILL.md` di `product-marketing`):

| Sezione documento | Fonte | Stato atteso |
|---|---|---|
| Product Overview | CLAUDE.md | Completa |
| Target Audience | spec 26/7 ("catene multi-sede 3+") | Completa |
| Personas | spec 26/7 (solo HR/Ops Director esplicito) | Parziale — Champion/User/Financial Buyer da ipotizzare e marcare come ipotesi |
| Problems & Pain Points | spec 26/7 (buddy punching, time-theft) | Completa |
| Competitive Landscape | spec 26/7 (tabella 5 competitor) | Completa, da rinfrescare in Fase 2 |
| Differentiation | spec 26/7 + spec whitelabel | Completa |
| Objections & Anti-Personas | spec 26/7 (rischio prezzo) + ragionamento | Parziale |
| Switching Dynamics (4 forze JTBD) | Da derivare da spec 26/7, non esplicitato prima | Nuovo — prima volta che viene articolato |
| Customer Language | — | **Vuota, marcata "non validato — zero clienti reali"** |
| Brand Voice | — | **Vuota, marcata "non ancora definito"** |
| Proof Points | — | **Vuota, marcata "non disponibile — nessun cliente pilota"** |
| Goals | CLAUDE.md (success criteria) | Completa |

Versione iniziale: `v1`, changelog: `- v1 (2026-08-11) — Bozza iniziale da spec positioning/pricing 26/7 e CLAUDE.md.`

### Fase 2 — `competitor-profiling`

Input: URL pubblici dei 5 competitor già nominati nello spec 26/7 (NoBadge, Zucchetti/TeamSystem HR, Factorial, Personio, Deputy). Gli URL esatti vanno verificati al momento dell'esecuzione (non erano linkati nello spec originale, solo nominati).

Profondità: **quick scan**, non deep profile — l'obiettivo è verificare scostamenti da dati di ~2 settimane fa, non rifare l'analisi da zero. Focus: pricing pubblico, eventuali nuove feature biometriche/anti-frode (il differenziatore Face ID è esplicitamente definito come "non difendibile in modo permanente" nello spec 26/7, sezione Rischi).

Output atteso: per ciascun competitor, conferma o segnalazione di scostamento rispetto alla tabella dello spec 26/7, con data del check.

### Fase 3 — `pricing`

Input: `.agents/product-marketing.md` v1 (letto automaticamente dalla skill) + output Fase 2.

Obiettivo esplicito: non ripetere il confronto tabellare già fatto il 26/7, ma applicare un framework di pricing strategy (value metric, willingness-to-pay, packaging) alla struttura a scaglioni già decisa (€8 → €7 → €6,50 per 25-99/100-149/150-200 dipendenti; €250 → €150 → €100 per sede) per verificare se regge sotto un'analisi più rigorosa o se emergono aggiustamenti.

Output atteso: uno dei due esiti, esplicito:
- **Conferma** — il pricing attuale è coerente con il framework, nessuna modifica proposta
- **Aggiustamento proposto** — con motivazione, da portare in Fase 4

### Fase 4 — Sintesi

1. Aggiornare `.agents/product-marketing.md`: bump a `v2`, changelog che nomina le sezioni toccate e il perché (seguendo la convenzione già in uso nel `SKILL.md` di `product-marketing`, es. `- v2 (2026-08-11) — Aggiornato competitive landscape dopo verifica fresca; [esito pricing].`)
2. **Se** Fase 2 o Fase 3 hanno trovato uno scostamento concreto: aggiungere una sezione `## Revisione 2026-08-11` in fondo a `docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md`, che descrive lo scostamento trovato e una proposta — **non modifica le sezioni esistenti già approvate**. Questa sezione resta in stato "da approvare" finché l'utente non conferma esplicitamente.
3. **Se** nessuno scostamento: dichiararlo esplicitamente nel changelog di `product-marketing.md` (es. "Positioning e pricing del 26/7 confermati dopo verifica con competitor-profiling e pricing skill — nessuna modifica.").

### Fase 5 — Materiale prospect-facing

Precondizione: `.agents/product-marketing.md` v2 esiste (Fase 4 completata).

1. **`sales-enablement`** → one-pager di vendita. Consuma direttamente differenziazione, obiezioni e pricing dal contesto v2. Formato: documento singolo, non un deck multi-slide (scope minimo, coerente con "nessun cliente ancora" — un deck completo avrebbe senso dopo la prima conversazione, non prima).

2. **`cold-email`** → bozza di email di primo contatto. **Vincolo esplicito:** nessun prospect nominato esiste ancora in questa sessione — l'email sarà un **template generico** per il segmento target (HR/Ops Director di catene retail multi-sede 3+), con placeholder per personalizzazione (nome, azienda, segnale specifico), non un'email pronta per l'invio a una persona reale. La skill stessa lo prevede ("Work with whatever the user gives you... note what would make it stronger").

Output: due file, salvati dove l'utente indica durante l'esecuzione (probabilmente `docs/marketing/` o cartella equivalente, da decidere in fase di esecuzione — non è un vincolo architetturale rilevante per questo spec).

---

## Testing / Validazione

Non essendo codice, la "verifica" per ciascuna fase è una revisione umana esplicita prima di procedere alla fase successiva:

- **Fase 1:** l'utente rivede la bozza v1 prima che Fase 2 inizi (le skill successive la useranno come contesto — un errore qui si propaga).
- **Fase 2-3:** output delle skill mostrato per intero, non riassunto, prima di passare alla sintesi.
- **Fase 4:** se viene proposta una revisione dello spec 26/7, richiedere conferma esplicita dell'utente prima di considerarla "proposta" definitiva (resta comunque non approvata fino a decisione separata).
- **Fase 5:** entrambi gli artefatti (one-pager, email) rivisti dall'utente — sono materiale che uscirà verso l'esterno, non solo contesto interno.

---

## Rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Gli URL dei competitor non sono verificati in questo spec | Basso | Verificarli come primo step di esecuzione della Fase 2, non assumerli |
| `competitor-profiling`/`pricing` potrebbero suggerire modifiche che contraddicono una decisione già "Approvato" (spec 26/7) | Medio | Per design, Fase 4 non sovrascrive mai lo spec esistente — solo propone in una sezione separata |
| L'email cold-outreach generica potrebbe essere usata così com'è senza personalizzazione | Basso-Medio | Esplicitato nel deliverable stesso e in questo spec: è un template, non un'email pronta all'invio |
| Nessuna delle 5 fasi produce un secondo canale di validazione oltre a un singolo prospect ipotetico | Basso | Fuori scope per questo spec — coerente con la raccomandazione già data in sessione di validare con UN prospect reale prima di scalare |

---

## Changelog
- v1 (2026-08-11) — Spec iniziale.
