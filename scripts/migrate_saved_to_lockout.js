// scripts/migrate_saved_to_lockout.js
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = "data.sqlite";
if (!fs.existsSync(DB_PATH)) {
  console.error('DB nicht gefunden:', DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

function columnExists(table, column) {
  const stmt = db.prepare(`PRAGMA table_info(${table})`);
  return stmt.all().some(r => r.name === column);
}

db.transaction(() => {
  if (!columnExists('signups', 'lockout') && columnExists('signups', 'saved')) {
    console.log('Renaming signups.saved -> signups.lockout …');
    db.prepare(`ALTER TABLE signups RENAME COLUMN saved TO lockout`).run();
  }

  if (!columnExists('signups', 'note')) {
    console.log('Adding signups.note …');
    db.prepare(`ALTER TABLE signups ADD COLUMN note TEXT`).run();
  }

  if (!columnExists('signups', 'signup_class')) {
    console.log('Adding signups.signup_class …');
    db.prepare(`ALTER TABLE signups ADD COLUMN signup_class TEXT`).run();
  }

  console.log('Migration fertig.');
})();

db.close();
