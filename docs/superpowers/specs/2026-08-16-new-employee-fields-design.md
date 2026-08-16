# Campi aggiuntivi form "Nuovo Dipendente" (Sede, Data assunzione, Matricola, Manager) — Design

**Data:** 2026-08-16
**Status:** Approvato
**Richiesto da:** Diego Falletti, sulla base di feedback su modifiche tecniche per aumentare l'interesse verso Badge System.

---

## Contesto

Il form "Nuovo Dipendente" (`frontend-web/src/features/admin/tabs/EmployeesTab.jsx`, righe 88-168) espone oggi solo Cliente, Nome, Email, Telefono, Ruolo, Sede gestita (condizionale, solo manager) e Password. Mancano 4 campi che l'admin considera essenziali per l'onboarding di un dipendente: **Sede**, **Data assunzione**, **Matricola**, **Manager di riferimento**.

Verifica del codice esistente (non un'assunzione): **Matricola** (`external_employee_id`, migration 008) e **Data assunzione** (`hiring_date`, migration 035) esistono già come colonne DB e sono già presenti nel template xlsx del wizard "Aggiorna Dipendenti" — mancano solo nel form di creazione singola e nell'endpoint `POST /api/v1/admin/employees`. **Sede** esiste con un modello ambiguo: `site_id` singolo (sede gestita, solo manager) vs `assigned_sites` array (dipendenti). **Manager di riferimento** non esiste in nessuna forma nel modello dati — richiede una migration nuova.

## Decisione

Aggiungere i 4 campi al form di creazione singola e all'endpoint corrispondente, riusando le colonne DB già esistenti dove possibile, introducendo una sola colonna nuova (`manager_id`), ed estendendo il wizard xlsx per coerenza. Aggiungere enforcement reale della data di assunzione nel flusso di check-in (non solo un campo informativo), su richiesta esplicita del committente.

### Perché non un modello dati completamente nuovo
Un'alternativa scartata: introdurre un concetto di "sede primaria" distinto da `assigned_sites` per disambiguare la UX. Scartata perché aggiunge una colonna e una fonte di verità in più senza necessità reale — mappare la singola selezione UI su `assigned_sites: [site_id]` riusa un vincolo già esistente e validato (`assigned_sites.length >= 1` per `role='employee'`, già in `validation.js`).

### Perché l'enforcement del check-in è nello stesso piano, non un piano separato
Il committente ha confermato esplicitamente che la data di assunzione deve bloccare attivamente lo scan QR prima di quella data, non solo essere un dato informativo. Separare l'enforcement dalla raccolta del dato produrrebbe un campo che mente all'admin (compilato ma inerte) — scartato.

---

## Scope

### Dentro lo scope
1. Form "Nuovo Dipendente": 4 campi nuovi, applicabili sia a `employee` che a `manager` (Sede, Matricola, Data assunzione), tranne Manager di riferimento (solo `employee`)
2. Endpoint `POST /api/v1/admin/employees`: accetta e valida i 4 campi
3. Migration `040_add_manager_id_to_employees.sql`
4. Enforcement `hiring_date` in `POST /api/v1/checkins`
5. Wizard xlsx "Aggiorna Dipendenti": colonna `manager` (email) in template/parse/validate/diff/apply

### Fuori scope (esplicitamente)
- Un form "Modifica dipendente" separato — questi campi non sono editabili su dipendenti esistenti tramite UI singola in questa fase (resta possibile solo via wizard xlsx, che già gestisce `sede`/`matricola`/`data_assunzione` e guadagnerà `manager`)
- Backfill di `hiring_date`/`manager_id` sui dipendenti esistenti — restano `NULL`, comportamento invariato
- Un secondo livello di sede ("sede primaria" vs multi-sede) — resta il modello esistente `assigned_sites`, solo vincolato a un singolo valore in questo specifico form

---

## Design dettagliato

### 1. Schema DB — migration 040

```sql
-- 040_add_manager_id_to_employees.sql
-- Manager di riferimento: relazione self-referencing su employees, nullable.
-- ON DELETE SET NULL — se il manager viene rimosso, i dipendenti a lui
-- assegnati non devono essere bloccati, solo riassegnati in un secondo momento.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES employees(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_manager_id ON employees(manager_id);
```

Nessuna migration necessaria per `external_employee_id`/`hiring_date` (già presenti).

### 2. Backend — `POST /api/v1/admin/employees`

**Zod schema (`AdminEmployeeSchema`, `validation.js`) — campi aggiunti:**
```js
site_id: z.string().uuid(),              // richiesto per employee E manager (sede di appartenenza)
external_employee_id: z.string()
  .regex(/^[A-Za-z0-9]+$/, 'Matricola: solo lettere e numeri')
  .max(50)
  .optional(),
hiring_date: z.string()
  .refine((d) => new Date(d) >= new Date(new Date().toDateString()), {
    message: 'La data di assunzione non può essere nel passato',
  })
  .optional(),
manager_id: z.string().uuid().optional().nullable(),
```

**Nota su `site_id` esistente**: il campo `site_id` nello schema attuale rappresenta la "sede gestita" per un manager. Questo design lo riusa anche per la sede di appartenenza dell'employee, mappata poi su `assigned_sites: [site_id]` nella business logic della route (non nello schema Zod) — così un manager mantiene `site_id` come sede gestita (semantica invariata) mentre un employee lo vede tradotto in `assigned_sites` prima dell'INSERT.

**Validazione manager_id lato server (non solo UI)**: prima dell'INSERT, se `manager_id` è presente, verificare con una query che quel dipendente abbia `role='manager'`, lo stesso `client_id`, e `site_id` coincidente con la sede scelta — altrimenti `400 INVALID_MANAGER_ASSIGNMENT`. Necessario perché la UI filtra correttamente ma un client malevolo/bug potrebbe inviare un `manager_id` arbitrario.

**Gestione violazione unique su matricola:**
```js
try {
  // INSERT esteso con i nuovi campi
} catch (err) {
  if (err.code === '23505' && err.constraint === 'uq_employees_external_id') {
    throw new ConflictError('DUPLICATE_MATRICOLA', 'Matricola già in uso per questo cliente');
  }
  throw err;
}
```

**Audit log**: `newValue` in `logAudit(...)` esteso con `site_id, external_employee_id, hiring_date, manager_id` (stesso pattern già usato, righe 61-69 di `admin/employees.js`).

### 3. Frontend — `EmployeesTab.jsx`

**Ordine campi**: Cliente → Nome → Email → Telefono → Ruolo → **Sede** → **Matricola** → **Data assunzione** → **Manager di riferimento** (condizionale) → Sede gestita (condizionale, solo manager) → Password.

**Sede**: `Select` obbligatorio, opzioni da `allSites.filter(s => s.client_id === form.client_id)` (stesso pattern già esistente per "Sede gestita").

**Matricola**: `TextField` opzionale, validazione client-side inline (`pattern="[A-Za-z0-9]+"` + helper text di errore se non matcha), errore server-side `DUPLICATE_MATRICOLA` mostrato sotto il campo (non un toast generico).

**Data assunzione**: `<TextField type="date">` con `inputProps={{ min: todayISODate }}`, `defaultValue` = oggi (non vuoto) — riduce l'attrito per il caso comune "assunzione da oggi".

**Manager di riferimento**: `Select` con questa logica di stato:
```js
const availableManagers = employees.filter(
  (e) => e.role === 'manager' && e.site_id === form.site_id
);
const managerFieldDisabled = form.role === 'manager' || !form.site_id;
const managerHelperText =
  form.role === 'manager' ? 'I manager non hanno un manager di riferimento'
  : !form.site_id ? 'Seleziona prima una sede'
  : availableManagers.length === 0 ? 'Nessun manager assegnato a questa sede — puoi comunque creare il dipendente'
  : undefined;
```
Nessuna fetch dedicata: `employees` è già l'elenco caricato per la tabella sottostante nello stesso componente — filtrato in memoria, zero round-trip aggiuntivi.

### 4. Enforcement check-in — `checkins.js`

Nuova classe in `backend/src/utils/errors.js`, stesso pattern di `GeofenceError`:
```js
class EmploymentNotStartedError extends ApiError {
  constructor(hiringDate) {
    super('EMPLOYMENT_NOT_STARTED', 'Employment has not started yet', 403);
    this.name = 'EmploymentNotStartedError';
    this.details = { hiring_date: hiringDate };
  }
}
```

In `POST /checkins`, dopo la verifica che l'employee esista/sia attivo (stesso punto logico della verifica geofence, prima dell'INSERT del check-in):
```js
if (employee.hiring_date && new Date(employee.hiring_date) > new Date(new Date().toDateString())) {
  throw new EmploymentNotStartedError(employee.hiring_date);
}
```
`hiring_date IS NULL` (tutti i dipendenti esistenti oggi) → condizione falsa, nessun blocco, comportamento invariato.

