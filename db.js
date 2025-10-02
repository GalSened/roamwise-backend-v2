// ---- Database Setup (SQLite) ----
// Multi-tenant database with tenants, users, and profiles tables

import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize SQLite database
const dbPath = join(__dirname, 'roamwise.db');
const db = new Database(dbPath);

// Enable foreign keys and WAL mode for better concurrency
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

/**
 * Run migrations to create tables and seed data
 */
export function migrate() {
  console.log('[DB] Running migrations...');

  // Create tenants table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      display_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      UNIQUE(tenant_id, username)
    )
  `);

  // Create profiles table with travel preferences
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      pace TEXT DEFAULT 'relaxed' CHECK(pace IN ('slow', 'relaxed', 'active', 'packed')),
      likes TEXT DEFAULT '[]',
      avoid TEXT DEFAULT '[]',
      dietary TEXT DEFAULT '[]',
      budget_min INTEGER DEFAULT 50,
      budget_max INTEGER DEFAULT 500,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  console.log('[DB] Tables created');

  // Seed default tenant and users
  seedDefaultData();

  console.log('[DB] Migrations complete');
}

/**
 * Seed default data for home use
 */
function seedDefaultData() {
  // Check if home tenant already exists
  const existingTenant = db.prepare('SELECT id FROM tenants WHERE name = ?').get('home');
  if (existingTenant) {
    console.log('[DB] Default data already exists, skipping seed');
    return;
  }

  console.log('[DB] Seeding default data...');

  // Create home tenant
  const insertTenant = db.prepare('INSERT INTO tenants (name) VALUES (?)');
  const tenantResult = insertTenant.run('home');
  const homeTenantId = tenantResult.lastInsertRowid;

  // Create default users
  const insertUser = db.prepare('INSERT INTO users (tenant_id, username, display_name) VALUES (?, ?, ?)');
  const users = [
    { username: 'gal', displayName: 'Gal' },
    { username: 'guest', displayName: 'Guest' },
    { username: 'family1', displayName: 'Family Member 1' },
    { username: 'family2', displayName: 'Family Member 2' }
  ];

  const insertProfile = db.prepare(`
    INSERT INTO profiles (user_id, pace, likes, avoid, dietary, budget_min, budget_max)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  users.forEach((user) => {
    const userResult = insertUser.run(homeTenantId, user.username, user.displayName);
    const userId = userResult.lastInsertRowid;

    // Create default profile for each user
    insertProfile.run(
      userId,
      'relaxed',
      JSON.stringify(['food', 'culture']),
      JSON.stringify([]),
      JSON.stringify([]),
      50,
      500
    );
  });

  console.log('[DB] Seeded home tenant with', users.length, 'users');
}

/**
 * Get all tenants
 */
export function getAllTenants() {
  return db.prepare('SELECT id, name FROM tenants').all();
}

/**
 * Get all users for a tenant
 */
export function getUsersByTenant(tenantId) {
  return db.prepare('SELECT id, username, display_name FROM users WHERE tenant_id = ?').all(tenantId);
}

/**
 * Get user by tenant and username
 */
export function getUserByCredentials(tenantName, username) {
  return db.prepare(`
    SELECT u.id, u.username, u.display_name, u.tenant_id, t.name as tenant_name
    FROM users u
    JOIN tenants t ON u.tenant_id = t.id
    WHERE t.name = ? AND u.username = ?
  `).get(tenantName, username);
}

/**
 * Get user profile by user ID
 */
export function getProfileByUserId(userId) {
  const profile = db.prepare(`
    SELECT p.*, u.username, u.display_name, t.name as tenant_name
    FROM profiles p
    JOIN users u ON p.user_id = u.id
    JOIN tenants t ON u.tenant_id = t.id
    WHERE p.user_id = ?
  `).get(userId);

  if (!profile) return null;

  // Parse JSON fields
  return {
    ...profile,
    likes: JSON.parse(profile.likes || '[]'),
    avoid: JSON.parse(profile.avoid || '[]'),
    dietary: JSON.parse(profile.dietary || '[]')
  };
}

/**
 * Update user profile preferences
 */
export function updateProfile(userId, prefs) {
  const updates = [];
  const params = [];

  if (prefs.pace !== undefined) {
    updates.push('pace = ?');
    params.push(prefs.pace);
  }
  if (prefs.likes !== undefined) {
    updates.push('likes = ?');
    params.push(JSON.stringify(prefs.likes));
  }
  if (prefs.avoid !== undefined) {
    updates.push('avoid = ?');
    params.push(JSON.stringify(prefs.avoid));
  }
  if (prefs.dietary !== undefined) {
    updates.push('dietary = ?');
    params.push(JSON.stringify(prefs.dietary));
  }
  if (prefs.budget_min !== undefined) {
    updates.push('budget_min = ?');
    params.push(prefs.budget_min);
  }
  if (prefs.budget_max !== undefined) {
    updates.push('budget_max = ?');
    params.push(prefs.budget_max);
  }

  if (updates.length === 0) return false;

  updates.push('updated_at = CURRENT_TIMESTAMP');
  params.push(userId);

  const sql = `UPDATE profiles SET ${updates.join(', ')} WHERE user_id = ?`;
  const result = db.prepare(sql).run(...params);

  return result.changes > 0;
}

export default db;
