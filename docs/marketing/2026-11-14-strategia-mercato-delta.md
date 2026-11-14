# Strategia di mercato — aggiornamento (delta) 2026-11-14

**Scritto per:** Diego Falletti, per decisioni go-to-market.
**Natura:** NON una nuova strategia. È un delta sui documenti esistenti (`.agents/product-marketing.md` v6, `docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md`, `docs/marketing/piano-tattico-3000-primo-cliente.md`) dopo una ricerca competitiva fresca di novembre 2026. Dice **cosa regge, cosa è cambiato, e cosa cambierei** — non ripete ciò che quei documenti già dicono bene.

---

## 0. In una riga

Il posizionamento di luglio-agosto regge nei numeri (prezzo NoBadge confermato a €5,04, verificato dal vivo), **ma due assunzioni di fondo si sono indebolite**: (1) l'anti-buddy-punching biometrico, pensato come il differenziatore #1, è diventato *commodity* tra i competitor (Jibble gratis, Skello/Buddy Punch con foto) proprio mentre il nostro Face ID non è un gate reale; (2) il fee per sede è uno svantaggio diretto verso NoBadge *esattamente* sul segmento multi-sede che abbiamo scelto. **Raccomandazione netta: spostare il messaggio-guida dalla frode biometrica all'ampiezza della suite (presenze + turni + assenze + export paghe), e ripensare il fee per sede.**

---

## 1. Cosa regge (confermato dalla ricerca fresca)

- **NoBadge = €5,04/utente attivo/mese, verificato direttamente dal sito (14/11/2026)**: tutte le funzioni incluse, **sedi illimitate**, zero hardware, zero attivazione, trial 15 giorni, paga solo chi timbra. Il dato dello spec di luglio (€4,20–5,04) è ancora valido, in cima alla fascia. Gap di prezzo verso BadgeSystem (€8 → €6,50) resta **~1,3–1,6x**.
- **Zucchetti/TeamSystem, Factorial, Personio**: nessun cambiamento sostanziale rilevato. Restano suite più pesanti/costose, percepite come overkill da chi vuole il solo modulo presenze. La caratterizzazione dello spec regge.
- **`product-marketing.md` v6 è accurato e onesto**: ha già corretto il claim Face ID (opzionale, verifica il device non il volto per-account, mai un gate server-side) e già elenca turni/export paghe come differenziatori. Nessuna correzione di fatti da fare lì — questo delta aggiunge la *lettura competitiva aggiornata*, non corregge errori.

## 2. Cosa è cambiato / si è indebolito (nuovo rispetto ad agosto)

### 2.1 — L'anti-buddy-punching non è più un differenziatore raro
La ricerca di novembre mostra che la prevenzione del "timbra-per-un-collega" è ormai una funzione diffusa, affrontata da più player con foto/biometria:
- **Jibble** — attendance con **riconoscimento facciale, dichiarato gratuito**, presente sul mercato italiano.
- **Skello** (~€5-6/dip/mese) — foto allo scatto + blocco delle app GPS false, esplicitamente contro il buddy punching.
- **Buddy Punch** (€4,49/utente + €19 base) — QR + PIN + foto a ogni timbratura.

Lo spec di luglio diceva "biometria assente in tutti i competitor italiani analizzati". A novembre non è più vero in senso ampio: il *problema* (identità di chi timbra) è presidiato da concorrenti, alcuni gratis. Il nostro Face ID, che per di più **non è un gate reale** (v6), non regge come argomento-guida #1.

### 2.2 — Il fee per sede è uno svantaggio sul nostro stesso target
Abbiamo scelto come ICP le **catene multi-sede (3+ sedi)**. Ma:
- **NoBadge: sedi illimitate incluse, €0.**
- **BadgeSystem: €250 (sedi 1-3) → €150 (4-10) → €100 (11+) una tantum per sede.**

Per una catena da 10 punti vendita sono ~€1.000-1.500 una tantum che il concorrente diretto **non chiede affatto**. Lo spec presenta gli scaglioni come "pensati per contenere il costo sulle catene grandi", ma non si confronta col fatto che il competitor azzera quella voce. Sul segmento che abbiamo scelto, questo è un punto di attrito reale in trattativa, non un dettaglio.

### 2.3 — Il QR dinamico di NoBadge batte il nostro QR statico sull'anti-frode
NoBadge usa un **QR dinamico** (cambia ogni pochi secondi): mitiga la foto/screenshot del codice. Il nostro è **statico** (`CLAUDE.md`). Sull'asse "anti-clonazione del codice", oggi NoBadge è tecnicamente avanti, e il nostro Face ID non colma il divario (non è enforced). Non è un dramma, ma smonta l'idea che siamo noi i più forti sull'anti-frode.

