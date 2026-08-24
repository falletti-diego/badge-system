# Verifica manuale staging — Fase A (fix findings 2 Agosto 2026)

**Prima di procedere:** `develop` è già deployato su staging (deploy + smoke test automatico già verdi). Questa checklist copre solo ciò che lo smoke test automatico NON verifica.

- Frontend: https://badge-system-staging.netlify.app
- Credenziali: `maria@badge.local` (employee) · `pino@badge.local` (manager, password nota) — stesso tenant demo Torino usato dallo smoke test

Spunta ogni riga dopo averla verificata. Se un punto fallisce, **non fondere in `main`** — segnalalo e ci fermiamo.

---

## 1. Face ID badge (finding #4)

- [ ] Login come `pino@badge.local` → Dashboard → tabella presenze
- [ ] Cerca (o crea, se serve, un check-in da mobile con Face ID disattivato nelle Impostazioni) una riga con chip **"No Face ID"** (arancione, accanto all'eventuale chip "Offline")
- [ ] Passa il mouse sul chip → tooltip "Timbratura registrata senza verifica Face ID" visibile

## 2. Export CSV troncato (finding #13) + fix CORS

- [ ] Dashboard → Export CSV con un intervallo di date ampio
- [ ] Il file si scarica regolarmente (anche se il dataset di staging è piccolo e non tronca, va bene: verifica solo che l'export **non dia errori in console browser** — apri DevTools → Console prima di esportare)
- [ ] Se il dataset supera 50.000 righe (improbabile in staging): compare l'alert giallo "Export troncato..."

## 3. Login multi-tab (finding #7 — lock cross-tab)

- [ ] Apri il dashboard in **due tab** dello stesso browser, stesso utente loggato
- [ ] Lascia passare il tempo di scadenza del token (o forza un refresh ricaricando entrambe le tab quasi in contemporanea)
- [ ] Nessuna delle due tab fa logout inatteso o mostra errori di sessione

## 4. Dashboard — errore polling visibile (finding #9)

- [ ] Solo un controllo visivo: la dashboard carica le card statistiche normalmente, nessun errore residuo mostrato senza motivo
- [ ] (Non serve simulare un guasto di rete — verificato nei test automatici, qui basta il comportamento normale)

## 5. Tabella presenze — messaggio ore (finding #11)

- [ ] Se una riga OUT non ha l'IN abbinato nella pagina corrente, compare **"N/D (verifica pagina precedente)"** invece di un trattino nudo — non bloccante se il dataset di staging non presenta questo caso

## 6. Sanity generale (nessuna regressione)

- [ ] Login → Dashboard carica senza errori in console
- [ ] Un check-in QR reale (mobile o simulato) va a buon fine e appare in tabella
- [ ] Logout e nuovo login funzionano

---

## Esito

- [ ] **Tutto verificato, nessun problema** → procedi con il merge `develop` → `main`
- [ ] **Problema trovato** → annota qui sotto, non fondere

Note:
