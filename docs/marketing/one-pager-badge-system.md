# Badge System — One-Pager

*Fonte: `.agents/product-marketing.md` v2 (2026-08-11). Nessun cliente pagante ad oggi — vedi nota onestà in fondo.*

---

## Il problema

Le catene retail multi-sede tracciano le presenze con metodi che non prevengono il "buddy punching" — un collega che timbra al posto di un altro — e non hanno una traccia di audit solida da mostrare in un controllo di compliance. I sistemi QR/GPS oggi sul mercato italiano (incluso il concorrente diretto più economico) restano clonabili o condivisibili tra colleghi: nessuno verifica che sia davvero la persona a timbrare.

## La soluzione

**Badge System** è un software di rilevazione presenze per catene retail multi-sede (3+ sedi, 25-200 dipendenti): i dipendenti timbrano da smartphone personale scansionando un QR code in sede e autenticandosi con **Face ID nativo** — zero hardware da acquistare o installare. Manager e HR/Ops accedono a una dashboard web con reporting in tempo reale, correzioni tracciate e export CSV.

> "Non solo digitalizzare il cartellino — impedire che qualcuno timbri al posto di un collega, con una traccia di audit che regge a un controllo."

## Perché Badge System, non un'alternativa

1. **Face ID nativo, non solo QR.** Un QR — anche "dinamico" come quello di alcuni concorrenti italiani — può sempre essere scansionato da un collega al posto del titolare. Badge System affianca al QR un'autenticazione biometrica nativa del dispositivo, con ogni check-in tracciato in un log verificabile: nessun concorrente italiano analizzato la offre.
2. **Audit log completo + RBAC, pensati per la scala multi-sede.** Ogni modifica (chi, quando, cosa) è tracciata — la risposta pronta a un controllo di compliance che un foglio Excel o un sistema QR-only non danno.
3. **Zero hardware, prezzo pensato per non punire la crescita.** Nessun terminale da installare per sede; il listino è a scaglioni decrescenti sia per dipendente sia per sede aggiuntiva, così l'espansione a nuove sedi non fa lievitare il costo unitario.

## Prezzo

| Dipendenti | €/dipendente/mese |
|---|---|
| 25-99 | €8 |
| 100-149 | €7 |
| 150-200 | €6,50 |

Più una fee una tantum per sede aggiuntiva: €250 (sedi 1-3) → €150 (sedi 4-10) → €100 (sedi 11+).

## Prossimo passo

Una demo di 20 minuti sul flusso di check-in e sulla dashboard di audit — nessun impegno, nessuna carta di credito richiesta.

**Contatto:** Diego Falletti — Dataxiom

---

### Nota di onestà (da rimuovere non appena disponibile prova sul campo)

Badge System non ha ancora clienti paganti: questo one-pager riporta la posizione commerciale ufficiale e la differenziazione verificata sui competitor pubblici (aggiornata 2026-08-11), non metriche o testimonianze reali — nessuna verrà inventata. Proof point quantificati (risparmio tempo, riduzione time-theft, testimonianze) andranno aggiunti qui solo dopo il primo cliente pilota.

**Aggiornata 2026-08-25:** precisato il punto 1 — rimosso "Face ID lega il check-in all'identità fisica della persona", claim più assoluto di quanto il codice implementi (verificato in `.agents/product-marketing.md` v6: Face ID è opzionale e verifica il dispositivo, non un confronto col volto specifico dell'account). In una demo con un prospect tecnico, qualificare l'argomento come prevenzione della falsificazione della richiesta, non come verifica biometrica ad ogni scan.