## 3. La trappola da evitare

La tentazione logica sarebbe: "rendiamo il Face ID un vero gate biometrico server-side, così l'anti-frode diventa reale e giustifica il prezzo". **È una trappola**, e qui i due filoni di questo lavoro (sicurezza/legale e mercato) si incontrano:
- Un vero riconoscimento facciale per-account = **dato biometrico, categoria particolare GDPR Art. 9** (soglia di conformità molto più alta del trattamento presenze ordinario).
- Si somma ai gap legali già aperti e non chiusi: **S.27** (base giuridica consenso GPS), **S.28** (autorizzazione Art. 4 Statuto Lavoratori), **S.29** (DPIA obbligatoria). Un biometrico reale renderebbe questi gap **bloccanti**, non più mitigabili con una bozza.

Quindi: **non inseguire il biometrico reale come leva di prezzo.** Il costo di conformità non vale il differenziatore, e un concorrente gratis (Jibble) lo offre comunque.

## 4. Raccomandazione

### 4.1 — Cambiare il messaggio-guida: dall'anti-frode all'ampiezza
Il moat difendibile verso NoBadge **non è** l'anti-frode: è che BadgeSystem è di fatto una **suite verticale leggera** (presenze + **pianificazione turni** integrata con ferie/malattia/eventi + **export tracciati paghe Zucchetti/TeamSystem** + audit/RBAC/multi-tenant + offline mode), mentre NoBadge è attendance-only e le suite enterprise (Zucchetti/Factorial/Personio) sono pesanti/costose.
- **Nuovo claim-guida proposto:** *"Non solo timbrature: presenze, turni, ferie/malattia e export paghe in un unico strumento verticale per catene multi-sede — senza il peso di una suite HR."*
- Face ID / audit / RBAC scendono a **argomenti di supporto** (compliance, tracciabilità), non più il titolo. Questo è anche più onesto rispetto a cosa il Face ID fa davvero.
- La pianificazione turni + export paghe sono il vero "perché pagare più di NoBadge": NoBadge non li ha, le suite li hanno ma dentro un pacchetto che il nostro ICP non vuole.

### 4.2 — Ripensare il fee per sede per il segmento multi-sede
Opzioni, in ordine di preferenza:
1. **Azzerare il fee per sede sulle trattative multi-sede** (o includerlo nel ricorrente) — toglie di mezzo l'unico confronto dove NoBadge ci batte frontalmente a parità di ICP. Il margine va rifatto, ma su una catena il ricorrente per-dipendente compensa.
2. In alternativa, tenerlo ma **nominarlo esplicitamente come setup/onboarding assistito** (il nostro import "concierge" via Excel è reale e ha valore), non come "costo per sede" — un valore percepito, non una tassa.

### 4.3 — Il prezzo ricorrente (€8→€6,50) regge, ma la giustificazione va riscritta
Il gap 1,3–1,6x va difeso con **ampiezza + export paghe + turni**, non con "Face ID anti-frode". La verifica pricing di agosto (esito CONFERMA) resta valida sui numeri; cambia solo *la storia* che li giustifica.

## 5. Cosa NON cambio e perché

- **Non tocco i numeri di prezzo** — la revisione di luglio + verifica di agosto reggono; il problema è il messaging e il fee per sede, non la tariffa per-dipendente.
- **Non riscrivo `product-marketing.md` in questo passaggio** — è accurato; andrebbe fatto un v7 che sposta turni/export paghe in cima a Differentiation e declassa Face ID, più una nota competitiva su Jibble/Skello/Buddy Punch e sul fee-sede vs NoBadge. Lo propongo come prossimo passo, non lo eseguo qui senza una tua conferma sul cambio di posizionamento (è una decisione di prodotto/business, non un fatto).
- **Resta valida la raccomandazione di fondo già nei documenti**: il collo di bottiglia non è altro codice né altra analisi, è **andare a validare con 10-15 prospect reali** (`piano-tattico-3000-primo-cliente.md`). Questo delta serve a entrare in quelle conversazioni con il messaggio giusto, non a rimandarle ancora.

---

**Fonti ricerca fresca (2026-11-14):** sito NoBadge (prezzo €5,04/utente attivo, sedi illimitate, QR dinamico — verificato dal vivo); comparazioni Skello e Capterra/Software Advice per Buddy Punch (€4,49+€19) e fascia €5-6; Jibble (riconoscimento facciale dichiarato gratuito, mercato IT); Factorial/Skello blog per panoramica funzioni (QR/GPS/geofence/foto). Dati di fornitori — da trattare come indicativi, non come verità indipendente.
