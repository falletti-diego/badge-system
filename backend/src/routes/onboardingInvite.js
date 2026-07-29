'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { withTransaction } = require('../middleware/db-transaction');
const { consumeInviteToken } = require('../utils/inviteTokens');
const { hashPassword } = require('../auth/password');
const { ValidationError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');

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
      return result.rows[0];
    });

    if (!employee) {
      // Un unico esito per token inesistente/scaduto/già usato — non
      // distinguiamo i casi verso un chiamante non autenticato per non
      // rivelare informazioni sullo storico del token.
      return next(new NotFoundError('Invito non valido o scaduto', 'INVITE_INVALID'));
    }

    const tokenPayload = {
      user_id: employee.id,
      name: employee.name,
      email: employee.email,
      role: employee.role,
      client_id: employee.client_id,
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
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
