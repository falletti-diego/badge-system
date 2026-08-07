# Mobile Secure Token Storage — Design Spec

**Data:** 7 Agosto 2026
**Origine:** Finding #1 (`findings2agosto2016.md`, HIGH, CONFIRMED) — Fase B del backlog Fix Findings
**Status:** Approvato, pronto per piano di implementazione

---

## Problema

`frontend-mobile/src/services/authService.js:15` salva access token, refresh token (validità 7 giorni) e l'oggetto utente completo (email, nome, ruolo, `employee_id`, `site_id`) via `@react-native-async-storage/async-storage`, **in chiaro**, invece di uno storage cifrato a livello OS.

**Scenario di fallimento:** su un device rootato/jailbroken, o tramite estrazione di un backup non cifrato, un attaccante legge direttamente `badge_auth_token`/`badge_refresh_token`/`badge_user` e ottiene account takeover completo per fino a 7 giorni, senza bisogno di Face ID o dell'app.

**Rilevanza GDPR:** l'oggetto utente contiene dati personali. L'Art. 32 GDPR nomina esplicitamente la cifratura come misura tecnica appropriata al rischio — tenere questi dati in chiaro su un device che un dipendente retail porta a casa, perde o rivende è un gap difendibile solo come "non ancora fatto", non come scelta accettabile.

---

## Scope

**Dentro scope (dati sensibili → storage cifrato):**
- Access token (`badge_auth_token`)
- Refresh token (`badge_refresh_token`)
- Oggetto utente (`badge_user`)

**Fuori scope (restano in `AsyncStorage`, nessuna sensibilità reale, cambiarli aggiungerebbe solo latenza)):**
- `FACE_ID_ENABLED` — preferenza locale, boolean
- `CACHE_SHIFTS` / `CACHE_PRESENCES` — cache UI, dati derivati non segreti
- `OFFLINE_QUEUE` — coda check-in pendenti, non un segreto

**Fuori scope (finding separato, non toccato da questo lavoro):**
- Finding #3 (token web in `localStorage`) — decisione già presa, Phase 2
- Certificate/TLS pinning — non richiesto da questo finding
- Refresh token lifetime (7 giorni) — orthogonal, già mitigato lato server dalla revoca `jti` (S.32.7)

---

## Architettura

Nuovo modulo `frontend-mobile/src/services/secureAuthStorage.js`, unico punto di accesso ai 3 dati sensibili, basato su `expo-secure-store` (nuova dipendenza — su iOS si appoggia a Keychain Services, su Android a Keystore-backed `EncryptedSharedPreferences`).

`expo-secure-store` non espone API batch (`multiSet`/`multiGet`/`multiRemove` come `AsyncStorage`) — solo `getItemAsync`/`setItemAsync`/`deleteItemAsync` per singola chiave. Il modulo le compone internamente con `Promise.all` mantenendo verso l'esterno la stessa granularità logica già usata oggi nel codice (sessione intera, coppia token, singolo token).

I 4 file che oggi importano `AsyncStorage` per queste chiavi smettono di farlo per la parte sensibile e usano `secureAuthStorage`:

| File | Uso oggi | Dopo |
|---|---|---|
| `src/services/authService.js` | `AsyncStorage.multiSet`/`multiRemove`/`getItem` su TOKEN/REFRESH/USER | chiama `secureAuthStorage` |
| `src/services/apiClient.js` | interceptor richiesta legge TOKEN ad ogni chiamata; interceptor risposta 401 fa `multiRemove` di TOKEN/REFRESH/USER | chiama `secureAuthStorage` |
| `src/navigation/RootNavigator.jsx` | `MainTabs` legge USER per il ruolo; cold-start effect fa `multiRemove` di 5 chiavi insieme (3 sensibili + `CACHE_SHIFTS`/`CACHE_PRESENCES`) | legge USER via `secureAuthStorage`; cold-start diventa **due chiamate parallele**: `secureAuthStorage.clearSession()` + `AsyncStorage.multiRemove([CACHE_SHIFTS, CACHE_PRESENCES])` |
| `src/screens/settings/ChangePasswordScreen.jsx` | `AsyncStorage.multiSet` di TOKEN+REFRESH dopo cambio password | chiama `secureAuthStorage.setTokenPair(...)` |