### 5. Wizard xlsx — `backend/src/services/employeeSync/`

- `generateTemplate.js`: `DIP_HEADERS` esteso con `'manager_email'` (colonna nuova, in coda per non rompere l'ordine delle colonne esistenti in file già scaricati dagli utenti)
- `parseTemplate.js`: normalizza `manager_email` come le altre colonne
- `validate.js` (`validateSyntax`): se `manager_email` è presente, verificare che corrisponda a un dipendente con `role='manager'` nello stesso file o già in DB per quel cliente; se la colonna manca nel file (retrocompatibilità con export precedenti), trattare come "nessun manager", non un errore di validazione
- `computeDiff.js`/`applyDiff.js`: **risoluzione email→id in batch**, non per riga:
  ```js
  const managerEmails = rows.map(r => r.manager_email).filter(Boolean);
  const { rows: managers } = await pool.query(
    'SELECT id, email FROM employees WHERE email = ANY($1) AND client_id = $2 AND role = $3',
    [managerEmails, clientId, 'manager']
  );
  const managerByEmail = new Map(managers.map(m => [m.email, m.id]));
  // poi, per ogni riga: managerByEmail.get(row.manager_email) ?? null
  ```

---

## Testing

- **Backend unit/integration**: Zod schema (matricola regex, hiring_date >= oggi, manager_id opzionale), endpoint creazione con tutti i campi, violazione unique matricola → 409 strutturato, validazione server-side manager_id (sede/ruolo/client mismatch → 400), check-in bloccato/permesso in base a hiring_date (incluso caso NULL)
- **Frontend**: rendering condizionale Manager di riferimento (disabled per ruolo, per sede mancante, helper text per sede senza manager), validazione inline matricola, submit con tutti i campi
- **xlsx wizard**: parsing colonna `manager_email` presente/assente, validazione riferimento a manager inesistente, risoluzione batch in `applyDiff`, retrocompatibilità file senza la colonna

Dettaglio task-by-task nel piano di implementazione (`writing-plans`, prossimo step).

---

## Rischi noti
- Nessun backfill significa che `manager_id` e `hiring_date` restano `NULL` per tutto lo storico esistente — se in futuro si vorrà un report "chi non ha ancora un manager assegnato" includerà anche dipendenti storici per cui il dato semplicemente non è mai stato raccolto, non necessariamente dipendenti realmente senza manager
- La colonna `manager_email` in coda al template xlsx (per retrocompatibilità) rompe la leggibilità "a colpo d'occhio" se un giorno si vorrà riordinare le colonne — accettato come trade-off minore
