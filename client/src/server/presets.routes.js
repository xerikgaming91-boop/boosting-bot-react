// src/server/presets.routes.js
import express from "express";

/**
 * Raid-Size Presets (2/1/7/…)
 * Endpunkte sind additiv; es wird nichts bestehendes überschrieben.
 *
 * Erwartet, dass der aufrufende Server:
 *  - eine SQLite-Instanz `db` (better-sqlite3) übergibt,
 *  - eine Auth-Middleware `ensureAuth` bereitstellt (User muss eingeloggt sein).
 *
 * Tabellen:
 *   raid_presets (neu, separat via DB-Setup angelegt)
 *
 * Felder:
 *   id, name, tanks, healers, dps, lootbuddies, created_by, created_at
 */
export default function createPresetRoutes({ db, ensureAuth }) {
  const router = express.Router();

  // Liste aller Presets
  router.get("/api/presets", ensureAuth, (req, res) => {
    const rows = db
      .prepare(`
        SELECT id, name, tanks, healers, dps, lootbuddies, created_by, created_at
        FROM raid_presets
        ORDER BY created_at DESC, id DESC
      `)
      .all();
    res.json({ ok: true, data: rows });
  });

  // Preset anlegen
  router.post("/api/presets", ensureAuth, (req, res) => {
    const { name, tanks = 0, healers = 0, dps = 0, lootbuddies = 0 } = req.body || {};
    if (!name || String(name).trim() === "") {
      return res.status(400).json({ ok: false, error: "name_required" });
    }
    const st = db.prepare(`
      INSERT INTO raid_presets (name, tanks, healers, dps, lootbuddies, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = st.run(
      String(name).trim(),
      ~~tanks,
      ~~healers,
      ~~dps,
      ~~lootbuddies,
      req.user?.id ?? null // discord_id oder interne user-id (je nach Setup)
    );
    return res.json({ ok: true, id: info.lastInsertRowid });
  });

  // Preset aktualisieren
  router.put("/api/presets/:id", ensureAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "invalid_id" });

    const cur = db.prepare(`SELECT * FROM raid_presets WHERE id = ?`).get(id);
    if (!cur) return res.status(404).json({ ok: false, error: "not_found" });

    const {
      name = cur.name,
      tanks = cur.tanks,
      healers = cur.healers,
      dps = cur.dps,
      lootbuddies = cur.lootbuddies,
    } = req.body || {};

    db.prepare(
      `UPDATE raid_presets
       SET name = ?, tanks = ?, healers = ?, dps = ?, lootbuddies = ?
       WHERE id = ?`
    ).run(String(name).trim(), ~~tanks, ~~healers, ~~dps, ~~lootbuddies, id);

    return res.json({ ok: true });
  });

  // Preset löschen
  router.delete("/api/presets/:id", ensureAuth, (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, error: "invalid_id" });

    const info = db.prepare(`DELETE FROM raid_presets WHERE id = ?`).run(id);
    if (!info.changes) return res.status(404).json({ ok: false, error: "not_found" });

    return res.json({ ok: true });
  });

  return router;
}
