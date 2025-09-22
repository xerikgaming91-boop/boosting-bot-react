// src/lib/cycle.routes.js
import { db, Users } from "./db.js";

/**
 * Liefert für einen Raid die Teilnehmer (Roster + offene Anmeldungen) und
 * für jeden Teilnehmer alle ANDEREN Raids, in denen er/sie bereits GE-PICKT ist.
 *
 * Response-Form:
 * [
 *   {
 *     user_id: "1234567890",
 *     user_name: "DiscordName",
 *     entries: [
 *       {
 *         raid_id: 42,
 *         title: "Manaforge Heroic 8/8 VIP",
 *         datetime: "2025-09-22 14:00:00",
 *         role: "dps" | "tank" | "healer" | "lootbuddy",
 *         char_name: "Synbeam",
 *         char_class: "Shaman"
 *       },
 *       ...
 *     ]
 *   },
 *   ...
 * ]
 */
export default function registerCycleRoutes(app) {
  // kompatibel zu deinem Frontend: /api/raids/:id/cycle-assignments
  app.get("/api/raids/:id/cycle-assignments", async (req, res) => {
    try {
      const raidId = Number(req.params.id);
      if (!Number.isInteger(raidId)) {
        return res.status(400).json({ ok: false, error: "invalid id" });
      }

      // 1) Alle Teilnehmer dieses Raids (Roster + offene Anmeldungen)
      //    -> wir benötigen user_id; char_id nur für Anzeige
      const cols = detectSignupColumns();
      const charCol = cols.charCol || "character_id";

      const participants = db
        .prepare(
          `
          SELECT s.user_id, s.role, s.${charCol} AS character_id
          FROM signups s
          WHERE s.raid_id = ?
          GROUP BY s.user_id
        `
        )
        .all(raidId);

      if (!participants || participants.length === 0) {
        return res.json({ ok: true, data: [] });
      }

      // 2) Für alle Teilnehmer alle ANDEREN Raids holen, in denen sie GE-PICKT sind.
      const qPicked = db.prepare(
        `
        SELECT
          r.id AS raid_id,
          r.title,
          r.datetime,
          r.difficulty,
          r.loot_type,
          s.user_id,
          s.role,
          s.${charCol} AS character_id,
          COALESCE(c.name, NULL)  AS char_name,
          COALESCE(c.class, NULL) AS char_class
        FROM signups s
        JOIN raids r ON r.id = s.raid_id
        LEFT JOIN characters c ON c.id = s.${charCol}
        WHERE s.user_id = ?
          AND s.picked = 1           -- <<< NUR gepickt!
          AND r.id != ?              -- aktuellen Raid ausblenden
        ORDER BY r.datetime ASC
      `
      );

      const resultMap = new Map();
      for (const p of participants) {
        const list = qPicked.all(p.user_id, raidId).map((row) => ({
          raid_id: row.raid_id,
          title: row.title,
          datetime: row.datetime,
          role: normalizeRole(row.role),
          char_name: row.char_name || null,
          char_class: normalizeClass(row.char_class),
        }));

        // Discord-Anzeigename, falls vorhanden
        const uRec = Users.get(p.user_id);
        const user_name = uRec?.username || null;

        resultMap.set(String(p.user_id), {
          user_id: String(p.user_id),
          user_name,
          entries: list,
        });
      }

      const out = Array.from(resultMap.values());
      return res.json({ ok: true, data: out });
    } catch (e) {
      console.error("cycle-assignments error:", e);
      return res.status(500).json({ ok: false, error: "internal error" });
    }
  });

  // andere cycle-bezogene Routen können hier registriert bleiben/werden
}

/* ───────────────────────────── Helpers ───────────────────────────── */

function detectSignupColumns() {
  try {
    const rows = db.prepare(`PRAGMA table_info(signups)`).all();
    const cols = rows.map((r) => r.name);
    const hasCharacterId = cols.includes("character_id");
    const hasCharId = cols.includes("char_id");
    return {
      charCol: hasCharacterId ? "character_id" : hasCharId ? "char_id" : null,
    };
  } catch {
    return { charCol: "character_id" };
  }
}

function normalizeRole(r) {
  const v = String(r || "").toLowerCase();
  if (v === "heal") return "healer";
  if (v === "lb" || v === "lootbuddies") return "lootbuddy";
  return v || null;
}

function normalizeClass(c) {
  if (!c) return null;
  const s = String(c).trim();
  return s;
}
