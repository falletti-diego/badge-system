'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { withTransaction } = require('../middleware/db-transaction');
const { consumeInviteToken } = require('../utils/inviteTokens');
const { hashPassword } = require('../auth/password');
const { logAudit } = require('../middleware/audit');
const { ValidationError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

if (!process.env.JWT_PRIVATE_KEY) {
  throw new Error('FATAL: JWT_PRIVATE_KEY environment variable is required — server cannot start without it');
}
const JWT_PRIVATE_KEY = process.env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n');
const JWT_ALGORITHM = 'RS256';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

const router = express.Router();

/**
 * POST /api/v1/onboarding/invite/:token/accept
 *
 * Endpoint pubblico (nessun JWT esistente al momento della chiamata, stesso
 * principio di POST /demo/start) — redime un invito one-time per il primo
 * admin di un nuovo client, creando la riga employees e consumando il token
 * atomicamente nella stessa transazione (mai l'uno senza l'altro).
 */
router.post('/invite/:token/accept', async (req, res, next) => {
  try {
    const { name, password } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return next(new ValidationError('Name must be at least 2 characters'));
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return next(new ValidationError('Password must be at least 8 characters'));
    }

    const employee = await withTransaction(async (client) => {
      // consumeInviteToken fa UPDATE...RETURNING atomica: due richieste
      // concorrenti con lo stesso token non possono mai entrambe passare
      // (la seconda vede 0 righe perché used_at non è più NULL).
      const invite = await consumeInviteToken(client, req.params.token);
      if (!invite) return null;

      const passwordHash = await hashPassword(password);
      const result = await client.query(
        `INSERT INTO employees (client_id, email, name, role, password_hash, must_change_password)
         VALUES ($1, $2, $3, 'admin', $4, false)
         RETURNING id, client_id, email, name, role`,
        [invite.client_id, invite.email, name.trim(), passwordHash]
      );
      const newEmployee = result.rows[0];
      await logAudit(client, {
        action: 'onboarding_invite_accepted',
        entity: 'employee',
        entityId: newEmployee.id,
        oldValue: null,
        newValue: { name: newEmployee.name, email: newEmployee.email, role: newEmployee.role, client_id: newEmployee.client_id },
        userId: newEmployee.id,
      });
      return newEmployee;
    });

    if (!employee) {
      // Un unico esito per token inesistente/scaduto/già usato — non
      // distinguiamo i casi verso un chiamante non autenticato per non
      // rivelare informazioni sullo storico del token.
      return next(new NotFoundError('Invito non valido o scaduto', 'INVITE_INVALID'));
    }

    // employee_id deve essere presente esattamente come in POST /auth/login
    // (auth.js: tokenPayload.employee_id = dbEmployee.id) — qui l'employee
    // appena creato coincide col soggetto del token, quindi è sempre se
    // stesso. Senza questo campo, endpoint gated su req.user.employee_id
    // (smartWorking.js, checkins.js, illnesses.js) tratterebbero il nuovo
    // admin come privo di profilo dipendente fino al primo refresh token.
    const tokenPayload = {
      user_id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      client_id: employee.client_id,
      employee_id: employee.id,
      jti: uuid(),
    };
    const token = jwt.sign(tokenPayload, JWT_PRIVATE_KEY, {
      algorithm: JWT_ALGORITHM,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });
    const refresh_token = jwt.sign(
      { user_id: employee.id, email: employee.email, type: 'refresh', jti: uuid() },
      JWT_PRIVATE_KEY,
      { algorithm: JWT_ALGORITHM, expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    logger.info({
      action: 'onboarding_invite_accepted',
      client_id: employee.client_id,
      employee_id: employee.id,
    });

    res.status(200).json({
      data: {
        token,
        refresh_token,
        user: {
          id: employee.id,
          email: employee.email,
          name: employee.name,
          role: employee.role,
          employee_id: employee.id,
          // Always false here: invite tokens are only ever issued for a
          // brand-new client at creation time (see admin/clients.js), so
          // this admin's client is guaranteed to have zero sites. Tells
          // LoginPage.jsx to redirect to /admin/onboarding on any later
          // re-login before the wizard is run (bug found Session 89).
          has_sites: false,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
