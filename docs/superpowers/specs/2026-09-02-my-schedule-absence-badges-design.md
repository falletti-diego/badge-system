# "I Miei Turni" — Badge di assenza (malattia/ferie/evento) — Design Spec

**Data:** 2026-09-02
**Status:** Approvato via `/superpowers:brainstorming`, pronto per il piano di implementazione

## Problema

`MyScheduleScreen.jsx` (mobile, schermata "I Miei Turni") interroga solo `GET /api/v1/shifts/my-schedule` (tabella `shifts`). Un giorno in cui il dipendente ha una malattia, una ferie o un evento approvato/in attesa, ma **nessun turno assegnato**, mostra semplicemente `—` — visivamente identico a "giorno non ancora pianificato".

Scoperto durante un test manuale reale (TestFlight, 2026-09-02): il dipendente `maria.rossi@torino.it` aveva una malattia comunicata dal 31/08 al 05/09/2026, che correttamente bloccava la creazione di un evento per quelle date (comportamento backend corretto, verificato) — ma "I Miei Turni" non mostrava nulla per quei giorni, rendendo impossibile capire perché la richiesta fosse stata rifiutata.

Il backend possiede già il dato corretto; il gap è puramente di visualizzazione in questa schermata.

## Non-Goals (esplicitamente fuori scope)

- **`ManagerScheduleScreen.jsx`** (vista manager sulla squadra) — stessa ambiguità potenziale per altri dipendenti, ma non segnalata in questo bug report. Resta invariata; un piano separato se emerge la stessa esigenza.
- **Cache offline per le assenze.** A differenza dei turni (`AsyncStorage.CACHE_SHIFTS`, dato operativo critico), le assenze mostrate qui sono di sola consultazione. Se il dipendente è offline, vede solo i turni in cache, senza badge assenza, fino alla prossima connessione.
- **Nuovi endpoint backend.** Tutti i dati necessari sono già esposti da endpoint self-service esistenti (vedi sotto). Nessuna modifica lato backend.
- **Risoluzione del caso limite "turno assegnato sopra un'assenza approvata".** Oggi nulla impedisce a un manager di assegnare un turno in un giorno con ferie/malattia/evento già approvati (la mutua esclusione esiste solo tra ferie/malattia/evento tra loro — vedi CLAUDE.md Pattern 7 — non verso i turni). Questa spec non introduce un vincolo lato backend per impedirlo; definisce solo cosa mostrare in quel caso (vedi Decisione 3).

## Decisioni di design

### 1. Fonte dati: 3 fetch aggiuntive verso endpoint self-service esistenti

Per il mese/anno correntemente visualizzato, in parallelo alla fetch turni già esistente:

| Endpoint | Note |
|---|---|
| `GET /api/v1/illnesses/by-date-range?start_date=<1° del mese>&end_date=<ultimo del mese>` | Già scopato al dipendente stesso (`role === 'employee'` → `WHERE employee_id = userId`), filtra già `cancelled_at IS NULL` lato server. |
| `GET /api/v1/leaves/my-requests` | Nessun filtro data lato server (fino a 100 righe più recenti, ogni stato). Filtrare **client-side**: overlap con il mese visualizzato E `status IN ('PENDING', 'APPROVED')` (scarta `REJECTED`/`WITHDRAWN`). |
| `GET /api/v1/events/my-requests?date_from=<1°>&date_to=<ultimo>` | Filtro data già lato server. Filtrare **client-side** per `status IN ('PENDING', 'APPROVED')` (scarta `REJECTED`). |

Le 3 fetch partono nello stesso `useFocusEffect` della fetch turni esistente, con lo stesso pattern `AbortController` già in uso (evita race condition tra cambi di mese rapidi).

### 2. Priorità e badge visivo (solo per giorni senza turno assegnato)

Se il giorno **non ha un turno assegnato** ed esiste almeno un'assenza, si applica questa priorità (coerente con "malattia vince sempre", CLAUDE.md Pattern 7):

