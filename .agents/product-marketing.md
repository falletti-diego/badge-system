# Product Marketing Context

**Document version:** v2
**Last updated:** 2026-08-11

## Product Overview
**One-liner:** SaaS multi-tenant per il tracciamento delle presenze nel retail italiano/europeo — QR code da smartphone + Face ID nativo, zero hardware.

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
- Export CSV mensile per l'elaborazione paghe (nota: integrazione payroll diretta è esplicitamente fuori dall'MVP — Fase 2, da `CLAUDE.md`)

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Decision Maker — HR/Ops Director di catene multi-sede | Compliance, controllo time-theft su più sedi, costo/beneficio giustificabile a livello di catena | Deve rispondere di irregolarità nelle presenze su più punti vendita, con strumenti che oggi non prevengono la frode alla radice | Audit trail difendibile + prevenzione time-theft via Face ID, pensato per la scala multi-sede, non per il singolo negozio |
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
**Direct:** NoBadge (IT) — smartphone-only, QR+GPS, verticale retail/commercio esplicito, dati su server italiani, **€5,04/utente/mese** (verificato 2026-08-11, in cima alla fascia €4,20-5,04 nota dal 26/7, nessun cambiamento sostanziale), nessun costo attivazione/hardware, nessun fee per sede, paga solo chi timbra nel mese corrente. Descritto nella fonte come "concorrente diretto quasi identico" a Badge System. **Aggiornamento 2026-08-11:** il QR è ora descritto come "dinamico, cambia ogni secondo" per anti-frode — mitiga la clonabilità dello screenshot/foto del QR statico, ma non risolve l'impersonificazione (un collega può comunque scansionarlo al posto di un altro). Nessuna autenticazione biometrica (Face ID/impronta) presente. Falls short perché: resta privo di verifica dell'identità fisica di chi timbra → nessuna prevenzione strutturale del buddy punching.

**Secondary:**
- Libemax / EcosAgile eClock (IT) — stessa meccanica QR, ma più legata a terminali fisici/postazioni fisse, meno smartphone-first. Prezzo su richiesta. *(Non riverificato il 2026-08-11 — non incluso nello scan di oggi.)*
- Zucchetti / TeamSystem HR (IT) — incumbent enterprise/mid-market HR suite, prezzo opaco (nessun listino pubblico, confermato 2026-08-11). Tipicamente licenza + hardware + canone + implementazione. Alto switching cost per chi già ce l'ha, ma percepito pesante/costoso da PMI 25-200 dipendenti che vogliono solo il modulo presenze. **Nota 2026-08-11:** il sito menziona "lettori biometrici" come opzione hardware per i terminali fissi — non è una novità (hardware da postazione, non Face ID nativo da smartphone), non intacca il differenziatore.
- Factorial (ES/EU) — suite HR modulare, **da "$8/utente/mese" a salire** (verificato 2026-08-11, in linea con la fascia ~€7-15 nota dal 26/7), prezzo custom per headcount + moduli. Time tracking include geolocalizzazione e QR, nessuna biometria. Falls short: suite completa (talent, finance, IT) — overkill per chi vuole solo badge/presenze.
- Personio (DE/EU) — suite HR enterprise-lite, ~€7,60+/dipendente/mese core (fino a €12-15 con moduli), contratto annuale custom. *(Non riverificato direttamente il 2026-08-11 — sito ha bloccato la richiesta con rate-limit; dato confermato solo da fonti terze indipendenti, coerente con lo spec 26/7.)* Target HR-manager di aziende strutturate generiche, non specificamente retail.

**Indirect:**
- Deputy (AU/US) — scheduling + time tracking, **$4,50-9/utente/mese** a piani (verificato 2026-08-11, in linea con lo spec 26/7). Falls short: localizzazione esplicita solo per Australia/USA/UK, GDPR menzionato genericamente ma nessun supporto IT/EU dedicato — conferma la valutazione "non localizzato IT/GDPR-first".
- 4HSE Digital Badge (IT) — **aggiunto 2026-08-11, categoria adiacente non nello spec 26/7**: badge digitale di identità/conformità sicurezza per cantieri edili (QR statico per verifica anagrafica, formazione, certificazioni ex D.Lgs. 81/08), non un time-tracking presenze. Non è un concorrente diretto sul check-in/audit presenze — citato come riferimento di mercato adiacente (compliance via QR in un altro segmento verticale italiano), non come minaccia competitiva diretta.

