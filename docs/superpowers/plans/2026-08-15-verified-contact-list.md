# Lista Contatti Verificata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Costruire, a batch, una lista verificata di aziende retail multi-sede italiane (3+ sedi, 25-200 dipendenti) con il relativo decision maker HR/Ops reale, sufficiente a sostenere l'outreach del primo cliente pilota Badge System, senza bloccare l'inizio dell'outreach sul completamento dell'intera lista.

**Architecture:** Un file CSV locale non versionato (dati professionali B2B) tiene lo stato di ogni contatto, affiancato da un README/template committabili che documentano processo e formato. Il lavoro procede a batch di 10-15 aziende: si qualifica un'azienda su 3 criteri, si trova e verifica il decision maker su LinkedIn, si registra nel CSV, e l'outreach sul batch parte subito — non si aspetta che l'intera lista sia pronta. Il criterio di prosecuzione (kill) si valuta sul totale di batch 1+2 combinati, non batch per batch.

**Tech Stack:** LinkedIn (ricerca aziende + Sales Navigator), Google Search/Maps, CSV, git, cartella cloud privata per backup (Google Drive o iCloud, a scelta dell'utente in fase di esecuzione).

**Fonte:** `docs/superpowers/specs/2026-08-13-verified-contact-list-design.md` (spec approvata).

---

## File Structure

- Create: `docs/marketing/contact-list/README.md` — spiega processo, criteri di qualifica, formato colonne, note GDPR (committabile, nessun dato personale)
- Create: `docs/marketing/contact-list/.gitignore` — esclude il file dati reale dal repo
- Create: `docs/marketing/contact-list/lista-contatti-template.csv` — solo intestazione colonne, committabile
- Non creato da questo piano (prodotto durante l'esecuzione, mai committato): `docs/marketing/contact-list/lista-contatti.csv` — copia del template compilata con i dati reali

---

## Task 1: Struttura cartella e file committabili

**Files:**
- Create: `docs/marketing/contact-list/README.md`
- Create: `docs/marketing/contact-list/.gitignore`
- Create: `docs/marketing/contact-list/lista-contatti-template.csv`

- [ ] **Step 1: Creare la cartella e il README**

Contenuto esatto di `docs/marketing/contact-list/README.md`:

```markdown
# Lista contatti verificata — outreach primo cliente pilota

Vedi design completo: `docs/superpowers/specs/2026-08-13-verified-contact-list-design.md`
Vedi piano di implementazione: `docs/superpowers/plans/2026-08-15-verified-contact-list.md`

## File di lavoro

`lista-contatti.csv` (NON committato — contiene dati di contatto reali).
Per iniziare: copiare `lista-contatti-template.csv` in `lista-contatti.csv` nella stessa cartella.

## Criteri di qualifica azienda (tutti e 3 richiesti)

1. 3+ sedi fisiche verificabili (store locator del sito o conteggio Google Maps)
2. Stima dipendenti in fascia 25-200 (pagina LinkedIn azienda o "chi siamo")
3. Settore retail — priorità a GDO/supermercati/ipermercati (più esposizione al buddy punching)

## Criteri di verifica contatto

1. Ruolo HR/Ops Director o equivalente italiano, trovato su LinkedIn (pagina aziendale → Persone)
2. Posizione verificata come attuale (non "ex" o profilo inattivo)
3. Email solo se verificabile a vista (pattern nome.cognome@dominio su pagina "contatti" del sito) — altrimenti canale primario = LinkedIn (InMail o connessione+messaggio)

## Backup

Copiare `lista-contatti.csv` in una cartella cloud privata personale (Google Drive o iCloud, non condivisa) dopo ogni sessione di lavoro — il file non è mai su git.

## Note GDPR

Dati professionali/pubblici (nome, ruolo, azienda) trattati su base di legittimo interesse per contatto commerciale B2B pertinente al ruolo. Ogni primo contatto deve offrire un'opzione di opt-out esplicita.
```

- [ ] **Step 2: Creare il `.gitignore` della cartella**

Contenuto esatto di `docs/marketing/contact-list/.gitignore`:

```
lista-contatti.csv
```

- [ ] **Step 3: Creare il template CSV (solo intestazione)**

Contenuto esatto di `docs/marketing/contact-list/lista-contatti-template.csv`:

```csv
azienda,sito,n_sedi_stimato,fascia_dipendenti_stimata,sotto_verticale,nome_contatto,ruolo,url_linkedin,email_verificata,stato_verifica,batch,canale_contatto,data_primo_contatto,data_risposta,esito_follow_up
```

- [ ] **Step 4: Verificare che il file dati reale non sia tracciato**

Run: `cd "docs/marketing/contact-list" && cp lista-contatti-template.csv lista-contatti.csv && cd - && git status --short docs/marketing/contact-list/`
Expected: solo `README.md`, `.gitignore`, `lista-contatti-template.csv` compaiono come untracked/da aggiungere — `lista-contatti.csv` NON deve comparire (ignorato)

- [ ] **Step 5: Commit dei soli file committabili**

```bash
git add docs/marketing/contact-list/README.md docs/marketing/contact-list/.gitignore docs/marketing/contact-list/lista-contatti-template.csv
git commit -m "docs: scaffold verified contact list tracking (README, gitignore, template)

Real data file (lista-contatti.csv) is gitignored — professional B2B
contact data stays out of the repo, backed up to a private cloud folder
instead."
```

---

## Task 2: Passo 0 — Controllo relazioni Dataxiom esistenti

**Files:**
- Modify: `docs/marketing/contact-list/lista-contatti.csv` (non committato)

- [ ] **Step 1: Elencare i clienti/contatti Dataxiom esistenti**

Rivedere manualmente (email, fatture, contatti CRM/appunti personali di Diego) l'elenco di clienti/prospect Dataxiom attuali o recenti (servizio BI/Analytics), indipendentemente da Badge System.

- [ ] **Step 2: Applicare i 3 criteri di qualifica a ciascuno**

Per ciascun cliente/contatto in elenco, verificare: 3+ sedi fisiche, 25-200 dipendenti, settore retail. Vedi checklist in `README.md`.

- [ ] **Step 3: Registrare l'esito**

Se emerge almeno un fit: aggiungere una riga a `lista-contatti.csv` con `batch = "0-esistente"` e `stato_verifica = "priorità - relazione esistente"`.
Se nessun fit: annotare in una nota separata (non nel CSV, che è solo per contatti validi) che il passo 0 non ha prodotto risultati, per non ripeterlo inutilmente in futuro.

- [ ] **Step 4: Nessun commit in questo task**

Il CSV con dati reali non va mai committato (vedi Task 1, `.gitignore`).

---

## Task 3: Sourcing aziende — Batch 1 (10-15 account)

**Files:**
- Modify: `docs/marketing/contact-list/lista-contatti.csv` (non committato)

- [ ] **Step 1: Ricerca su associazioni di categoria**

Query di ricerca da eseguire su Google: `elenco associati Federdistribuzione` e `elenco soci Confcommercio distribuzione moderna`. Annotare i nomi delle catene retail multi-sede che compaiono, con priorità a GDO/supermercati/ipermercati.

- [ ] **Step 2: Ricerca su stampa di settore GDO**

Query di ricerca: `classifica catene supermercati italiane per numero punti vendita site:markup.it` e `classifica catene retail italiane GDOWeek`. Annotare nomi e, se presente, numero di sedi dichiarato nell'articolo.

- [ ] **Step 3: Verifica store locator per ciascun candidato**

Per ogni azienda candidata dai passi 1-2: cercare `[nome azienda] punti vendita` o `[nome azienda] negozi` su Google, aprire la pagina "i nostri negozi"/store locator del sito ufficiale, contare le sedi elencate. Qualifica solo se ≥3.

- [ ] **Step 4: Verifica fascia dipendenti**

Per ogni azienda che supera lo Step 3: cercare la pagina aziendale LinkedIn (`[nome azienda] LinkedIn`), controllare il numero dipendenti dichiarato. Qualifica solo se rientra in 25-200 (o fascia LinkedIn 51-200, la più vicina disponibile).

- [ ] **Step 5: Registrare le aziende qualificate**

Per ogni azienda che supera Step 3 e Step 4, aggiungere una riga a `lista-contatti.csv` con: `azienda`, `sito`, `n_sedi_stimato`, `fascia_dipendenti_stimata`, `sotto_verticale` (es. "supermercati", "abbigliamento"), `batch = "1"`, `stato_verifica = "azienda qualificata, contatto da trovare"`. Fermarsi a 10-15 aziende qualificate per questo batch.

- [ ] **Step 6: Nessun commit in questo task**

Dati reali, non committati (vedi Task 1).

---

## Task 4: Verifica decision maker — Batch 1

**Files:**
- Modify: `docs/marketing/contact-list/lista-contatti.csv` (non committato)

- [ ] **Step 1: Cercare il decision maker su LinkedIn per ciascuna azienda del Batch 1**

Per ogni riga con `batch = "1"`: aprire la pagina aziendale LinkedIn trovata al Task 3, sezione "Persone", filtrare per titolo cercando `HR`, `Risorse Umane`, `Operations`, `Responsabile Operations`.

- [ ] **Step 2: Verificare che la posizione sia attuale**

Aprire il profilo del candidato trovato, controllare che il ruolo HR/Ops in quell'azienda sia marcato come posizione attuale (non passata) e che il profilo mostri attività recente (non abbandonato da anni).

- [ ] **Step 3: Tentare la verifica email**

Cercare `[nome azienda] contatti` o `[nome azienda] lavora con noi` sul sito ufficiale, controllare se espone un pattern email pubblico (es. nome.cognome@dominio.it). Se il pattern è verificabile a vista, registrarlo; altrimenti lasciare vuoto.

- [ ] **Step 4: Registrare il contatto**

Aggiornare la riga corrispondente in `lista-contatti.csv` con: `nome_contatto`, `ruolo`, `url_linkedin`, `email_verificata` (se trovata), `stato_verifica = "contatto verificato, pronto per outreach"`. Se nessun decision maker identificabile: `stato_verifica = "scartato - nessun contatto identificabile"` (non conta nel totale batch).

- [ ] **Step 5: Nessun commit in questo task**

Dati reali, non committati.

---

## Task 5: Canale di contatto e limiti InMail

**Files:**
- Modify: `docs/marketing/contact-list/lista-contatti.csv` (non committato)

- [ ] **Step 1: Controllare i crediti InMail residui**

Aprire LinkedIn Sales Navigator → impostazioni account → controllare il numero di InMail residui nel mese in corso.

- [ ] **Step 2: Assegnare il canale per ogni contatto verificato del Batch 1**

Per ogni riga con `stato_verifica = "contatto verificato, pronto per outreach"`: se `email_verificata` è presente, `canale_contatto = "email"`. Altrimenti, se restano crediti InMail, `canale_contatto = "inmail"`; se i crediti sono esauriti, `canale_contatto = "connessione+messaggio"`.

- [ ] **Step 3: Registrare il canale nel CSV**

Aggiornare la colonna `canale_contatto` per ogni riga del Batch 1.

- [ ] **Step 4: Nessun commit in questo task**

Dati reali, non committati.

---

## Task 6: Avviare outreach Batch 1 e tracciare risposte

**Files:**
- Modify: `docs/marketing/contact-list/lista-contatti.csv` (non committato)
- Read: `docs/marketing/cold-email-outreach-template.md` (template già esistente, non riscritto qui)

- [ ] **Step 1: Inviare il primo contatto per ogni riga del Batch 1**

Usare il template esistente in `docs/marketing/cold-email-outreach-template.md` per il canale `email`, o un messaggio equivalente personalizzato per `inmail`/`connessione+messaggio`, verso ogni contatto del Batch 1 con `stato_verifica = "contatto verificato, pronto per outreach"`.

- [ ] **Step 2: Registrare la data del primo contatto**

Per ogni riga contattata, impostare `data_primo_contatto` (formato `YYYY-MM-DD`) e aggiornare `stato_verifica = "contattato"`.

- [ ] **Step 3: Tracciare le risposte ricevute**

Per ogni risposta ricevuta nei giorni successivi: impostare `data_risposta` e `esito_follow_up` (es. "call prenotata", "non interessato", "nessuna risposta" se dopo 5 giorni lavorativi non arriva nulla).

- [ ] **Step 4: Nessun commit in questo task**

Dati reali, non committati.

---

## Task 7: Sourcing e verifica — Batch 2 (in parallelo all'outreach del Batch 1)

**Files:**
- Modify: `docs/marketing/contact-list/lista-contatti.csv` (non committato)

- [ ] **Step 1: Ripetere Task 3 (Step 1-5) per il Batch 2**

Stesse fonti e query del Task 3, evitando le aziende già presenti in `lista-contatti.csv` (controllo duplicati per nome azienda). Target 10-15 nuove aziende qualificate, `batch = "2"`.

- [ ] **Step 2: Ripetere Task 4 (Step 1-4) per il Batch 2**

Verifica decision maker per ogni azienda del Batch 2.

- [ ] **Step 3: Ripetere Task 5 (Step 1-3) per il Batch 2**

Assegnazione canale di contatto, ricontrollando i crediti InMail residui (potrebbero essere scesi dopo il Batch 1).

- [ ] **Step 4: Avviare outreach sul Batch 2**

Ripetere Task 6 (Step 1-3) per le righe del Batch 2.

- [ ] **Step 5: Nessun commit in questo task**

Dati reali, non committati.

---

## Task 8: Valutazione criterio di kill su Batch 1+2 combinati

**Files:**
- Modify: `docs/marketing/contact-list/lista-contatti.csv` (non committato)

- [ ] **Step 1: Attendere almeno 5 giorni lavorativi dal contatto del Batch 2**

Il criterio si valuta solo dopo che entrambi i batch hanno avuto tempo sufficiente per ricevere risposta.

- [ ] **Step 2: Calcolare il tasso di risposta combinato**

Formula: `(numero righe con esito_follow_up diverso da "nessuna risposta" e diverso da vuoto, tra batch 1 e 2) / (numero totale righe contattate tra batch 1 e 2) × 100`.

- [ ] **Step 3: Decidere in base alla soglia**

Se il tasso è **≥5%**: procedere al Task 9 (Batch 3+).
Se il tasso è **<5%**: fermarsi. Non costruire altri batch. Rivedere il messaging in `docs/marketing/cold-email-outreach-template.md` prima di qualunque ulteriore contatto — coerente con il criterio di kill già definito nel piano tattico (`docs/marketing/piano-tattico-3000-primo-cliente.md`).

- [ ] **Step 4: Registrare l'esito della valutazione**

Annotare in una riga di nota (fuori dal CSV strutturato, es. in fondo al file o in un commento separato) la data della valutazione, il tasso calcolato, e la decisione presa.

---

## Task 9 (condizionale — solo se Task 8 risulta ≥5%): Batch 3+ fino a 100-150 account

**Files:**
- Modify: `docs/marketing/contact-list/lista-contatti.csv` (non committato)

- [ ] **Step 1: Ripetere il pattern Task 3 → 4 → 5 → 6 per ogni batch successivo**

Ogni nuovo batch da 10-15 account, `batch = "3"`, `"4"`, ecc., fino a un totale di 100-150 aziende contattate o fino a quando il budget/tempo disponibile (vedi vincolo ore, spec) lo consente.

- [ ] **Step 2: Controllo duplicati ad ogni batch**

Prima di aggiungere una nuova azienda, verificare che non sia già presente in `lista-contatti.csv` (nessun nome azienda duplicato).

- [ ] **Step 3: Backup dopo ogni batch completato**

Copiare `lista-contatti.csv` nella cartella cloud privata di backup (vedi `README.md`).

---

## Task 10: Backup periodico e chiusura

**Files:**
- Nessun file di codice — attività manuale ricorrente

- [ ] **Step 1: Copiare il file dati nella cartella di backup**

Dopo ogni sessione di lavoro sulla lista, copiare `docs/marketing/contact-list/lista-contatti.csv` nella cartella cloud privata (Google Drive o iCloud) scelta in fase di esecuzione.

- [ ] **Step 2: Verificare che il file dati resti fuori da git**

Run: `git status --short docs/marketing/contact-list/`
Expected: nessuna riga per `lista-contatti.csv` (ignorato da `.gitignore`)

---

Non è previsto un merge/PR per questo piano — è un processo operativo, non codice applicativo. I soli commit riguardano i file di scaffolding non sensibili (README, `.gitignore`, template), mai il file dati reale.
