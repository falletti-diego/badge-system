# Product Marketing Context

**Document version:** v7
**Last updated:** 2026-11-14

## Product Overview
**One-liner:** Suite verticale leggera per il retail multi-sede italiano/europeo — presenze da smartphone (QR + Face ID opzionale), pianificazione turni, gestione ferie/malattia ed export tracciati paghe Zucchetti/TeamSystem in un unico strumento, zero hardware, senza il peso di una suite HR.

**What it does:** I dipendenti scannerizzano un QR code statico in sede con il proprio smartphone e si autenticano con Face ID nativo (iOS/Android) per timbrare entrata/uscita. Manager e HR/Ops accedono a una dashboard web per reporting in tempo reale, correzioni, export CSV e audit log completo di ogni modifica.

**Product category:** Software di rilevazione presenze (time & attendance) per il retail multi-sede.

**Product type:** SaaS multi-tenant, B2B, verticale retail.

**Business model:** Prezzo per dipendente/mese a scaglioni decrescenti sulla numerosità, più fee per sede aggiuntiva (una tantum) a scaglioni decrescenti sul numero di sedi. Dettaglio in "Goals"/pricing sotto. *(Fonte: `docs/superpowers/specs/2026-07-26-competitive-positioning-pricing-design.md`, sezione "Pricing definitivo".)*

## Target Audience
**Target companies:** Catene retail multi-sede (ipermercati, catene, centri commerciali) in Italia/Europa, **con 3+ sedi** dove il time-theft e la compliance hanno un costo reale da giustificare — non più "qualsiasi negozio 25+ dipendenti" (ipotesi iniziale superata). Fascia dipendenti: 25-200 per cliente. *(Fonte: spec positioning/pricing, sezione "Decisione di posizionamento".)*

**Decision-makers:** HR/Ops Director di catene multi-sede — è l'unico ruolo esplicitamente nominato nella fonte come chi deve giustificare il costo del time-theft e della compliance, non il singolo punto vendita che vuole solo smettere di usare un foglio Excel. *(Fonte: spec positioning/pricing.)*

**Primary use case:** Sostituire il tracciamento presenze manuale/cartaceo con un sistema che impedisce il "buddy punching" (un collega che timbra al posto di un altro) e produce una traccia di audit difendibile in un controllo.

**Jobs to be done:**
- Impedire che un dipendente timbri per conto di un collega (anti-frode/time-theft), cosa che QR/GPS da soli non garantiscono perché clonabili/condivisibili
- Avere un audit log completo (chi/quando/cosa) e RBAC per rispondere a controlli di compliance
- Ottenere reporting/export presenze in tempo reale su più sedi senza hardware dedicato per sede

**Use cases:**
- Timbratura giornaliera entrata/uscita dipendenti multi-sede via smartphone personale
- Correzione presenze da parte del manager entro una finestra temporale, con log della modifica
- **Export tracciati paghe compatibili Zucchetti/TeamSystem** (confermato reale e funzionante il 2026-08-12, verificato direttamente da Diego — non solo export CSV generico): le presenze arrivano allo studio paghe senza lavoro manuale, un click. **Nota di disallineamento:** `CLAUDE.md` e la Business Goal sotto dichiarano ancora "Payroll API — Fase 2, fuori scope MVP"; quella dicitura riguardava presumibilmente un'integrazione API diretta, non un export tracciati — ma il gap testuale andrebbe chiarito/aggiornato in `CLAUDE.md` per evitare messaging disallineato tra sito e documentazione interna.

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Decision Maker — HR/Ops Director di catene multi-sede | Compliance, controllo presenze/turni/assenze su più sedi, costo/beneficio giustificabile a livello di catena | Deve coordinare presenze, turni, ferie/malattia ed export paghe su più punti vendita, oggi con 2-3 strumenti scollegati | Una suite verticale unica (presenze + turni + ferie/malattia + export paghe) pensata per la scala multi-sede, con audit trail difendibile e RBAC — senza il peso/costo di una suite HR completa |
| User (dipendente che timbra) — **ipotesi da validare, non fonte esplicita** | Rapidità e semplicità della timbratura, nessun attrito con hardware nuovo | Possibile resistenza a un'autenticazione biometrica percepita come invasiva | UX minima: smartphone personale già in tasca, nessun hardware nuovo da imparare |
| Champion (es. store manager) — **ipotesi da validare, non fonte esplicita** | Gestire correzioni/eccezioni del proprio punto vendita senza dover scalare tutto all'HR centrale | Volume di correzioni manuali, tempo perso su fogli Excel | Dashboard con correzioni self-service entro finestra temporale definita |
| Financial Buyer — **ipotesi da validare, non fonte esplicita** | Costo totale vs incumbent HR suite (Zucchetti/TeamSystem) o vs il concorrente diretto low-cost (NoBadge) | Giustificare un prezzo ~1,3-1,9x superiore a NoBadge senza case study/clienti reali a supporto | Prezzo a scaglioni pensato per contenere il costo su catene grandi (sconto per dipendente e per sede al crescere della scala) |

