# Piano di Test — FASE 8, 9, 10

**Produzione:** https://badge.dataxiom.it  
**API:** https://api.dataxiom.it  
**Data:** 2026-06-11

---

## Account Demo

| Ruolo | Email | Password |
|-------|-------|----------|
| Admin | admin@badge.local | admin01 |
| Manager Torino | alice@badge.local | alice01 |
| Manager Roma | mario@badge.local | mario01 |
| Dipendente | carlo@badge.local | carlo01 |
| Viewer (Commercialista) | — | da creare in AdminPage → tab Commercialisti |

---

## FASE 8 — Portale Commercialista & CSV Paghe

### 8A — Ruolo Viewer (Commercialista)

**Prerequisito:** crea un account viewer nell'AdminPage → tab Commercialisti.

| # | Azione | Risultato atteso |
|---|--------|-----------------|
| 8.A1 | Login con account viewer | Redirect a /dashboard |
| 8.A2 | Verifica navbar | NON vede Correzioni / Planning / Admin |
| 8.A3 | Apre la tabella presenze | Vede tutti i check-in (come admin) |
| 8.A4 | Clicca "Esporta CSV" → Formato "Generico" | Download CSV |
| 8.A5 | Clicca "Esporta CSV" → Formato "Zucchetti" | Download CSV con colonne OreOrdinarie/OreStraordinarie, max 8h/gg, formato HH:MM |
| 8.A6 | Clicca "Esporta CSV" → Formato "TeamSystem" | Download CSV con colonna Tipo (E/U), data DD/MM/YYYY, una riga per timbratura |
| 8.A7 | Prova ad aprire /corrections | Redirect o 403 |
| 8.A8 | Prova ad aprire /admin | Redirect o 403 |

### 8B — Export Formato da Admin/Manager

| # | Azione | Risultato atteso |
|---|--------|-----------------|
| 8.B1 | Login admin → Esporta CSV → "Zucchetti" | CSV con colonne: Cognome, Nome, Matricola, Data, OreOrdinarie (max 8h), OreStraordinarie, Buono Pasto |
| 8.B2 | Login admin → Esporta CSV → "TeamSystem" | CSV con: Data (DD/MM/YYYY), Tipo (E=entrata / U=uscita), Ora (HH:MM), Matricola |
| 8.B3 | Login manager → dropdown formato | Vede tutti e 3 i formati |
| 8.B4 | Login viewer → dropdown formato | Vede solo Zucchetti e TeamSystem (non Generico) |

### 8C — Colonna "Matricola" nella tab Dipendenti

| # | Azione | Risultato atteso |
|---|--------|-----------------|
| 8.C1 | Admin → AdminPage → tab Dipendenti | La colonna si chiama "Matricola" (non "ID Dipendente") |
| 8.C2 | Crea dipendente con matricola "EMP001" | Il campo appare nella lista dipendenti |

---

## FASE 9 — Ore Lavorate & Buoni Pasto

### 9A — Riepilogo Mensile (SummaryPage)

| # | Azione | Risultato atteso |
|---|--------|-----------------|
| 9.A1 | Login admin → clicca "📊 Riepilogo" nel navbar | Apre /summary con tabella mensile |
| 9.A2 | Verifica colonne tabella | Nome, Matricola, Giorni Presenti, Ore Tot, Ore Ord, Ore Straord, Buoni Pasto, Presenze Aperte |
| 9.A3 | Navigazione mese: clicca `<` | Mostra il mese precedente |
| 9.A4 | Navigazione mese: clicca `>` | Ritorna al mese corrente |
| 9.A5 | Dipendente con 8h/giorno × 5 giorni | Ore Tot: 40, Ore Ord: 40, Ore Straord: 0, Buoni Pasto: 5 (se soglia ≤ 8h) |
| 9.A6 | Dipendente con 9h/giorno | Ore Ord: 8, Ore Straord: 1 per quel giorno |
| 9.A7 | Dipendente con check-in IN senza OUT | Colonna ⚠️ Presenze Aperte > 0, chip warning visibile |
| 9.A8 | Clicca "Esporta CSV" | Download CSV con tutti i dati della tabella |
| 9.A9 | Login manager → apre Riepilogo | Vede solo i dipendenti della propria sede |
| 9.A10 | Login viewer → apre Riepilogo | Vede tutti (come admin) |
| 9.A11 | Login dipendente → accede a /summary | 403 o redirect |

### 9B — Colonna "Ore" in PresencesTable

| # | Azione | Risultato atteso |
|---|--------|-----------------|
| 9.B1 | Dashboard → tabella presenze | Colonna "Ore" visibile |
| 9.B2 | Riga con type=OUT dove il corrispondente IN è sulla stessa pagina | Colonna Ore mostra "Xh Ym" (es. "8h 0m") |
| 9.B3 | Riga con type=IN | Colonna Ore mostra "—" |
| 9.B4 | Riga OUT il cui IN è su una pagina diversa | Colonna Ore mostra "—" |

### 9C — Impostazioni Buoni Pasto

| # | Azione | Risultato atteso |
|---|--------|-----------------|
| 9.C1 | Admin → AdminPage → tab "Impostazioni" | Visible campo "Ore minime per buono pasto" con valore corrente (default 5) |
| 9.C2 | Cambia valore a "6" → Salva | Alert "Impostazioni salvate" |
| 9.C3 | Ricarica la pagina | Il campo mostra ancora "6" |
| 9.C4 | Torna a Riepilogo → verifica buoni pasto | I buoni pasto si ricalcolano con soglia 6h |
| 9.C5 | Inserisci valore "25" → Salva | Errore validazione (max 24) |

