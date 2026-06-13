# Geofencing Hierarchical Toggle (Single-Tenant) — Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to execute this plan task-by-task.

**Goal:** Implement client-level geofencing master switch + per-site toggle hierarchy, with single-tenant (JWT-based) client isolation.

**Architecture:** 
- Frontend SettingsTab reads `client_id` from JWT, loads client settings (meal hours + geofencing flag), saves with dialog confirmation
- SitesTab displays per-site toggle, disabled visually if client geofencing is OFF
- Backend validates geofence checks using both flags: `if (site.geofencing_feature_enabled && site.geofence_enabled)`
- Database column `clients.geofencing_feature_enabled` already exists (commit a51615c)

**Tech Stack:** React 18 (MUI), Express.js, PostgreSQL, Jest/React Testing Library

---

## File Structure

| File | Responsibility |
|------|-----------------|
| `frontend-web/src/features/admin/pages/AdminPage.jsx` | SettingsTab: render geofencing switch + buoni pasto, dialog confirmation |
| `frontend-web/src/features/admin/pages/AdminPage.jsx` | SitesTab: render per-site geofencing toggle (disabled if client OFF) |
| `frontend-web/src/features/admin/pages/AdminPage.jsx` | GeofenceDialog: disable toggle if client geofencing OFF |
| `backend/src/routes/admin.js` | GET /admin/clients, GET /admin/sites, PUT /admin/settings: verify geofencing_feature_enabled in response |
| `backend/src/routes/checkins.js` | Verify geofence validation uses both flags |
| `backend/src/__tests__/presences-summary.test.js` | Test PUT /admin/settings with geofencing_feature_enabled |
| `backend/src/__tests__/checkins-geofence.test.js` | Test geofence validation with client feature flag OFF |

---

## Task 1: Verify Backend Responses Include geofencing_feature_enabled

**Files:**
- Modify: `backend/src/routes/admin.js` (GET /admin/clients, GET /admin/sites, PUT /admin/settings)
- Test: `backend/src/__tests__/presences-summary.test.js`

**Context:** Commit a51615c added the column to the DB and fixed GET /admin/clients. Verify GET /admin/sites also returns it, and that PUT /admin/settings accepts it.

- [ ] **Step 1: Read backend/src/routes/admin.js to verify current state**

Check lines for GET /admin/sites query — does it SELECT `c.geofencing_feature_enabled`?

Expected: Yes (from commit 5c2d761). If not, add it.

- [ ] **Step 2: Run backend tests to see current state**

```bash
cd /Users/diegofalletti/DATAXIOM/Dataxiom\ -\ Analisi\ \&\ BI/badge/backend
npm run test:coverage 2>&1 | grep -A 20 "presences-summary"
```

Expected: Tests pass. Look for any failures in PUT /admin/settings with geofencing_feature_enabled.

- [ ] **Step 3: If GET /admin/sites missing c.geofencing_feature_enabled, add it**

Current line in GET /admin/sites (around line ~250):
```javascript
SELECT s.id, s.client_id, s.name, s.location, s.qr_code_content, s.created_at,
       s.latitude, s.longitude, s.geofence_radius_meters, s.geofence_enabled,
       c.name AS client_name, c.geofencing_feature_enabled
```

If `c.geofencing_feature_enabled` is missing, add it.

- [ ] **Step 4: Commit if changes made**

```bash
git add backend/src/routes/admin.js
git commit -m "fix: ensure GET /admin/sites includes c.geofencing_feature_enabled in SELECT"
```

---

## Task 2: Update SettingsTab — Reorder (Geofencing First) + Single-Tenant Load

**Files:**
- Modify: `frontend-web/src/features/admin/pages/AdminPage.jsx` (SettingsTab function, lines ~1071-1184)
- Test: Tested manually during browser testing

**Context:** SettingsTab currently loads `res.data.data[0]` (first client). Change to load the client matching JWT client_id.

- [ ] **Step 1: Extract client_id from authService in SettingsTab**

At top of SettingsTab function, add:
```javascript
const user = authService.getUser(); // or authService.getAuthToken() and decode JWT
const clientId = user?.client_id;
```

Verify authService has a method to get decoded JWT. Check `frontend-web/src/services/authService.js`.

- [ ] **Step 2: Update GET /api/admin/clients call to filter or just load first**

