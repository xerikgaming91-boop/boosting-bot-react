// src/lib/db.js
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const DB_PATH = path.resolve(process.cwd(), 'data.sqlite');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// -------- Helpers --------
function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function tableInfo(name) {
  try { return db.prepare(`PRAGMA table_info(${name})`).all(); } catch { return []; }
}
function hasColumn(table, col) {
  return tableInfo(table).some((r) => r.name === col);
}
function ensureColumn(table, col, typeSql, defaultSql = null) {
  if (!hasColumn(table, col)) {
    const def = defaultSql ? ` DEFAULT ${defaultSql}` : '';
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${col} ${typeSql}${def}`).run();
    if (defaultSql) {
      try {
        const v = defaultSql.includes('datetime') ? now() : defaultSql.replace(/^'|'+$/g, '');
        db.prepare(`UPDATE ${table} SET ${col}=? WHERE ${col} IS NULL`).run(v);
      } catch {}
    }
  }
}
function ensureIndex(_name, sql) { try { db.prepare(sql).run(); } catch {} }
function cleanupSignupDuplicates() {
  try {
    db.exec(`
      DELETE FROM signups
      WHERE id NOT IN (SELECT MIN(id) FROM signups GROUP BY raid_id, character_id);
    `);
  } catch {}
}

// ---- Cycle-Tools (Mi–Di) ----
function pad(n){return String(n).padStart(2,'0');}
function fmtDateTime(d){
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function parseDbDate(s){ if (!s) return null; const d=new Date(s.replace(' ','T')); return isNaN(d)?null:d; }
function startOfCycle(dateLike){
  const d = new Date(dateLike);
  const day = d.getDay(); // 0 So ... 6 Sa
  const start = new Date(d);
  start.setHours(0,0,0,0);
  const diff = (day - 3 + 7) % 7; // zurück bis Mittwoch
  start.setDate(start.getDate() - diff);
  return start;
}
function endOfCycle(dateLike){
  const s = startOfCycle(dateLike);
  const e = new Date(s);
  e.setDate(e.getDate()+6);
  e.setHours(23,59,59,999);
  return e;
}

const BLOCKING_LOOT = new Set(['unsaved', 'vip']); // saved/community blocken *nicht*

// -------- Base schema (create if missing) --------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  discord_id TEXT PRIMARY KEY,
  username   TEXT,
  avatar     TEXT,
  is_raidlead INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  realm TEXT NOT NULL,
  region TEXT NOT NULL,
  class TEXT,
  spec TEXT,
  ilvl INTEGER,
  rio_score REAL,
  wcl_rank TEXT,
  wcl_url TEXT,
  imported_from TEXT,
  FOREIGN KEY(user_id) REFERENCES users(discord_id)
);
CREATE TABLE IF NOT EXISTS raids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  datetime TEXT,
  difficulty TEXT,
  run_type TEXT,
  loot_type TEXT,
  description TEXT,
  channel_id TEXT,
  message_id TEXT,
  roster_message_id TEXT,
  created_by TEXT
);
CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raid_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  character_id INTEGER NOT NULL,
  role TEXT,
  slot TEXT,
  status TEXT,
  picked INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY(raid_id) REFERENCES raids(id),
  FOREIGN KEY(user_id) REFERENCES users(discord_id),
  FOREIGN KEY(character_id) REFERENCES characters(id)
);
`);

// -------- Migrations --------
(function migrate() {
  // users
  ensureColumn('users', 'created_at', 'TEXT', `'${now()}'`);
  ensureColumn('users', 'updated_at', 'TEXT', `'${now()}'`);

  // characters
  ensureColumn('characters', 'created_at', 'TEXT', `'${now()}'`);
  ensureColumn('characters', 'updated_at', 'TEXT', `'${now()}'`);
  ensureColumn('characters', 'last_synced_at', 'TEXT', 'NULL');

  // raids
  ensureColumn('raids', 'created_at', 'TEXT', `'${now()}'`);
  ensureColumn('raids', 'updated_at', 'TEXT', `'${now()}'`);

  // signups (Basis)
  ensureColumn('signups', 'created_at', 'TEXT', `'${now()}'`);
  ensureColumn('signups', 'updated_at', 'TEXT', `'${now()}'`);
  ensureColumn('signups', 'picked', 'INTEGER', '0');
  ensureColumn('signups', 'status', 'TEXT', `'signed'`);
  ensureColumn('signups', 'role', 'TEXT', 'NULL');
  ensureColumn('signups', 'slot', 'TEXT', 'NULL');
  ensureColumn('signups', 'note', 'TEXT', 'NULL');
  ensureColumn('signups', 'signup_class', 'TEXT', 'NULL');

  // --- Wechsel: saved -> lockout ---
  ensureColumn('signups', 'lockout', 'TEXT', `'unsaved'`);
  if (hasColumn('signups', 'saved')) {
    try {
      db.exec(`
        UPDATE signups
           SET lockout = COALESCE(lockout, saved)
         WHERE saved IS NOT NULL;
      `);
    } catch {}
    try { db.exec(`ALTER TABLE signups DROP COLUMN saved;`); } catch {}
  }

  // Aufräumen/Indizes
  cleanupSignupDuplicates();

  ensureIndex('idx_signups_raid_char',
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_signups_raid_char ON signups(raid_id, character_id)`);

  ensureIndex('idx_one_pick_user_raid',
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pick_user_raid
     ON signups(raid_id, user_id)
     WHERE picked=1`);

  ensureIndex('idx_chars_user', `CREATE INDEX IF NOT EXISTS idx_chars_user ON characters(user_id)`);
  ensureIndex('idx_raids_time', `CREATE INDEX IF NOT EXISTS idx_raids_time ON raids(datetime)`);
  ensureIndex('idx_signups_raid', `CREATE INDEX IF NOT EXISTS idx_signups_raid ON signups(raid_id)`);
})();

// ================= Users =================
export const Users = {
  upsert({ discord_id, username, avatar, is_raidlead = 0 }) {
    const exist = db.prepare(`SELECT discord_id FROM users WHERE discord_id=?`).get(discord_id);
    if (exist) {
      db.prepare(`UPDATE users SET username=?, avatar=?, updated_at=? WHERE discord_id=?`)
        .run(username, avatar, now(), discord_id);
    } else {
      db.prepare(`
        INSERT INTO users (discord_id, username, avatar, is_raidlead, created_at, updated_at)
        VALUES (?,?,?,?,?,?)
      `).run(discord_id, username, avatar, is_raidlead ? 1 : 0, now(), now());
    }
  },
  get(discord_id) { return db.prepare(`SELECT * FROM users WHERE discord_id=?`).get(discord_id); },
  setRaidlead(discord_id, flag) {
    db.prepare(`UPDATE users SET is_raidlead=?, updated_at=? WHERE discord_id=?`)
      .run(flag ? 1 : 0, now(), discord_id);
  }
};

// ================= Characters =================
export const Characters = {
  listByUser(user_id) {
    return db.prepare(`SELECT * FROM characters WHERE user_id=? ORDER BY created_at DESC, id DESC`).all(user_id);
    },
  listAll() {
    return db.prepare(`SELECT * FROM characters ORDER BY updated_at DESC, id DESC`).all();
  },
  create(payload) {
    const st = db.prepare(`
      INSERT INTO characters
      (user_id, name, realm, region, class, spec, ilvl, rio_score, wcl_rank, wcl_url, imported_from, created_at, updated_at, last_synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    const info = st.run(
      payload.user_id,
      payload.name, payload.realm, payload.region,
      payload.class || null, payload.spec || null,
      payload.ilvl ?? null, payload.rio_score ?? null,
      payload.wcl_rank ?? null, payload.wcl_url ?? null,
      payload.imported_from || null,
      now(), now(), null
    );
    return { id: info.lastInsertRowid };
  },
  updateStats(id, { className, spec, ilvl, rio_score, wcl_rank, wcl_url }) {
    db.prepare(`
      UPDATE characters
      SET class=?, spec=?, ilvl=?, rio_score=?, wcl_rank=?, wcl_url=?, updated_at=?, last_synced_at=?
      WHERE id=?
    `).run(
      className || null,
      spec || null,
      (typeof ilvl === 'number' ? ilvl : null),
      (typeof rio_score === 'number' ? rio_score : null),
      wcl_rank || null,
      wcl_url || null,
      now(),
      now(),
      id
    );
  },
  delete(id) { db.prepare(`DELETE FROM characters WHERE id=?`).run(id); }
};

// ================= Raids =================
export const Raids = {
  list() { return db.prepare(`SELECT * FROM raids ORDER BY datetime ASC, id DESC`).all(); },
  get(id) { return db.prepare(`SELECT * FROM raids WHERE id=?`).get(id); },
  create(payload) {
    const st = db.prepare(`
      INSERT INTO raids
      (title, datetime, difficulty, run_type, loot_type, description, created_by, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)
    `);
    const info = st.run(
      payload.title || null,
      payload.datetime || null,
      payload.difficulty || null,
      payload.run_type || null,
      payload.loot_type || null,
      payload.description || null,
      payload.created_by || null,
      now(), now()
    );
    return { id: info.lastInsertRowid, ...this.get(info.lastInsertRowid) };
  },
  update(payload) {
    db.prepare(`
      UPDATE raids
      SET title=?, datetime=?, difficulty=?, loot_type=?, description=?, channel_id=?, message_id=?, roster_message_id=?, updated_at=?
      WHERE id=?
    `).run(
      payload.title || null,
      payload.datetime || null,
      payload.difficulty || null,
      payload.loot_type || null,
      payload.description || null,
      payload.channel_id || null,
      payload.message_id || null,
      payload.roster_message_id || null,
      now(),
      payload.id
    );
    return this.get(payload.id);
  },
  setMessageAndChannel(id, message_id, channel_id) {
    db.prepare(`UPDATE raids SET message_id=?, channel_id=?, updated_at=? WHERE id=?`)
      .run(message_id, channel_id, now(), id);
  },
  setRosterMessage(id, message_id) {
    db.prepare(`UPDATE raids SET roster_message_id=?, updated_at=? WHERE id=?`)
      .run(message_id, now(), id);
  },
  delete(id) {
    db.prepare(`DELETE FROM signups WHERE raid_id=?`).run(id);
    db.prepare(`DELETE FROM raids WHERE id=?`).run(id);
  }
};

// ================= Signups =================
export const Signups = {
  listForRaidWithChars(raid_id) {
    return db.prepare(`
      SELECT s.*,
             c.name  AS char_name,
             c.class AS char_class,
             c.spec  AS char_spec,
             c.ilvl  AS char_ilvl,
             c.wcl_url AS char_wcl_url
      FROM signups s
      LEFT JOIN characters c ON c.id = s.character_id
      WHERE s.raid_id=?
      ORDER BY s.picked DESC, s.created_at ASC
    `).all(raid_id);
  },

  // kompatibler Helper (z. B. für Bot)
  listByRaid(raid_id) {
    return db.prepare(`SELECT * FROM signups WHERE raid_id=? ORDER BY created_at ASC, id ASC`).all(raid_id);
  },

  listCharIdsForRaid(raid_id) {
    const rows = db.prepare(`SELECT character_id FROM signups WHERE raid_id=?`).all(raid_id);
    return new Set(rows.map((r) => r.character_id));
  },

  lockedCharIdsGlobal(excludeRaidId = null) {
    const rows = db.prepare(`
      SELECT character_id, raid_id
      FROM signups
      WHERE picked=1
    `).all();
    const locked = new Set();
    for (const r of rows) {
      if (excludeRaidId != null && Number(r.raid_id) === Number(excludeRaidId)) continue;
      locked.add(r.character_id);
    }
    return locked;
  },

  isCharLockedForRaid(raid_id, character_id) {
    const target = Raids.get(raid_id);
    if (!target) return false;
    const loot = String(target.loot_type || '').toLowerCase();
    if (!BLOCKING_LOOT.has(loot)) return false;

    const dt = parseDbDate(target.datetime) || new Date();
    const s = fmtDateTime(startOfCycle(dt));
    const e = fmtDateTime(endOfCycle(dt));

    const row = db.prepare(`
      SELECT 1
      FROM signups s
      JOIN raids r ON r.id = s.raid_id
      WHERE s.character_id = ?
        AND s.picked = 1
        AND r.id != ?
        AND r.difficulty = ?
        AND r.loot_type IN ('unsaved','vip')
        AND r.datetime BETWEEN ? AND ?
      LIMIT 1
    `).get(character_id, raid_id, String(target.difficulty), s, e);

    return !!row;
  },

  lockedCharIdsForRaid(raid_id) {
    const target = Raids.get(raid_id);
    if (!target) return new Set();
    const loot = String(target.loot_type || '').toLowerCase();
    if (!BLOCKING_LOOT.has(loot)) return new Set();

    const dt = parseDbDate(target.datetime) || new Date();
    const s = fmtDateTime(startOfCycle(dt));
    const e = fmtDateTime(endOfCycle(dt));

    const rows = db.prepare(`
      SELECT DISTINCT s.character_id
      FROM signups s
      JOIN raids r ON r.id = s.raid_id
      WHERE s.picked=1
        AND r.difficulty = ?
        AND r.loot_type IN ('unsaved','vip')
        AND r.datetime BETWEEN ? AND ?
    `).all(String(target.difficulty), s, e);

    return new Set(rows.map(r => r.character_id));
  },

  isCharPickedElsewhere(character_id, raid_id) {
    return this.isCharLockedForRaid(raid_id, character_id);
  },

  withdrawCharElsewhere(character_id, exceptRaidId) {
    const raids = db.prepare(`
      SELECT DISTINCT raid_id FROM signups
      WHERE character_id=? AND raid_id!=?
    `).all(character_id, exceptRaidId).map(r => r.raid_id);

    db.prepare(`DELETE FROM signups WHERE character_id=? AND raid_id!=?`).run(character_id, exceptRaidId);
    return raids;
  },

  getForUser(raid_id, user_id) {
    return db.prepare(`SELECT * FROM signups WHERE raid_id=? AND user_id=?`).get(raid_id, user_id);
  },
  getForRaidChar(raid_id, character_id) {
    return db.prepare(`SELECT * FROM signups WHERE raid_id=? AND character_id=?`).get(raid_id, character_id);
  },
  getById(id) {
    return db.prepare(`SELECT * FROM signups WHERE id=?`).get(id);
  },

  create(payload) {
    const st = db.prepare(`
      INSERT INTO signups (raid_id, user_id, character_id, role, slot, status, picked, lockout, note, signup_class, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?, ?, ?)
    `);
    const info = st.run(
      payload.raid_id,
      payload.user_id,
      payload.character_id,
      payload.role || null,
      payload.slot || null,
      payload.status || 'signed',
      payload.picked ? 1 : 0,
      payload.lockout || 'unsaved',
      payload.note || null,
      payload.signup_class || null,
      now(), now()
    );
    return { id: info.lastInsertRowid };
  },

  updateRoleSlot(id, role, slot) {
    db.prepare(`UPDATE signups SET role=?, slot=?, status='signed', updated_at=? WHERE id=?`)
      .run(role || null, slot || null, now(), id);
  },

  setPicked(id, flag) {
    db.prepare(`UPDATE signups SET picked=?, updated_at=? WHERE id=?`)
      .run(flag ? 1 : 0, now(), id);
  },

  setExclusivePick(raid_id, user_id, signup_id) {
    const tx = db.transaction(() => {
      db.prepare(`UPDATE signups SET picked=0, updated_at=? WHERE raid_id=? AND user_id=?`)
        .run(now(), raid_id, user_id);
      db.prepare(`UPDATE signups SET picked=1, updated_at=? WHERE id=?`)
        .run(now(), signup_id);
    });
    tx();
  },

  withdraw(raid_id, user_id) {
    db.prepare(`DELETE FROM signups WHERE raid_id=? AND user_id=?`).run(raid_id, user_id);
  },

  withdrawUserAll(raid_id, user_id) {
    db.prepare(`DELETE FROM signups WHERE raid_id=? AND user_id=?`).run(raid_id, user_id);
  }
};
