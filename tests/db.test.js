// ---- Database Tests ----
import { describe, it, expect, beforeAll } from 'vitest';
import { getAllTenants, getUsersByTenant, getUserByCredentials } from '../db.js';

describe('Database Operations', () => {
  beforeAll(() => {
    // Migrations should have run during server startup
    // If running tests independently, may need to call migrate() here
  });

  describe('getAllTenants', () => {
    it('should return at least the home tenant', () => {
      const tenants = getAllTenants();
      expect(Array.isArray(tenants)).toBe(true);
      expect(tenants.length).toBeGreaterThan(0);
      expect(tenants.some(t => t.name === 'home')).toBe(true);
    });
  });

  describe('getUsersByTenant', () => {
    it('should return users for home tenant', () => {
      const tenants = getAllTenants();
      const homeTenant = tenants.find(t => t.name === 'home');
      const users = getUsersByTenant(homeTenant.id);
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
    });
  });

  describe('getUserByCredentials', () => {
    it('should find user gal in home tenant', () => {
      const user = getUserByCredentials('home', 'gal');
      expect(user).toBeTruthy();
      expect(user.username).toBe('gal');
      expect(user.tenant_name).toBe('home');
    });

    it('should return undefined for non-existent user', () => {
      const user = getUserByCredentials('home', 'nonexistent');
      expect(user).toBeUndefined();
    });
  });
});