Since backend returns only the current client's data (or single result), the current code `res.data.data[0]` is fine IF the backend is filtering by clientId. But for safety:

Change line ~1082 from:
```javascript
const res = await apiClient.get('/api/admin/clients');
if (!cancelled && res.data.data && res.data.data.length > 0) {
  const client = res.data.data[0];
```

To:
```javascript
const res = await apiClient.get('/api/admin/clients');
if (!cancelled && res.data.data && res.data.data.length > 0) {
  const client = res.data.data.find(c => c.id === clientId) || res.data.data[0];
```

This ensures we load the correct client by ID from JWT.

- [ ] **Step 3: Reorder sections — Geofencing before Buoni Pasto**

Current order (lines ~1119-1167):
1. Typography h6 "Impostazioni Buoni Pasto"
2. Description
3. TextField meal_hours
4. Box mt={3} + Typography h6 "Geofencing"
5. Description + Switch

Reorder to:
1. Box with Geofencing section first
2. Switch geofencing_enabled
3. Box mt={3} with Buoni Pasto section
4. TextField meal_hours
5. Button Salva

Target code block (lines ~1119-1177):
```jsx
return (
  <Card>
    <CardContent>
      <Typography variant="h6" fontWeight={700} mb={2}>Impostazioni</Typography>

      {fetching ? (
        <CircularProgress size={24} />
      ) : (
        <>
          {/* GEOFENCING FIRST */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" fontWeight={700} mb={1}>📍 Geofencing</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Se attivo, i dipendenti possono effettuare il check-in solo quando si trovano
              fisicamente nelle vicinanze della sede (configurabile per ogni sede).
              Se disattivato, il controllo GPS viene ignorato per tutte le sedi.
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={geofencingEnabled}
                  onChange={(e) => setGeofencingEnabled(e.target.checked)}
                  color="primary"
                />
              }
              label={geofencingEnabled ? 'Geofencing attivo' : 'Geofencing disattivato'}
            />
            {!geofencingEnabled && (
              <Alert severity="info" sx={{ mt: 1, maxWidth: 500 }}>
                Il controllo GPS è disabilitato. I dipendenti possono fare check-in da qualsiasi posizione.
              </Alert>
            )}
          </Box>

          {/* BUONI PASTO SECOND */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" fontWeight={700} mb={1}>📋 Buoni Pasto</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Il sistema assegna automaticamente un buono pasto per ogni giornata in cui il dipendente
              lavora almeno il numero di ore configurato qui.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2, maxWidth: 400 }}>
              <TextField
                label="Ore minime per buono pasto"
                type="number"
                value={mealHours}
                onChange={(e) => setMealHours(e.target.value)}
                inputProps={{ min: 0, max: 24, step: 0.5 }}
                size="small"
                helperText="Es: 5 = buono pasto se ≥ 5h lavorate"
                sx={{ flexGrow: 1 }}
              />
            </Box>
          </Box>

          <Button
            variant="contained"
            onClick={handleSave}
            disabled={loading}
            sx={{ backgroundColor: '#1E3A5F', mt: 2 }}
          >
            {loading ? <CircularProgress size={18} /> : 'Salva'}
          </Button>
        </>
      )}

      {msg && <Alert severity={msg.type} sx={{ mt: 2, maxWidth: 500 }}>{msg.text}</Alert>}
    </CardContent>
  </Card>
);
```

- [ ] **Step 4: Add dialog confirmation before save**

Modify `handleSave` to show dialog first:

```javascript
const [confirmDialog, setConfirmDialog] = useState(false);

const handleSave = async () => {
  setConfirmDialog(true); // Show dialog
};

const handleConfirmSave = async () => {
  const parsed = parseFloat(mealHours);
  if (isNaN(parsed) || parsed < 0 || parsed > 24) {
    setMsg({ type: 'error', text: 'Inserisci un valore tra 0 e 24 ore.' });
    setConfirmDialog(false);
    return;
  }
  setLoading(true);
  setMsg(null);
  try {
    await apiClient.put('/api/admin/settings', {
      meal_voucher_hours: parsed,
      geofencing_feature_enabled: geofencingEnabled,
    });
    setMsg({ type: 'success', text: 'Impostazioni salvate.' });
    setConfirmDialog(false);
  } catch (err) {
    setMsg({ type: 'error', text: err.response?.data?.message || err.message });
  } finally {
    setLoading(false);
  }
};
```

