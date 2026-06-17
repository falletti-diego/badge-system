# Onboarding cliente — runbook operatore (Dataxiom)

Strumento "concierge": il cliente compila un Excel a 3 fogli, noi lo importiamo.

## Procedura

1. Invia al cliente il modello: `backend/scripts/seed-data/onboarding-template-esempio.xlsx`.
2. Ricevuto il file compilato, esegui **SEMPRE prima il dry-run** (non scrive nulla):
   ```bash
   cd backend
   node scripts/onboard-client.js <file.xlsx> --dry-run
   ```
   Controlla il riepilogo (conteggi per sede) e gli **avvisi** (es. sede senza responsabile).
3. Se è tutto corretto, esegui l'import reale:
   ```bash
   # NUOVO cliente (crea azienda + sedi + dipendenti + saldi):
   node scripts/onboard-client.js <file.xlsx>

   # AGGIUNGERE a un cliente esistente (o correggere/ri-caricare):
   node scripts/onboard-client.js <file.xlsx> --client-id <uuid>
   ```
4. Le credenziali iniziali sono in `backend/scripts/onboarding-output/credenziali-<cliente>-<data>.csv`.
   **Consegnale al cliente in modo sicuro, poi CANCELLA il file.** (La cartella è gitignored.)

## Comportamento (sicuro e ri-eseguibile)

- **Atomico:** tutto in una transazione. Un errore → rollback totale, nessuno stato parziale.
- **Idempotente:** ri-eseguire lo stesso file è sicuro.
  - Sedi: trovate per nome → riusate (no duplicati).
  - Dipendenti: già presenti (per email, nello stesso cliente) → aggiornati nel profilo, **la password NON viene mai resettata** (e quindi niente nuova riga credenziali).
  - Saldi: aggiornati solo se non ancora usati (`used_days = 0`) — non sovrascrivono ferie già godute.
- **Validazione doppia:** prima sul file (campi, email, ruoli, riferimenti sede), poi contro il DB (email cliente già esistente, matricola già assegnata).
- **Audit:** ogni creazione (cliente/sede/dipendente) finisce in `audit_log`.

## Limitazioni note (MVP)

- **Saldi in giorni interi** — niente mezze giornate né Permessi/ROL in ore. Vedi TASKS `ONB.2` per il cambio schema (`NUMERIC`).
- `total_days` = giorni **residui** (con `used_days = 0`): non distinguiamo maturato/goduto.
- L'**anno** del saldo è quello corrente; eventuale carryover dell'anno precedente confluisce nell'anno corrente.
- **Geofencing** salvato come spento di default anche se le coordinate sono presenti — si attiva poi in-app (le coordinate del cliente vengono comunque memorizzate).
- In modalità `--client-id`, una sede già esistente viene **riusata** senza aggiornarne le coordinate (la riconfigurazione sede si fa in-app).

## Mappatura colonne → DB

| Foglio | Colonna | Tabella.colonna |
|---|---|---|
| Azienda | ragione_sociale / email_referente / ore_min_buono_pasto | clients.name / email / meal_voucher_hours |
| Sedi | nome_sede / indirizzo / latitudine / longitudine / raggio_geofence_m | sites.name / location / latitude / longitude / geofence_radius_meters |
| Dipendenti | nome_completo / email / telefono / ruolo / sede / matricola | employees.name / email / phone / role / site_id / external_employee_id |
| Dipendenti | ferie_giorni / permessi_giorni / exfestivita_giorni | leave_saldi (FERIE_1 / FERIE_2 / FERIE_3) |

ruolo: `dipendente`→`employee`, `responsabile`→`manager`.
