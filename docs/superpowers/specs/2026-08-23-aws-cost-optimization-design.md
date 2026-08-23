# AWS Cost Optimization — Design Spec

**Data:** 23 Agosto 2026
**Contesto:** Budget AWS configurato a $20/mese, spesa reale del mese in corso $68.42, previsione $102.81 — richiesto dall'utente ("stiamo spendendo 100$ al mese e questo non è sostenibile").
**Target concordato:** ~€20-30/mese a regime (staging spento), con picchi temporanei solo nei giorni in cui lo staging viene riacceso per un test.

---

## 1. Diagnosi — dove va la spesa

L'inventario reale (via `aws ec2`, `aws rds`, `aws ecr`, `aws logs`, `aws budgets`) ha individuato queste cause, in ordine di impatto:

| # | Voce | Costo stimato/mese | Causa |
|---|---|---|---|
| 1 | RDS staging (`db.t3.micro`) gira 24/7 | ~$15-16 | Il Free Tier RDS copre solo **una** istanza `db.t3.micro` per l'intero account (750h/mese cumulative) — quella di produzione la satura già, lo staging paga per intero. |
| 2 | EC2 produzione `t3.small` 24/7 | ~$15 | CPU media reale ultimi 7gg: 1.07%, picco 32.6% — sovradimensionato per il carico attuale. |
| 3 | 2 snapshot RDS manuali dimenticati (`badge-backup-test-20260608`, `badge-system-db-snapshot`, 20GB ciascuno) | ~$3.8 | Gli snapshot manuali non scadono mai da soli (a differenza degli automatici, retention 1gg) — restano a pagare finché non vengono cancellati esplicitamente. |
| 4 | ECR senza lifecycle policy | ~$3.3 e in crescita | 181 immagini Docker accumulate (~33GB totali), mai pulite — cresce di 1 immagine ad ogni push su `main`, senza limite. |
| 5 | Log CloudWatch staging senza retention | piccolo ma in crescita | `/badge/api-staging` ha retention `None` (mai scade), a differenza di `/badge/api` (prod, 30gg). |

Nessun NAT Gateway, Load Balancer, bucket S3 dimenticato, secret paganti o KMS custom key trovati — quei fronti sono già puliti.

Gli alert di budget ($20, soglie 85%/100%) sono già configurati correttamente verso l'email dell'utente e risultano già in stato ALARM — non serve aggiungere alerting, il meccanismo esiste già e ha probabilmente già notificato (verosimilmente non notato in tempo).

## 2. Vincoli dalla revisione "attivazione cliente entro 1 mese"

Il piano di taglio costi è stato rivalutato esplicitamente rispetto al rischio di destabilizzare l'onboarding del primo cliente pilota, atteso entro ~1 mese:

- **Il downgrade EC2 prod (`t3.small`→`t3.micro`) è rimandato**, non incluso in questo piano di esecuzione immediata. La CPU lo giustificherebbe, ma la memoria (2GB→1GB) è un rischio concreto: il progetto ha già avuto una crisi di stabilità da pool exhaustion/OOM sulla size attuale più grande (vedi `backend_stability_crisis_resolved.md` in memoria). Non è saggio introdurre un downgrade di memoria proprio nella finestra in cui non ci si può permettere instabilità.
- **Nuovo item di readiness, non di risparmio**: `BackupRetentionPeriod = 1 giorno` su entrambi gli RDS (prod compreso) è troppo corto per un cliente pagante in arrivo — va alzato a 7 giorni. Costo aggiuntivo trascurabile (pochi GB di storage snapshot incrementale in più).
- Tutti gli altri interventi (staging on-demand, pulizia snapshot/ECR/log) non toccano nulla di produzione-facing e sono sicuri da eseguire subito.
- Il flusso di onboarding self-service è già verificato end-to-end in produzione (Gate finale, Session 89) — nessun blocker di attivazione cliente non legato al costo è emerso da questa analisi.

## 3. Piano d'azione — interventi immediati

