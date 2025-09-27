// src/server/roster.routes.js
import express from "express";

/**
 * Erwartet: req.params.raidId
 * Optional body: { ephemeral: boolean } (für spätere Erweiterungen)
 * Liefert: { ok: true, messageId, channelId }
 */
export default function createRosterRoutes({ db, discord }) {
  const router = express.Router();

  router.post("/api/raids/:raidId/post-roster", async (req, res) => {
    try {
      const raidId = req.params.raidId;

      // Raid + Signups laden
      const raid = db.prepare(`
        SELECT r.*, c.discord_channel_id as channelId
        FROM raids r
        LEFT JOIN raid_channels c ON c.raid_id = r.id
        WHERE r.id = ?
      `).get(raidId);

      if (!raid) {
        return res.status(404).json({ ok: false, error: "Raid not found" });
      }
      if (!raid.channelId) {
        return res.status(400).json({ ok: false, error: "No Discord channel linked for this raid" });
      }

      const signups = db.prepare(`
        SELECT s.*, u.discord_id AS userDiscordId, u.username AS userName, u.nickname AS guildNick,
               s.role as role, s.is_picked as picked
        FROM signups s
        LEFT JOIN users u ON u.id = s.user_id
        WHERE s.raid_id = ?
        ORDER BY s.is_picked DESC, s.created_at ASC
      `).all(raidId);

      // Formatter aufrufen
      const { embed, content } = buildRosterEmbed(raid, signups);

      // Discord posten
      const message = await discord.sendEmbedToChannel(raid.channelId, { content, embed });

      return res.json({ ok: true, messageId: message.id, channelId: raid.channelId });
    } catch (err) {
      console.error("post-roster error:", err);
      return res.status(500).json({ ok: false, error: "Internal error" });
    }
  });

  return router;
}

/**
 * Baut ein Embed ähnlich deinem Screenshot:
 * Titel mit Summen, danach Listenblöcke mit Mentions je Kategorie.
 */
function buildRosterEmbed(raid, signups) {
  // Rollen-Emojis (ggf. an eure Emojis anpassen)
  const EMOJI = {
    tank: "🛡️",
    heal: "💚",
    dps: "🗡️",
    gold: "🪙",
    picked: "✅",
    bench: "🧊",
  };

  // Spieler gruppieren
  const groups = {
    picked: [],
    heal: [],
    tank: [],
    dps: [],
    bench: [],
    gold: [],
  };

  for (const s of signups) {
    const mention = s.userDiscordId ? `<@${s.userDiscordId}>` : (s.guildNick || s.userName || "Unbekannt");
    if (s.picked) groups.picked.push(mention);
    else if (s.role === "healer") groups.heal.push(mention);
    else if (s.role === "tank") groups.tank.push(mention);
    else if (s.role === "gold") groups.gold.push(mention);
    else groups.dps.push(mention);
  }

  const counts = {
    tanks: groups.tank.length,
    heals: groups.heal.length,
    dps: groups.dps.length + groups.picked.filter(m => !groups.heal.includes(m) && !groups.tank.includes(m)).length, // robust fallback
    gold: groups.gold.length,
    picked: groups.picked.length,
    total: signups.length,
  };

  // Überschrift im Content (damit Mentions auch pingen)
  const contentTitle = `**Current Roster (${counts.total}) (${counts.picked}x ${EMOJI.picked} | ${counts.tanks}x 🛡️ | ${counts.heals}x 💚 | ${counts.dps}x 🗡️ | ${counts.gold}x 🪙)**`;

  const lines = [];

  const pushBlock = (emoji, title, arr) => {
    if (!arr.length) return;
    lines.push(`${emoji} **${title}**`);
    for (const m of arr) lines.push(m);
    lines.push(""); // Leerzeile
  };

  // Reihenfolge wie im Screenshot
  pushBlock(EMOJI.picked, "Picked", groups.picked);
  pushBlock("🛡️", "Tanks", groups.tank);
  pushBlock("💚", "Healer", groups.heal);
  pushBlock("🗡️", "DPS", groups.dps);
  pushBlock("🪙", "Gold/Buyer", groups.gold);

  // Embed
  const embed = {
    title: `Current Roster (${counts.total})`,
    description: lines.join("\n").trim(),
    color: 0x2b2d31,
    footer: { text: raid.title || `${raid.tag || ""} ${raid.difficulty || ""}`.trim() },
  };

  return { content: contentTitle, embed };
}
