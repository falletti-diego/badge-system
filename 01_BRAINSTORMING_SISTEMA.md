# Badge System — Brainstorming Sistema & Hardware
**Data:** 27 Maggio 2026  
**Progetto:** Dataxiom Badge (Time Tracking Solution)  
**Status:** Brainstorming completato → Pronto per development planning

---

## 📋 Executive Summary

**Badge System** è una soluzione SaaS multi-tenant per il tracciamento delle presenze dei dipendenti nel **retail**. Sfrutta **QR Code statici**, **Face ID nativo**, e un'architettura **cloud-first** per garantire semplicità, scalabilità e costi minimi.

- **MVP Timeline:** 2-3 mesi
- **Target:** 25-200 dipendenti su 1-N sedi
- **Pricing:** €10/dipendente/mese + €250/sede aggiuntiva
- **Hardware:** Zero (dipendenti usano smartphone personali)

---

## 🎯 Definizione Progetto

### Scopo
Registrare **ingresso e uscita** dei dipendenti in modo semplice, affidabile e scalabile per il settore retail.

### Ambito iniziale
- ✅ Time tracking puro (ingresso/uscita)
- ❌ Gestione presenze (assenze, permessi, straordinari) — Phase 2
- ❌ Controllo accesso fisico — Phase 3

### Scalabilità
- **MVP:** 1 sede, 25 dipendenti
- **Target:** Fino a 200 dipendenti distribuiti su N sedi
- **Modello:** SaaS multi-tenant (N clienti retail)

---

## 🏗️ Architettura Sistema

### 1. Hardware & Dispositivi

#### Scelta: **QR Code statico + Smartphone personale dipendente**

| Aspetto | Scelta | Razionale |
|---------|--------|-----------|
| **Lettore** | QR Code fisso per sede | Zero investimento hardware, massima scalabilità |
| **Dispositivo dipendente** | Smartphone personale | Retail ha alta penetrazione smartphone |
| **Autenticazione** | Face ID nativo del telefono | iOS/Android built-in, sicuro, zero overhead |
| **Costo hardware totale** | €0 per dipendente | Solo QR stampato per sede (~€1 per sede) |
| **Consumo energetico** | Nullo (QR passivo) | Nessuna alimentazione richiesta |

#### Flow Interazione
```
1. Dipendente apre app Dataxiom
2. Si autentica con Face ID (una volta per sessione)
3. Scannerizza QR code fisso della sede
4. App invia: [Timestamp] + [Email dipendente] + [Luogo] → Server
5. Server registra check-in
```

---

### 2. Architettura Software

#### Stack Tecnologico

| Livello | Tecnologia | Razionale |
|---------|-----------|-----------|
| **Frontend Mobile** | React Native (iOS/Android) | Cross-platform, reattivo, asset sharing |
| **Frontend Web** | React + TypeScript | Dashboard responsive per manager |
| **Backend API** | Node.js + Express (o Python FastAPI) | Semplice, scalabile, JSON-first |
| **Database** | PostgreSQL (AWS RDS) | Multi-tenant ready, ACID, relazionale |
| **Hosting** | AWS (EC2 + RDS) o Azure | Scalabilità elastica, backup automatico |
| **Auth** | Keycloak (self-hosted) o Auth0 | Face ID integration via biometrics APIs |
| **API Gateway** | AWS API Gateway | Rate limiting, monitoring, CORS |
| **Monitoring** | Sentry + CloudWatch | Error tracking, performance metrics |

#### Architettura Multi-Tenant
```
Database Centrale PostgreSQL
├── Schema Public (meta: clienti, sedi, utenti)
├── Schema Cliente_A (check-ins, dipendenti cliente A)
├── Schema Cliente_B (check-ins, dipendenti cliente B)
└── Schema Cliente_N
```

---

### 3. Modello Dati

#### Entità Principali

```sql
-- Clienti
Clients (id, name, email, created_at, plan)

-- Sedi
Sites (id, client_id, name, location, qr_code_content, created_at)

-- Dipendenti
Employees (id, client_id, email, name, phone, assigned_sites[], created_at)

-- Check-ins
CheckIns (id, employee_id, site_id, timestamp, type[IN/OUT], created_by, modified_at, modified_by)

-- Audit Log
AuditLog (id, action, entity, old_value, new_value, user_id, timestamp)
```

