// src/server/signups.helpers.js
// Kleine, eigenständige Helfer rund um Signups/Picks.
// Nichts in deinen bestehenden Dateien wird überschrieben.

export function getSignupById(db, id) {
  return db.prepare("SELECT * FROM signups WHERE id = ?").get(id);
}

export function getRaidById(db, id) {
  return db.prepare("SELECT * FROM raids WHERE id = ?").get(id);
}

/**
 * Setzt einen Signup exklusiv auf picked=1 und alle anderen Signups des gleichen
 * Users in dem gleichen Raid auf picked=0. (Kein Repost, nur Flags)
 */
export function setExclusivePick(db, raidId, userId, signupId) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const tx = db.transaction(() => {
    db.prepare(
      "UPDATE signups SET picked = 0, updated_at = ? WHERE raid_id = ? AND user_id = ?"
    ).run(now, raidId, userId);

    db.prepare(
      "UPDATE signups SET picked = 1, status = 'picked', updated_at = ? WHERE id = ?"
    ).run(now, signupId);
  });
  tx();
}

/** Einfaches Flag setzen (für Unpick) */
export function setPickedFlag(db, signupId, flag) {
  db.prepare(
    "UPDATE signups SET picked = ?, status = CASE WHEN ? = 1 THEN 'picked' ELSE 'open' END, updated_at = datetime('now') WHERE id = ?"
  ).run(flag ? 1 : 0, flag ? 1 : 0, signupId);
}