Tutti eseguibili subito, nessuno tocca la disponibilità di produzione:

### 3.1 Staging on-demand (manuale)
- Fermare RDS staging ora (`badge-system-db-staging`), oltre a EC2 staging (già `stopped`).
- Nessuna automazione di scheduling: l'utente richiede/conferma esplicitamente start e stop quando serve un test (pattern già usato in questa sessione per l'EC2 di produzione).
- **Risparmio: ~$15-16/mese** quando lo staging è spento (il regime normale, dato l'uso solo occasionale).

### 3.2 Pulizia snapshot RDS manuali obsoleti
- Cancellare `badge-backup-test-20260608` e `badge-system-db-snapshot` (entrambi di giugno, mai più referenziati).
- **Risparmio: ~$3.8/mese.**

### 3.3 Lifecycle policy ECR
- Aggiungere una lifecycle policy al repository `badge-system-backend` che mantiene solo le immagini più recenti (soglia da definire nel piano di esecuzione, indicativamente le ultime 10-15 — sufficienti per rollback rapidi senza accumulo illimitato).
- Ferma la crescita futura e recupera gran parte del costo storage attuale.

### 3.4 Retention log CloudWatch staging
- Impostare retention 30 giorni su `/badge/api-staging` (oggi `None`, crescita illimitata), allineandolo a `/badge/api` (prod).

### 3.5 Backup retention RDS produzione (readiness, non risparmio)
- Alzare `BackupRetentionPeriod` da 1 a 7 giorni su `badge-system-db` (produzione), in vista dell'onboarding del primo cliente pagante.
- Costo aggiuntivo marginale, giustificato dalla necessità di una finestra di rollback realistica su un sistema con dati di un cliente reale.

### 3.6 Elastic IP per l'EC2 di produzione (affidabilità, costo ~zero)
- Allocare e associare un Elastic IP all'istanza `badge-system-api` (`i-033bb0cc6ad03f88f`), che oggi ha solo un IP pubblico effimero — causa diretta dell'incidente di oggi (il riavvio EC2 ha cambiato IP, `api.dataxiom.it` è rimasto puntato al vecchio IP, health check in timeout).
- Un Elastic IP resta invariato tra stop/start, eliminando la classe di problema alla radice per i futuri riavvii.
- Nessun costo aggiuntivo finché resta associato a un'istanza in esecuzione.

## 4. Downgrade EC2 produzione — deferito, non eseguito ora

Documentato per riferimento futuro, **non incluso nell'esecuzione di questo piano**:

- **Trigger per rivalutarlo**: non prima che il cliente pilota sia stabile da almeno 2-4 settimane dal go-live.
- **Verifica preliminare richiesta prima di procedere, quando sarà il momento**: installare il CloudWatch Agent per ottenere metriche di memoria reali (oggi assenti) — la sola CPU (media 1.07%, picco 32.6%) non è sufficiente a escludere rischi di OOM su un'istanza con la metà della RAM.
- **Piano di rollback se si procede**: il cambio di instance type è reversibile in ~2 minuti (stop, change instance type, start) — da eseguire comunque in una finestra a basso traffico, con monitoraggio attivo nelle ore successive.
- **Risparmio potenziale se applicato in futuro**: ~$7-8/mese.

## 5. Migrazione DNS `dataxiom.it` — Soluzione A (delega DNS a Route53, non trasferimento di registrazione)

### Contesto
`dataxiom.it` è oggi registrato **e** gestito interamente da Register.it (nameserver `ns1/ns2.register.it`). Verificato via `aws route53domains`: il TLD `.it` è supportato da Route53 Domains per il trasferimento di registrazione ($11/anno), ma un trasferimento di registrar per un ccTLD `.it` passa per una procedura propria del registro Nic.it (Change Authorization, PIN/autorizzazione del registrante) con tempistiche non garantite — rischio non accettabile a ridosso dell'attivazione di un cliente reale.

### Soluzione scelta: solo delega DNS (nameserver), non trasferimento di registrazione
1. Creare una hosted zone Route53 per `dataxiom.it`.
2. Copiare in Route53 tutti i record DNS attualmente su Register.it (verificati in questa sessione: A/CNAME per `dataxiom.it`, `www`, `api`, `badge`, più eventuali altri sottodomini/record MX/TXT da inventariare puntualmente nel piano di esecuzione — inclusi i record SES/DKIM già configurati, che non vanno persi).
3. Verificare che la hosted zone risolva correttamente prima di ogni cambio a livello di registrar (query diretta contro i nameserver Route53, non ancora quelli pubblici).
4. Cambiare solo i nameserver del dominio su Register.it, puntandoli ai 4 nameserver assegnati dalla hosted zone Route53. **La registrazione del dominio resta a Register.it** — nessun trasferimento di proprietà.
5. Verificare la propagazione (TTL dei vecchi NS, tipicamente fino a 24-48h di coda) e che tutti i sottodomini critici (`api`, `badge`, SES) continuino a risolvere correttamente.

### Perché questa soluzione e non il trasferimento completo
- Rischio basso: un cambio nameserver è reversibile in minuti ripristinando i vecchi NS su Register.it, se qualcosa non torna.
- Dà comunque il beneficio operativo principale desiderato: gestione DNS via API/CLI (`aws route53`), utile per automatizzare in futuro l'aggiornamento del record A dopo un riavvio EC2 — o, più semplicemente, l'Elastic IP di cui al punto 3.6 rende questo automatismo superfluo nella pratica.
- Il trasferimento di registrazione vero e proprio (Soluzione B, scartata per questa finestra) resta un'opzione da rivalutare dopo il lancio, senza pressione di tempo.

### Costo
+$0.50/mese per la hosted zone, più query DNS (trascurabili al volume di traffico attuale) — marginale rispetto ai risparmi del resto del piano.

## 6. Fuori scope (esplicitamente, per questo piano)

- Trasferimento completo della registrazione del dominio a Route53 (Soluzione B) — deferito post-lancio.
- Downgrade EC2 produzione — deferito, vedi sezione 4.
- Automazione di scheduling per lo staging (start/stop a orario fisso) — l'utente ha scelto esplicitamente il controllo manuale on-demand.
- S.28 (autorizzazione Statuto dei Lavoratori per il geofencing) — item GDPR già tracciato separatamente in `TASKS.md`, non correlato al costo.

## 7. Risultato atteso

| Voce | Prima | Dopo |
|---|---|---|
| Baseline mensile (staging spento) | ~$68-100+ | **~€20-25/mese** |
| Picco quando staging riacceso per test | — | temporaneo, per i soli giorni di utilizzo |
| Affidabilità DNS/IP produzione | IP effimero, DNS esterno non sincronizzato (causa dell'incidente odierno) | IP statico (Elastic IP) + DNS gestito via Route53, registrazione invariata su Register.it |
| Backup produzione | 1 giorno di retention | 7 giorni |

## 8. Piano di test/verifica

- Dopo lo stop di RDS/EC2 staging: confermare che nessun processo/CI dipenda da staging essendo sempre attivo (verificare `deploy-staging.yml` — si attiva su push `develop`/`workflow_dispatch`, non richiede l'istanza già accesa).
- Dopo la lifecycle policy ECR: verificare che il numero di immagini converga e che l'immagine più recente (quella in produzione) non venga mai eliminata.
- Dopo l'associazione dell'Elastic IP: verificare `https://api.dataxiom.it/health` → 200, poi ripetere un ciclo stop/start EC2 di prova e confermare che l'IP (e quindi la risoluzione DNS) non cambi.
- Dopo la migrazione DNS: verificare tutti i sottodomini critici (`dataxiom.it`, `www`, `api`, `badge`) e l'invio email SES (dipende da record TXT/DKIM) prima e dopo il cambio nameserver, con un margine di rollback pronto.
- A fine mese: confrontare la spesa reale (`aws budgets describe-budgets`) contro il target €20-30.
