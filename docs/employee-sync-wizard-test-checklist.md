# Wizard "Aggiorna Dipendenti" — Checklist di Test Manuale

**Documento:** Test Plan E2E su ambiente di staging
**Data:** 2026-08-01
**Copre:** Wizard Excel di sostituzione dell'import CSV (ONB.3) — template, diff, conferma, storico, RBAC
**Durata stimata:** 45-60 minuti
**Ambiente:** Staging (`https://badge-system-staging.netlify.app`, API `https://staging-api.dataxiom.it`) — **mai produzione**, i dati sono liberamente modificabili/ripristinabili

**Prerequisiti:**
- Login admin: `pippo@badge.local` / `NQQG65D7Zawy57ur` (cliente demo "Dataxiom MVP")
- Un editor Excel (Excel, Numbers, Google Sheets) per modificare i file `.xlsx` scaricati
- Accesso al browser con strumenti sviluppatore (per controllare eventuali errori console, opzionale ma utile)

---

## Come leggere questa checklist

Ogni riga: azione → cosa aspettarsi → ✅/❌. Se qualcosa non corrisponde, annota lo scostamento esatto (screenshot, messaggio di errore testuale, file usato) prima di continuare — una ❌ senza dettaglio non è recuperabile in revisione.

Le sezioni sono ordinate dal percorso più semplice (golden path) ai casi limite. Se il tempo è limitato, le sezioni 1-4 sono le più importanti da coprire per prime.

**Prima di iniziare:** annota quanti dipendenti attivi ha il cliente "Dataxiom MVP" su staging (Admin → tab Dipendenti → conta le righe), così puoi verificare i conteggi lungo il percorso.

---

## 1. Accesso e primo scaricamento del template

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 1.1 | Login come `pippo@badge.local`, vai su Admin → tab Dipendenti | La sezione "Importazione CSV" non esiste più; al suo posto c'è una sezione "Aggiorna Dipendenti" con un selettore "Cliente" | ☐ |
| 1.2 | Seleziona il cliente "Dataxiom MVP" dal menu a tendina | Compare il wizard con due bottoni: "Scarica template" e "Carica file" | ☐ |
| 1.3 | Clicca "Scarica template" | Un file `.xlsx` (es. `aggiorna-dipendenti.xlsx`) viene scaricato senza errori | ☐ |
| 1.4 | Apri il file scaricato con un editor Excel | Due fogli: **Dipendenti** (colonne: nome_completo, email, telefono, ruolo, sede, matricola, stato, data_assunzione, data_uscita) e **Sedi** (nome_sede, indirizzo, latitudine, longitudine, raggio_geofence_m) | ☐ |
| 1.5 | Controlla il foglio Dipendenti | Contiene solo dipendenti **attivi**, colonna "stato" sempre "Attivo", colonna "sede" **mai vuota** per un dipendente reale | ☐ |
| 1.6 | Controlla che **non** compaiano account admin/viewer (es. `pippo@badge.local` stesso) nel foglio Dipendenti | Solo personale operativo (ruolo dipendente/responsabile) è elencato — gli account amministrativi sono esclusi | ☐ |

---