And add dialog component before closing SettingsTab:

```jsx
<ConfirmDeleteDialog
  open={confirmDialog}
  title="Conferma salvataggio"
  description="Vuoi salvare le modifiche?"
  onConfirm={handleConfirmSave}
  onCancel={() => setConfirmDialog(false)}
  loading={loading}
/>
```

- [ ] **Step 5: Test in browser — login, navigate to Settings tab**

```bash
cd /Users/diegofalletti/DATAXIOM/Dataxiom\ -\ Analisi\ \&\ BI/badge
npm run dev --prefix frontend-web
```

Navigate to https://badge.dataxiom.it/admin → Settings tab
- Verify Geofencing section appears FIRST
- Verify Buoni Pasto section appears SECOND
- Verify toggle for geofencing works
- Verify clicking "Salva" shows dialog: "Vuoi salvare le modifiche?"
- Click "Confermo" → toast "Impostazioni salvate"

- [ ] **Step 6: Commit**

```bash
git add frontend-web/src/features/admin/pages/AdminPage.jsx
git commit -m "feat: reorder SettingsTab (geofencing first) + add confirmation dialog + load client from JWT"
```

---

## Task 3: Update SitesTab — Disable Per-Site Toggle When Client Geofencing OFF

**Files:**
- Modify: `frontend-web/src/features/admin/pages/AdminPage.jsx` (SitesTab function, lines ~400-582)
- Test: Tested manually during browser testing

**Context:** When client has `geofencing_feature_enabled = false`, the toggle for each site should be greyed out (disabled).

- [ ] **Step 1: Load client geofencing flag in SitesTab**

In SitesTab, after `const { data: clients } = useFetch('/api/admin/clients');`, add:

```javascript
const clientGeofencingEnabled = clients.length > 0 
  ? clients[0]?.geofencing_feature_enabled !== false 
  : true;
```

(If filtering by client_id from JWT in Task 2, this becomes more explicit: `clients.find(c => c.id === clientId)?.geofencing_feature_enabled`.)

- [ ] **Step 2: Pass flag to GeofenceDialog**

Current line ~573:
```jsx
{geofenceTarget && (
  <GeofenceDialog
    site={geofenceTarget}
    onClose={() => setGeofenceTarget(null)}
    onSaved={() => { setGeofenceTarget(null); reload(); }}
  />
)}
```

Change to:
```jsx
{geofenceTarget && (
  <GeofenceDialog
    site={geofenceTarget}
    clientGeofencingEnabled={clientGeofencingEnabled}
    onClose={() => setGeofenceTarget(null)}
    onSaved={() => { setGeofenceTarget(null); reload(); }}
  />
)}
```

- [ ] **Step 3: Update GeofenceDialog to disable toggle when client geo OFF**

Modify GeofenceDialog function signature and add disabled state:

