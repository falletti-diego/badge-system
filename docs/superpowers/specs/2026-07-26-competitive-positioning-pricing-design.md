# Posizionamento Competitivo e Pricing — Design

**Data:** 26 Luglio 2026
**Status:** Approvato
**Collegato a:** `docs/superpowers/specs/2026-07-26-tenant-branding-and-whitelabel-design.md` (Tier 1 / Tier 2)

---

## Contesto

BadgeSystem è oggi prezzato a **€10/dipendente/mese + €250/sede una tantum**, un modello definito prima di qualunque analisi comparativa con il mercato reale. Questo documento nasce da una richiesta esplicita di analisi competitiva: capire chi vende cosa a che prezzo nel segmento PMI/retail italiano ed europeo, e da lì derivare un posizionamento e un pricing difendibili per il primo cliente reale.

**Vincolo di realtà:** zero clienti paganti ad oggi. Ogni conclusione di questo documento è un'ipotesi di go-to-market da validare nelle prime conversazioni commerciali, non un fatto verificato sul campo.

---

## Analisi competitiva

| Player | Segmento | Prezzo pubblico | Modello | Note |
|---|---|---|---|---|
| **NoBadge** (IT) | PMI/retail, smartphone-only | **€4,20–5,04/utente/mese**, nessun costo attivazione/hardware, nessun fee per sede | Paga solo chi timbra nel mese corrente | **Concorrente diretto quasi identico**: QR code + GPS da smartphone, dati su server italiani, verticale retail/commercio esplicito. Nessuna menzione di autenticazione biometrica. |
| **Libemax / EcosAgile eClock** (IT) | PMI, QR-based | Prezzo su richiesta | — | Stessa meccanica QR, meno smartphone-first, più legato a terminali fisici/postazioni fisse |
| **Zucchetti / TeamSystem HR** (IT) | Enterprise/mid-market HR suite | Prezzo su richiesta (opaco, nessun listino pubblico trovato) | Tipicamente licenza + hardware + canone + costi di implementazione | Incumbent storici con alto switching cost per il cliente esistente, ma percepiti pesanti/costosi da PMI 25-200 dipendenti che cercano solo il modulo presenze |
| **Factorial** (ES/EU) | HR suite modulare | ~€7-15/dipendente/mese a modulo | Prezzo custom per headcount + moduli (Time è uno tra tanti hub) | Suite completa (talent, finance, IT) — overkill per chi vuole solo badge/presenze |
| **Personio** (DE/EU) | HR suite enterprise-lite | ~€7,60+/dipendente/mese core, fino a €12-15 con moduli | Custom quote, contratto annuale | Target HR-manager di aziende strutturate, non specificamente retail |
| **Deputy** (AU/US) | Scheduling + time tracking | $4-9/dipendente/mese (PEPM a fasce) | Minimo $30/mese | Non localizzato IT/GDPR-first, forte su scheduling ma debole su compliance italiana |

### Il dato che cambia la conversazione

**NoBadge fa oggi, in Italia, quasi esattamente quello che fa BadgeSystem** — smartphone, no hardware, QR/GPS, verticale retail — **a meno della metà del prezzo e senza fee per sede**. Questo significa che "zero hardware + QR + smartphone" da solo non è più un differenziatore: è commodity nel mercato italiano PMI/retail.

Il potenziale differenziante reale di BadgeSystem, assente nei competitor italiani analizzati, è duplice:
1. **Face ID nativo come anti-frode** — QR code e GPS sono clonabili/condivisibili tra colleghi ("buddy punching"), un problema noto e quantificabile nel retail (turni coperti da un collega che timbra al posto di un altro). Face ID lo rende strutturalmente più difficile.
2. **Opzione white-label Tier 2** (design approvato la settimana precedente) — nessun competitor italiano citato offre un percorso di brandizzazione completa per clienti grandi.

---

## Decisione di posizionamento

Tre approcci sono stati valutati esplicitamente con l'utente:

- **A. Differenziazione premium** (prezzo invariato o quasi, giustificato solo dalla storia Face ID/audit) — scartato: senza clienti reali né case study, un gap 2x rispetto a un incumbent locale consolidato rischia di far scartare BadgeSystem a priori nel confronto prezzi, prima ancora che la storia di differenziazione venga ascoltata.
- **B. Parità quasi totale con NoBadge** (~€5-6/dipendente/mese) — scartato: con la struttura di costi fissi MVP attuale, un margine così compresso sul primo cliente non lascia risorse per vendita/supporto/iterazione, ed è una corsa al ribasso contro un player che ha già scala.
- **C. Riduzione del gap, non eliminazione** (scelto) — avvicinarsi a NoBadge quanto basta per non essere scartati sul prezzo, mantenendo un margine sostenibile e usando Face ID/audit/white-label come motivo esplicito del delta residuo.

