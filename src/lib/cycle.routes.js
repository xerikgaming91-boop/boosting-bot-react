// src/lib/cycle.routes.js
// Additive Routen: liefert je gepicktem User im aktuellen Raid,
// in welchen ANDEREN Raids desselben Zyklus (Mi->Di) er noch eingeplant ist.
// Zusätzlich kann der Client damit Picks blocken, wenn zu nah beieinander.

import { db } from "./db.js";

/** Ermittelt Start/Ende des Zyklus (Mi 00:00:00 bis Di 23:59:59) für ein Datum. */
function getCycleBounds(dtStr) {
  // dtStr ist z.B. "2025-09-26 20:00:00" (lokal). Wir nehmen lokale Zeit an.
  const dt = new Date(dtStr.replace(" ", "T"));
  if (isNaN(+dt)) {
    // Fallback: heutiger Tag
    const now = new Date();
    return cycleBoundsFromDate(now);
  }
  return cycleBoundsFromDate(dt);
}

function cycleBoundsFromDate(date) {
  const d = new Date(date);
  // Wochentag: 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa
  const wd = d.getDay();
  // Wir wollen den Mittwoch der Woche
  // Differenz in Tagen vom aktuellen Tag bis Mi:
  // Wenn wd=3 (Mi) -> diffStart=0, sonst rückwärts bis Mi
  const diffToWed = (wd - 3 + 7) % 7; // wie viele Tage seit Mi vergangen
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToWed);

  // Ende ist Dienstag 23:59:59 der folgenden Woche
  const end = new Date(start);
  end.setDate(end.getDate() + 6); // Mi->Di: +6 Tage
  end.setHours(23, 59, 59, 999);

  // ISO-Strings im Format "YYYY-MM-DD HH:MM:SS" für SQLite
  const toSql = (x) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")} ` +
    `${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}:${String(x.getSeconds()).padStart(2, "0")}`;

  return { startSql: toSql(start), endSql: toSql(end) };
}

/** Hilfsfunktion: SQL IN-Placeholders für better-sqlite3 bauen */
function inPlaceholders(n) {
  return Array.from({ length: n }, () => "?").join(",");
}

/** Liefert pro (gepicktem) User im aktuellen Raid alle anderen geplanten Raids im Zyklus. */
function getCycleAssignmentsForRaid(raidId) {
  // 1) Datum des Raids holen
  const raidRow = db.prepare(`SELECT id, datetime FROM raids WHERE id = ?`).get(raidId);
  if (!raidRow) return [];

  const { startSql, endSql } = getCycleBounds(raidRow.datetime);

  // 2) Alle GEPICKTEN Signups dieses Raids (Bestimmung der User-Schlüssel)
  const pickedRows = db
    .prepare(
      `
      SELECT
        s.id            AS signup_id,
        s.role          AS role,
        s.raid_id       AS raid_id,
        s.picked        AS picked,
        s.discord_id    AS s_discord_id,
        s.user_id       AS s_user_id,
        s.character_id  AS character_id,
        c.user_id       AS c_user_id
      FROM signups s
      LEFT JOIN characters c ON c.id = s.character_id
      WHERE s.raid_id = ? AND s.picked = 1
    `
    )
    .all(raidId);

  if (pickedRows.length === 0) return [];

  // 3) User-Key pro Row bestimmen
  const userKeys = [];
  const rowsWithKey = pickedRows.map((r) => {
    const key =
      r.s_discord_id ||
      r.s_user_id ||
      r.c_user_id || // falls Booster über Character verknüpft
      null;
    if (key) userKeys.push(String(key));
    return { ...r, user_key: key ? String(key) : null };
  });

  const uniqueKeys = Array.from(new Set(userKeys));
  if (uniqueKeys.length === 0) return [];

  // 4) Alle anderen geplanten (picked) Raids der selben User im Zyklus (außer aktueller Raid)
  const sql = `
    SELECT
      s.raid_id             AS raid_id,
      s.role                AS role,
      s.picked              AS picked,
      COALESCE(s.discord_id, s.user_id, c.user_id) AS user_key,
      r.title               AS title,
      r.datetime            AS datetime
    FROM signups s
    JOIN raids r ON r.id = s.raid_id
    LEFT JOIN characters c ON c.id = s.character_id
    WHERE s.picked = 1
      AND r.datetime BETWEEN ? AND ?
      AND s.raid_id != ?
      AND user_key IN (${inPlaceholders(uniqueKeys.length)})
    ORDER BY r.datetime ASC
  `;
  const params = [startSql, endSql, raidId, ...uniqueKeys];
  const others = db.prepare(sql).all(...params);

  // 5) Gruppieren pro User-Key
  const map = new Map();
  for (const key of uniqueKeys) map.set(String(key), []);
  for (const row of others) {
    const uk = String(row.user_key);
    if (!map.has(uk)) map.set(uk, []);
    map.get(uk).push({
      raid_id: row.raid_id,
      title: row.title,
      datetime: row.datetime,
      role: row.role,
    });
  }

  // 6) Rückgabe-Format (username optional – wir geben nur user_id zurück)
  const result = [];
  for (const key of uniqueKeys) {
    result.push({
      user_id: key,
      entries: map.get(key) || [],
    });
  }
  return result;
}

/** Registriert die Routen am Express-App. */
export default function registerCycleRoutes(app) {
  // Bevorzugter Endpoint
  app.get("/api/raids/:id/cycle-assignments", (req, res) => {
    try {
      const raidId = Number(req.params.id);
      if (!Number.isFinite(raidId)) {
        return res.status(400).json({ ok: false, error: "invalid_raid_id" });
      }
      const data = getCycleAssignmentsForRaid(raidId);
      return res.json({ ok: true, data });
    } catch (err) {
      console.error("cycle-assignments error:", err);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // Fallback-Alias (gleicher Inhalt)
  app.get("/api/raids/:id/conflicts", (req, res) => {
    try {
      const raidId = Number(req.params.id);
      if (!Number.isFinite(raidId)) {
        return res.status(400).json({ ok: false, error: "invalid_raid_id" });
      }
      const data = getCycleAssignmentsForRaid(raidId);
      return res.json({ ok: true, data });
    } catch (err) {
      console.error("conflicts error:", err);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });
}