```javascript
function GeofenceDialog({ site, clientGeofencingEnabled = true, onClose, onSaved }) {
  const [form, setForm] = useState({
    geofence_enabled: site.geofence_enabled || false,
    latitude: site.latitude != null ? String(site.latitude) : '',
    longitude: site.longitude != null ? String(site.longitude) : '',
    geofence_radius_meters: site.geofence_radius_meters || 150,
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const lat = form.latitude !== '' ? parseFloat(form.latitude) : null;
      const lng = form.longitude !== '' ? parseFloat(form.longitude) : null;
      // Validate: if geofencing is enabled AND client has geo enabled, require coords
      if (clientGeofencingEnabled && form.geofence_enabled && (lat == null || lng == null || isNaN(lat) || isNaN(lng))) {
        setMsg({ type: 'error', text: 'Inserisci latitudine e longitudine valide per attivare il geofencing.' });
        setSaving(false);
        return;
      }
      await apiClient.put(`/api/admin/sites/${site.id}`, {
        latitude: lat,
        longitude: lng,
        geofence_radius_meters: Number(form.geofence_radius_meters),
        geofence_enabled: form.geofence_enabled,
      });
      setMsg({ type: 'success', text: 'Geofencing aggiornato.' });
      onSaved();
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.message || err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>📍 Geofencing — {site.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={form.geofence_enabled}
                onChange={(e) => setForm({ ...form, geofence_enabled: e.target.checked })}
                disabled={!clientGeofencingEnabled}
              />
            }
            label={!clientGeofencingEnabled ? 'Geofencing disabilitato' : 'Geofencing attivo'}
          />
          {!clientGeofencingEnabled && (
            <Alert severity="info">
              Geofencing è disattivato a livello cliente. Abilita il geofencing nelle Impostazioni per attivarlo per questa sede.
            </Alert>
          )}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Latitudine"
              size="small"
              fullWidth
              value={form.latitude}
              onChange={(e) => setForm({ ...form, latitude: e.target.value })}
              placeholder="es. 45.4654"
              disabled={!clientGeofencingEnabled || !form.geofence_enabled}
              type="number"
              inputProps={{ step: 'any' }}
            />
            <TextField
              label="Longitudine"
              size="small"
              fullWidth
              value={form.longitude}
              onChange={(e) => setForm({ ...form, longitude: e.target.value })}
              placeholder="es. 9.1859"
              disabled={!clientGeofencingEnabled || !form.geofence_enabled}
              type="number"
              inputProps={{ step: 'any' }}
            />
          </Stack>
          <TextField
            label="Raggio (metri)"
            size="small"
            type="number"
            value={form.geofence_radius_meters}
            onChange={(e) => setForm({ ...form, geofence_radius_meters: e.target.value })}
            inputProps={{ min: 50, max: 5000, step: 10 }}
            disabled={!clientGeofencingEnabled || !form.geofence_enabled}
            helperText="Min 50m — Max 5000m. Consigliato: 100-200m."
          />
          {form.latitude && form.longitude && (
            <Typography variant="caption">
              <a href={`https://maps.google.com/?q=${form.latitude},${form.longitude}`} target="_blank" rel="noreferrer">
                📍 Verifica posizione su Google Maps
              </a>
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary">
            Suggerimento: apri Google Maps, fai click sulla sede e copia le coordinate.
          </Typography>
          {msg && <Alert severity={msg.type}>{msg.text}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>Annulla</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving} sx={{ backgroundColor: '#1E3A5F' }}>
          {saving ? <CircularProgress size={18} /> : 'Salva'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
```

- [ ] **Step 4: Test in browser — verify toggle disabled when client geo OFF**

```bash
cd /Users/diegofalletti/DATAXIOM/Dataxiom\ -\ Analisi\ \&\ BI/badge
npm run dev --prefix frontend-web
```

1. Go to Settings → Disable Geofencing → Save
2. Go to Sites tab → Click GPS icon for any site
3. Verify toggle is greyed out + disabled
4. Verify lat/lng/radius fields are disabled
5. Verify alert explains why
6. Go back to Settings → Enable Geofencing → Save
7. Go to Sites → Click GPS icon again
8. Verify toggle and fields are now enabled

- [ ] **Step 5: Commit**

```bash
git add frontend-web/src/features/admin/pages/AdminPage.jsx
git commit -m "feat: disable per-site geofencing toggle when client geofencing is OFF"
```

---

## Task 4: Verify Backend Geofence Validation Uses Both Flags

**Files:**
- Read: `backend/src/routes/checkins.js` (POST /api/checkins, geofence validation)
- Test: `backend/src/__tests__/checkins-geofence.test.js` (already exists from commit 5c2d761)

**Context:** The geofence check in checkins.js should use `if (site.geofencing_feature_enabled && site.geofence_enabled)`. Verify this is already in place.

- [ ] **Step 1: Read checkins.js around line 70 (geofence check)**

Expected code (from commit 5c2d761):
```javascript
if (site.geofencing_feature_enabled && site.geofence_enabled) {
  // geofence validation
}
```

If not present, add it.

- [ ] **Step 2: Run existing geofence tests**

```bash
cd /Users/diegofalletti/DATAXIOM/Dataxiom\ -\ Analisi\ \&\ BI/badge/backend
npm run test -- checkins-geofence.test.js 2>&1 | tail -20
```

Expected: All tests pass, including:
- "site has geofence ON but client feature OFF → check-in without GPS → 201"
- "site has geofence ON, client feature ON, no GPS → 400 (original behavior)"

- [ ] **Step 3: If validation missing, add it**

If not already there, modify the POST /api/checkins handler:

```javascript
// Get site with client geofencing flag
const siteResult = await pool.query(
  `SELECT s.id, s.geofence_enabled, s.latitude, s.longitude, s.geofence_radius_meters,
          c.geofencing_feature_enabled
   FROM sites s
   JOIN clients c ON c.id = s.client_id
   WHERE s.id = $1::uuid AND s.client_id = $2::uuid LIMIT 1`,
  [siteId, clientId]
);

const site = siteResult.rows[0];

// Validate geofence: BOTH client flag AND site flag must be true
if (site.geofencing_feature_enabled && site.geofence_enabled) {
  // Perform geofence distance check
  if (!latitude || !longitude) {
    return res.status(400).json({
      error: 'GEOFENCE_COORDINATES_REQUIRED',
      details: { code: 'GEOFENCE_COORDINATES_REQUIRED', message: 'GPS coordinates required' }
    });
  }
  
  const distance = haversine(latitude, longitude, site.latitude, site.longitude);
  if (distance > site.geofence_radius_meters) {
    return res.status(403).json({
      error: 'OUTSIDE_GEOFENCE',
      details: { distance_meters: Math.round(distance), max_meters: site.geofence_radius_meters }
    });
  }
}
```

- [ ] **Step 4: Run tests again to confirm**

```bash
cd /Users/diegofalletti/DATAXIOM/Dataxiom\ -\ Analisi\ \&\ BI/badge/backend
npm run test -- checkins-geofence.test.js 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 5: If changes made, commit**

```bash
git add backend/src/routes/checkins.js
git commit -m "fix: ensure geofence validation uses both client and site flags"
```

---

## Task 5: Run Full Test Suite + Deploy

**Files:**
- Test: All backend + frontend tests

- [ ] **Step 1: Run backend test suite**

```bash
cd /Users/diegofalletti/DATAXIOM/Dataxiom\ -\ Analisi\ \&\ BI/badge/backend
npm run test:coverage 2>&1 | tail -30
```

Expected: All tests pass, coverage unchanged or improved.

- [ ] **Step 2: Run frontend test suite (if any)**

```bash
cd /Users/diegofalletti/DATAXIOM/Dataxiom\ -\ Analisi\ \&\ BI/badge/frontend-web
npm run test -- --run 2>&1 | tail -20
```

Expected: All tests pass or N/A (no tests added for UI changes, tested manually).

- [ ] **Step 3: Commit any outstanding changes**

```bash
git status
git add -A
git commit -m "docs: update for geofencing hierarchical toggle implementation" || echo "Nothing to commit"
```

- [ ] **Step 4: Push to remote**

```bash
git push origin main
```

- [ ] **Step 5: Deploy frontend to Netlify**

```bash
cd /Users/diegofalletti/DATAXIOM/Dataxiom\ -\ Analisi\ \&\ BI/badge
netlify deploy --prod --dir frontend-web/dist --site 29a79b49
```

Expected: Deploy succeeds, frontend live at https://badge.dataxiom.it

- [ ] **Step 6: Verify in production**

Open https://badge.dataxiom.it/admin → Settings tab
- Geofencing toggle is first
- Toggle it ON/OFF → click Salva → dialog appears → confirms → saves
- Go to Sites → toggle per-site geofencing (disabled if client OFF)

---

## Self-Review

**Spec coverage:**
- ✅ SettingsTab: Geofencing master switch (reordered before Buoni Pasto)
- ✅ Dialog confirmation on save (minimalista: "Vuoi salvare?")
- ✅ SitesTab: Per-site toggle disabled (greyed out) when client OFF
- ✅ GeofenceDialog: Opens, toggle disabled if client OFF, data read-only if client OFF
- ✅ Lat/lng manual entry via Google Maps (already in dialog, no changes needed)
- ✅ Backend validation uses both flags (client + site)
- ✅ Single-tenant: load client from JWT client_id

**Placeholder scan:**
- ✅ All code blocks complete (no "TBD" or "add validation")
- ✅ All commands include expected output
- ✅ All commits are specific and meaningful

**Type consistency:**
- ✅ `clientGeofencingEnabled` boolean passed through SitesTab → GeofenceDialog
- ✅ `geofencing_feature_enabled` property name consistent (from DB)
- ✅ Toggle disabled = `disabled={!clientGeofencingEnabled}`

**No gaps detected.**