**Target di vendita:** si sposta leggermente in alto rispetto all'ipotesi originale — non più "qualsiasi negozio 25+ dipendenti", ma **catene multi-sede (3+ sedi) dove il time-theft e la compliance hanno un costo reale da giustificare** a un HR/Ops director, non al singolo punto vendita che vuole solo smettere di usare un foglio Excel.

---

## Pricing definitivo

| Voce | Attuale | Nuovo |
|---|---|---|
| Per dipendente/mese | €10 flat | **€8** (25-99 dipendenti) → **€7** (100-149) → **€6,50** (150-200) |
| Per sede aggiuntiva (una tantum) | €250 flat | **€250** (sedi 1-3) → **€150** (sedi 4-10) → **€100** (sedi 11+) |
| Gap vs NoBadge (~€4,20-5,04) | ~2x | **~1,3-1,9x**, giustificato da Face ID/audit/RBAC/white-label |
| White-label Tier 2 | — | invariato: resta fuori listino, trattativa custom (nessuna modifica rispetto al design branding/white-label già approvato) |

Il fee per sede passa da flat a scaglioni per non penalizzare le catene con molte sedi (il segmento target scelto), coerente con lo spostamento verso clienti multi-sede.

### Verifica margine sul primo cliente MVP

Costi fissi mensili di infrastruttura per un solo cliente (da `CLAUDE.md`, sezione "Monthly Operating"):

| Voce | Costo/mese |
|---|---|
| AWS EC2 t3.small | €40-50 |
| AWS RDS PostgreSQL | €30-50 |
| AWS Data Transfer | €5-10 |
| Auth0 | €20-30 *(non ancora attivo — MVP usa Mock Auth0 gratuito, vedi `auth_strategy_mvp`)* |
| CloudWatch | €5-10 |
| Domain + varie | €5-10 |
| **Totale nominale** | €105-160 |
| **Totale reale attuale** (Auth0 non attivo) | **~€85-130** |

Con €8/dipendente × 25 dipendenti = **€200/mese di ricavo** contro **~€85-130/mese di costo reale attuale**, il margine sul primo cliente pilota è positivo (~€70-115/mese). Questi costi sono in larga parte fissi, non proporzionali al numero di dipendenti di un singolo cliente: un secondo cliente sulla stessa infrastruttura multi-tenant condivisa avrebbe un costo marginale molto più basso, quindi il margine per-cliente migliora rapidamente con la crescita del portafoglio clienti.

---

## Nuovo messaging commerciale

Il claim primario cambia da **"zero hardware, QR da smartphone"** (ora commodity) a:

> **"Non solo digitalizzare il cartellino — impedire che qualcuno timbri al posto di un collega, con una traccia di audit che regge a un controllo."**

Argomenti di vendita in ordine di priorità:
1. Face ID nativo vs QR/GPS clonabili/condivisibili — prevenzione time-theft
2. Audit log completo (chi/quando/cosa) + RBAC — rilevante per HR/Ops director di catene multi-sede, non per il singolo negozio
3. Opzione white-label Tier 2 come argomento per i clienti più grandi in prospettiva di crescita ("possiamo diventare invisibili sotto il tuo brand")

---

## Rischi

| Rischio | Impatto | Note |
|---|---|---|
| Il posizionamento non è ancora validato con nessun cliente reale | Alto | Il gap di 1,3-1,9x rispetto a NoBadge potrebbe comunque essere respinto da un buyer molto sensibile al prezzo — da verificare nelle prime conversazioni commerciali (Sprint 4 / primo cliente pilota), non assunto come vero |
| Margine sottile finché c'è un solo cliente sull'infrastruttura condivisa | Medio | Positivo ma non ampio (~€70-115/mese) — un imprevisto di costo cloud o un cliente sotto i 25 dipendenti comprime rapidamente il margine |
| Auth0 a pagamento non ancora nel calcolo di margine per il futuro | Medio | Quando si attiverà (revenue-triggered, vedi `revenue_auth0_migration_todo`), il costo fisso reale salirà di €20-30/mese — da ricalcolare il margine a quel punto |
| NoBadge o altri competitor italiani potrebbero reagire abbassando ulteriormente il prezzo o aggiungendo biometria | Basso-Medio | Nessuna evidenza attuale che questo sia in corso, ma il differenziale Face ID non è difendibile in modo permanente se un competitor lo implementa |

---

## Collegamento con Tier 1 / Tier 2

Il pricing definito in questo documento è il **listino Tier 1** (Dataxiom-managed) del design `2026-07-26-tenant-branding-and-whitelabel-design.md`. **Tier 2 (white-label completo) resta, come già deciso in quel documento, una trattativa custom fuori listino per grandi clienti** — nessuna sovrapposizione da risolvere tra i due documenti.