| Priorità | Tipo | Stato | Label | Icona | Colore |
|---|---|---|---|---|---|
| 1 (massima) | Malattia | (sempre attiva, nessun concetto di PENDING) | "Malattia" | 🤒 | `#DC2626` |
| 2 | Ferie | APPROVED | "Ferie" | 🏖️ | `#059669` |
| 2 | Ferie | PENDING | "Ferie (in attesa)" | 🏖️ | `#059669` |
| 3 (minima) | Evento | APPROVED | "Evento" | 📅 | `#7C3AED` |
| 3 (minima) | Evento | PENDING | "Evento (in attesa)" | 📅 | `#7C3AED` |

Stile del badge (contenitore + icona + label): stesso componente visivo dei badge turno esistenti (`styles.shiftBadge`/`styles.shiftIcon`/`styles.shiftLabel` in `MyScheduleScreen.jsx`), riusato as-is — sfondo `color + '20'` (stessa convenzione esadecimale-alpha già usata per `SHIFT_COLORS[shift] + '20'`), testo/icona nel colore pieno della tabella sopra. Per distinguere PENDING da APPROVED **non** si usa l'opacità (rischia di sembrare "disabilitato"/errore di rendering) — si usa esclusivamente il testo del label (" (in attesa)" nel suffisso), colore e icona identici tra i due stati.

Se più assenze coincidono sullo stesso giorno (non dovrebbe accadere per le coppie mutuamente esclusive malattia/ferie/evento, ma un evento PENDING può tecnicamente coesistere con una ferie PENDING finché nessuna delle due è approvata — la mutua esclusione backend blocca solo alla creazione/approvazione, non retroattivamente) si mostra solo la priorità più alta.

### 3. Turno assegnato vince sempre sul badge di assenza

Se il giorno **ha già un turno assegnato** (valore diverso da vuoto in `shiftsData[date]`), si mostra il turno esattamente come oggi — nessun badge di assenza, anche se esiste un'assenza approvata per quella data. Scelta deliberata: non introdurre una nuova UI per un caso limite raro che è un problema di pianificazione a monte (un manager non dovrebbe assegnare un turno sopra un'assenza approvata), non un problema di questa schermata.

### 4. Gestione errori: degrado silenzioso

Se una o più delle 3 nuove fetch falliscono (es. problema di rete), i turni restano visibili normalmente (comportamento invariato). I giorni la cui assenza non si è potuta verificare mostrano semplicemente `—`, **nessun banner d'errore visibile** — coerente con lo stile fire-and-forget già adottato in questo progetto per le notifiche push (`notifyEmployee`, Session 119).

### 5. Logica di priorità come funzione pura testabile

La logica "dato un giorno, uno `shiftValue`, e le 3 liste di assenze del mese, quale badge mostrare (se c'è)" va estratta in una funzione pura (es. `resolveAbsenceBadge(date, shiftValue, illnesses, leaves, events)` in un nuovo file `src/utils/absenceBadges.js`), separata dal componente — testabile in isolamento senza montare l'intero screen, seguendo la stessa filosofia di file piccoli e a responsabilità unica già osservata nel resto del progetto.

## Testing

- **Unit test** su `resolveAbsenceBadge()`: priorità malattia > ferie > evento; PENDING vs APPROVED per ferie/evento; nessun badge se il giorno ha un turno; nessun badge se nessuna assenza copre quella data; una ferie/evento `REJECTED`/`WITHDRAWN` non genera badge.
- **Component test** su `MyScheduleScreen.jsx`: rendering del badge corretto per un giorno con malattia (mock delle 3 fetch); degrado silenzioso quando una fetch assenze fallisce ma quella turni ha successo (i turni restano visibili, nessun banner d'errore, i giorni coinvolti restano `—`).

## Compatibilità / rollback

Additiva al 100%: nessuna modifica backend, nessuna modifica schema. Se le 3 nuove fetch falliscono sistematicamente (es. un problema di permessi non prima riscontrato), il comportamento degrada esattamente allo stato attuale (solo turni, nessun badge assenza) — mai un errore bloccante per l'utente.
