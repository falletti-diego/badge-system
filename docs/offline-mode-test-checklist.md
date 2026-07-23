# Offline Mode — Checklist di Test Manuale

**Documento:** Test Plan E2E su device reale
**Data:** 2026-07-23
**Copre:** Fase A (backend, già LIVE in produzione) + Fase B (mobile, codice completo, MAI testato su device reale)
**Durata stimata:** 30-40 minuti
**Prerequisiti:**
- Build TestFlight aggiornata con il codice della Fase B (Task B6 — `/build-mobile`)
- Un iPhone reale (la modalità aereo va testata su device vero, non nel simulatore)
- Un secondo account demo per lo scenario "device condiviso" (es. `maria@badge.local` / `maria01` ed un secondo account employee dello stesso sito)
- Accesso alla dashboard web (`badge.dataxiom.it`) per verificare cosa arriva al backend

---

## Come leggere questa checklist

Ogni riga: azione → cosa aspettarsi → ✅/❌. Se qualcosa fallisce, annota lo scostamento esatto (schermata, messaggio, timestamp) prima di continuare — non serve a niente segnare ❌ e basta.

Le sezioni 1-2 sono **retrocompatibilità** (già live, ma vale la pena un check veloce prima di stressare l'offline). Le sezioni 3-8 sono il cuore della Fase B, **mai verificate su device reale finora**.

---

## 1. Sanity check — flusso online normale (retrocompatibilità)

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 1.1 | Con rete attiva, scansiona un QR code e fai un check-in IN | Vibrazione, flash verde, schermata "Check-in Registrato" classica (NON "in attesa di rete") | ☐ |
| 1.2 | Nessun contatore "in attesa di sincronizzazione" visibile in CheckInScreen | Il contatore non appare (perché è 0) | ☐ |
| 1.3 | Controlla la dashboard web: il check-in appena fatto è presente | Orario corretto, NESSUN badge "Offline" sulla riga | ☐ |

---

## 2. Errore applicativo — non deve mai finire in coda

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 2.1 | Prova un check-in su un sito a cui il dipendente NON è assegnato (o un altro errore applicativo, es. QR di un'altra sede) | Alert "Errore check-in" con messaggio chiaro, **nessuna coda**, nessun contatore che sale | ☐ |
| 2.2 | Riprova con un check-in valido subito dopo | Funziona normalmente, nessun residuo dal tentativo fallito | ☐ |

---

## 3. Timbratura offline singola — la promessa centrale della feature

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 3.1 | Attiva **modalità aereo** sul telefono | — | ☐ |
| 3.2 | Scansiona un QR code, fai un check-in IN | Entro ~6 secondi: schermata verde "Timbratura salvata sul telefono" con il pill "☁️ Offline" e il sottotitolo "Verrà sincronizzata automaticamente..." (NON un errore, NON un blocco come succedeva prima) | ☐ |
| 3.3 | Torna a CheckInScreen | Contatore "🕓 1 timbratura in attesa di sincronizzazione" visibile | ☐ |

---

## 4. Coda multipla + persistenza dopo kill dell'app

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 4.1 | Ancora in modalità aereo, fai un secondo check-in (OUT) | Stessa schermata "in attesa di rete", contatore sale a 2 | ☐ |
| 4.2 | **Chiudi completamente l'app** (swipe-kill, non solo background) | — | ☐ |
| 4.3 | Riapri l'app (sempre in modalità aereo) | Il contatore mostra ancora 2 — la coda è sopravvissuta al kill dell'app | ☐ |

---

## 5. Sync automatico al ritorno della rete

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 5.1 | Disattiva la modalità aereo | Entro pochi secondi il contatore scende a 0 senza alcuna azione manuale | ☐ |
| 5.2 | Controlla la dashboard web | Entrambe le timbrature (IN e OUT) presenti, **con l'orario REALE di quando sono state fatte** (non l'ora in cui è scattato il sync) | ☐ |
| 5.3 | Entrambe le righe mostrano il badge **"Offline"** (con tooltip) | ☐ |
| 5.4 | Metti di nuovo il telefono in modalità aereo → riattivala subito dopo (toggle rapido) | Il sync scatta una volta sola, non parte doppio (nessun log/contatore anomalo) | ☐ |

---

## 6. Nessun duplicato su retry ripetuti

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 6.1 | Ripeti la sequenza della Sezione 3-5 un'altra volta (nuova timbratura offline → sync) | Sincronizza correttamente come prima | ☐ |
| 6.2 | Sulla dashboard web (o via query DB se hai accesso), conta le righe per quel dipendente in quel minuto | Nessuna riga duplicata — ogni timbratura fatta appare una volta sola | ☐ |
| 6.3 | (Opzionale, più tecnico) Se riesci a forzare il telefono a rimandare la stessa timbratura in coda due volte (es. toggle aereo molto rapido durante il sync), verifica comunque che in DB resti una riga sola | Il backend deduplica su `client_uuid` — zero righe doppie anche in caso di retry | ☐ |

---

## 7. Device condiviso tra dipendenti diversi (scenario critico, corretto in questa sessione)

Questo scenario testa un bug reale trovato e corretto: su un device condiviso, le timbrature in coda di un dipendente non devono mai andare perse o confuse con quelle di un altro.

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 7.1 | Login come **Dipendente A**, modalità aereo, fai un check-in (va in coda) | Contatore = 1, come atteso | ☐ |
| 7.2 | Disattiva la modalità aereo SOLO per un istante (non aspettare il sync), poi **logout** di A prima che sincronizzi (se il sync è troppo veloce, riprova in aereo e fai logout mentre sei ancora offline) | A si scollega con la timbratura ancora in coda | ☐ |
| 7.3 | Login come **Dipendente B** (stesso device) | CheckInScreen di B mostra contatore **0** — NON deve vedere la timbratura in coda di A | ☐ |
| 7.4 | Con B loggato e rete attiva, aspetta qualche secondo (il sync automatico può scattare in background) | La timbratura di A NON deve fallire/sparire — resta in coda in attesa che A rifaccia login | ☐ |
| 7.5 | Fai logout di B, rifai login come A | Il contatore di A torna a mostrare 1 (la sua timbratura in sospeso) | ☐ |
| 7.6 | Con rete attiva, aspetta il sync | La timbratura di A si sincronizza correttamente, con l'orario reale del punto 7.1 | ☐ |
| 7.7 | Verifica sulla dashboard che la cache di turni/presenze non abbia mai mostrato dati di A a B (vedi anche Sezione 8) | ☐ |

---

## 8. Cache read-only turni e presenze offline

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 8.1 | Con rete attiva, apri "I Miei Turni" e "Le mie presenze" (per popolare la cache) | Dati caricati normalmente | ☐ |
| 8.2 | Attiva modalità aereo, riapri "I Miei Turni" | Vedi comunque i turni del mese corrente, con un banner giallo "Sei offline — dati aggiornati al [data/ora]" | ☐ |
| 8.3 | Stessa prova su "Le mie presenze" | Stesso comportamento: dati + banner | ☐ |
| 8.4 | Cambia mese in "I Miei Turni" mentre sei ancora offline (mese MAI aperto online prima) | Niente cache per quel mese → schermata di errore/Riprova classica (non deve mostrare dati sbagliati né andare in crash) | ☐ |
| 8.5 | Disattiva la modalità aereo e ricarica | Banner sparisce, dati aggiornati normalmente | ☐ |

---

## 9. Riepilogo — cosa NON è (ancora) coperto

- Sync in background con app completamente chiusa (nessun listener attivo): esplicitamente fuori perimetro di questa fase — il sync parte solo all'apertura dell'app o al cambio di stato rete/foreground mentre l'app è aperta.
- Richieste ferie/permessi/correzioni offline: fuori perimetro (solo timbrature + consultazione read-only).
- Coda piena (200 timbrature in sospeso): scenario limite, non pratico da testare manualmente — coperto solo dai test automatici (`offlineQueue.test.js`).

---

## Se qualcosa fallisce

Annota: sezione/step, cosa hai visto vs cosa aspettavi, se possibile uno screenshot. La maggior parte della logica (coda, dedup, scoping per utente) è già coperta da test automatici (`frontend-mobile/src/__tests__/offlineQueue.test.js`, 18 test) — se qualcosa si comporta diversamente da qui, è probabile un problema specifico del device/build, non della logica stessa. Utile in quel caso: `docker logs badge-system-api` sul backend e i log Sentry mobile (se configurato).
