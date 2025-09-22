// src/lib/cycle.routes.js
// Für jeden im aktuellen Raid gepickten User: andere gepickte Raids desselben Zyklus
// Liefert je User: { user_id, user_name, entries: [{raid_id, title, datetime, role}] }

import { db } from "./db.js";

/* ───── Zyklus (Mi 00:00:00 bis Di 23:59:59) ───── */
function cycleBoundsFromDate(date) {
  const d = new Date(date);
  const wd = d.getDay();            // 0 So … 3 Mi
  const diffToWed = (wd - 3 + 7) % 7;
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToWed);

  const end = new Date(start);
  end.setDate(end.getDate() + 6);   // Mi -> Di
  end.setHours(23, 59, 59, 999);

  const toSql = (x) =>
    `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")} ` +
    `${String(x.getHours()).padStart(2,"0")}:${String(x.getMinutes()).padStart(2,"0")}:${String(x.getSeconds()).padStart(2,"0")}`;

  return { startSql: toSql(start), endSql: toSql(end) };
}
function getCycleBounds(dtStr) {
  const dt = new Date(String(dtStr || "").replace(" ", "T"));
  return isNaN(+dt) ? cycleBoundsFromDate(new Date()) : cycleBoundsFromDate(dt);
}
const inPlaceholders = (n) => Array.from({ length: n }, () => "?").join(",");

/* ───── Kernabfrage ───── */
function getCycleAssignmentsForRaid(raidId) {
  // 1) Datum des Zielraids
  const raidRow = db.prepare(`SELECT id, datetime FROM raids WHERE id=?`).get(raidId);
  if (!raidRow) return [];

  const { startSql, endSql } = getCycleBounds(raidRow.datetime);

  // 2) Gepickte Signups in diesem Raid
  const pickedRows = db.prepare(`
    SELECT
      s.id           AS signup_id,
      s.role         AS role,
      s.raid_id      AS raid_id,
      s.picked       AS picked,
      s.user_id      AS s_user_id,
      s.character_id AS character_id,
      c.user_id      AS c_user_id
    FROM signups s
    LEFT JOIN characters c ON c.id = s.character_id
    WHERE s.raid_id=? AND s.picked=1
  `).all(raidId);

  if (pickedRows.length === 0) return [];

  // 3) user_keys bilden (COALESCE(s.user_id, c.user_id))
  const userKeys = [];
  for (const r of pickedRows) {
    const key = String(r.s_user_id || r.c_user_id || "");
    if (key) userKeys.push(key);
  }
  const uniqueKeys = Array.from(new Set(userKeys));
  if (!uniqueKeys.length) return [];

  // 4) Namen aus users holen (discord_id == user_key)
  let nameMap = new Map();
  try {
    const sqlU = `SELECT discord_id, username FROM users WHERE discord_id IN (${inPlaceholders(uniqueKeys.length)})`;
    const rowsU = db.prepare(sqlU).all(...uniqueKeys);
    nameMap = new Map(rowsU.map(r => [String(r.discord_id), r.username || String(r.discord_id)]));
  } catch {
    nameMap = new Map(uniqueKeys.map(k => [String(k), String(k)]));
  }

  // 5) Andere geplante (picked) Raids dieser user_keys im Zyklus (ohne aktuellen Raid)
  const sql = `
    SELECT
      s.raid_id                        AS raid_id,
      s.role                           AS role,
      s.picked                         AS picked,
      COALESCE(s.user_id, c.user_id)   AS user_key,
      r.title                          AS title,
      r.datetime                       AS datetime
    FROM signups s
    JOIN raids r ON r.id = s.raid_id
    LEFT JOIN characters c ON c.id = s.character_id
    WHERE s.picked=1
      AND r.datetime BETWEEN ? AND ?
      AND s.raid_id != ?
      AND COALESCE(s.user_id, c.user_id) IN (${inPlaceholders(uniqueKeys.length)})
    ORDER BY r.datetime ASC
  `;
  const otherRows = db.prepare(sql).all(startSql, endSql, raidId, ...uniqueKeys);

  // 6) Gruppieren pro user_key
  const grouped = new Map(uniqueKeys.map(k => [String(k), []]));
  for (const r of otherRows) {
    const uk = String(r.user_key);
    if (!grouped.has(uk)) grouped.set(uk, []);
    grouped.get(uk).push({ raid_id: r.raid_id, title: r.title, datetime: r.datetime, role: r.role });
  }

  // 7) Ergebnis
  return uniqueKeys.map(k => ({
    user_id: String(k),
    user_name: nameMap.get(String(k)) || String(k),
    entries: grouped.get(String(k)) || [],
  }));
}

/* ───── Routen ───── */
export default function registerCycleRoutes(app) {
  app.get("/api/raids/:id/cycle-assignments", (req, res) => {
    try {
      const raidId = Number(req.params.id);
      if (!Number.isFinite(raidId)) return res.status(400).json({ ok:false, error:"invalid_raid_id" });
      const data = getCycleAssignmentsForRaid(raidId);
      return res.json({ ok:true, data });
    } catch (err) {
      console.error("cycle-assignments error:", err);
      return res.status(500).json({ ok:false, error:"internal_error" });
    }
  });

  // Alias
  app.get("/api/raids/:id/conflicts", (req, res) => {
    try {
      const raidId = Number(req.params.id);
      if (!Number.isFinite(raidId)) return res.status(400).json({ ok:false, error:"invalid_raid_id" });
      const data = getCycleAssignmentsForRaid(raidId);
      return res.json({ ok:true, data });
    } catch (err) {
      console.error("conflicts error:", err);
      return res.status(500).json({ ok:false, error:"internal_error" });
    }
  });
}
