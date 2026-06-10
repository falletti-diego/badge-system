# Design Spec — Commercial Features v1.1
**Data:** 2026-06-10  
**Scope:** Tre feature commerciali per rendere Badge System più competitivo nel retail italiano  
**Priorità implementazione:** FASE 8 → FASE 9 → FASE 10

---

## FASE 8 — Portale Commercialista & CSV Paghe

### Problema
Il cliente dice "se non si collega al mio software paghe non mi serve". Il commercialista che gestisce le paghe delle PMI clienti è il gate-keeper della decisione d'acquisto. Oggi riceve il CSV generico e deve rielaborarlo manualmente.

### Soluzione

**Nuovo ruolo `viewer`**  
Quarto ruolo JWT (admin / manager / employee / **viewer**). Il viewer è il commercialista o consulente del lavoro. Ha accesso read-only a presenze e riepilogo ore del suo cliente. Non vede planning, correzioni, o pannello admin.

Accesso alle route:
- ✅ `GET /api/checkins` — tutte le sedi del cliente
- ✅ `GET /api/export/csv` — con formato selezionabile
- ✅ `GET /api/presences/summary` (FASE 9)
- ❌ `PUT /api/checkins/:id` — solo manager/admin
- ❌ `GET/POST /api/shifts/*` — solo manager/admin/employee
- ❌ `GET/POST /api/admin/*` — solo admin

Account viewer creato dall'admin in AdminPage (tab "Commercialisti"), salvato in tabella `employees` con `role='viewer'`. Non ha `employee_id` nel JWT, ha solo `client_id` e `role`.

**Campo `matricola` su employees**  
Codice dipendente usato dal software paghe (es. "001", "EMP-023"). Nullable, stringa libera. Aggiunto alla tabella `employees` (migration 008). Visibile/modificabile in AdminPage tab Dipendenti e nel CSV import.

**Formato Zucchetti (tracciato presenze)**  
Un file CSV con separatore `;`, una riga per giorno lavorato:
```
Matricola;Cognome;Nome;Data;OraEntrata;OraUscita;OreOrdinarie;OreStraordinarie
001;Rossi;Mario;01/06/2026;08:30;17:00;8,00;1,00
```
- Data: `DD/MM/YYYY`
- Ore: formato `H,MM` con virgola decimale (convenzione italiana)
- OreOrdinarie: min(ore_lavorate, soglia_giornaliera) — default 8h
- OreStraordinarie: max(ore_lavorate - soglia, 0)
- Righe senza OUT omesse (presenza aperta non calcolabile)

**Formato TeamSystem (Lynfa/Alyante)**  
Due righe per ogni timbratura (IN e OUT separate):
```
Matricola;Data;Tipo;Ora
001;01/06/2026;E;08:30
001;01/06/2026;U;17:00
```
- Tipo: `E` = entrata, `U` = uscita
- Data: `DD/MM/YYYY`

**Selezione formato**  
Nel dashboard → Esporta CSV: dropdown "Formato" con opzioni `Generico`, `Zucchetti`, `TeamSystem`. Default: Generico (formato attuale). Il viewer vede solo Zucchetti e TeamSystem come opzioni.

### Schema changes
```sql
-- Migration 008
ALTER TABLE employees ADD COLUMN matricola VARCHAR(50);
-- role enum già supporta valori stringa — aggiungere 'viewer' nella validazione Zod
```

### API changes
`GET /api/export/csv?format=generic|zucchetti|teamsystem`  
Parametro `format` aggiunto. Default `generic`. Il backend formatta le righe in base al valore.

`POST /api/admin/viewers` — crea account viewer (email, nome, password temporanea)  
`GET /api/admin/viewers` — lista viewers del client

---

## FASE 9 — Ore Lavorate & Buoni Pasto

### Problema
Il titolare paga €10/mese ma "fa già tutto con Excel". Il valore non è percepito perché il sistema non calcola le ore — fa solo timbratura. Il calcolo manuale a fine mese richiede 2-3 ore di lavoro al manager.

### Soluzione

**Calcolo ore per giorno**  
Logica backend: per ogni dipendente, per ogni giorno, accoppiare il check-in IN con il successivo OUT. Se ci sono più coppie in un giorno (es. pausa pranzo con uscita/rientro), sommare tutte le coppie.

```
Ore_lavorate_giorno = Σ (OUT_i - IN_i) per ogni coppia nello stesso giorno
```

Casi speciali:
- IN senza OUT corrispondente → `presenza_aperta` = true, ore = null
- OUT senza IN precedente → ignorato nel calcolo
- Arrotondamento: al minuto esatto (nessun arrotondamento artificioso)

**Buoni pasto**  
Configurazione per client: `meal_voucher_threshold_hours` (default: 5.0). Salvato in tabella `clients` come colonna `meal_voucher_hours` (migration 008, stesso file).

Regola: se `ore_lavorate_giorno >= threshold` → 1 buono pasto per quel giorno.

```sql
-- Migration 008 (aggiunto qui)
ALTER TABLE clients ADD COLUMN meal_voucher_hours DECIMAL(4,2) DEFAULT 5.0;
```

**Nuovo endpoint**  
`GET /api/presences/summary?month=6&year=2026`