## Differentiation
**Key differentiators:**
- Face ID nativo come anti-frode: lega il check-in all'identità fisica della persona, prevenendo l'**impersonificazione** (un collega che timbra al posto di un altro) — non solo la clonabilità del QR. **Nota 2026-08-11:** NoBadge ha introdotto un QR "dinamico" (cambia ogni secondo) che mitiga lo screenshot/foto del QR statico, ma non risolve l'impersonificazione: un collega può comunque scansionare il QR dinamico al posto del titolare. Il differenziatore Face ID resta quindi valido, ma il messaging va precisato su *chi* timbra, non su *come* viene generato il codice — assente in tutti i competitor italiani analizzati
- Audit log completo (chi/quando/cosa) + RBAC, rilevante per un HR/Ops director di catena multi-sede, non per il singolo negozio
- Opzione white-label Tier 2 (branding completo: nome/icona proprie, possibile dominio dedicato) per clienti grandi — nessun competitor italiano citato la offre. *(Fonte: `docs/superpowers/specs/2026-07-26-tenant-branding-and-whitelabel-design.md` — Tier 1 SaaS multi-tenant condiviso è il modello base/listino; Tier 2 white-label dedicato è una trattativa custom fuori listino per clienti grandi con scala attesa di 1-2 clienti nel primo anno.)*

**How we do it differently:** "Zero hardware + QR + smartphone" da solo non è più un differenziatore reale (è commodity in Italia grazie a NoBadge). Il vero differenziale è biometrico (Face ID) e strutturale (audit/RBAC/white-label), non la meccanica di check-in in sé.

**Why that's better:** Un QR/GPS può essere condiviso o clonato tra colleghi; Face ID nativo lega il check-in fisicamente alla persona. L'audit log e l'RBAC danno una risposta pronta a un controllo di compliance che un foglio Excel o un sistema QR-only non offrono.

**Why customers choose us:** Per catene multi-sede dove il time-theft e la compliance hanno un costo reale da giustificare a un HR/Ops director — non per il singolo punto vendita che cerca solo di smettere di usare Excel (quel segmento è meglio servito, sul prezzo, da NoBadge).

## Objections
| Objection | Response |
|-----------|----------|
| "NoBadge costa meno della metà e fa quasi la stessa cosa" | Vero sul prezzo nominale (gap ridotto a ~1,3-1,9x, non più ~2x, dopo la revisione pricing) — il delta residuo è esplicitamente giustificato da Face ID anti-frode, audit log/RBAC e opzione white-label, argomenti assenti in NoBadge. **Nota onestà:** questa risposta non è ancora stata testata su un cliente reale (vedi rischio sotto). |
| "Le suite HR (Zucchetti/TeamSystem, Factorial, Personio) fanno già tutto" | Sono percepite come pesanti/costose o overkill da chi vuole solo il modulo presenze in una PMI/catena 25-200 dipendenti — Badge System è verticale sul solo problema presenze/anti-frode, non una suite HR completa. |
| "Perché pagare un fee per sede se cresco?" | Il fee sede è a scaglioni decrescenti (€250 → €150 → €100) proprio per non penalizzare le catene con molte sedi, il segmento target scelto. |

**Anti-persona:** Il singolo punto vendita/PMI che cerca solo di smettere di usare un foglio Excel senza un problema di time-theft/compliance da giustificare a un livello superiore — per questo segmento il prezzo NoBadge è probabilmente più competitivo. *(Dedotto esplicitamente dal riposizionamento del target in "Decisione di posizionamento" della fonte.)*

## Switching Dynamics
**Push:** Time-theft quantificabile (turni coperti da un collega che timbra al posto di un altro) e mancanza di una traccia di audit solida per i controlli di compliance nelle catene multi-sede.

**Pull:** Face ID nativo come prevenzione strutturale del buddy punching + audit log/RBAC pronti per un HR/Ops director, con un gap di prezzo verso il concorrente diretto (NoBadge) ridotto a ~1,3-1,9x invece di ~2x.

**Habit:** *(Non esplicitato nella fonte — non aggiunto per evitare invenzione. Ipotesi plausibile ma non fondata: inerzia di processi Excel/cartacei esistenti, da validare.)*

**Anxiety:** *(Non esplicitato nella fonte oltre al rischio di prezzo — vedi sezione Rischi/Proof Points. Non aggiunto altro per evitare invenzione.)*

## Customer Language

**Non ancora validato — zero clienti reali ad oggi.**

Nessuna citazione verbatim di clienti, nessun linguaggio "as heard in sales" è disponibile: il documento sorgente dichiara esplicitamente "zero clienti paganti ad oggi" e definisce ogni conclusione di posizionamento come "un'ipotesi di go-to-market da validare nelle prime conversazioni commerciali, non un fatto verificato sul campo." Questa sezione va compilata dopo le prime conversazioni commerciali reali (Sprint 4 / primo cliente pilota, vedi `CLAUDE.md`).

**Glossario di termini di prodotto (questo è terminologia interna del progetto, non linguaggio cliente validato):**
| Term | Meaning |
|------|---------|
| Buddy punching | Un dipendente timbra al posto di un collega — la frode che Face ID è pensato per prevenire |
| Tier 1 | SaaS multi-tenant condiviso, listino standard (questo documento di pricing) |
| Tier 2 | White-label dedicato, trattativa custom fuori listino, per clienti grandi |
| Time-theft | Costo del tempo di lavoro non effettivamente prestato ma registrato come tale |