---

## FASE 10 — Geofencing

### 10A — Configurazione Geofencing (AdminPage Web)

| # | Azione | Risultato atteso |
|---|--------|-----------------|
| 10.A1 | Admin → AdminPage → tab Sedi | Colonna "Geofencing" visibile con icona 📍 grigia per ogni sede |
| 10.A2 | Clicca icona 📍 su una sede | Apre dialog "Geofencing — [nome sede]" |
| 10.A3 | Nel dialog: attiva toggle "Geofencing attivo" | I campi lat/lng/raggio si abilitano |
| 10.A4 | Inserisci lat/lng validi (es. 45.4654 / 9.1859) + raggio 150 → Salva | Alert "Geofencing aggiornato", icona diventa verde con chip "150m" |
| 10.A5 | Clicca icona 📍 di nuovo | Vedi lat/lng/raggio già popolati |
| 10.A6 | Link "📍 Verifica posizione su Google Maps" | Apre Google Maps con il punto corretto |
| 10.A7 | Prova a salvare con geofence ON e lat vuoto | Messaggio errore "Inserisci latitudine e longitudine valide" |
| 10.A8 | Prova a salvare con raggio 30 (< 50) | Errore validazione 400 |
| 10.A9 | Disattiva toggle → Salva | Icona torna grigia, chip rimosso |

### 10B — Check-in con Geofencing (API / Mobile)

> **Per testare senza app mobile:** usa le curl sotto

#### Test con curl — Geofence disabilitato

```bash
# Login
TOKEN=$(curl -s -X POST https://api.dataxiom.it/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carlo@badge.local","password":"carlo01"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Check-in senza coordinate — OK perché geofence disabled
curl -s -X POST https://api.dataxiom.it/api/v1/checkins \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"employee_id":"<CARLO_UUID>","site_id":"<SEDE_UUID>","type":"IN"}'
# Atteso: 201 Created
```

#### Test con curl — Geofence abilitato

Prima abilita il geofencing su una sede via AdminPage con coordinate (es. 45.4654, 9.1859, raggio 150m).

```bash
# Check-in senza coordinate → 400 GEOFENCE_COORDINATES_REQUIRED
curl -s -X POST https://api.dataxiom.it/api/v1/checkins \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"employee_id":"<UUID>","site_id":"<UUID>","type":"IN"}'
# Atteso: 400, "code":"GEOFENCE_COORDINATES_REQUIRED"

# Check-in dentro il raggio (~50m dalla sede) → 201
curl -s -X POST https://api.dataxiom.it/api/v1/checkins \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"employee_id":"<UUID>","site_id":"<UUID>","type":"IN","latitude":45.4658,"longitude":9.1859}'
# Atteso: 201 Created

# Check-in fuori dal raggio (~500m) → 403 OUTSIDE_GEOFENCE
curl -s -X POST https://api.dataxiom.it/api/v1/checkins \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"employee_id":"<UUID>","site_id":"<UUID>","type":"IN","latitude":45.4699,"longitude":9.1859}'
# Atteso: 403, "error":"OUTSIDE_GEOFENCE", "details":{"distance_meters":>150,"max_meters":150}
```

### 10C — Check-in Mobile con GPS (TestFlight Build 17)

> **Nota:** Build 17 richiede `eas build` — non ancora sottomesso. Testa con build locale o simulatore.

| # | Scenario | Risultato atteso |
|---|----------|-----------------|
| 10.C1 | Check-in normale, sede senza geofencing | GPS non richiesto, check-in OK |
| 10.C2 | GPS disabilitato sul telefono, sede senza geofencing | Check-in OK (GPS opzionale) |
| 10.C3 | GPS disabilitato, sede CON geofencing abilitato | Alert "📍 GPS richiesto — Attiva il GPS e riprova" |
| 10.C4 | GPS abilitato, dentro raggio 150m dalla sede | Check-in OK 201 |
| 10.C5 | GPS abilitato, fuori raggio (>150m) | Alert "📍 Fuori dalla sede — Distanza: Xm, Massimo: 150m" |
| 10.C6 | Permesso GPS negato → Riprova → concede permesso | Richiede permesso → check-in prosegue |

---

## Sequenza di Test Raccomandata

1. **Crea un viewer** in AdminPage → Commercialisti (ti serve per 8A)
2. **Esegui 8A + 8B** (viewer login, export formati)
3. **Esegui 9A** (SummaryPage — naviga tra mesi, verifica calcoli ore)
4. **Esegui 9B** (colonna Ore nella dashboard)
5. **Esegui 9C** (cambia soglia buono pasto, ricontrolla Summary)
6. **Configura geofence** su una sede di test (10A)
7. **Esegui 10B** con curl per test backend
8. **Opzionale:** EAS build per 10C su iPhone reale

---

## ID UUID di Riferimento

Per le chiamate curl, ottieni gli UUID reali da:
- `/api/v1/employees` (come admin) per `employee_id`
- `/api/v1/sites` (come admin) per `site_id`

Oppure usa il debug endpoint: `GET /api/v1/admin/debug/employee-assignment/:employeeId`
