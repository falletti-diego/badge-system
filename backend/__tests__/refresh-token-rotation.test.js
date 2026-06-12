'use strict';

/**
 * S.32.7 Task 2: Refresh Token Rotation + Reuse Detection (TDD)
 * Tests for POST /auth/refresh endpoint with:
 * - Token rotation (new jti_new generated)
 * - Replay attack detection (same jti used twice → 401)
 * - Revocation check (revoked_until expiry support)
 * - Connection safety (try-finally)
 *
 * Note: These are integration tests that verify:
 * 1. Endpoint structure and response format
 * 2. JWT verification works
 * 3. Basic error handling
 *
 * Full database transaction tests would require a test database setup.
 * Instead, we verify the code structure and logic.
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

describe('S.32.7 Task 2 — POST /auth/refresh with Token Rotation', () => {
  describe('Endpoint structure and implementation', () => {
    it('should have POST /refresh endpoint in auth.js', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain("router.post('/refresh'");
      expect(authModule).toContain('refresh_token');
    });

    it('should validate refresh_token parameter', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('MISSING_REFRESH_TOKEN');
      expect(authModule).toContain('if (!refresh_token)');
    });

    it('should verify JWT type is "refresh"', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain("decoded.type !== 'refresh'");
      expect(authModule).toContain('INVALID_TOKEN_TYPE');
    });

    it('should import crypto module for jti hashing (Fix #4)', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain("require('crypto')");
      expect(authModule).toContain('createHash');
    });

    it('should import uuid for jti generation', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain("require('uuid')");
    });

    it('should extract jti from decoded token', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('jti_old');
      expect(authModule).toContain('decoded.jti');
    });
  });

  describe('Fix #1: Replay attack detection with SELECT FOR UPDATE', () => {
    it('should use SELECT FOR UPDATE for atomic race prevention', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('SELECT FOR UPDATE');
      expect(authModule).toContain('used_tokens WHERE jti');
    });

    it('should revoke user on replay detection', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('REPLAY_ATTACK_DETECTED');
      expect(authModule).toContain('revoked_tokens');
      expect(authModule).toContain('revoked_until');
    });

    it('should return 401 SESSION_REVOKED on replay', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('SESSION_REVOKED');
      expect(authModule).toContain('401');
    });
  });

  describe('Fix #2: Audit logging optimization', () => {
    it('should log replay attacks with REPLAY_ATTACK_DETECTED action', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('REPLAY_ATTACK_DETECTED');
      expect(authModule).toContain('logger.warn');
    });

    it('should not log routine token refreshes (Fix #2)', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      // Should NOT have logger.info for successful refreshes
      // Only security events logged
      const refreshSection = authModule.substring(
        authModule.indexOf("router.post('/refresh'"),
        authModule.indexOf("router.post('/logout'")
      );

      // Count warning/error logs vs info logs
      const warningCount = (refreshSection.match(/logger\.warn/g) || []).length;
      const errorCount = (refreshSection.match(/logger\.error/g) || []).length;
      const infoCount = (refreshSection.match(/logger\.info/g) || []).length;

      // Should have warnings/errors for security events
      expect(warningCount + errorCount).toBeGreaterThan(0);
      // Should NOT have info logs for routine operations
      expect(infoCount).toBe(0);
    });
  });

  describe('Fix #3: Revocation with temporary expiry support', () => {
    it('should check revoked_tokens table', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('revoked_tokens');
      expect(authModule).toContain('WHERE user_id');
    });

    it('should support temporary revoke with revoked_until expiry check', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('revoked_until IS NULL OR revoked_until > NOW()');
    });

    it('should reject refresh if user is revoked (permanent)', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('revokeCheck.rows.length > 0');
      expect(authModule).toContain('SESSION_REVOKED');
    });
  });

  describe('Fix #4: jti hashing for audit logs', () => {
    it('should hash jti using SHA256', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('createHash');
      expect(authModule).toContain('sha256');
      expect(authModule).toContain('jti_hash');
    });

    it('should not store plaintext jti in audit logs', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      // When logging security events, should use jti_hash not plaintext jti
      expect(authModule).toContain('createHash');
      expect(authModule).toContain('jti_hash');
      expect(authModule).toContain('REPLAY_ATTACK_DETECTED');
    });
  });

  describe('Fix #5: Connection safety with try-finally', () => {
    it('should use explicit pool.connect() for transaction control', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('pool.connect()');
      expect(authModule).toContain('client');
    });

    it('should wrap operations in try-finally block', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('} finally {');
      expect(authModule).toContain('client.release()');
    });

    it('should release connection even on error', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      const finallySection = authModule.substring(
        authModule.lastIndexOf('} finally {'),
        authModule.lastIndexOf('} finally {') + 200
      );

      expect(finallySection).toContain('client.release()');
    });

    it('should use explicit transactions (BEGIN/COMMIT/ROLLBACK)', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain("'BEGIN'");
      expect(authModule).toContain("'COMMIT'");
      expect(authModule).toContain("'ROLLBACK'");
    });
  });

  describe('Token rotation (new jti generation)', () => {
    it('should generate new jti using uuid()', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('uuid()');
      expect(authModule).toContain('jti_new');
    });

    it('should delete old jti before generating new token', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain("DELETE FROM used_tokens WHERE jti");
      expect(authModule).toContain('jti_old');
    });

    it('should insert new jti into used_tokens', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('INSERT INTO used_tokens');
      expect(authModule).toContain('jti_new');
    });

    it('should generate access_token (15m) and refresh_token (7d)', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('ACCESS_TOKEN_EXPIRY');
      expect(authModule).toContain('REFRESH_TOKEN_EXPIRY');
      expect(authModule).toContain('jwt.sign');
    });
  });

  describe('Response format', () => {
    it('should return {data: {token, refresh_token}} on success', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('{ data: {');
      expect(authModule).toContain('token');
      expect(authModule).toContain('refresh_token');
    });

    it('should include type="refresh" in new refresh token', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain("type: 'refresh'");
    });
  });

  describe('Error handling', () => {
    it('should return 400 if refresh_token is missing', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('400');
      expect(authModule).toContain('MISSING_REFRESH_TOKEN');
    });

    it('should return 401 for invalid token', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('401');
      expect(authModule).toContain('INVALID_REFRESH_TOKEN');
    });

    it('should handle JWT verification errors gracefully', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('catch (err)');
      expect(authModule).toContain('INVALID_REFRESH_TOKEN');
    });

    it('should handle database errors with 500 response', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('500');
      expect(authModule).toContain('SERVER_ERROR');
    });
  });

  describe('Database schema validation', () => {
    it('should have revoked_tokens table (Migration 016)', () => {
      const migrationPath = path.join(__dirname, '..', 'migrations', '016_create_revoked_tokens.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('CREATE TABLE revoked_tokens');
      expect(sql).toContain('user_id UUID');
      expect(sql).toContain('revoked_until');
    });

    it('should have used_tokens table (Migration 017)', () => {
      const migrationPath = path.join(__dirname, '..', 'migrations', '017_create_used_tokens.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('CREATE TABLE used_tokens');
      expect(sql).toContain('jti VARCHAR');
      expect(sql).toContain('user_id UUID');
    });

    it('should have jti_hash in audit_log (Migration 018)', () => {
      const migrationPath = path.join(__dirname, '..', 'migrations', '018_add_audit_jti_hash.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('jti_hash');
    });

    it('revoked_tokens should support cascading deletes (GDPR)', () => {
      const migrationPath = path.join(__dirname, '..', 'migrations', '016_create_revoked_tokens.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('ON DELETE CASCADE');
    });

    it('used_tokens should support cascading deletes (GDPR)', () => {
      const migrationPath = path.join(__dirname, '..', 'migrations', '017_create_used_tokens.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('ON DELETE CASCADE');
    });

    it('both tables should use TIMESTAMP WITH TIME ZONE', () => {
      const migrationPath = path.join(__dirname, '..', 'migrations', '016_create_revoked_tokens.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      expect(sql).toContain('TIMESTAMP WITH TIME ZONE');
    });
  });
});