### API del modulo

| Funzione | Comportamento | Sostituisce |
|---|---|---|
| `getToken()` | legge access token | `AsyncStorage.getItem(AUTH_TOKEN)` |
| `getRefreshToken()` | legge refresh token | `AsyncStorage.getItem(REFRESH_TOKEN)` |
| `getUser()` | legge + `JSON.parse` oggetto utente (ritorna `null` se assente o malformato, stesso comportamento difensivo già presente in `authService.getUser`) | `AsyncStorage.getItem(USER_DATA)` |
| `setSession({ token, refreshToken, user })` | scrive token + user sempre, refresh token solo se presente (rispecchia `authService.login`) | `AsyncStorage.multiSet` in login |
| `setTokenPair({ token, refreshToken })` | scrive token + refresh token (refresh opzionale), **non tocca** `user` | `AsyncStorage.multiSet` in `refreshAccessToken`/`ChangePasswordScreen` |
| `clearSession()` | rimuove le 3 chiavi sensibili | `AsyncStorage.multiRemove` in logout/401-fallito/cold-start |

Tutte le funzioni sono `async` e lanciano `SecureStorageError` (vedi sezione Error Handling) in caso di fallimento sottostante.

### Migrazione — decisione: forza re-login, nessun codice di migrazione

Gli utenti con l'app già installata (token in `AsyncStorage` dalla build precedente) **non** vengono migrati automaticamente: al primo avvio post-update, `secureAuthStorage.getToken()` non trova nulla (SecureStore è vuoto), `isAuthenticated()` ritorna `false`, l'utente rifà login. Zero codice di migrazione, zero rischio di bug a metà migrazione.

I vecchi valori in chiaro restano temporaneamente orfani in `AsyncStorage` (mai più letti da nessun path applicativo) finché non vengono ripuliti dal cold-start effect di `RootNavigator` — che gira ad ogni kill+riapertura per design preesistente (device retail condivisi tra dipendenti) e quindi si attiva automaticamente al primo avvio della nuova build, senza bisogno di logica dedicata. Il `multiRemove` cold-start continua a includere le 3 chiavi sensibili *anche* lato `AsyncStorage` (oltre alla chiamata a `secureAuthStorage.clearSession()`) proprio per garantire questa pulizia opportunistica dei residui della versione precedente.

**Nota infrastrutturale:** `expo-secure-store` è un modulo nativo — non distribuibile via OTA (`expo-updates`, già configurato in `app.json`). Il rollout richiede una nuova build nativa (Codemagic → TestFlight/Play Store), come la Build 34 appena rilasciata.

### Verificato, nessuna azione necessaria: Android `allowBackup`

`app.json` non imposta esplicitamente `allowBackup` (default Android `true`). Verificato che questo **non** riapre il vettore "estrazione da backup": i valori passano per Android Keystore, la cui chiave è hardware-bound e non esportabile — un backup ripristinato su un device diverso non può decifrarli. Documentato qui per tracciabilità dell'audit, nessuna modifica di configurazione richiesta.

---

## Error Handling

`AsyncStorage.setItem` praticamente non fallisce mai in pratica; `SecureStore.setItemAsync` invece può lanciare eccezioni (es. limiti di dimensione su versioni Android più vecchie della libreria). Oggi nessuno dei 4 consumer ha try/catch attorno alla scrittura storage.

`secureAuthStorage.js` avvolge ogni chiamata a `expo-secure-store` in try/catch e rilancia un errore normalizzato `SecureStorageError` (con `message` leggibile). I chiamanti diretti dell'utente finale intercettano questo errore specifico:

