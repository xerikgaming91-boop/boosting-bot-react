// src/lib/routes/users.routes.js
// Robuste Users + Characters API mit automatischer Schema-Erkennung.

import express from "express";
import { db } from "../db.js";

const router = express.Router();

/* ───────────────────────────── Helpers ───────────────────────────── */

function quoteIdent(name) {
  // Sicheres Quoting für SQLite Identifiers
  return `"${String(name).replace(/"/g, '""')}"`;
}

function listTables() {
  const rows = db
    .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view')")
    .all();
  return rows.map((r) => String(r.name));
}

function tableExists(name) {
  const row = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type IN ('table','view') AND lower(name)=lower(?)"
    )
    .get(name);
  return !!row;
}

function getColumns(tableName) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${quoteIdent(tableName)})`).all();
    const set = new Set(rows.map((r) => String(r.name).toLowerCase()));
    return set;
  } catch {
    return new Set();
  }
}

/* ── User-Tabelle heuristisch bestimmen ── */
function findUsersTable() {
  const names = listTables();

  // 1) Bevorzugte Namen
  const preferred = ["users", "user", "accounts", "members"];
  for (const p of preferred) if (names.some((n) => n.toLowerCase() === p)) return p;

  // 2) Heuristik: eine Tabelle, die Spalten wie 'discord_id' ODER 'username' hat
  for (const t of names) {
    const cols = getColumns(t);
    if (cols.size === 0) continue;
    const hasDiscordId = cols.has("discord_id");
    const hasUsername =
      cols.has("username") || cols.has("name") || cols.has("display_name");
    if (hasDiscordId || hasUsername) return t;
  }

  return null;
}

/* ── Character-Tabelle heuristisch bestimmen ── */
function findCharsTable() {
  const names = listTables();

  // 1) Bevorzugte Namen
  const preferred = ["characters", "chars", "wow_chars", "wowcharacters"];
  for (const p of preferred) if (names.some((n) => n.toLowerCase() === p)) return p;

  // 2) Heuristik: Tabelle mit (name|char_name|character_name) UND (user_id|owner_id|account_id)
  for (const t of names) {
    const cols = getColumns(t);
    if (cols.size === 0) continue;
    const hasName =
      cols.has("name") || cols.has("char_name") || cols.has("character_name");
    const hasUser =
      cols.has("user_id") || cols.has("owner_id") || cols.has("account_id");
    if (hasName && hasUser) return t;
  }

  return null;
}

/* ── Dynamic SELECTs bauen ── */
function buildUserSelectSQL(tableName) {
  const cols = getColumns(tableName);
  const has = (c) => cols.has(String(c).toLowerCase());
  const qTable = quoteIdent(tableName);

  // id-Quelle
  const idBase = has("discord_id") ? "discord_id" : has("id") ? "id" : "ROWID";

  const sel = [];
  sel.push(`${idBase} AS id`);

  const unameParts = [];
  if (has("username")) unameParts.push("username");
  if (has("name")) unameParts.push("name");
  if (has("display_name")) unameParts.push("display_name");
  if (has("discord_name")) unameParts.push("discord_name");
  if (has("discord_tag")) unameParts.push("discord_tag");
  const unameExpr =
    unameParts.length > 0
      ? `COALESCE(${unameParts.join(", ")}, 'User '||${idBase})`
      : `'User '||${idBase}`;
  sel.push(`${unameExpr} AS username`);

  if (has("email")) sel.push("email");
  sel.push(has("discord_id") ? "discord_id" : "NULL AS discord_id");
  sel.push(has("discord_name") ? "discord_name" : "NULL AS discord_name");
  sel.push(has("discord_tag") ? "discord_tag" : "NULL AS discord_tag");

  const flagCols = ["is_admin", "is_elevated", "is_raidlead", "is_booster", "is_customer"];
  for (const f of flagCols) {
    sel.push(has(f) ? `CAST(${f} AS INTEGER) AS ${f}` : `CAST(0 AS INTEGER) AS ${f}`);
  }

  return `SELECT ${sel.join(", ")} FROM ${qTable} ORDER BY ${idBase} ASC`;
}

function buildCharsSelectSQL(tableName, userParam = "?") {
  const cols = getColumns(tableName);
  const has = (c) => cols.has(String(c).toLowerCase());
  const qTable = quoteIdent(tableName);

  const nameExpr = ["name", "char_name", "character_name"].filter(has).join(", ");
  const classExpr = ["class", "char_class", "wowclass"].filter(has).join(", ");
  const specExpr = ["spec", "char_spec", "wowspec"].filter(has).join(", ");
  const realmExpr = ["realm", "char_realm", "server"].filter(has).join(", ");
  const regionExpr = ["region", "char_region"].filter(has).join(", ");
  const ilvlExpr = ["ilvl", "item_level", "char_ilvl"].filter(has).join(", ");
  const rioExpr = ["rio_score", "rio", "mythicplus"].filter(has).join(", ");
  const userIdExpr = ["user_id", "owner_id", "account_id"].filter(has).join(", ");

  const sel = [];
  sel.push((has("id") ? "id" : "ROWID") + " AS id");
  sel.push((nameExpr ? `COALESCE(${nameExpr})` : `'—'`) + " AS name");
  sel.push((classExpr ? `COALESCE(${classExpr})` : `NULL`) + " AS class");
  sel.push((specExpr ? `COALESCE(${specExpr})` : `NULL`) + " AS spec");
  sel.push((realmExpr ? `COALESCE(${realmExpr})` : `NULL`) + " AS realm");
  sel.push((regionExpr ? `COALESCE(${regionExpr})` : `NULL`) + " AS region");
  sel.push((ilvlExpr ? `COALESCE(${ilvlExpr})` : `NULL`) + " AS ilvl");
  sel.push((rioExpr ? `COALESCE(${rioExpr})` : `NULL`) + " AS rio_score");
  sel.push(has("wcl_url") ? "wcl_url" : "NULL AS wcl_url");
  sel.push(userIdExpr ? `COALESCE(${userIdExpr}) AS user_id` : "NULL AS user_id");

  const where = userIdExpr ? `WHERE COALESCE(${userIdExpr}) = ${userParam}` : `WHERE 1=0`;

  return `SELECT ${sel.join(", ")} FROM ${qTable} ${where} ORDER BY id ASC`;
}

/* ── High-level Reader ── */

function readAllUsers() {
  const t = findUsersTable();
  if (!t) return { rows: [], meta: { table: null } };
  const sql = buildUserSelectSQL(t);
  const rows = db.prepare(sql).all();
  return { rows, meta: { table: t } };
}

function readCharsForUser(userId) {
  const t = findCharsTable();
  if (!t) return { rows: [], meta: { table: null } };
  const sql = buildCharsSelectSQL(t, "?");
  const rows = db.prepare(sql).all(userId);
  return { rows, meta: { table: t } };
}

/* ───────────────────────────── Routes ───────────────────────────── */

// GET /api/admin/users
router.get("/admin/users", (_req, res) => {
  try {
    const { rows, meta } = readAllUsers();
    res.json({ ok: true, data: rows, table: meta.table });
  } catch (e) {
    res.status(500).json({ ok: false, error: "users_query_failed", reason: String(e?.message || e) });
  }
});

// GET /api/users (Alias)
router.get("/users", (_req, res) => {
  try {
    const { rows, meta } = readAllUsers();
    res.json({ ok: true, data: rows, table: meta.table });
  } catch (e) {
    res.status(500).json({ ok: false, error: "users_query_failed", reason: String(e?.message || e) });
  }
});

// GET /api/users/:id/characters
router.get("/users/:id/characters", (req, res) => {
  try {
    const uid = String(req.params.id);
    const { rows, meta } = readCharsForUser(uid);
    // data + chars zurückgeben (Frontend-Kompatibilität)
    res.json({ ok: true, data: rows, chars: rows, table: meta.table });
  } catch (e) {
    res.status(500).json({ ok: false, error: "chars_query_failed", reason: String(e?.message || e) });
  }
});

// Alias: /api/users/:id/chars
router.get("/users/:id/chars", (req, res) => {
  try {
    const uid = String(req.params.id);
    const { rows, meta } = readCharsForUser(uid);
    res.json({ ok: true, data: rows, chars: rows, table: meta.table });
  } catch (e) {
    res.status(500).json({ ok: false, error: "chars_query_failed", reason: String(e?.message || e) });
  }
});

export default router;