## Brand Voice

**Non ancora validato — zero clienti reali ad oggi.** Nessun tono, stile o personalità di brand è stato testato con clienti reali; qualunque scelta ora sarebbe un'invenzione. Il claim commerciale approvato (vedi Proof Points/Goals) dà un indizio di registro — diretto, orientato al rischio/compliance — ma non è stato formalizzato come "brand voice".

## Proof Points

**Non ancora validato — zero clienti reali ad oggi.** Nessuna metrica di prodotto in produzione con clienti paganti, nessun cliente/logo referenziabile, nessuna testimonianza. Il documento sorgente è esplicito su questo vincolo di realtà.

**Claim commerciale approvato (non ancora testato su clienti reali, ma è la posizione ufficiale attuale, quindi riportato qui come tale):**
> "Non solo digitalizzare il cartellino — impedire che qualcuno timbri al posto di un collega, con una traccia di audit che regge a un controllo."

**Argomenti di vendita in ordine di priorità (fonte: spec positioning/pricing, sezione "Nuovo messaging commerciale"):**
1. Face ID nativo vs QR/GPS clonabili/condivisibili — prevenzione time-theft
2. Audit log completo (chi/quando/cosa) + RBAC — rilevante per HR/Ops director di catene multi-sede
3. Opzione white-label Tier 2 come argomento per i clienti più grandi in prospettiva di crescita

## Goals

**Business goal:** Primo cliente pilota entro 3 mesi (MVP lancio target: Settembre 2026, da `CLAUDE.md`), con costi operativi < €200/mese per l'MVP e zero bug critici in produzione.

**Pricing (listino Tier 1 — riprodotto esattamente dalla fonte, nessun arrotondamento):**
- Per dipendente/mese: **€8** (25-99 dipendenti) → **€7** (100-149 dipendenti) → **€6,50** (150-200 dipendenti)
- Per sede aggiuntiva (una tantum): **€250** (sedi 1-3) → **€150** (sedi 4-10) → **€100** (sedi 11+)
- Tier 2 white-label: fuori listino, trattativa custom (invariato)

**Verifica pricing 2026-08-11 (skill `pricing`, framework value metric / willingness-to-pay / packaging):** esito **CONFERMA — nessuna modifica**. Value metric (per-dipendente ricorrente + per-sede una tantum decrescente) allineato al valore percepito e coerente col segmento target multi-sede. Gap reale vs. NoBadge ricalcolato: **1,59x** in fascia bassa (€8/€5,04), **1,29x** in fascia alta (€6,50/€5,04) — leggermente sotto il range dichiarato "1,3-1,9x" nello spec 26/7 ma entro soglia comunemente difendibile con differenziazione chiara. Nessun aggiustamento di prezzo proposto; unico follow-up è di messaging (vedi Differentiation, nota Face ID/impersonificazione).

**Conversion action:** Firma del primo cliente pilota (catena multi-sede, 3+ sedi, 25-200 dipendenti) sul listino Tier 1 sopra.

**Current metrics:** Zero clienti paganti ad oggi. Margine stimato (non ancora verificato su un cliente reale) sul primo pilota: ricavo ~€200/mese (€8 × 25 dipendenti) contro un costo infrastrutturale reale attuale stimato di ~€85-130/mese (Auth0 non ancora attivo), per un margine stimato di ~€70-115/mese. *(Fonte: spec positioning/pricing, sezione "Verifica margine sul primo cliente MVP", che a sua volta cita `CLAUDE.md` sezione "Monthly Operating".)*

## Rischi noti sul posizionamento (riportati per trasparenza, non normalmente parte del template ma rilevanti per chi userà questo documento)
- Il posizionamento e il gap di prezzo (~1,3-1,9x vs NoBadge) non sono ancora stati validati con nessun cliente reale — rischio che un buyer sensibile al prezzo lo respinga comunque
- Il margine sul primo cliente è positivo ma sottile (~€70-115/mese) finché c'è un solo cliente sull'infrastruttura condivisa
- Il costo Auth0 (€20-30/mese) non è ancora nel calcolo di margine reale — si attiverà quando i ricavi lo giustificheranno
- Il differenziale Face ID non è difendibile in modo permanente se un competitor (es. NoBadge) lo implementa

## Changelog
*Newest first. One line per revision: what changed and why.*
- v2 (2026-08-11) — Aggiornato Competitive Landscape dopo verifica fresca (competitor-profiling: NoBadge ha aggiunto QR dinamico anti-frode ma resta senza biometria, pricing competitor invariato, aggiunto 4HSE come indirect/categoria adiacente su richiesta esplicita); pricing skill: esito CONFERMATO, nessun aggiustamento; precisato messaging Face ID (impersonificazione, non solo clonabilità QR).
- v1 (2026-08-11) — Bozza iniziale da spec positioning/pricing 26/7 e CLAUDE.md.
