// src/server/cycle.routes.js
import express from "express";
import { db, Raids } from "./db.js";

/**
 * Lokale Helfer – identisch zur Logik im Server:
 */
const MIN_GAP_MINUTES = 90;

const pad = (n) => String(n).padStart(2, "0");
const fmtDateTime = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())} ${pad(
    x.getHours()
  )}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`;
};
function parseDbDate(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d) ? null : d;
}
function startOfCycle(dateLike) {
  const d = new Date(dateLike);
  const day = d.getDay(); // So=0 … Sa=6; Reset auf Mittwoch (3)
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const diff = (day - 3 + 7) % 7;
  start.setDate(start.getDate() - diff);
  return start;
}
function endOfCycle(dateLike) {
  const s = startOfCycle(dateLike);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

/**
 * Kern: Liefert pro User die anderen (zeitlich/zyklisch kollidierenden)
 * Raids, in denen er Pick/Signup hat – exakt im vom Frontend erwarteten Format.
 */
function buildCycleAssignmentsPayload(raidId) {
  const raid = Raids.get(raidId);
  if (!raid) throw Object.assign(new Error("not_found"), { status: 404 });

  const dt = parseDbDate(raid.datetime) || new Date();
  const sC = fmtDateTime(startOfCycle(dt));
  const eC = fmtDateTime(endOfCycle(dt));
  const winStart = fmtDateTime(new Date(dt.getTime() - MIN_GAP_MINUTES * 60000));
  const winEnd = fmtDateTime(new Date(dt.getTime() + MIN_GAP_MINUTES * 60000));

  // Alle Signups (Roster + offen) dieses Raids → user_ids
  const currentSignups = db
    .prepare(
      `
      SELECT DISTINCT s.user_id
      FROM signups s
      WHERE s.raid_id = ?
    `
    )
    .all(raidId);

  const userIds = Array.from(
    new Set(currentSignups.map((r) => String(r.user_id)).filter(Boolean))
  );
  if (!userIds.length) return [];

  // Andere Raids der betroffenen User innerhalb des Fensters / Cycle-Blocks
  const placeholders = userIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `
      SELECT s2.user_id,
             u.username AS user_name,
             r2.id       AS raid_id,
             r2.title    AS title,
             r2.datetime AS datetime,
             r2.difficulty,
             r2.loot_type,
             s2.role,
             c.name      AS char_name,
             c.class     AS char_class
      FROM signups s2
      JOIN raids r2             ON r2.id = s2.raid_id
      LEFT JOIN users u         ON u.discord_id = s2.user_id
      LEFT JOIN characters c    ON c.id = s2.character_id
      WHERE s2.user_id IN (${placeholders})
        AND s2.raid_id != ?
        AND (
              (r2.difficulty = ? AND r2.loot_type IN ('unsaved','vip') AND r2.datetime BETWEEN ? AND ?)
           OR (r2.datetime BETWEEN ? AND ?)
        )
      ORDER BY r2.datetime ASC
    `
    )
    .all(...userIds, raidId, raid.difficulty, sC, eC, winStart, winEnd);

  // In das Frontend-Format mappen:
  // [{ user_id, user_name, entries: [{ raid_id, title, datetime, role, char_name, char_class }] }]
  const map = new Map();
  for (const r of rows) {
    const uid = String(r.user_id);
    if (!map.has(uid)) map.set(uid, { user_id: uid, user_name: r.user_name || "", entries: [] });
    map.get(uid).entries.push({
      raid_id: r.raid_id,
      title: r.title,
      datetime: r.datetime,
      role: (r.role || "").toString().toLowerCase(),
      char_name: r.char_name || "",
      char_class: r.char_class || null,
    });
  }
  return Array.from(map.values());
}

/**
 * Router-Factory
 * Hinweis: Wenn eure Pfade bereits mit '/api/...' beginnen (wie hier),
 * dann in server.js OHNE Präfix mounten:  app.use(createCycleRoutes({ ensureAuth }));
 */
export default function createCycleRoutes({ ensureAuth }) {
  const router = express.Router();

  // Offizieller Pfad, den das UI normalerweise nutzt:
  router.get("/api/raids/:id/cycle-assignments", ensureAuth, (req, res) => {
    try {
      const data = buildCycleAssignmentsPayload(Number(req.params.id));
      res.json({ ok: true, data });
    } catch (e) {
      res.status(e?.status || 500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  // Abwärtskompatible Aliase (falls ein älteres View sie aufruft)
  router.get("/api/raids/:id/assignments", ensureAuth, (req, res) => {
    try {
      const data = buildCycleAssignmentsPayload(Number(req.params.id));
      res.json({ ok: true, data });
    } catch (e) {
      res.status(e?.status || 500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  router.get("/api/raids/:id/other-picks", ensureAuth, (req, res) => {
    try {
      const data = buildCycleAssignmentsPayload(Number(req.params.id));
      res.json({ ok: true, data });
    } catch (e) {
      res.status(e?.status || 500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  return router;
}