**Nota:** solo la riga "Decision Maker — HR/Ops Director" è esplicitamente nominata nella fonte come tale. Le altre tre righe (User, Champion, Financial Buyer) sono ipotesi ragionevoli dedotte dal contesto del prodotto, non fatti verificati — da validare nelle prime conversazioni commerciali.

## Problems & Pain Points
**Core problem:** Le catene retail multi-sede tracciano le presenze con metodi che non prevengono il "buddy punching" (un collega che timbra al posto di un altro), e non hanno una traccia di audit solida da mostrare in un controllo di compliance.

**Why alternatives fall short:**
- Soluzioni QR/GPS-only (incluso il concorrente diretto NoBadge) sono clonabili/condivisibili tra colleghi — nessuna verifica che sia davvero la persona a timbrare
- Le suite HR incumbent (Zucchetti/TeamSystem) sono percepite come pesanti/costose da PMI 25-200 dipendenti che vogliono solo il modulo presenze, con licenza + hardware + canone + costi di implementazione
- Le suite modulari internazionali (Factorial, Personio) sono overkill (troppi moduli non richiesti) o non specificamente pensate per il retail
- Deputy (AU/US) non è localizzato IT/GDPR-first ed è debole su compliance italiana

**What it costs them:** Time-theft quantificabile nel retail (turni "coperti" da un collega che timbra al posto di un altro); tempo/rischio in caso di controllo senza audit trail solido.

**Emotional tension:** *(non esplicitato nella fonte oltre al concetto di time-theft/compliance — non aggiunto per evitare invenzione)*

## Competitive Landscape
**Direct:** NoBadge (IT) — smartphone-only, QR+GPS, verticale retail/commercio esplicito, dati su server italiani, **€5,04/utente/mese** (verificato 2026-08-11, in cima alla fascia €4,20-5,04 nota dal 26/7, nessun cambiamento sostanziale), nessun costo attivazione/hardware, nessun fee per sede, paga solo chi timbra nel mese corrente. Descritto nella fonte come "concorrente diretto quasi identico" a Badge System. **Aggiornamento 2026-08-11:** il QR è ora descritto come "dinamico, cambia ogni secondo" per anti-frode — mitiga la clonabilità dello screenshot/foto del QR statico, ma non risolve l'impersonificazione (un collega può comunque scansionarlo al posto di un altro). Nessuna autenticazione biometrica (Face ID/impronta) presente. **Aggiornamento 2026-11-14:** NoBadge resta attendance-only (QR+GPS, sedi illimitate incluse a €0). Il suo limite non è più "non previene il buddy punching" (ormai commodity — vedi nota sotto) ma l'assenza di pianificazione turni, gestione ferie/malattia ed export tracciati paghe. Il suo QR dinamico è tecnicamente superiore al nostro QR statico sull'anti-clonazione del codice, e il nostro Face ID opzionale non colma quel divario (non è un gate server-side). Il confronto va quindi spostato dall'anti-frode all'ampiezza della suite.