## 2. Golden path — nessuna modifica (round-trip pulito)

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 2.1 | Senza modificare nulla, ricarica lo stesso file appena scaricato tramite "Carica file" | Compare una schermata di anteprima | ☐ |
| 2.2 | Controlla il riepilogo | **Nessuna** riga in Nuovi / Riattivati / Rimossi / Modificati; nessun errore; nessuna anomalia | ☐ |
| 2.3 | Il bottone "Conferma tutte le modifiche" è comunque cliccabile (anche se non c'è nulla da confermare) | Cliccalo, dovrebbe restituire successo senza cambiare nulla nel DB | ☐ |

Questo è il test più importante: se fallisce (es. appaiono errori "sede obbligatoria" o falsi "trasferimenti"), è un bug bloccante — segnalalo prima di proseguire.

---

## 3. Aggiunta di un nuovo dipendente

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 3.1 | Scarica un template fresco. Aggiungi una nuova riga nel foglio Dipendenti: nome a tua scelta, email nuova (mai usata prima, es. `test-nuovo-<data>@example.it`), telefono opzionale, ruolo "dipendente", sede = una sede esistente (es. "Torino Store", controlla il nome esatto nel foglio Sedi), matricola opzionale, stato "Attivo", data_assunzione vuota | — | ☐ |
| 3.2 | Carica il file modificato | Anteprima mostra **1 riga in "Nuovi"** con l'email/nome corretti | ☐ |
| 3.3 | Conferma | Successo; il nuovo dipendente compare ora nella tabella "Dipendenti" della pagina Admin | ☐ |
| 3.4 | Controlla la casella email usata (se hai accesso, o verifica nei log se disponibile) | Email di benvenuto con credenziali temporanee inviata (o segnalata come "invio fallito" con retry disponibile — entrambi accettabili, ma non deve mancare silenziosamente) | ☐ |
| 3.5 | Riscarica il template | Il nuovo dipendente compare ora tra gli attivi, con la sede corretta | ☐ |

---

## 4. Disattivazione di un dipendente (via colonna Stato, non cancellazione riga)

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 4.1 | Scarica un template fresco. Trova la riga del dipendente creato al punto 3 (o un altro dipendente di test) e cambia la colonna "stato" da "Attivo" a "Inattivo" — **non cancellare la riga** | — | ☐ |
| 4.2 | Carica il file | Anteprima mostra **1 riga in "Rimossi"** | ☐ |
| 4.3 | Conferma | Successo; il dipendente **non compare più** nella tabella Dipendenti attivi in Admin | ☐ |
| 4.4 | Riscarica il template | Il dipendente disattivato **non compare più** nel foglio (il template include solo attivi) | ☐ |
| 4.5 | Verifica che il dipendente NON possa più fare check-in (se hai un modo di testarlo, es. app mobile o Postman con le sue credenziali) | Check-in rifiutato (403), non silenziosamente ignorato | ☐ |

**Test dell'anomalia (variante di 4.1):** invece di cambiare lo stato, prova a **cancellare fisicamente** una riga di un dipendente attivo dal file e ricaricalo.
| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 4.6 | Carica il file con la riga cancellata | Compare un **avviso "anomalia"** (non un "Rimosso" automatico) — il sistema segnala la riga mancante ma non disattiva nulla senza conferma esplicita tramite la colonna Stato | ☐ |
| 4.7 | Controlla che il dipendente sia ancora attivo dopo la conferma | Nessuna disattivazione avvenuta per la riga mancante | ☐ |

---

## 5. Riattivazione di un dipendente disattivato

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 5.1 | Il dipendente disattivato al punto 4 non compare più nel template scaricato. Apri di nuovo l'ultimo file scaricato (o riusa quello del punto 4.1) e riporta la sua riga a stato "Attivo" | — | ☐ |
| 5.2 | Carica il file | Anteprima mostra **1 riga in "Riattivati"** (non in "Nuovi" — non deve creare un duplicato) | ☐ |
| 5.3 | Conferma | Il dipendente ricompare tra gli attivi in Admin, **stesso ID/storico di prima**, non un account nuovo | ☐ |
| 5.4 | **Variante combinata**: ripeti disattivando di nuovo un dipendente, poi riattivalo cambiando ANCHE la colonna "sede" nello stesso passaggio (es. da Torino a Milano, se esiste una seconda sede) | L'anteprima mostra la riattivazione **con la nuova sede già applicata**, non la vecchia — verifica dopo la conferma che il dipendente sia assegnato alla sede nuova, non quella di prima della disattivazione | ☐ |

---

## 6. Trasferimento di sede (sostituzione, non accumulo)

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 6.1 | Scarica un template fresco. Cambia la colonna "sede" di un dipendente attivo da una sede a un'altra esistente | — | ☐ |
| 6.2 | Carica il file | Anteprima mostra **1 riga in "Modificati"** con il cambio di sede evidenziato (da → a) | ☐ |
| 6.3 | Conferma | Il dipendente risulta ora assegnato **solo** alla nuova sede in Admin, non a entrambe | ☐ |
| 6.4 | Se possibile, verifica lato check-in/mobile: il dipendente può timbrare nella nuova sede | Check-in accettato sulla nuova sede | ☐ |
| 6.5 | Verifica che il dipendente **non possa più** timbrare nella sede vecchia (se testabile) | Check-in rifiutato/non assegnato sulla sede precedente | ☐ |

---

## 7. Altre modifiche di campo (telefono, ruolo, matricola)

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 7.1 | Cambia solo il telefono di un dipendente attivo, lascia tutto il resto invariato | Anteprima: 1 "Modificato" con solo il campo telefono evidenziato | ☐ |
| 7.2 | Conferma e verifica in Admin | Telefono aggiornato, nessun altro campo toccato | ☐ |
| 7.3 | Cambia il ruolo di un dipendente da "dipendente" a "responsabile" (o viceversa) | Anteprima: 1 "Modificato" con il cambio ruolo | ☐ |
| 7.4 | Conferma e verifica | Ruolo aggiornato in Admin | ☐ |
| 7.5 | Cambia la matricola di un dipendente a un valore mai usato prima per questo cliente | Anteprima: 1 "Modificato" con la matricola | ☐ |
| 7.6 | Conferma | Matricola aggiornata | ☐ |

---

## 8. Nuova sede nello stesso file

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 8.1 | Scarica un template fresco. Nel foglio "Sedi", aggiungi una riga con un nome sede mai usato prima (es. "Bologna Store Test") | — | ☐ |
| 8.2 | Assegna quella nuova sede a un dipendente (nuovo o esistente) nel foglio Dipendenti | — | ☐ |
| 8.3 | Carica il file | Il preview non segnala errori di "sede non trovata" per quella riga | ☐ |
| 8.4 | Conferma | La nuova sede compare in Admin → tab Sedi; il dipendente risulta assegnato correttamente | ☐ |

---

## 9. Validazione ed errori bloccanti

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 9.1 | Scarica un template, scrivi un valore non valido nella colonna "stato" (es. "Boh" invece di Attivo/Inattivo) | Preview mostra un **errore bloccante** che indica la riga e il problema | ☐ |
| 9.2 | Il bottone "Conferma tutte le modifiche" è disabilitato quando ci sono errori | Non è possibile confermare finché il file non è corretto | ☐ |
| 9.3 | Scrivi due righe con la **stessa email** | Errore bloccante "email duplicata" con riferimento alla riga | ☐ |
| 9.4 | Scrivi due righe con la **stessa matricola** (non vuota) | Errore bloccante "matricola duplicata" | ☐ |
| 9.5 | Svuota la colonna "sede" per una riga | Errore bloccante "sede obbligatoria" | ☐ |
| 9.6 | Scrivi nella colonna "sede" un nome che non esiste nel foglio Sedi | Errore bloccante che indica il nome sede non trovato | ☐ |
| 9.7 | Carica un file completamente vuoto (nessuna riga nel foglio Dipendenti) | Nessun errore di crash; anteprima vuota (0 righe in ogni categoria), oppure messaggio chiaro — non un errore 500 | ☐ |

---

## 10. Esportazione storico completo

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 10.1 | In Admin → tab Dipendenti, con un cliente selezionato, clicca "Esporta storico completo" | File `.xlsx` scaricato (es. `storico-dipendenti.xlsx`) | ☐ |
| 10.2 | Apri il file | Contiene **sia** i dipendenti attivi **sia** quelli disattivati durante i test precedenti (es. quello del punto 4), con colonna "stato" corretta | ☐ |
| 10.3 | Controlla le colonne data_assunzione / data_uscita | Per un dipendente disattivato, data_uscita è valorizzata; per uno riattivato, data_uscita è di nuovo vuota e data_assunzione è quella **originale** (non la data di riattivazione) | ☐ |
| 10.4 | Il bottone "Esporta storico completo" è disabilitato se nessun cliente è selezionato | Comportamento coerente col resto della sezione | ☐ |

---

## 11. Disattivazione singola da Admin (non tramite wizard)

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 11.1 | Nella tabella Dipendenti di Admin, clicca l'icona di disattivazione (cestino) su un dipendente di test | Dialog di conferma con testo che parla di "disattivazione", non più di "eliminazione irreversibile dei check-in" | ☐ |
| 11.2 | Conferma | Il dipendente sparisce dalla lista attivi (non un errore) | ☐ |
| 11.3 | Verifica tramite "Esporta storico completo" che il dipendente esista ancora, solo marcato Inattivo | Nessuna perdita di dati | ☐ |
| 11.4 | Riattivalo tramite il wizard (carica un template coi vecchi valori impostando Stato=Attivo su quella riga — nota: non comparirà nel template scaricato perché è inattivo, quindi aggiungi tu la riga manualmente con la stessa email) | Riattivazione riuscita, stesso record | ☐ |

---

## 12. Casi limite e robustezza

| # | Azione | Atteso | ✅ |
|---|--------|--------|---|
| 12.1 | Carica un file `.xlsx` valido ma con un foglio "Dipendenti" rinominato (es. "Employees") | Errore chiaro, non un crash silenzioso | ☐ |
| 12.2 | Carica un file che non è un `.xlsx` (es. rinomina un `.txt` in `.xlsx`, o carica un vero `.csv`) | Errore gestito (400), non un errore 500 generico | ☐ |
| 12.3 | Prova a caricare un file molto grande (se hai modo di generarne uno con centinaia di righe) | O viene accettato ed elaborato correttamente, o rifiutato con un messaggio chiaro sul limite dimensione — non un timeout silenzioso | ☐ |
| 12.4 | Ricarica la pagina Admin a metà di un'anteprima (prima di confermare) | Nessuna modifica applicata a metà — un preview mai confermato non deve aver toccato il DB (puoi verificarlo controllando che il conteggio dipendenti sia invariato) | ☐ |
| 12.5 | Prova ad applicare due volte di fila lo stesso file con un nuovo dipendente (senza modificarlo tra le due) | La prima conferma crea il nuovo dipendente; la seconda (stesso file, stessa email) NON deve creare un duplicato — dovrebbe risultare "nessuna variazione" dato che ora coincide con lo stato DB | ☐ |

---

## Riepilogo finale

Al termine, verifica lo stato complessivo del cliente "Dataxiom MVP" in Admin:

| Controllo | Atteso |
|---|---|
| Nessun dipendente di test rimasto "sporco" senza motivo (opzionale: pulisci quelli creati solo per il test) | — |
| Nessun errore in console del browser durante l'intera sessione di test | — |
| Nessun 500/errore generico incontrato in nessuno step (a parte quelli attesi come test di robustezza in sezione 12) | — |

**Se trovi un problema:** annota il numero del test (es. "6.3"), cosa hai fatto esattamente, cosa ti aspettavi, cosa è successo davvero (screenshot se possibile), e se c'è un messaggio di errore in console (F12 → tab Console/Network).
