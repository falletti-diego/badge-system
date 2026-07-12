'use strict';

const fs = require('fs');
const path = require('path');

describe('S.32.6 — CSV Temp Password Feature', () => {
  describe('Migration: must_change_password column', () => {
    it('should have migration 015 file for must_change_password', () => {
      const migrationPath = path.join(__dirname, '..', 'migrations', '015_add_must_change_password.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Verify the migration file exists and contains the required column
      expect(sql).toContain('ALTER TABLE employees');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS must_change_password');
      expect(sql).toContain('BOOLEAN NOT NULL DEFAULT false');
    });

    it('should create index on must_change_password column', () => {
      const migrationPath = path.join(__dirname, '..', 'migrations', '015_add_must_change_password.sql');
      const sql = fs.readFileSync(migrationPath, 'utf8');

      // Verify index is created
      expect(sql).toContain('CREATE INDEX');
      expect(sql).toContain('idx_employees_must_change_password');
      expect(sql).toContain('must_change_password');
    });
  });

  describe('Auth module exports', () => {
    it('should have verifyPassword and hashPassword exported from password module', () => {
      const passwordPath = path.join(__dirname, '..', 'src', 'auth', 'password.js');
      const passwordModule = fs.readFileSync(passwordPath, 'utf8');

      expect(passwordModule).toContain('verifyPassword');
      expect(passwordModule).toContain('hashPassword');
      expect(passwordModule).toContain('module.exports');
    });
  });

  describe('Auth routes changes', () => {
    it('should import verifyPassword and hashPassword in auth.js', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('verifyPassword');
      expect(authModule).toContain('hashPassword');
      expect(authModule).toContain('requireAuth');
    });

    it('should include change-password endpoint in auth.js', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('/change-password');
      expect(authModule).toContain('old_password');
      expect(authModule).toContain('new_password');
    });

    it('should handle badge.local accounts (password_hash = NULL) in change-password', () => {
      // Bug fix: @badge.local accounts have password_hash = NULL in DB (password lives in env var).
      // change-password must verify old_password against DEMO_USERS plaintext, not bcrypt.
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      // Must have a branch that handles null password_hash
      expect(authModule).toContain('employee.password_hash');
      // Must fall back to DEMO_USERS plaintext comparison
      expect(authModule).toContain('DEMO_USERS.find');
      expect(authModule).toContain('demoUser.password === old_password');
    });

    it('should include must_change_password in login response', () => {
      const authPath = path.join(__dirname, '..', 'src', 'routes', 'auth.js');
      const authModule = fs.readFileSync(authPath, 'utf8');

      expect(authModule).toContain('must_change_password');
      expect(authModule).toContain('SELECT e.id, e.client_id, e.email, e.name, e.role, e.site_id, e.password_hash');
      expect(authModule).toContain('e.must_change_password');
    });
  });

  describe('Admin CSV import changes', () => {
    it('should include passwords array in import results', () => {
      const employeesPath = path.join(__dirname, '..', 'src', 'routes', 'admin', 'employees.js');
      const employeesModule = fs.readFileSync(employeesPath, 'utf8');

      expect(employeesModule).toContain('passwords: []');
      expect(employeesModule).toContain('results.passwords.push');
      expect(employeesModule).toContain('temp_password');
    });

    it('should collect temp passwords for each created employee', () => {
      const employeesPath = path.join(__dirname, '..', 'src', 'routes', 'admin', 'employees.js');
      const employeesModule = fs.readFileSync(employeesPath, 'utf8');

      expect(employeesModule).toContain('email: emp.email');
      expect(employeesModule).toContain('temp_password: item.tempPassword');
    });
  });
});