---

## 🔐 Flusso Operativo Dettagliato

### A. Onboarding Cliente

1. **Dataxiom crea cliente** (via admin panel)
   - Assegna email admin, nome azienda, piano
   
2. **Dataxiom crea sedi**
   - Genera QR code statico per ogni sede
   - QR contiene: `https://api.badge.dataxiom.it/checkin/sede/{site_id}`
   - Stampa QR da affiggere in entrata
   
3. **Cliente crea dipendenti** (autonomo via dashboard)
   - Upload CSV oppure form manuale
   - Assegna dipendenti a sedi

### B. Flusso Check-In Quotidiano

```
Dipendente:
1. Apre app Dataxiom
2. Face ID autentica (primo utilizzo: login email + password + enrollment Face ID)
3. Scannerizza QR code
4. App invia HTTP POST:
   {
     "employee_email": "mario@retail.it",
     "site_id": "site_milano_001",
     "timestamp": "2026-05-27T09:15:00Z",
     "type": "IN"
   }
5. Server risponde: "✅ Check-in registrato"

Server:
1. Riceve richiesta autenticata (JWT token)
2. Valida timestamp (non più vecchio di 1 min)
3. Valida site_id appartiene a client
4. Valida employee_email è assegnato a site
5. Crea record CheckIn con audit trail
6. Ritorna success/error
```

### C. Correzioni

| Chi | Entro | Cosa può fare |
|-----|-------|----------------|
| **Dipendente** | 2 ore | Correggere il proprio check-in (orario) |
| **Manager sede** | 48 ore | Correggere check-in di dipendenti della sede |
| **Dataxiom** | ∞ | Forzare correzioni (con audit log) |

---

## 📊 Reporting & Permessi

### Accesso ai dati

| Ruolo | Accesso | Vede |
|------|---------|------|
| **Dipendente** | App mobile | Solo i propri check-in |
| **Manager Sede** | Web dashboard | Check-in della sua sede, report, export CSV |
| **HR Centrale** | Web dashboard (se multi-sede) | Check-in da tutte le sedi, report aggregati |
| **Dataxiom** | Backend API | Dati aggregati/anonimizzati di tutti i clienti (Power BI) |

### Export & Integrazioni

- **CSV export:** Manager può esportare presenze per la sede
- **Power BI integration:** Dataxiom analizza trends, churn, ROI per cliente
- **API Payroll:** Phase 2 (post-MVP) — webhook per invio dati a sistemi payroll cliente

---

## 💰 Modello Pricing & Costi

### Pricing Cliente
```
Prezzo per dipendente:    €10/mese
Prezzo per sede aggiunta: €250 (una tantum setup)

Esempi:
- 25 dipendenti, 1 sede:    €250/mese
- 50 dipendenti, 1 sede:    €500/mese
- 150 dipendenti, 3 sedi:   €1500 + (2×€250) = €2000/mese
```

### Costi di Sviluppo (MVP)

| Componente | Ore | Costo (€50/h) |
|-----------|------|--------------|
| Backend API (auth, check-in, reporting) | 30-40h | €1500-2000 |
| Frontend Dashboard (React) | 20-30h | €1000-1500 |
| Mobile App (React Native) | 25-35h | €1250-1750 |
| Infrastructure setup (AWS, CI/CD) | 10-15h | €500-750 |
| Testing + Docs | 10-15h | €500-750 |
| **Buffer (20%)** | — | €1000 |
| **TOTALE** | **95-140h** | **€6250-7750** |

### Costi Operativi Ricorrenti (Mensili)

**MVP (1 cliente, 25 dipendenti):**
```
Database PostgreSQL:     €30-50
Server API/Backend:      €50-80
Frontend hosting:        €10-15
Monitoring (Sentry):     €0-30
Backup/DR:              €10-20
Miscellaneous:          €5-10
────────────────────────────
TOTALE:                 €115-220 (~€150/mese)
```

**Scaled (5-10 clienti, ~250 dipendenti):**
```
Database:               €80-150
Server API:             €150-250
Frontend:               €15-25
Monitoring:             €50-100
Backup/DR:              €30-50
CDN + Firewall:         €20-30
Email transazionali:    €20-30
────────────────────────────
TOTALE:                 €375-685 (~€500/mese)
```

### ROI Proiezione

