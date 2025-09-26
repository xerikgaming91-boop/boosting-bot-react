// src/lib/routes/users.routes.js
// Robuste Users + Characters API:
// - nutzt bevorzugt Characters.listByUser(uid) aus dem DB-Modul,
// - fallback auf dynamische Schema-Erkennung (PRAGMA),
// - liefert bei Charakteren IMMER { data: rows, chars: rows } (Frontend-kompatibel),
// - stellt Aliase /api/users/:id/chars und /api/admin/users/:id/characters bereit,
// - optional: ?expand=chars → liefert bei /api/users pro User die Char-Liste mit.

import express from "express";
import { db, Characters } from "../db.js";

const router = express.Router();

/* ───────────────────────────── Helpers ───────────────────────────── */

function qIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function listTables() {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')")
    .all();
  return rows.map((r) => String(r.name));
}

function getColumns(tableName) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${qIdent(tableName)})`).all();
    return new Set(rows.map((r) => String(r.name).toLowerCase()));
  } catch {
    return new Set();
  }
}

/* ── User-Tabelle heuristisch bestimmen ── */
function findUsersTable() {
  const names = listTables();

  const preferred = ["users", "user", "accounts", "members"];
  for (const p of preferred) if (names.some((n) => n.toLowerCase() === p)) return p;

  for (const t of names) {
    const cols = getColumns(t);
    if (!cols.size) continue;
    if (cols.has("discord_id") || cols.has("username") || cols.has("name") || cols.has("display_name")) {
      return t;
    }
  }
  return null;
}

/* ── Charakter-Tabelle heuristisch bestimmen ── */
function findCharsTable() {
  const names = listTables();

  const preferred = ["characters", "chars", "wow_chars", "wowcharacters"];
  for (const p of preferred) if (names.some((n) => n.toLowerCase() === p)) return p;

  for (const t of names) {
    const cols = getColumns(t);
    if (!cols.size) continue;
    const hasName  = cols.has("name") || cols.has("char_name") || cols.has("character_name");
    const hasUser  = cols.has("user_id") || cols.has("owner_id") || cols.has("account_id");
    if (hasName && hasUser) return t;
  }
  return null;
}

/* ── Dynamic SELECTs ── */
function buildUserSelectSQL(tableName) {
  const cols = getColumns(tableName);
  const has = (c) => cols.has(String(c).toLowerCase());
  const t = qIdent(tableName);

  const idBase = has("discord_id") ? "discord_id" : has("id") ? "id" : "ROWID";

  const sel = [];
  sel.push(`${idBase} AS id`);

  const unameParts = [];
  if (has("username")) unameParts.push("username");
  if (has("name")) unameParts.push("name");
  if (has("display_name")) unameParts.push("display_name");
  if (has("discord_name")) unameParts.push("discord_name");
  if (has("discord_tag")) unameParts.push("discord_tag");
  const unameExpr = unameParts.length
    ? `COALESCE(${unameParts.join(", ")}, 'User '||${idBase})`
    : `'User '||${idBase}`;
  sel.push(`${unameExpr} AS username`);

  if (has("email")) sel.push("email");
  sel.push(has("discord_id") ? "discord_id" : "NULL AS discord_id");
  sel.push(has("discord_name") ? "discord_name" : "NULL AS discord_name");
  sel.push(has("discord_tag") ? "discord_tag" : "NULL AS discord_tag");

  for (const f of ["is_admin", "is_elevated", "is_raidlead", "is_booster", "is_customer"]) {
    sel.push(has(f) ? `CAST(${f} AS INTEGER) AS ${f}` : `CAST(0 AS INTEGER) AS ${f}`);
  }

  return `SELECT ${sel.join(", ")} FROM ${t} ORDER BY ${idBase} ASC`;
}

function buildCharsSelectSQL(tableName) {
  const cols = getColumns(tableName);
  const has = (c) => cols.has(String(c).toLowerCase());
  const t = qIdent(tableName);

  const nameExpr   = ["name", "char_name", "character_name"].filter(has).join(", ");
  const classExpr  = ["class", "char_class", "wowclass"].filter(has).join(", ");
  const specExpr   = ["spec", "char_spec", "wowspec"].filter(has).join(", ");
  const realmExpr  = ["realm", "char_realm", "server"].filter(has).join(", ");
  const regionExpr = ["region", "char_region"].filter(has).join(", ");
  const ilvlExpr   = ["ilvl", "item_level", "char_ilvl"].filter(has).join(", ");
  const rioExpr    = ["rio_score", "rio", "mythicplus"].filter(has).join(", ");
  const userExpr   = ["user_id", "owner_id", "account_id"].filter(has).join(", ");

  const sel = [];
  sel.push((has("id") ? "id" : "ROWID") + " AS id");
  sel.push((nameExpr   ? `COALESCE(${nameExpr})`   : `'—'`) + " AS name");
  sel.push((classExpr  ? `COALESCE(${classExpr})`  : "NULL") + " AS class");
  sel.push((specExpr   ? `COALESCE(${specExpr})`   : "NULL") + " AS spec");
  sel.push((realmExpr  ? `COALESCE(${realmExpr})`  : "NULL") + " AS realm");
  sel.push((regionExpr ? `COALESCE(${regionExpr})` : "NULL") + " AS region");
  sel.push((ilvlExpr   ? `COALESCE(${ilvlExpr})`   : "NULL") + " AS ilvl");
  sel.push((rioExpr    ? `COALESCE(${rioExpr})`    : "NULL") + " AS rio_score");
  sel.push(has("wcl_url") ? "wcl_url" : "NULL AS wcl_url");
  sel.push(userExpr ? `COALESCE(${userExpr}) AS user_id` : "NULL AS user_id");

  const where = userExpr ? `WHERE COALESCE(${userExpr}) = ?` : `WHERE 1=0`;

  return `SELECT ${sel.join(", ")} FROM ${t} ${where} ORDER BY id ASC`;
}

/* ── High-level Reader ── */

function readAllUsers() {
  const t = findUsersTable();
  if (!t) return { rows: [], meta: { table: null } };
  const sql = buildUserSelectSQL(t);
  const rows = db.prepare(sql).all();
  return { rows, meta: { table: t } };
}

function readCharsForUser(uid) {
  // 1) Bevorzugt: DB-Modul (gleiche Logik wie /api/me/chars)
  try {
    if (Characters && typeof Characters.listByUser === "function") {
      const rows = Characters.listByUser(uid) || [];
      return { rows, meta: { source: "db-module" } };
    }
  } catch {
    // fallback
  }

  // 2) Fallback: dynamischer SQL-Reader
  const t = findCharsTable();
  if (!t) return { rows: [], meta: { table: null, source: "fallback-none" } };
  const sql = buildCharsSelectSQL(t);
  const rows = db.prepare(sql).all(uid);
  return { rows, meta: { table: t, source: "fallback-sql" } };
}

/* ───────────────────────────── Routes ───────────────────────────── */

// GET /api/admin/users → Liste aller Benutzer
router.get("/admin/users", (_req, res) => {
  try {
    const { rows, meta } = readAllUsers();
    res.json({ ok: true, data: rows, table: meta.table });
  } catch (e) {
    res.status(500).json({ ok: false, error: "users_query_failed", reason: String(e?.message || e) });
  }
});

// GET /api/users → Alias, optional mit expand=chars (liefert charsMap je User)
router.get("/users", (req, res) => {
  try {
    const { rows, meta } = readAllUsers();

    // Optional: ?expand=chars → für jedes user.id auch die Charaktere laden
    const expand = String(req.query.expand || "").toLowerCase();
    if (expand === "chars" || expand === "characters") {
      const charsMap = {};
      for (const u of rows) {
        const { rows: chars } = readCharsForUser(String(u.id));
        charsMap[String(u.id)] = chars;
      }
      return res.json({ ok: true, data: rows, table: meta.table, charsMap });
    }

    res.json({ ok: true, data: rows, table: meta.table });
  } catch (e) {
    res.status(500).json({ ok: false, error: "users_query_failed", reason: String(e?.message || e) });
  }
});

// GET /api/users/:id/characters → Charaktere eines Benutzers
router.get("/users/:id/characters", (req, res) => {
  try {
    const uid = String(req.params.id);
    const { rows, meta } = readCharsForUser(uid);
    // WICHTIG: beide Property-Namen zurückgeben (Kompatibilität)
    res.json({ ok: true, data: rows, chars: rows, meta });
  } catch (e) {
    res.status(500).json({ ok: false, error: "chars_query_failed", reason: String(e?.message || e) });
  }
});

// Alias: /api/users/:id/chars
router.get("/users/:id/chars", (req, res) => {
  try {
    const uid = String(req.params.id);
    const { rows, meta } = readCharsForUser(uid);
    res.json({ ok: true, data: rows, chars: rows, meta });
  } catch (e) {
    res.status(500).json({ ok: false, error: "chars_query_failed", reason: String(e?.message || e) });
  }
});

// **Neu**: Admin-Alias (manche UIs benutzen diesen Pfad)
router.get("/admin/users/:id/characters", (req, res) => {
  try {
    const uid = String(req.params.id);
    const { rows, meta } = readCharsForUser(uid);
    res.json({ ok: true, data: rows, chars: rows, meta });
  } catch (e) {
    res.status(500).json({ ok: false, error: "chars_query_failed", reason: String(e?.message || e) });
  }
});

export default router;