- `authService.login` → propaga l'errore a `LoginScreen`, che mostra "Impossibile salvare la sessione, riprova" invece di un crash non gestito
- `ChangePasswordScreen` → stesso pattern già usato per gli errori di rete (`err.response?.data?.message`), esteso per includere `SecureStorageError`

---

## Sentry Scrubbing (difesa in profondità)

Il backend ha già uno scrubbing Sentry (`app.js`, finding storico S.15): `beforeSend` rimuove `authorization`, `password`, `token`, `cookie`, `x-api-key` prima dell'invio. Lato mobile, `App.jsx:12-17` inizializza Sentry con `tracesSampleRate: 0.2` (performance tracing, auto-strumenta le richieste di rete) **senza** alcuno scrubbing equivalente.

Non è confermato che l'SDK Sentry RN catturi di default l'header `Authorization` nelle breadcrumb (`sendDefaultPii` è `false` di default), ma spostare i token in storage cifrato e poi lasciarli potenzialmente transitare in chiaro verso un servizio esterno vanificherebbe parte del lavoro. Aggiunta a `Sentry.init()`:

- `beforeBreadcrumb`: se la breadcrumb è di categoria rete (`xhr`/`fetch`) e contiene un header `Authorization` nei dati, lo sostituisce con `[REDACTED]`
- `beforeSend`: stesso scrubbing a livello di evento (eccezioni/crash report), stessa lista di chiavi sensibili del backend per coerenza

---

## Testing

- **Nuovo `secureAuthStorage.test.js`**: mock manuale di `expo-secure-store` (Map in-memory, stesso pattern dei mock nativi già in `jest.setup.js`), TDD su tutte e 6 le funzioni, inclusi i path di errore (eccezione simulata da `SecureStore.setItemAsync` → `SecureStorageError` propagato).
- **`RootNavigator.test.jsx`** (file esistente): l'asserzione attuale su `AsyncStorage.multiRemove` chiamato con le 5 chiavi insieme va aggiornata — diventa un'asserzione su `secureAuthStorage.clearSession()` (mockato) + una su `AsyncStorage.multiRemove` con le sole 2 chiavi cache rimanenti.
- **Test comportamentali** (non regex/source-matching — lezione già imparata in Fase A, finding #10) su `authService`, `apiClient` interceptor, `ChangePasswordScreen`: verificano l'esito osservabile (token salvato/rimosso/letto correttamente), non l'assenza testuale di `AsyncStorage` nel sorgente.
- **Nuovo test su scrubbing Sentry**: verifica che `beforeBreadcrumb`/`beforeSend` rediga effettivamente un header `Authorization` presente in una breadcrumb/evento simulato.
- Suite completa mobile (`npm test`) a fine piano, zero regressioni rispetto al baseline corrente.

---

## File Structure (riepilogo)

**Nuovi:**
- `frontend-mobile/src/services/secureAuthStorage.js`
- `frontend-mobile/src/__tests__/secureAuthStorage.test.js`

**Modificati:**
- `frontend-mobile/src/services/authService.js`
- `frontend-mobile/src/services/apiClient.js`
- `frontend-mobile/src/navigation/RootNavigator.jsx`
- `frontend-mobile/src/screens/settings/ChangePasswordScreen.jsx`
- `frontend-mobile/src/__tests__/RootNavigator.test.jsx`
- `frontend-mobile/App.jsx` (Sentry scrubbing)
- `frontend-mobile/package.json` (nuova dipendenza `expo-secure-store`)

**Non toccati** (confermato durante l'analisi): `SettingsScreen.jsx`, `MyScheduleScreen.jsx`, `MyPresencesScreen.jsx`, `CheckInScreen.jsx` — usano `AsyncStorage` solo per chiavi fuori scope (`FACE_ID_ENABLED`, `CACHE_SHIFTS`, `CACHE_PRESENCES`).

---

## Rollout

Richiede una nuova build nativa (non OTA). Coordinare con il prossimo ciclo di build Codemagic → TestFlight/Play Store, non distribuibile come hotfix immediato via `expo-updates`.