```
Anno 1:
├─ Sviluppo: €6250-7750 (una tantum)
├─ Operazioni: €1380-2640 (12 mesi)
├─ Manutenzione: €8400-15000 (supporto, bug fixes)
└─ TOTALE ANNO 1: €16030-25390

Anno 2+ (Steady State):
├─ Operazioni: €4500-8220 (12 mesi)
├─ Manutenzione: €8400-15000
└─ TOTALE ANNO 2+: €12900-23220 (annui)

Revenue Scenario (5 clienti medi, €3500/mese):
└─ Annual Revenue: €42K
└─ Gross Margin (dopo costi ops + maint): €18K-26K (43-62%)
```

---

## 🔌 Integrazioni & API

### MVP (2-3 mesi)
- ✅ Mobile app (QR + Face ID)
- ✅ Web dashboard (reporting)
- ✅ CSV export
- ✅ Power BI connector (Dataxiom)
- ❌ Payroll API (Phase 2)

### Phase 2 (Post-MVP, su richiesta cliente)
- Webhook per invio check-in a sistemi payroll (Personio, Workday, ecc.)
- Integrazione HR systems
- Custom API per clienti enterprise

---

## 🔒 Sicurezza & Compliance

### Authentication
- ✅ Face ID nativo (biometrico)
- ✅ JWT tokens (sessione app)
- ✅ HTTPS/TLS (tutte le comunicazioni)
- ✅ Password reset via email

### Data Protection
- ✅ Database encryption at rest (AWS RDS)
- ✅ Role-based access control (RBAC)
- ✅ Audit log completo di ogni modifica
- ✅ GDPR-ready (diritto all'oblio, data export)

### Compliance
- ✅ Multi-tenant isolation (schema separation)
- ✅ IP whitelisting (opzionale per cliente enterprise)
- ✅ SOC 2 audit trail (Phase 2)

---

## 📅 Timeline Development

### Phase 1: MVP (2-3 mesi)
**Sprint 1 (Settimane 1-2):** Foundation
- Setup infrastruttura AWS (RDS, EC2, API Gateway)
- Scaffold backend API (Node.js + Express)
- Database schema design
- CI/CD pipeline setup

**Sprint 2 (Settimane 3-4):** Core Features
- API endpoints: auth, check-in, reporting
- Admin panel (Dataxiom: crea cliente/sede)
- Mobile app: QR scanning + Face ID

**Sprint 3 (Settimane 5-6):** Dashboard & Polish
- Web dashboard (React): visualizzazione presenze
- CSV export
- Testing, documentation, security review

**Sprint 4 (Settimana 7-8):** Demo Ready
- Bug fixes, performance tuning
- Onboarding documentation
- Ready for customer demo

### Phase 2: Production (Mesi 4-6)
- Feedback da primo cliente pilota
- API Payroll integration
- Advanced reporting features
- Production hardening

---

## 🚨 Rischi & Mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|------------|--------|-----------|
| Connettività retail instabile | Alta | Alta | MVP online-only (accettato), Phase 2 offline mode |
| Adozione dipendenti bassa | Media | Alta | UX semplice, training cliente, incentivi |
| Churn clienti | Media | Alta | Support proattivo, feature request loop veloce |
| Costi cloud superiori a budget | Bassa | Media | Monitoring mensile, ottimizzazione istanze |
| GDPR/Privacy issues | Bassa | Alta | Legal review, audit trail, data residency options |

---

## 🎯 Success Criteria (MVP)

- ✅ App funziona offline/online con Face ID
- ✅ Check-in registrati correttamente (±1 secondo accuracy)
- ✅ Dashboard mostra presenze in real-time
- ✅ First customer pilota pronto entro 3 mesi
- ✅ Costi operativi < €200/mese per MVP
- ✅ Zero bug critici in produzione

---

## 📁 Prossimi Step

1. **Approva architettura** ← Diego review
2. **Tech stack finale** (Node.js vs Python? AWS vs Azure?)
3. **Prototipo UI/UX** (Figma mockup: app + dashboard)
4. **Development planning** (task breakdown, sprint planning)
5. **Primo cliente pilot** (identificare retail partner)

---

**Note:** Questo documento è il riepilogo dell'intervista brainstorming. Ogni decisione è tracciata e reversibile se nuove informazioni emerge durante lo sviluppo.

Data aggiornamento: 2026-05-27