**Secondary:**
- Libemax / EcosAgile eClock (IT) — stessa meccanica QR, ma più legata a terminali fisici/postazioni fisse, meno smartphone-first. Prezzo su richiesta. *(Non riverificato il 2026-08-11 — non incluso nello scan di oggi.)*
- Zucchetti / TeamSystem HR (IT) — incumbent enterprise/mid-market HR suite, prezzo opaco (nessun listino pubblico, confermato 2026-08-11). Tipicamente licenza + hardware + canone + implementazione. Alto switching cost per chi già ce l'ha, ma percepito pesante/costoso da PMI 25-200 dipendenti che vogliono solo il modulo presenze. **Nota 2026-08-11:** il sito menziona "lettori biometrici" come opzione hardware per i terminali fissi — non è una novità (hardware da postazione, non Face ID nativo da smartphone), non intacca il differenziatore.
- Factorial (ES/EU) — suite HR modulare, **da "$8/utente/mese" a salire** (verificato 2026-08-11, in linea con la fascia ~€7-15 nota dal 26/7), prezzo custom per headcount + moduli. Time tracking include geolocalizzazione e QR, nessuna biometria. Falls short: suite completa (talent, finance, IT) — overkill per chi vuole solo badge/presenze.
- Personio (DE/EU) — suite HR enterprise-lite, ~€7,60+/dipendente/mese core (fino a €12-15 con moduli), contratto annuale custom. *(Non riverificato direttamente il 2026-08-11 — sito ha bloccato la richiesta con rate-limit; dato confermato solo da fonti terze indipendenti, coerente con lo spec 26/7.)* Target HR-manager di aziende strutturate generiche, non specificamente retail.

**Indirect:**
- Deputy (AU/US) — scheduling + time tracking, **$4,50-9/utente/mese** a piani (verificato 2026-08-11, in linea con lo spec 26/7). Falls short: localizzazione esplicita solo per Australia/USA/UK, GDPR menzionato genericamente ma nessun supporto IT/EU dedicato — conferma la valutazione "non localizzato IT/GDPR-first".
- 4HSE Digital Badge (IT) — **aggiunto 2026-08-11, categoria adiacente non nello spec 26/7**: badge digitale di identità/conformità sicurezza per cantieri edili (QR statico per verifica anagrafica, formazione, certificazioni ex D.Lgs. 81/08), non un time-tracking presenze. Non è un concorrente diretto sul check-in/audit presenze — citato come riferimento di mercato adiacente (compliance via QR in un altro segmento verticale italiano), non come minaccia competitiva diretta.

**Commodity anti-buddy-punching (aggiunto 2026-11-14, ricerca fresca):** la prevenzione del "timbra-per-un-collega" non è più una funzione rara. **Jibble** offre riconoscimento facciale **dichiarato gratuito** (presente sul mercato IT); **Skello** (~€5-6/dip/mese) usa foto allo scatto + blocco GPS falsi; **Buddy Punch** (€4,49/utente + €19 base) usa QR + PIN + foto a ogni timbratura. Conseguenza strategica: l'anti-frode biometrica **non può più essere il differenziatore #1** — un concorrente la offre gratis e il nostro Face ID non è nemmeno un gate reale. Il moat difendibile si sposta sull'ampiezza della suite (turni + ferie/malattia + export paghe), dove né NoBadge né questi player arrivano. Dati di fornitori — indicativi, non verità indipendente.

