# Lista contatti verificata per l'outreach del primo cliente pilota — Design

**Data:** 2026-08-13
**Status:** Approvato
**Contesto:** Sotto-progetto del piano tattico `docs/marketing/piano-tattico-3000-primo-cliente.md` (scenario €1500) — la voce di budget "lista contatti verificata" (€600, scope ridotto ~100-150 account) va costruita fai-da-te con LinkedIn Sales Navigator + ricerca manuale, partendo da zero (nessuna banca dati camerale disponibile).

---

## Obiettivo

Costruire una lista di contatti verificati (aziende retail multi-sede italiane in target + decision maker reale HR/Ops Director) sufficiente a sostenere l'outreach del piano tattico, senza bloccare l'intero piano sul completamento della lista prima di iniziare a contattare nessuno.

## Passo 0 — Controllo relazioni Dataxiom esistenti (da fare per primo)

Prima di costruire qualunque batch a freddo: rivedere i clienti/contatti BI-Analytics esistenti di Dataxiom per un possibile fit col criterio retail multi-sede (3+ sedi, 25-200 dipendenti). Se emerge un fit, diventa il **primo contatto tentato**, prioritario su qualunque batch freddo — un'introduzione calda ha probabilità di risposta enormemente più alta di un cold outreach puro. Attività di revisione (minuti), non di ricerca.

## Fonti dati e criteri di qualifica

Fonti, in ordine di priorità (dal più mirato al più ampio):
1. Associazioni di categoria retail (Federdistribuzione, Confcommercio) — elenchi soci spesso pubblici, già filtrati per settore
2. Stampa di settore GDO (Mark Up, GDOWeek) — classifiche/articoli che nominano catene multi-sede con numero di punti vendita
3. Google Maps / ricerca "punti vendita [categoria] Italia" — le pagine "i nostri negozi" dei siti aziendali sono la prova più diretta del numero di sedi
4. LinkedIn (ricerca aziende, poi Sales Navigator) — filtro settore "Retail" + dimensione 51-200 dipendenti (fascia più vicina a 25-200), Italia

**Criteri di qualifica azienda (tutti e 3 richiesti):**
1. 3+ sedi fisiche verificabili (store locator del sito o conteggio Google Maps)
2. Stima dipendenti in fascia 25-200 (pagina LinkedIn azienda o "chi siamo")
3. Settore retail

**Priorità di sotto-verticale:** a parità di criterio, dare precedenza a GDO/supermercati/ipermercati rispetto a es. catene con pochi addetti per sede (es. piccole boutique) — più dipendenti sovrapposti per turno significa più esposizione reale al buddy punching, quindi pain-fit più alto e probabile tasso di risposta migliore a parità di sforzo.

## Verifica del contatto (decision maker)

Per ogni azienda qualificata:
1. Cercare su LinkedIn (pagina aziendale → "Persone") il ruolo HR/Ops Director o equivalente italiano ("Direttore Risorse Umane", "HR Manager", "Responsabile Operations")
2. Verificare che la posizione risulti attuale (non "ex" o profilo inattivo da anni)
3. Registrare nome, ruolo, URL profilo LinkedIn
4. Email: nessun tool a pagamento dedicato nel budget — tentare pattern standard (nome.cognome@dominioazienda.it) verificabile a vista su email pubbliche del sito ("contatti"/"lavora con noi"); se non verificabile con certezza, il contatto resta valido e il **canale primario diventa LinkedIn** (connessione/InMail via Sales Navigator, già a budget), non l'email

## Limiti InMail (Sales Navigator)

Il piano Sales Navigator Core ha tipicamente un tetto mensile InMail (~50/mese). Fallback esplicito oltre il tetto: **richiesta di connessione + messaggio post-accettazione** (gratuito, più lento ma senza limite di credito), invece di bloccarsi o accumulare contatti non raggiungibili.

## Formato lista

File CSV locale (es. `docs/marketing/contact-list/lista-contatti.csv`), **non committato su git** (dati professionali B2B trattabili su base di legittimo interesse, ma comunque fuori dal repo pubblico/condiviso) — **con backup su una cartella cloud privata personale** (Google Drive/iCloud, non condivisa), per non perdere il lavoro di ricerca in caso di problema locale.

**Colonne:** azienda, sito, n. sedi stimato, fascia dipendenti stimata, sotto-verticale, nome contatto, ruolo, URL LinkedIn, email (se verificata), stato verifica, batch, canale di contatto usato, data primo contatto, data risposta (se c'è), esito/follow-up.

**Nota GDPR:** dati professionali/pubblici (nome, ruolo, azienda), trattabili su base di legittimo interesse per contatto commerciale B2B pertinente al ruolo — prassi comune e accettata in Italia/UE, a condizione di offrire sempre un'opzione di opt-out esplicita nella prima email/messaggio di contatto.

## Cadenza a batch

| Quando | Batch | Dimensione | Azione |
|---|---|---|---|
| Subito | Passo 0 | — | Check relazioni Dataxiom esistenti, contatto prioritario se trovato |
| ~3-4 giorni | Batch 1 | **10-15 account** | Costruzione+verifica, poi outreach parte subito su questo batch |
| Settimana 2 | Batch 2 | 10-15 account | Costruzione in parallelo all'outreach del batch 1 |
| Dopo batch 1+2 (~20-30 totali) | Valutazione kill | — | Il criterio "≥5% risposta" (stesso del piano tattico) si valuta su **batch 1+2 combinati**, non sul solo batch 1 — un campione di 10-15 è troppo rumoroso per decidere da solo |
| Settimana 2-3 | Batch 3+ | fino a 100-150 totali | Solo se il tasso combinato lo giustifica; altrimenti ci si ferma e si rivede il messaging prima di costruire altri batch |

**Perché 10-15 e non 25-30 per batch:** con 5-8h/settimana disponibili e ricerca manuale da zero (qualificare un'azienda su 3 criteri + trovare e verificare il decision maker su LinkedIn richiede realisticamente 10-20 min/contatto), 25-30 contatti in 3-4 giorni non è raggiungibile con certezza. 10-15 è il numero coerente col tempo reale.

## Vincolo tempo/monte ore

Le 5-8h/settimana dedicate a questa attività competono col monte ore totale di progetto (10h/settimana complessivi, da `CLAUDE.md`) — per 2-3 settimane, questa attività assorbe la maggior parte del tempo disponibile su Badge System, lasciando poco margine per altro (es. la routine contenuti LinkedIn, eventuale sviluppo). Non è tempo aggiuntivo: è una scelta esplicita di priorità per questa finestra, da tenere presente se emergono altre urgenze sul progetto in parallelo.

## Gestione casi limite
- Azienda qualificata ma senza decision maker identificabile su LinkedIn → scartata, non conta nel totale del batch
- Batch sotto la dimensione attesa entro il tempo previsto → non forzare il numero con aziende fuori criterio, si compensa nel batch successivo
- Tetto InMail raggiunto → fallback a connessione + messaggio (vedi sopra)
- Tasso di risposta batch 1+2 combinato <5% → fermarsi, non costruire altri batch finché il messaging non è stato rivisto (coerente col criterio di kill del piano tattico — questa lista lo rispetta, non lo bypassa)

## Fuori scope
- Tool di email-finding a pagamento (Hunter.io, Apollo, ecc.) — non c'è budget dedicato separato da quello di Sales Navigator
- Banche dati camerali (AIDA/Cerved) — non disponibili, non nel budget di questo sotto-progetto
- Verifica/validazione automatica degli indirizzi email — verifica solo manuale/a vista