Response:
```json
{
  "data": {
    "period": { "month": 6, "year": 2026 },
    "employees": [
      {
        "id": "uuid",
        "name": "Mario Rossi",
        "matricola": "001",
        "giorni_presenti": 22,
        "ore_totali": 176.5,
        "ore_ordinarie": 176.0,
        "ore_straordinarie": 0.5,
        "buoni_pasto": 20,
        "presenze_aperte": 1
      }
    ],
    "totals": { "ore_totali": 352, "buoni_pasto": 40 }
  }
}
```

RBAC: admin vede tutti, manager vede solo la sua sede, viewer vede tutti (read-only).

**Frontend: nuova sezione "Riepilogo Mensile"**  
Nuova tab nella dashboard (accanto a "Presenze"). Tabella: una riga per dipendente, colonne: Nome, Matricola, Giorni, Ore Tot, Ore Ord, Ore Straord, Buoni Pasto, Presenze Aperte.

Navigazione mese con frecce (stesso pattern di PlanningPage). Export CSV del riepilogo.

**Frontend: colonna "Ore" nella tabella presenze**  
Nella tabella presenze esistente, aggiungere una colonna calcolata lato backend che mostra le ore della coppia IN/OUT per ogni giorno.

**Configurazione buoni pasto**  
In AdminPage → tab Impostazioni: campo `Ore minime per buono pasto` (default 5). Aggiornato via `PUT /api/admin/settings`.

---

## FASE 10 — Geofencing

### Problema
"Come faccio a sapere che non possono barare? Un dipendente può timbrare da casa." Senza una risposta a questa domanda, i clienti che hanno già avuto problemi di presenza non si convincono.

### Soluzione

**Coordinate per sede**  
Aggiungere `latitude`, `longitude`, `geofence_radius_meters` (default: 150), `geofence_enabled` (default: false) alla tabella `sites` (migration 009).

L'admin imposta le coordinate in AdminPage → Sedi → Modifica. Per ora: input manuale lat/lng (l'admin copia da Google Maps). Phase 2: geocoding automatico da indirizzo.

**Validazione backend**  
`POST /api/checkins` riceve body aggiuntivo: `{ latitude, longitude }` (opzionali).

Se `geofence_enabled = true` per la sede:
1. Se coordinate non fornite → `403 GEOFENCE_COORDINATES_REQUIRED`
2. Calcola distanza con formula Haversine
3. Se distanza > `geofence_radius_meters` → `403 OUTSIDE_GEOFENCE` con `{ distance_meters, max_meters }`
4. Se distanza ≤ radius → check-in accettato, coordinate salvate nel log

Formula Haversine implementata in `src/utils/geo.js` (nessuna dipendenza esterna).

**App mobile: raccolta GPS**  
Prima di inviare il check-in, l'app richiede la posizione GPS con `expo-location`:
1. Controlla permesso → richiede se non concesso
2. `Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })`
3. Aggiunge `latitude` e `longitude` alla request del check-in
4. Gestisce `OUTSIDE_GEOFENCE`: mostra alert "Sei troppo lontano dalla sede (Xm, massimo Ym). Avvicinati e riprova."
5. Gestisce `GEOFENCE_COORDINATES_REQUIRED`: "Attiva la posizione GPS per timbrare in questa sede."
6. Se GPS non disponibile e geofence non abilitato → check-in funziona come prima (compatibilità)

**Permission in app.json**
```json
"ios": { "infoPlist": { "NSLocationWhenInUseUsageDescription": "..." } }
"android": { "permissions": ["ACCESS_FINE_LOCATION"] }
```

**Admin UI**  
AdminPage → Sedi: aggiungere campo "Geofencing" con toggle on/off + input latitudine/longitudine + slider raggio (50-500m). Mostrare un link "Trova coordinate" che apre Google Maps.

### Note implementative
- Raggio default 150m — generoso per coprire imprecisioni GPS indoor
- Il campo `geofence_enabled = false` di default: non rompe build esistenti, adozione opt-in
- Le coordinate vengono salvate nel check-in (colonne `checkin_latitude`, `checkin_longitude`) per audit trail
- Phase 2: mappa interattiva per impostare il geofence direttamente dal browser

---

## Ordine di implementazione raccomandato

```
FASE 8 (Portale + CSV):
  migration 008 → viewer RBAC → CSV Zucchetti/TeamSystem → viewer UI → matricola UI

FASE 9 (Ore + Buoni Pasto):
  migration 008 → calcolo ore utility → /api/presences/summary → frontend riepilogo → config buoni pasto

FASE 10 (Geofencing):
  migration 009 → geo.js utility → checkins validation → expo-location → admin UI geofence
```

Le FASI 8 e 9 condividono migration 008 — fare un'unica migration con tutti i campi.

---

## Stima effort

| Feature | Backend | Frontend | Mobile | Totale |
|---------|---------|----------|--------|--------|
| FASE 8 — Portale + CSV | 6h | 5h | — | ~11h |
| FASE 9 — Ore + Buoni Pasto | 5h | 6h | — | ~11h |
| FASE 10 — Geofencing | 4h | 2h | 4h | ~10h |
| **Totale** | | | | **~32h** |
