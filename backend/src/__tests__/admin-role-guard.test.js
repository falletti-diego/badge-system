'use strict';

/**
 * Finding #8 (2026-08-02, security/correctness review): verifica esplicita
 * che il guard server-side su /api/v1/admin/* non dipenda in alcun modo da
 * localStorage o da dati forniti dal client — il finding originale segnalava
 * che ProtectedRoute.jsx (dashboard) si basa su localStorage, manomettibile
 * dall'utente, per mostrare/nascondere la UI admin. Questo test conferma che
 * il backend ri-verifica il ruolo indipendentemente, da un JWT RS256 firmato
 * (vedi middleware/auth.js e routes/admin.js), quindi la manomissione del
 * solo localStorage non può concedere accesso reale.
 *
 * Non è un fix: nessun codice di produzione è modificato in questo task.
 * Stesso pattern di firma JWT di admin-clients-scoping.test.js.
 */

const jwt = require('jsonwebtoken');

describe('Admin route guard — finding #8', () => {
  let request;
  let app;

  beforeAll(() => {
    request = require('supertest');
    app = require('../app');
  });

  function tokenFor({ client_id, role }) {
    const privateKey = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
    return jwt.sign({ user_id: 'test-user', client_id, role, name: 'Test' }, privateKey, {
      algorithm: 'RS256',
      expiresIn: '1h',
    });
  }

  const fakeClientId = '00000000-0000-0000-0000-000000000001';

  it('un token con role=employee riceve 403 ADMIN_REQUIRED su una rotta admin generica', async () => {
    const token = tokenFor({ client_id: fakeClientId, role: 'employee' });
    const res = await request(app)
      .get('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error?.code || res.body.error || res.body.code).toBe('ADMIN_REQUIRED');
  });

  it('un token con role=manager riceve 403 ADMIN_REQUIRED su una rotta admin generica', async () => {
    const token = tokenFor({ client_id: fakeClientId, role: 'manager' });
    const res = await request(app)
      .get('/api/v1/admin/employees')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error?.code || res.body.error || res.body.code).toBe('ADMIN_REQUIRED');
  });
});