## Differentiation
**Key differentiators:** *(riordinati 2026-11-14 — l'ampiezza della suite è ora il differenziatore #1; Face ID declassato ad argomento di supporto, vedi changelog v7)*
- **Suite verticale, non attendance-only** — presenze + **pianificazione turni** integrata con ferie/malattia/eventi (matrice manager, vista settimanale, "Copia Settimana", export PDF, blocco automatico del turno se il dipendente ha ferie approvate/malattia/evento per quel giorno — feature live da Session 3.3/34/38/44) + **export tracciati paghe Zucchetti/TeamSystem un click** (confermato reale 2026-08-12). NoBadge (concorrente diretto) è QR+GPS-only e non ha nulla di tutto questo; le suite enterprise (Zucchetti/TeamSystem/Factorial/Personio) le hanno ma dentro un pacchetto pesante/costoso che il nostro ICP non vuole. **Questo è il vero "perché pagare più di NoBadge".**
- **Export tracciati paghe Zucchetti/TeamSystem un click** — nessun competitor tra quelli analizzati dichiara pubblicamente questa integrazione per i due gestionali paghe italiani più diffusi; toglie lavoro manuale verso lo studio paghe del cliente, una frizione reale per un HR/Ops director
- Audit log completo (chi/quando/cosa) + RBAC + multi-tenant + offline mode — tracciabilità difendibile a un controllo di compliance, rilevante per un HR/Ops director di catena multi-sede, non per il singolo negozio
- Opzione white-label Tier 2 (branding completo: nome/icona proprie, possibile dominio dedicato) per clienti grandi — nessun competitor italiano citato la offre. *(Fonte: `docs/superpowers/specs/2026-07-26-tenant-branding-and-whitelabel-design.md` — Tier 1 SaaS multi-tenant condiviso è il modello base/listino; Tier 2 white-label dedicato è una trattativa custom fuori listino per clienti grandi con scala attesa di 1-2 clienti nel primo anno.)*
- **Face ID nativo — argomento di supporto, non più il titolo (declassato 2026-11-14).** Lega il check-in all'account loggato sul device e rende visibile in dashboard (chip "No Face ID") quando la verifica biometrica del device non è stata usata. **Non** è un confronto col volto per-account né un gate server-side: è opzionale, verifica solo lo sblocco biometrico/PIN del dispositivo (`expo-local-authentication`), e `faceid_verified` è salvato come metadato informativo mai usato come gate di autorizzazione (verificato sul codice `checkins.js`/`QRScannerScreen.jsx`/`FaceIDScreen.jsx`). Da novembre 2026 l'anti-buddy-punching è commodity (Jibble gratis, Skello/Buddy Punch con foto — vedi Competitive Landscape), quindi non regge più come argomento di vendita #1. **Non trasformarlo in un biometrico reale per giustificare il prezzo: sarebbe un dato GDPR Art. 9 che renderebbe bloccanti i gap legali aperti S.27/S.28/S.29 — vedi Rischi noti.**

**How we do it differently:** "Zero hardware + QR + smartphone" è commodity (NoBadge), e da novembre 2026 anche l'anti-buddy-punching biometrico lo è (Jibble gratis, Skello/Buddy Punch con foto). Il vero differenziale è **l'ampiezza verticale della suite** — presenze + turni + ferie/malattia + export paghe + audit/RBAC/multi-tenant/offline in un unico strumento leggero — non la meccanica di check-in né il Face ID in sé.

**Why that's better:** Con NoBadge un HR/Ops director di catena deve comunque gestire turni, ferie/malattia ed export paghe con altri strumenti; con le suite enterprise paga e impara moduli che non gli servono. Badge System copre l'intero ciclo presenze → turni → assenze → paghe in un solo strumento verticale, con audit log/RBAC pronti a un controllo di compliance che un foglio Excel o un sistema QR-only non offrono.

**Why customers choose us:** Per catene multi-sede che vogliono un unico strumento verticale per presenze + turni + assenze + export paghe, senza il peso di una suite HR — non per il singolo punto vendita che cerca solo di smettere di usare Excel (quel segmento è meglio servito, sul prezzo, da NoBadge, che include sedi illimitate a €0).

## Objections
| Objection | Response |
|-----------|----------|
| "NoBadge costa meno e fa quasi la stessa cosa" | NoBadge fa **solo presenze** (QR+GPS): niente pianificazione turni, niente gestione ferie/malattia integrata, niente export tracciati paghe Zucchetti/TeamSystem. Il delta di prezzo (~1,3-1,6x) copre l'intero ciclo presenze → turni → assenze → paghe in un solo strumento, che altrimenti il cliente gestisce con 2-3 tool separati. **Riposizionamento 2026-11-14:** il delta NON va più giustificato con "Face ID anti-frode" (commodity: Jibble lo offre gratis), ma con l'ampiezza della suite. **Nota onestà:** non ancora testato su un cliente reale (vedi rischio sotto). |
| "Le suite HR (Zucchetti/TeamSystem, Factorial, Personio) fanno già tutto" | Sono percepite come pesanti/costose o overkill da chi vuole solo il modulo presenze in una PMI/catena 25-200 dipendenti — Badge System è verticale sul solo problema presenze/anti-frode, non una suite HR completa. **Aggiunta 2026-08-24:** include comunque la pianificazione turni (integrata con ferie/malattia/eventi, blocco automatico dei conflitti) — non si rinuncia a questa funzione scegliendo un prodotto verticale invece di una suite intera. |
| "Perché pagare un fee per sede se cresco? NoBadge include le sedi gratis" | **Punto debole reale (2026-11-14):** NoBadge include **sedi illimitate a €0**; il nostro fee (€250 → €150 → €100 una tantum per sede) vale ~€1.000-1.500 su una catena da 10 sedi, che il concorrente diretto non chiede affatto — ed è l'unico confronto dove NoBadge ci batte frontalmente sul nostro stesso ICP. In trattativa multi-sede: azzerarlo/includerlo nel ricorrente, oppure nominarlo esplicitamente come **setup/onboarding assistito** (import "concierge" via Excel, un valore reale) invece che come "tassa per sede". Vedi `docs/marketing/2026-11-14-strategia-mercato-delta.md` §4.2. |
| "Il nostro DPO/legale chiederà una DPIA e l'autorizzazione sindacale prima di attivare il GPS" | **Aggiunta 2026-08-23.** Template DPIA precompilato pronto (`docs/DPIA_geofencing_IT.md`, bozza — il cliente resta Titolare e deve validarla col proprio legale). Il geofencing di un nuovo cliente parte **spento di default** e richiede una conferma esplicita dell'autorizzazione Art. 4 Statuto Lavoratori prima di poterlo attivare (gate tecnico con audit log dedicato) — riduce il rischio di attivazione senza autorizzazione, un argomento difendibile in una conversazione con HR/Ops Director sensibile alla compliance. |

**Anti-persona:** Il singolo punto vendita/PMI che cerca solo di smettere di usare un foglio Excel senza un problema di time-theft/compliance da giustificare a un livello superiore — per questo segmento il prezzo NoBadge è probabilmente più competitivo. *(Dedotto esplicitamente dal riposizionamento del target in "Decisione di posizionamento" della fonte.)*

## Switching Dynamics
**Push:** Time-theft quantificabile (turni coperti da un collega che timbra al posto di un altro) e mancanza di una traccia di audit solida per i controlli di compliance nelle catene multi-sede.

**Pull:** Un unico strumento verticale che copre presenze + turni + ferie/malattia + export paghe Zucchetti/TeamSystem, con audit log/RBAC pronti per un HR/Ops director — ciò che NoBadge (attendance-only) non ha e le suite HR offrono solo dentro un pacchetto pesante. Il gap di prezzo verso NoBadge (~1,3-1,6x) è ora giustificato dall'ampiezza, non più dal Face ID.

**Habit:** *(Non esplicitato nella fonte — non aggiunto per evitare invenzione. Ipotesi plausibile ma non fondata: inerzia di processi Excel/cartacei esistenti, da validare.)*

**Anxiety:** *(Non esplicitato nella fonte oltre al rischio di prezzo — vedi sezione Rischi/Proof Points. Non aggiunto altro per evitare invenzione.)*

## Customer Language

**Non ancora validato — zero clienti reali ad oggi.**

Nessuna citazione verbatim di clienti, nessun linguaggio "as heard in sales" è disponibile: il documento sorgente dichiara esplicitamente "zero clienti paganti ad oggi" e definisce ogni conclusione di posizionamento come "un'ipotesi di go-to-market da validare nelle prime conversazioni commerciali, non un fatto verificato sul campo." Questa sezione va compilata dopo le prime conversazioni commerciali reali (Sprint 4 / primo cliente pilota, vedi `CLAUDE.md`).

**Glossario di termini di prodotto (questo è terminologia interna del progetto, non linguaggio cliente validato):**
| Term | Meaning |
|------|---------|
| Buddy punching | Un dipendente timbra al posto di un collega — anti-frode un tempo differenziatore #1, dal 2026-11-14 commodity di mercato (vedi Competitive Landscape) |
| Tier 1 | SaaS multi-tenant condiviso, listino standard (questo documento di pricing) |
| Tier 2 | White-label dedicato, trattativa custom fuori listino, per clienti grandi |
| Time-theft | Costo del tempo di lavoro non effettivamente prestato ma registrato come tale |

## Brand Voice

**Non ancora validato — zero clienti reali ad oggi.** Nessun tono, stile o personalità di brand è stato testato con clienti reali; qualunque scelta ora sarebbe un'invenzione. Il claim commerciale approvato (vedi Proof Points/Goals) dà un indizio di registro — diretto, orientato al rischio/compliance — ma non è stato formalizzato come "brand voice".

## Proof Points

**Non ancora validato — zero clienti reali ad oggi.** Nessuna metrica di prodotto in produzione con clienti paganti, nessun cliente/logo referenziabile, nessuna testimonianza. Il documento sorgente è esplicito su questo vincolo di realtà.

**Asset di vendita reale disponibile (verificato 2026-08-12, aggiornato 2026-08-23):** pagina pubblica dedicata `dataxiom.it/badge-system` con demo self-serve attiva su `badge.dataxiom.it/prova-demo` (dati realistici, attivabile in pochi secondi, nessun impegno) — non è un proof point cliente, ma è un asset concreto utilizzabile subito in outreach/ads/social. **Aggiornamento 2026-08-23:** il funnel demo ora porta esplicitamente il messaging Face ID/anti-frode in hero (prima l'asset esisteva ma senza questo argomento in evidenza) — un prospect che arriva dalla demo vede subito un argomento di vendita in hero, non solo screenshot della dashboard. **Nota 2026-11-14 (v7):** l'hero attuale porta ancora Face ID/anti-frode come argomento #1; con il riposizionamento andrebbe aggiornato a guidare con l'ampiezza della suite (presenze + turni + assenze + export paghe) — modifica al sito consigliata, non ancora eseguita.

**Claim commerciale (riposizionato 2026-11-14 — v7):**
> "Non solo timbrature: presenze, turni, ferie/malattia ed export paghe in un unico strumento verticale per catene multi-sede — senza il peso di una suite HR."

*Claim precedente (fino a v6, ora superato): "Non solo digitalizzare il cartellino — impedire che qualcuno timbri al posto di un collega, con una traccia di audit che regge a un controllo." Ritirato come titolo perché l'anti-buddy-punching è diventato commodity (vedi Competitive Landscape); l'audit resta un argomento di supporto valido.*

**Argomenti di vendita in ordine di priorità (riordinati 2026-11-14 — v7):**
1. **Ampiezza della suite** — presenze + pianificazione turni + ferie/malattia + export tracciati paghe Zucchetti/TeamSystem in un unico strumento verticale, ciò che NoBadge (attendance-only) non ha e le suite HR offrono solo dentro un pacchetto pesante
2. **Export paghe un click** — le presenze arrivano allo studio paghe senza lavoro manuale (Zucchetti/TeamSystem), frizione reale eliminata
3. Audit log completo (chi/quando/cosa) + RBAC + multi-tenant — tracciabilità difendibile a un controllo di compliance
4. Face ID / anti-frode — ora **argomento di supporto**, non più il titolo (commodity dal 2026-11-14: Jibble gratis, Skello/Buddy Punch con foto)
5. Opzione white-label Tier 2 come argomento per i clienti più grandi in prospettiva di crescita

## Goals

**Business goal:** Primo cliente pilota entro 3 mesi (MVP lancio target: Settembre 2026, da `CLAUDE.md`), con costi operativi < €200/mese per l'MVP e zero bug critici in produzione.

**Pricing (listino Tier 1 — riprodotto esattamente dalla fonte, nessun arrotondamento):**
- Per dipendente/mese: **€8** (25-99 dipendenti) → **€7** (100-149 dipendenti) → **€6,50** (150-200 dipendenti)
- Per sede aggiuntiva (una tantum): **€250** (sedi 1-3) → **€150** (sedi 4-10) → **€100** (sedi 11+)
- Tier 2 white-label: fuori listino, trattativa custom (invariato)

**Verifica pricing 2026-08-11 (skill `pricing`, framework value metric / willingness-to-pay / packaging):** esito **CONFERMA — nessuna modifica**. Value metric (per-dipendente ricorrente + per-sede una tantum decrescente) allineato al valore percepito e coerente col segmento target multi-sede. Gap reale vs. NoBadge ricalcolato: **1,59x** in fascia bassa (€8/€5,04), **1,29x** in fascia alta (€6,50/€5,04) — leggermente sotto il range dichiarato "1,3-1,9x" nello spec 26/7 ma entro soglia comunemente difendibile con differenziazione chiara. Nessun aggiustamento di prezzo proposto; unico follow-up è di messaging (vedi Differentiation, nota Face ID/impersonificazione).

**Conversion action:** Firma del primo cliente pilota (catena multi-sede, 3+ sedi, 25-200 dipendenti) sul listino Tier 1 sopra. **Aggiornamento 2026-08-23:** esiste ora un meccanismo di chiusura formale — `docs/modulo-ordine-commerciale-IT.md` (prezzo, fatturazione, durata, referenzia SLA/DPA esistenti) — prima assente, la conversion action non aveva un documento pronto da far firmare.

**Current metrics:** Zero clienti paganti ad oggi. Margine stimato (non ancora verificato su un cliente reale) sul primo pilota: ricavo ~€200/mese (€8 × 25 dipendenti) contro un costo infrastrutturale reale attuale stimato di ~€85-130/mese (Auth0 non ancora attivo), per un margine stimato di ~€70-115/mese. *(Fonte: spec positioning/pricing, sezione "Verifica margine sul primo cliente MVP", che a sua volta cita `CLAUDE.md` sezione "Monthly Operating".)*

## Rischi noti sul posizionamento (riportati per trasparenza, non normalmente parte del template ma rilevanti per chi userà questo documento)
- Il posizionamento e il gap di prezzo (~1,3-1,9x vs NoBadge) non sono ancora stati validati con nessun cliente reale — rischio che un buyer sensibile al prezzo lo respinga comunque
- Il margine sul primo cliente è positivo ma sottile (~€70-115/mese) finché c'è un solo cliente sull'infrastruttura condivisa
- Il costo Auth0 (€20-30/mese) non è ancora nel calcolo di margine reale — si attiverà quando i ricavi lo giustificheranno
- Il differenziale Face ID non è difendibile in modo permanente se un competitor (es. NoBadge) lo implementa
- **Aggiunto 2026-08-25:** il claim "Face ID lega il check-in fisicamente alla persona" era più assoluto di quanto il codice implementi — Face ID è opzionale, verifica il device (non il volto per-account) e non è un gate lato server. Se un prospect tecnico lo scopre in demo dopo un pitch non precisato, è un rischio di credibilità maggiore del gap stesso non menzionarlo prima. Vedi precisazione tecnica in Differentiation.
- **Aggiunto 2026-11-14 (v7):** l'anti-buddy-punching biometrico è diventato commodity (Jibble riconoscimento facciale gratuito, Skello/Buddy Punch foto allo scatto) — il differenziatore #1 di luglio-agosto non regge più; il posizionamento è stato spostato sull'ampiezza della suite. Rischio residuo: l'ampiezza è difendibile solo finché NoBadge non aggiunge turni/export paghe.
- **Aggiunto 2026-11-14 (v7):** il fee per sede è uno svantaggio diretto verso NoBadge (sedi illimitate a €0) esattamente sul segmento multi-sede scelto — ~€1.000-1.500 su una catena da 10 sedi. Da rivedere in trattativa (azzerare/includere nel ricorrente, o rinominare come setup assistito). Vedi `docs/marketing/2026-11-14-strategia-mercato-delta.md`.
- **Aggiunto 2026-11-14 (v7):** NON inseguire un Face ID biometrico reale come leva di prezzo — sarebbe dato biometrico GDPR Art. 9 e renderebbe bloccanti i gap legali aperti S.27 (base giuridica GPS), S.28 (autorizzazione Art. 4 Statuto Lavoratori), S.29 (DPIA). Il costo di conformità non vale un differenziatore che un concorrente offre gratis.

## Changelog
*Newest first. One line per revision: what changed and why.*
- v7 (2026-11-14) — **Riposizionamento.** Spostato il messaggio-guida dall'anti-frode biometrica (Face ID) all'ampiezza della suite verticale (presenze + turni + ferie/malattia + export paghe). Trigger: ricerca competitiva fresca di novembre — l'anti-buddy-punching è diventato commodity (Jibble facciale gratis, Skello/Buddy Punch foto) e il fee per sede è emerso come svantaggio diretto verso NoBadge (sedi illimitate gratis) sul segmento multi-sede scelto. Riordinati Key differentiators e Argomenti di vendita (suite/export paghe in cima, Face ID declassato ad argomento di supporto), aggiornati one-liner, claim commerciale, How/Why/Why-choose, Objections (NoBadge + fee sede), Pull, Proof Points, Competitive Landscape (nota commodity + NoBadge attendance-only) e Rischi noti (commodity, fee sede, trappola GDPR Art.9 sul biometrico reale). Numeri di prezzo invariati. Fonte: `docs/marketing/2026-11-14-strategia-mercato-delta.md`. **Downstream: le altre skill di marketing genereranno ora contro questo nuovo posizionamento.**
- v6 (2026-08-25) — Corretto il claim Face ID in Differentiation/Why that's better: verificato sul codice reale (`checkins.js`, `QRScannerScreen.jsx`, `FaceIDScreen.jsx`) che è opzionale, verifica il device non il volto per-account, e `faceid_verified` non è mai un gate di autorizzazione server-side. Aggiunto rischio corrispondente in Rischi noti. Nessun cambiamento di posizionamento complessivo — solo precisione tecnica su un argomento di vendita esistente, per evitare un'obiezione da un prospect tecnico.
- v5 (2026-08-24) — Aggiunta la pianificazione turni (integrata con ferie/malattia/eventi) come differenziatore in Differentiation, rafforzata l'obiezione "le suite HR fanno già tutto" in Objections. Feature era già live da tempo (Session 3.3/34/38/44) ma non era mai stata catturata nel documento — gap di documentazione, non di prodotto.
- v4 (2026-08-23) — Sessione readiness "Sales-Ready": aggiornato Proof Points (messaging Face ID ora effettivamente live nel funnel demo `/prova-demo`, non solo pianificato), aggiunta obiezione compliance/DPIA in Objections (mitigata con template DPIA + gate tecnico Art.4 su attivazione geofencing), aggiornato Goals/Conversion action (modulo d'ordine commerciale ora esiste). Nessun cambiamento di posizionamento — solo la realtà del prodotto che ha raggiunto quanto il documento già dichiarava.
- v3 (2026-08-12) — Corretta assunzione errata "nessuna pagina pubblica": esiste dataxiom.it/badge-system con demo self-serve su badge.dataxiom.it, aggiunta come asset in Proof Points; aggiunto export tracciati paghe Zucchetti/TeamSystem come differenziatore reale e funzionante (confermato da Diego), con nota di disallineamento verso CLAUDE.md sulla dicitura "Payroll — Fase 2".
- v2 (2026-08-11) — Aggiornato Competitive Landscape dopo verifica fresca (competitor-profiling: NoBadge ha aggiunto QR dinamico anti-frode ma resta senza biometria, pricing competitor invariato, aggiunto 4HSE come indirect/categoria adiacente su richiesta esplicita); pricing skill: esito CONFERMATO, nessun aggiustamento; precisato messaging Face ID (impersonificazione, non solo clonabilità QR).
- v1 (2026-08-11) — Bozza iniziale da spec positioning/pricing 26/7 e CLAUDE.md.
