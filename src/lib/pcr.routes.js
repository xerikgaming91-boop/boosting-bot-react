// src/lib/pcr.routes.js
import express from "express";
import crypto from "crypto";
import { db, Raids } from "./db.js";

const router = express.Router();

// Helpers
const pad = (n) => String(n).padStart(2, "0");
function parseDbDate(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d) ? null : d;
}
function diffToTeamsLabel(difficulty) {
  const d = String(difficulty || "").toLowerCase();
  if (d.startsWith("norm")) return "NM Teams";
  if (d.startsWith("hero")) return "HC Teams";
  if (d.startsWith("myth")) return "Mythic Teams";
  return "Teams";
}

/**
 * POST /api/raids/:id/pcr
 * Body: {
 *   pot: number (required),
 *   collector_id: string (required),
 *   advertiser?: string,
 *   include?: "picked" | "all",   // default "picked"
 *   shares?: { "<id_or_name>": number }, // optional
 *   extra_participants?: string[], // optional (e.g. ["Xemphy-Thrall"])
 *   trailing_comma?: boolean       // default true
 * }
 */
export default function createPcrRoutes({ ensureAuth }) {
  router.post("/api/raids/:id/pcr", ensureAuth, (req, res) => {
    try {
      const raidId = Number(req.params.id);
      const raid = Raids.get(raidId);
      if (!raid) return res.status(404).json({ ok: false, error: "raid_not_found" });

      const {
        pot,
        collector_id,
        advertiser,
        include = "picked",
        shares = {},
        extra_participants = [],
        trailing_comma = true,
      } = req.body || {};

      if (!pot || isNaN(Number(pot))) return res.status(400).json({ ok: false, error: "pot_required" });
      if (!collector_id) return res.status(400).json({ ok: false, error: "collector_id_required" });

      // 1) Zeilen 1–4: Datum/Uhrzeit, Teams-Label, Loot-Type
      const dt = parseDbDate(raid.datetime) || new Date();
      const line1 = `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}`;
      const line2 = `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      const line3 = diffToTeamsLabel(raid.difficulty);
      const line4 = String(raid.loot_type || "").toUpperCase();

      // 2) Teilnehmer aus Signups
      const baseRows = db
        .prepare(
          `
          SELECT s.user_id, s.picked,
                 c.name AS char_name, c.realm AS char_realm
          FROM signups s
          LEFT JOIN characters c ON c.id = s.character_id
          WHERE s.raid_id = ?
          ORDER BY s.role ASC, s.slot ASC, s.id ASC
        `
        )
        .all(raidId);

      const rows = String(include) === "all" ? baseRows : baseRows.filter((r) => Number(r.picked) === 1);

      // Label: bevorzugt Discord-ID, sonst Name-Realm
      const set = new Set();
      for (const r of rows) {
        const label =
          r.user_id ||
          (r.char_name ? `${r.char_name}${r.char_realm ? `-${r.char_realm}` : ""}` : null);
        if (label) set.add(String(label));
      }

      for (const x of extra_participants || []) if (x) set.add(String(x));

      // Collector sicherstellen
      set.add(String(collector_id));

      const participants = Array.from(set);

      // 3) Zeile 5: Pot
      const line5 = String(Number(pot));

      // 4) Zeile 6: Teilnehmerliste "<id_or_name>:<share>:"
      const list = participants
        .map((p) => {
          const share =
            shares && typeof shares[p] !== "undefined" && !isNaN(Number(shares[p]))
              ? Number(shares[p])
              : 1;
          return `${p}:${share}:`;
        })
        .join(",");
      const line6 = trailing_comma ? list + "," : list;

      // 5) Zeile 7: Advertiser optional
      const line7 = advertiser ? `|Adv| ${advertiser}` : "";

      // 6) Hash
      const raw = [line1, line2, line3, line4, line5, line6, line7].filter(Boolean).join("\n");
      const digest = crypto.createHash("md5").update(raw, "utf8").digest("hex").slice(0, 24);

      const lines = [line1, line2, line3, line4, line5, line6];
      if (line7) lines.push(line7);
      lines.push(digest);

      const pcr = lines.join("\n");

      res.json({
        ok: true,
        pcr,
        lines,
        participants,
        raid: {
          id: raid.id,
          title: raid.title,
          difficulty: raid.difficulty,
          loot_type: raid.loot_type,
          datetime: raid.datetime,
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e?.message || String(e) });
    }
  });

  return router;
}
