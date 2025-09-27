// src/server/pick.routes.js
// Stellt /api/raids/:id/pick und /api/raids/:id/unpick bereit – ohne deine
// vorhandenen Routen zu verändern. Es wird nur das bestehende Embed aktualisiert.

import { db } from "../db.js"; // nutzt DEINE bestehende DB-Instanz
import {
  getSignupById,
  setExclusivePick,
  setPickedFlag,
} from "../signups.helpers.js";
// Wir rufen NUR das bestehende Embed-Update auf – KEIN Roster-Repost!
import { updateRaidMessage } from "../bot.js";

// Wenn du bereits ein ensureAuth hast, kannst du es injizieren.
// Hier optionaler Fallback, damit es keine Abhängigkeit zerreißt:
function fallbackEnsureAuth(req, res, next) {
  if (typeof req.isAuthenticated === "function") {
    return req.isAuthenticated() ? next() : res.status(401).json({ ok: false, error: "unauthorized" });
  }
  // Falls du kein Passport nutzt, einfach durchlassen:
  return next();
}

/**
 * Registriert die Pick/Unpick-Routen auf der bestehenden Express-App.
 * - kein Roster-Repost
 * - Embed wird aktualisiert (updateRaidMessage)
 * - Eintrag verschwindet aus "Signups" (picked=1)
 */
export function applyPickRoutes(app, ensureAuth = fallbackEnsureAuth) {
  // PICK
  app.post("/api/raids/:id/pick", ensureAuth, (req, res) => {
    try {
      const raidId = Number(req.params.id);
      const signupId = Number(req.body?.signup_id ?? req.body?.signupId ?? req.body?.id);
      if (!raidId || !signupId) return res.status(400).json({ ok: false, error: "missing_params" });

      const s = getSignupById(db, signupId);
      if (!s || Number(s.raid_id) !== raidId) {
        return res.status(404).json({ ok: false, error: "signup_not_found" });
      }

      // Exklusiv auf picked setzen (alle anderen Signups dieses Users in dem Raid depicken)
      setExclusivePick(db, s.raid_id, s.user_id, s.id);

      // Embed im bestehenden Post aktualisieren (kein Repost!)
      try { updateRaidMessage(s.raid_id); } catch (_) {}

      return res.json({ ok: true });
    } catch (err) {
      console.error("pick route error:", err);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });

  // UNPICK
  app.post("/api/raids/:id/unpick", ensureAuth, (req, res) => {
    try {
      const raidId = Number(req.params.id);
      const signupId = Number(req.body?.signup_id ?? req.body?.signupId ?? req.body?.id);
      if (!raidId || !signupId) return res.status(400).json({ ok: false, error: "missing_params" });

      const s = getSignupById(db, signupId);
      if (!s || Number(s.raid_id) !== raidId) {
        return res.status(404).json({ ok: false, error: "signup_not_found" });
      }

      setPickedFlag(db, s.id, 0);

      try { updateRaidMessage(s.raid_id); } catch (_) {}

      return res.json({ ok: true });
    } catch (err) {
      console.error("unpick route error:", err);
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });
}
