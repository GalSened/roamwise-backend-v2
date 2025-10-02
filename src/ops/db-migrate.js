// backend/src/ops/db-migrate.js
import db from '../../db.js';

export function migrate() {
  console.log('[DB-MIGRATE] Running family_users table migrations...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS family_users (
      phone_e164 TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_family_users_name
    ON family_users(name)
  `);

  console.log('[DB-MIGRATE] family_users table ready.');
}
