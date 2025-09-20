// scripts/migrate-signups-nullable.js
// Macht character_id in "signups" NULL-fähig – ohne andere Spalten zu verlieren.
// Findet die SQLite-Datei automatisch oder nutzt --db <pfad> / ENV.

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// ---- 1) DB-Pfad ermitteln ---------------------------------------------------
function pickDbPath() {
  // 1) CLI-Arg: --db <path>
  const ix = process.argv.findIndex(a => a === "--db");
  if (ix >= 0 && process.argv[ix + 1]) {
    return path.resolve(process.cwd(), process.argv[ix + 1]);
  }
  // 2) ENV
  const envCand = process.env.SQLITE_DB || process.env.DATABASE_FILE || process.env.DB_PATH;
  if (envCand) return path.resolve(process.cwd(), envCand);
  // 3) Häufige Standardpfade (prüfe Reihenfolge)
  const candidates = [
    "data.sqlite",
    "db.sqlite",
    path.join("src", "data.sqlite"),
    path.join("server", "data.sqlite"),
    path.join("backend", "data.sqlite"),
  ];
  for (const c of candidates) {
    const p = path.resolve(process.cwd(), c);
    if (fs.existsSync(p)) return p;
  }
  // 4) Fallback (existiert evtl. nicht)
  return path.resolve(process.cwd(), "data.sqlite");
}

const DB_PATH = pickDbPath();

function die(msg) { console.error(`❌ ${msg}`); process.exit(1); }

// ---- 2) Backup anlegen ------------------------------------------------------
function backupDb(file) {
  if (!fs.existsSync(file)) die(`DB nicht gefunden: ${file}\n➡️  Starte mit: node scripts/migrate-signups-nullable.js --db <pfad/zur/data.sqlite>`);
  const dir = path.dirname(file);
  const base = path.basename(file, path.extname(file));
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const bak = path.join(dir, `${base}.bak.${ts}.sqlite`);
  fs.copyFileSync(file, bak);
  console.log(`✅ Backup erstellt: ${bak}`);
}

// ---- 3) Migration -----------------------------------------------------------
function run() {
  console.log(`📦 Verwende DB: ${DB_PATH}`);
  backupDb(DB_PATH);

  const db = new Database(DB_PATH);
  db.pragma("foreign_keys = OFF");

  try {
    const tbl = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='signups'`).get();
    if (!tbl?.sql) die(`Tabelle 'signups' nicht gefunden.`);

    const cols = db.prepare(`PRAGMA table_info(signups)`).all();
    const charCol = cols.find(c => c.name === "character_id") || cols.find(c => c.name === "char_id");
    if (!charCol) {
      console.log("ℹ️ Keine Spalte 'character_id'/'char_id' – keine Migration nötig.");
      db.pragma("foreign_keys = ON");
      return;
    }
    if (charCol.notnull === 0) {
      console.log("✅ 'character_id' ist bereits NULL-fähig – nichts zu tun.");
      db.pragma("foreign_keys = ON");
      return;
    }

    const originalCreate = tbl.sql.replace(/\n+/g, " ");
    const m = originalCreate.match(/^CREATE TABLE\s+["']?signups["']?\s*\((.*)\)\s*;?$/i);
    if (!m) die("Konnte CREATE TABLE signups nicht parsen.");
    const body = m[1];

    // Column-Defs auf Top-Level an Kommas splitten
    const parts = [];
    let depth = 0, buf = "";
    for (const ch of body) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { parts.push(buf.trim()); buf = ""; }
      else buf += ch;
    }
    if (buf.trim()) parts.push(buf.trim());

    const targetName = charCol.name; // character_id oder char_id
    const newParts = parts.map(def => {
      const nameMatch = def.match(/^[`"[]?([A-Za-z0-9_]+)[`"\]]?\s+/);
      if (!nameMatch) return def;
      const colName = nameMatch[1];
      if (colName !== targetName) return def;
      let changed = def.replace(/\bNOT\s+NULL\b/gi, "").replace(/\s+/g, " ").trim();
      console.log(`🔧 Spalte '${targetName}': NOT NULL entfernt`);
      return changed;
    });

    const newCreate = `CREATE TABLE signups (${newParts.join(", ")})`;

    // Migration (neue Tabelle -> Daten -> umbenennen)
    db.exec("BEGIN TRANSACTION;");
    db.exec(`ALTER TABLE signups RENAME TO signups__old;`);
    db.exec(newCreate);

    const newCols = db.prepare(`PRAGMA table_info(signups)`).all().map(c => c.name);
    const oldCols = cols.map(c => c.name);
    const common = oldCols.filter(c => newCols.includes(c));
    const insertSql = `
      INSERT INTO signups (${common.join(",")})
      SELECT ${common.join(",")}
      FROM signups__old;
    `;
    db.exec(insertSql);
    db.exec(`DROP TABLE signups__old;`);
    db.exec("COMMIT;");
    db.pragma("foreign_keys = ON");

    console.log("✅ Migration abgeschlossen: 'character_id' ist jetzt NULL-fähig.");
  } catch (e) {
    try { db.exec("ROLLBACK;"); } catch {}
    db.pragma("foreign_keys = ON");
    die(`Migration fehlgeschlagen: ${e.message || e}`);
  }
}

run();
