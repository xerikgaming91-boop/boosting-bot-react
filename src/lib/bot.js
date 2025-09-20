// src/lib/bot.js
import {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";

import { CONFIG } from "./config.js";
import { db, Users, Raids, Signups } from "./db.js";

/* =============================================================================
   Discord Client (Singleton)
============================================================================= */

let _client = null;
let _ready = false;

function ensureRequiredEnvForBot() {
  const miss = [];
  if (!process.env.DISCORD_TOKEN) miss.push("DISCORD_TOKEN");
  if (!CONFIG?.guildId && !process.env.GUILD_ID) miss.push("GUILD_ID");
  if (miss.length) console.warn("⚠️ Bot-ENV unvollständig:", miss.join(", "));
}

export function getClient() {
  if (_client) return _client;

  ensureRequiredEnvForBot();

  _client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
  });

  _client.once("ready", () => {
    _ready = true;
    console.log(`✅ Discord Bot eingeloggt als ${_client.user?.tag || "?"}`);
  });

  _client.on("error", (e) => console.error("Discord Client error:", e?.message || e));
  _client.on("shardError", (e) => console.error("Discord Shard error:", e?.message || e));

  const token = process.env.DISCORD_TOKEN;
  if (token) {
    _client.login(token).catch((e) => console.error("❌ Bot-Login fehlgeschlagen:", e?.message || e));
  } else {
    console.warn("⚠️ Kein DISCORD_TOKEN gesetzt – Bot-Features deaktiviert.");
  }

  wireUpInteractions(_client);
  return _client;
}

export async function startBot({ timeoutMs = 15000 } = {}) {
  getClient();
  if (_ready) return _client;
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Bot nicht ready (Timeout).")), timeoutMs);
    const tick = () => { if (_ready) { clearTimeout(t); resolve(); } else setTimeout(tick, 200); };
    tick();
  });
  return _client;
}
getClient();

/* =============================================================================
   Domain & Mapping
============================================================================= */

const CLASS_LIST = [
  "Warrior","Paladin","Hunter","Rogue","Priest",
  "Death Knight","Shaman","Mage","Warlock","Monk",
  "Druid","Demon Hunter","Evoker"
];

function rolesForClass(cls) {
  const map = {
    Warrior: ["Tank","DPS"],
    Paladin: ["Tank","Healer","DPS"],
    Hunter: ["DPS"],
    Rogue: ["DPS"],
    Priest: ["Healer","DPS"],
    "Death Knight": ["Tank","DPS"],
    Shaman: ["Healer","DPS"],
    Mage: ["DPS"],
    Warlock: ["DPS"],
    Monk: ["Tank","Healer","DPS"],
    Druid: ["Tank","Healer","DPS"],
    "Demon Hunter": ["Tank","DPS"],
    Evoker: ["Healer","DPS"],
  };
  return map[cls] || ["DPS"];
}

function bucketForRole(role) {
  const r = String(role || "").toLowerCase();
  if (r === "lootbuddy" || r === "lb" || r === "lootbuddies") return "lootbuddies";
  if (r === "tank") return "tanks";
  if (r === "healer" || r === "heal") return "healers";
  return "dps";
}

function mention(userId) {
  return userId ? `<@${userId}>` : "—";
}

function nowSql() { return new Date().toISOString().slice(0, 19).replace("T", " "); }

/* =============================================================================
   DB Helpers
============================================================================= */

function getUserCharacters(userId) {
  try {
    return db.prepare(
      `SELECT id,name,realm,region,class,spec,ilvl,wcl_url
         FROM characters
        WHERE user_id=?
        ORDER BY name`
    ).all(userId);
  } catch { return []; }
}

function getCharacter(charId) {
  try {
    return db.prepare(
      `SELECT id,user_id,name,realm,region,class,spec,ilvl,wcl_url
         FROM characters WHERE id=?`
    ).get(charId);
  } catch { return null; }
}

async function getSignups(raidId) {
  if (typeof Signups?.listByRaid === "function") return await Signups.listByRaid(raidId);
  return db.prepare(`SELECT * FROM signups WHERE raid_id=? ORDER BY id`).all(raidId);
}

function signupsColumns() {
  const rows = db.prepare(`PRAGMA table_info(signups)`).all();
  const cols = rows.map((c) => c.name);
  const charInfo = rows.find((r) => r.name === "character_id") || rows.find((r) => r.name === "char_id");
  return {
    hasCharId: cols.includes("character_id") || cols.includes("char_id"),
    charCol: cols.includes("character_id") ? "character_id" : (cols.includes("char_id") ? "char_id" : null),
    charNotNull: !!(charInfo && charInfo.notnull === 1),
    hasSignupClass: cols.includes("signup_class"),
    hasNote: cols.includes("note"),
    hasRole: cols.includes("role"),
    hasLockout: cols.includes("lockout"),
    hasPicked: cols.includes("picked"),
    hasStatus: cols.includes("status"),
    hasCreatedAt: cols.includes("created_at"),
    hasUpdatedAt: cols.includes("updated_at"),
  };
}

/* =============================================================================
   Guards (Doppel-/Cycle)
============================================================================= */

function toSqlDateTime(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// Mi 00:00 bis Di 23:59:59
function computeCycleRange(baseDateStr) {
  const base = baseDateStr ? new Date(baseDateStr.replace(" ", "T")) : new Date();
  const d = new Date(base.getTime());
  const day = d.getDay(); // 0=So .. 3=Mi
  const deltaToWed = (day >= 3) ? (day - 3) : (7 - (3 - day));
  const wed = new Date(d.getFullYear(), d.getMonth(), d.getDate() - deltaToWed, 0, 0, 0);
  const start = wed;
  const end = new Date(start.getTime() + (6*24*60*60*1000) + (23*60*60*1000) + (59*60*1000) + 59*1000);
  return { startSql: toSqlDateTime(start), endSql: toSqlDateTime(end) };
}

function isAlreadyPickedHere(raidId, characterId) {
  try {
    const cols = signupsColumns();
    if (!cols.hasCharId || !cols.hasPicked) return false;
    const row = db.prepare(
      `SELECT picked FROM signups WHERE raid_id=? AND ${cols.charCol}=? LIMIT 1`
    ).get(raidId, characterId);
    return row && Number(row.picked) === 1;
  } catch { return false; }
}

/**
 * 🔁 NEU: Cycle-Lock gilt **pro Schwierigkeit**.
 * Wenn der Charakter im aktuellen Mi→Di-Zeitraum bereits in **derselben Schwierigkeit**
 * gepickt ist, blockieren wir. Andere Schwierigkeiten bleiben erlaubt.
 */
function isCharLockedForCycle(raidId, characterId) {
  try {
    const raid = Raids.get ? Raids.get(raidId) : db.prepare(`SELECT * FROM raids WHERE id=?`).get(raidId);
    if (!raid) return false;

    const { startSql, endSql } = computeCycleRange(raid.datetime || null);
    const cols = signupsColumns();
    if (!cols.hasCharId || !cols.hasPicked) return false;

    // nur gleiche Schwierigkeit sperren
    const rows = db.prepare(
      `SELECT r.id AS raid_id
         FROM signups s
         JOIN raids r ON r.id = s.raid_id
        WHERE s.${cols.charCol}=? 
          AND s.picked=1
          AND r.difficulty = ?
          AND r.datetime BETWEEN ? AND ?`
    ).all(characterId, raid.difficulty || null, startSql, endSql);

    return !!(rows && rows.length);
  } catch { return false; }
}

function hasSignupInRaid(raidId, characterId, userId) {
  try {
    const cols = signupsColumns();
    if (!cols.hasCharId) return false;
    const row = db.prepare(
      `SELECT id FROM signups WHERE raid_id=? AND user_id=? AND ${cols.charCol}=? LIMIT 1`
    ).get(raidId, userId, characterId);
    return !!row;
  } catch { return false; }
}

/* =============================================================================
   Upsert Signup (mehrere Chars, keine Duplikate pro Char)
============================================================================= */
async function upsertSignup({ raidId, userId, characterId, role, saved, signupClass, note }) {
  const c = signupsColumns();

  // Booster → Klasse vom Charakter übernehmen, wenn nicht gesetzt
  if (!signupClass && characterId != null) {
    const ch = getCharacter(characterId);
    if (ch?.class) signupClass = ch.class;
  }

  // nur Duplikat des gleichen Chars (oder LB-Klasse) im selben Raid entfernen
  try {
    if (characterId != null && c.hasCharId) {
      db.prepare(`DELETE FROM signups WHERE raid_id=? AND ${c.charCol}=?`).run(raidId, characterId);
    } else if (role === "lootbuddy" && c.hasSignupClass) {
      db.prepare(`DELETE FROM signups WHERE raid_id=? AND user_id=? AND role='lootbuddy' AND signup_class IS ?`)
        .run(raidId, userId, signupClass || null);
    }
  } catch {}

  const fields = ["raid_id", "user_id"];
  const values = [raidId, userId];
  const placeholders = ["?", "?"];

  if (c.hasCharId) {
    const value = characterId != null ? characterId : (c.charNotNull ? 0 : null);
    fields.push(c.charCol); values.push(value); placeholders.push("?");
  }
  if (c.hasRole && role != null) { fields.push("role"); values.push(role); placeholders.push("?"); }
  if (c.hasLockout && saved != null) { fields.push("lockout"); values.push(saved); placeholders.push("?"); }
  if (c.hasSignupClass) { fields.push("signup_class"); values.push(signupClass || null); placeholders.push("?"); }
  if (c.hasNote) { fields.push("note"); values.push(note ?? ""); placeholders.push("?"); }
  if (c.hasPicked) { fields.push("picked"); values.push(0); placeholders.push("?"); }
  if (c.hasStatus) { fields.push("status"); values.push("signed"); placeholders.push("?"); }
  if (c.hasCreatedAt) { fields.push("created_at"); values.push(nowSql()); placeholders.push("?"); }
  if (c.hasUpdatedAt) { fields.push("updated_at"); values.push(nowSql()); placeholders.push("?"); }

  const sql = `INSERT INTO signups (${fields.join(",")}) VALUES (${placeholders.join(",")})`;
  db.prepare(sql).run(...values);
}

async function removeSignup(raidId, userId) {
  try { db.prepare(`DELETE FROM signups WHERE raid_id=? AND user_id=?`).run(raidId, userId); } catch {}
}

function listUserSignupsForRaid(raidId, userId, { onlyUnpicked = false } = {}) {
  try {
    const cols = signupsColumns();
    const cond = onlyUnpicked ? "AND picked=0" : "";
    const sql = `
      SELECT id, ${cols.charCol || "character_id"} AS character_id, role, signup_class, picked
      FROM signups
      WHERE raid_id=? AND user_id=? ${cond}
      ORDER BY id
    `;
    return db.prepare(sql).all(raidId, userId);
  } catch { return []; }
}

function getSignupById(signupId, userId) {
  try {
    const cols = signupsColumns();
    return db.prepare(
      `SELECT id, ${cols.charCol || "character_id"} AS character_id, role, signup_class, picked, user_id
         FROM signups WHERE id=? AND user_id=? LIMIT 1`
    ).get(signupId, userId);
  } catch { return null; }
}

function getSignupsByIds(ids, userId) {
  if (!ids.length) return [];
  try {
    const placeholders = ids.map(() => "?").join(",");
    const cols = signupsColumns();
    const sql = `
      SELECT id, ${cols.charCol || "character_id"} AS character_id, role, signup_class, picked, user_id
      FROM signups
      WHERE id IN (${placeholders}) AND user_id=?
      ORDER BY id
    `;
    return db.prepare(sql).all(...ids, userId);
  } catch { return []; }
}

function deleteSignupById(signupId, userId) {
  try {
    return db.prepare(`DELETE FROM signups WHERE id=? AND user_id=?`).run(signupId, userId).changes > 0;
  } catch { return false; }
}

/* =============================================================================
   Grouping & Embeds
============================================================================= */

function groupSignups(signups) {
  const buckets = { tanks: [], healers: [], dps: [], lootbuddies: [] };
  for (const s of signups) {
    const bucket = bucketForRole(s.role);
    const label = s.role === "lootbuddy" && s.signup_class
      ? `${mention(s.user_id)} (${s.signup_class})`
      : mention(s.user_id);
    buckets[bucket].push(label);
  }
  return buckets;
}

function fieldFor(title, arr) {
  const count = arr.length;
  const value = count ? arr.join("\n") : "keine";
  return { name: `${title} **(${count})**`, value, inline: true };
}

function buildTopEmbed(raid) {
  const when = raid.datetime ? `\`${raid.datetime}\`` : "`tba`";
  const lead = raid.created_by ? `<@${raid.created_by}>` : "—";
  const loot = (raid.loot_type || "").toUpperCase();
  return new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle(`${raid.title || "Raid"}`)
    .setDescription("Anmeldungen über Website / Buttons")
    .addFields(
      { name: "Datum", value: when, inline: true },
      { name: "Raid Leader", value: lead, inline: true },
      { name: "Loot Type", value: loot || "—", inline: true },
    )
    .setFooter({ text: `RID:${raid.id}` });
}

// ✅ Signups-Embed zeigt NUR ungepickte (picked=0)
async function buildSignupsEmbed(raidId) {
  const all = await getSignups(raidId);
  const unpicked = all.filter((s) => Number(s.picked) !== 1);
  const g = groupSignups(unpicked);
  return new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle("Signups")
    .addFields(
      fieldFor("🛡️ Tanks", g.tanks),
      fieldFor("✨ Healers", g.healers),
      fieldFor("⚔️ DPS", g.dps),
      fieldFor("💰 Lootbuddies", g.lootbuddies),
    )
    .setFooter({ text: `RID:${raidId}` });
}

// Roster (nur gepickte)
async function buildRosterEmbed(raidId) {
  let rows = [];
  try {
    const cols = signupsColumns();
    if (cols.hasPicked) {
      rows = db.prepare(`SELECT * FROM signups WHERE raid_id=? AND picked=1 ORDER BY id`).all(raidId);
    }
  } catch {}

  const g = groupSignups(rows);
  return new EmbedBuilder()
    .setColor(0x2f3136)
    .setTitle("Roster (geplant)")
    .addFields(
      fieldFor("🛡️ Tanks", g.tanks),
      fieldFor("✨ Healers", g.healers),
      fieldFor("⚔️ DPS", g.dps),
      fieldFor("💰 Lootbuddies", g.lootbuddies),
    )
    .setFooter({ text: `RID:${raidId}` });
}

function buildButtons(raidId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`raid-signup:${raidId}`).setStyle(ButtonStyle.Success).setLabel("Anmelden"),
      new ButtonBuilder().setCustomId(`raid-unsign:${raidId}`).setStyle(ButtonStyle.Danger).setLabel("Abmelden"),
      new ButtonBuilder().setCustomId(`raid-lootbuddy:${raidId}`).setStyle(ButtonStyle.Secondary).setLabel("Lootbuddy"),
    ),
  ];
}

function buildRaidMessage(raid) {
  return { embeds: [buildTopEmbed(raid)], components: buildButtons(raid.id) };
}

async function buildRaidMessageFull(raid) {
  return {
    embeds: [
      buildTopEmbed(raid),
      await buildRosterEmbed(raid.id),   // gepickte
      await buildSignupsEmbed(raid.id),  // ungepickte
    ],
    components: buildButtons(raid.id),
  };
}

/* =============================================================================
   Benachrichtigung an Raidlead bei UNSIGN von PICKED
============================================================================= */

async function notifyRaidleadPickedUnsign(raidId, byUserId, items, reason) {
  try {
    const raid = Raids.get ? await Raids.get(raidId) : db.prepare(`SELECT * FROM raids WHERE id=?`).get(raidId);
    if (!raid?.created_by) return;

    const client = getClient();
    if (!_ready) return;

    const leadUser = await client.users.fetch(String(raid.created_by)).catch(() => null);
    if (!leadUser) return;

    const when = raid.datetime ? `\`${raid.datetime}\`` : "`tba`";
    const title = raid.title || `Raid #${raid.id}`;

    const lines = items.map((s) => {
      if (s.character_id) {
        const ch = getCharacter(s.character_id);
        const chTxt = ch ? `${ch.name} (${ch.class}${ch.spec ? `/${ch.spec}` : ""})` : `Char#${s.character_id}`;
        return `• ${mention(byUserId)} — **${chTxt}** als **${(s.role || "").toUpperCase()}**`;
      } else if (s.role === "lootbuddy") {
        return `• ${mention(byUserId)} — **Lootbuddy** (${s.signup_class || "?"})`;
      }
      return `• ${mention(byUserId)} — **${(s.role || "signup").toUpperCase()}**`;
    });

    const msg =
      `**Abmeldung (PICKED)**\n` +
      `Raid: **${title}** ${when}\n` +
      `Von: ${mention(byUserId)}\n` +
      `${lines.join("\n")}\n` +
      (reason ? `**Grund:** ${reason}` : "");

    await leadUser.send({ content: msg }).catch(() => null);
  } catch (e) {
    console.warn("notifyRaidleadPickedUnsign:", e?.message || e);
  }
}

/* =============================================================================
   Public API: Channel & Messages
============================================================================= */

export async function createRaidChannel(raid) {
  const client = getClient();
  if (!_ready) throw new Error("Bot nicht ready");

  const guildId = CONFIG.guildId || process.env.GUILD_ID;
  const guild = await client.guilds.fetch(guildId);

  const name = buildChannelName(raid);
  const parentId = CONFIG.raidsCategoryId || process.env.RAIDS_CATEGORY_ID || null;

  const chan = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId || undefined,
    permissionOverwrites: [],
  });

  await ensureRaidMessageFirstPost(chan, raid);
  return chan.id;
}

export async function updateRaidMessage(raidId) {
  try {
    const raid = await Raids.get(raidId);
    if (!raid?.channel_id) return;

    const client = getClient();
    if (!_ready) return;

    const channel = await client.channels.fetch(raid.channel_id).catch(() => null);
    if (!channel) return;

    let msg = null;
    if (raid.message_id) {
      msg = await channel.messages.fetch(raid.message_id).catch(() => null);
    }

    if (!msg) {
      const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
      if (fetched) {
        msg = fetched
          .filter((m) => m.author?.id === getClient().user?.id)
          .find((m) => (m.embeds?.[0]?.footer?.text || "").includes(`RID:${raid.id}`)) || null;
        if (msg) {
          try { db.prepare("UPDATE raids SET message_id=? WHERE id=?").run(msg.id, raid.id); } catch {}
        }
      }
    }

    const payload = await buildRaidMessageFull(raid);

    if (msg) {
      await msg.edit({ ...payload, allowedMentions: { parse: ["users"] } });
    } else {
      const created = await channel.send({ ...payload, allowedMentions: { parse: ["users"] } });
      try { db.prepare("UPDATE raids SET message_id=? WHERE id=?").run(created.id, raid.id); } catch {}
    }
  } catch (e) {
    console.error("updateRaidMessage error:", e?.message || e);
  }
}

export async function postRaidAnnouncement(raid) {
  const client = getClient();
  if (!_ready) return;

  const channelId = raid?.channel_id || process.env.CHANNEL_ID || null;
  if (!channelId) return;

  const ch = await client.channels.fetch(channelId).catch(() => null);
  if (!ch) return;

  const payload = await buildRaidMessageFull(raid);
  const msg = await ch.send({ ...payload, allowedMentions: { parse: ["users"] } });
  return msg?.id || null;
}

export async function publishRoster(raidId) {
  // NICHT automatisch posten – nur die bestehende Nachricht enthält ein Roster-Embed.
  await updateRaidMessage(raidId);
}

export async function deleteGuildChannel(channelId) {
  try {
    if (!channelId) return { ok: true, info: "no channel id" };
    const client = getClient();
    const guild = await client.guilds.fetch(CONFIG.guildId || process.env.GUILD_ID);
    const ch = await guild.channels.fetch(channelId).catch(()=>null);
    if (ch) await ch.delete("Raid gelöscht");
    return { ok: true };
  } catch (e) {
    const msg = e?.message || String(e);
    if (e?.code === 50013) {
      console.warn(`⚠️ Missing Permissions to delete channel ${channelId}`);
      return { ok: false, error: "missing permissions" };
    }
    console.warn(`⚠️ deleteGuildChannel(${channelId}) failed:`, msg);
    return { ok: false, error: msg };
  }
}

/* =============================================================================
   Interactions
============================================================================= */

function wireUpInteractions(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      // ---------- Buttons ----------
      if (interaction.isButton()) {
        const [key, raidIdRaw] = String(interaction.customId || "").split(":");
        const raidId = Number(raidIdRaw) || null;
        if (!raidId || !key?.startsWith("raid-")) return;

        if (key === "raid-signup") {
          const allChars = getUserCharacters(interaction.user.id);

          // verfügbare Chars: nicht gepickt (hier/zyklus) und noch nicht in diesem Raid angemeldet
          const availableRows = allChars.filter((c) => {
            try {
              if (isAlreadyPickedHere(raidId, c.id)) return false;
              if (isCharLockedForCycle(raidId, c.id)) return false; // ← jetzt "pro Schwierigkeit"
              if (hasSignupInRaid(raidId, c.id, interaction.user.id)) return false;
              return true;
            } catch { return true; }
          });

          if (!availableRows.length) {
            await interaction.reply({
              ephemeral: true,
              content: "❌ Du hast aktuell keinen **verfügbaren** Charakter (bereits angemeldet/gepickt in dieser Schwierigkeit oder im Raid).",
            });
            return;
          }

          const menu = new StringSelectMenuBuilder()
            .setCustomId(`raid-choose-char:${raidId}`)
            .setPlaceholder("Wähle deinen Charakter …")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
              availableRows.slice(0, 25).map((c) => ({
                label: `${c.name} (${c.class}${c.spec ? `/${c.spec}` : ""})`,
                description: `${(c.realm || "").toUpperCase()}  ilvl:${c.ilvl || "-"}`,
                value: String(c.id),
              }))
            );

          await interaction.reply({
            ephemeral: true,
            content: "Wähle den Charakter für die Anmeldung:",
            components: [new ActionRowBuilder().addComponents(menu)],
          });
          return;
        }

        if (key === "raid-lootbuddy") {
          const menu = new StringSelectMenuBuilder()
            .setCustomId(`raid-choose-lbclass:${raidId}`)
            .setPlaceholder("Wähle deine Klasse als Lootbuddy …")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(CLASS_LIST.map((cls) => ({ label: cls, value: cls })));

          await interaction.reply({
            ephemeral: true,
            content: "Lootbuddy-Anmeldung: Wähle deine Klasse:",
            components: [new ActionRowBuilder().addComponents(menu)],
          });
          return;
        }

        if (key === "raid-unsign") {
          // Liste ALLER eigenen Signups (inkl. gepickter) – Mehrfachauswahl erlaubt
          const list = listUserSignupsForRaid(raidId, interaction.user.id, { onlyUnpicked: false });

          if (!list.length) {
            await interaction.reply({ ephemeral: true, content: "ℹ️ Du hast keine Anmeldungen für diesen Raid." });
            return;
          }

          const options = list.slice(0, 25).map((s) => {
            let label = "";
            if (s.character_id) {
              const ch = getCharacter(s.character_id);
              label = ch ? `${ch.name} (${ch.class}${ch.spec ? `/${ch.spec}` : ""})` : `Char#${s.character_id}`;
            } else if (s.role === "lootbuddy") {
              label = `Lootbuddy (${s.signup_class || "?"})`;
            } else {
              label = `${s.role || "signup"} (#${s.id})`;
            }
            if (Number(s.picked) === 1) label += " [PICKED]";

            return {
              label,
              description: s.role ? `Rolle: ${s.role}` : undefined,
              value: String(s.id), // signup-id
            };
          });

          const menu = new StringSelectMenuBuilder()
            .setCustomId(`raid-unsign-choose:${raidId}`)
            .setPlaceholder("Wähle Anmeldungen zum Abmelden … (PICKED erfordert Grund)")
            .setMinValues(1)
            .setMaxValues(Math.min(25, options.length))
            .addOptions(options);

          await interaction.reply({
            ephemeral: true,
            content: "Wähle die Anmeldungen, die du entfernen möchtest:",
            components: [new ActionRowBuilder().addComponents(menu)],
          });
          return;
        }

        return;
      }

      // ---------- Select-Menüs ----------
      if (interaction.isStringSelectMenu()) {
        const id = String(interaction.customId || "");

        // Booster-Char -> Rolle (mit Guards)
        if (id.startsWith("raid-choose-char:")) {
          const raidId = Number(id.split(":")[1]);
          const characterId = Number(interaction.values?.[0]) || null;
          if (!raidId || !characterId) return;

          if (isAlreadyPickedHere(raidId, characterId)) {
            await interaction.update({ content: "❌ Dieser Charakter ist in **diesem Raid** bereits gepickt.", components: [] });
            return;
          }
          if (isCharLockedForCycle(raidId, characterId)) {
            await interaction.update({ content: "❌ Dieser Charakter ist im aktuellen **Cycle in dieser Schwierigkeit** bereits gepickt.", components: [] });
            return;
          }
          if (hasSignupInRaid(raidId, characterId, interaction.user.id)) {
            await interaction.update({ content: "❌ Dieser Charakter ist in diesem Raid bereits **angemeldet**.", components: [] });
            return;
          }

          const ch = getCharacter(characterId);
          if (!ch) {
            await interaction.update({ content: "❌ Charakter nicht gefunden.", components: [] });
            return;
          }
          const roles = rolesForClass(ch.class);
          const roleMenu = new StringSelectMenuBuilder()
            .setCustomId(`raid-choose-role:${raidId}:${characterId}`)
            .setPlaceholder("Wähle die Rolle …")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(roles.map((r) => ({ label: r, value: r.toLowerCase() })));

          await interaction.update({
            content: `Char: **${ch.name} (${ch.class}${ch.spec ? `/${ch.spec}` : ""})**\nJetzt Rolle wählen:`,
            components: [new ActionRowBuilder().addComponents(roleMenu)],
          });
          return;
        }

        // Booster-Rolle -> Saved/Unsaved
        if (id.startsWith("raid-choose-role:")) {
          const [, raidIdStr, charIdStr] = id.split(":");
          const raidId = Number(raidIdStr);
          const characterId = Number(charIdStr);
          const role = String(interaction.values?.[0] || "dps").toLowerCase();

          const savedMenu = new StringSelectMenuBuilder()
            .setCustomId(`raid-choose-saved:${raidId}:${characterId}:${role}`)
            .setPlaceholder("Saved oder Unsaved?")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions([
              { label: "Unsaved", value: "unsaved" },
              { label: "Saved", value: "saved" },
            ]);

          await interaction.update({
            content: `Rolle: **${role.toUpperCase()}**\nBist du **Saved**? (danach kannst du eine *optionale* Notiz eingeben)`,
            components: [new ActionRowBuilder().addComponents(savedMenu)],
          });
          return;
        }

        // Booster-Saved gewählt -> Notiz-Modal
        if (id.startsWith("raid-choose-saved:")) {
          const [, raidIdStr, charIdStr, roleValue] = id.split(":");
          const raidId = Number(raidIdStr);
          const characterId = Number(charIdStr);
          const saved = String(interaction.values?.[0] || "unsaved");

          const modal = new ModalBuilder()
            .setCustomId(`raid-note:${raidId}:${characterId}:${roleValue}:${saved}`)
            .setTitle("Optionale Notiz");

          const noteInput = new TextInputBuilder()
            .setCustomId("note")
            .setLabel("Notiz (optional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200);

          modal.addComponents(new ActionRowBuilder().addComponents(noteInput));
          await interaction.showModal(modal);
          return;
        }

        // Lootbuddy: Klasse -> Notiz-Modal
        if (id.startsWith("raid-choose-lbclass:")) {
          const raidId = Number(id.split(":")[1]);
          const cls = interaction.values?.[0];
          if (!raidId || !cls) {
            await interaction.update({ content: "❌ Ungültige Auswahl.", components: [] });
            return;
          }

          const modal = new ModalBuilder()
            .setCustomId(`raid-note-lb:${raidId}:${cls}`)
            .setTitle("Optionale Notiz (Lootbuddy)");

          const noteInput = new TextInputBuilder()
            .setCustomId("note")
            .setLabel("Notiz (optional)")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200);

          modal.addComponents(new ActionRowBuilder().addComponents(noteInput));
          await interaction.showModal(modal);
          return;
        }

        // Abmelden: Auswahl der Einträge → evtl. Grund abfragen, wenn (mind.) 1 picked
        if (id.startsWith("raid-unsign-choose:")) {
          const raidId = Number(id.split(":")[1]);
          const selected = (interaction.values || []).map((v) => Number(v)).filter(Boolean);
          if (!selected.length) {
            await interaction.update({ content: "Keine Auswahl getroffen.", components: [] });
            return;
          }

          // Prüfen, ob gepickte dabei sind
          let hasPicked = false;
          try {
            const placeholders = selected.map(() => "?").join(",");
            const rows = db.prepare(
              `SELECT picked FROM signups WHERE id IN (${placeholders}) AND user_id=?`
            ).all(...selected, interaction.user.id);
            hasPicked = rows.some((r) => Number(r.picked) === 1);
          } catch {}

          if (hasPicked) {
            // Grund via Modal abfragen
            const modal = new ModalBuilder()
              .setCustomId(`raid-unsign-reason:${raidId}:${selected.join(",")}`)
              .setTitle("Grund für Abmeldung (Pflicht bei PICKED)");

            const reason = new TextInputBuilder()
              .setCustomId("reason")
              .setLabel("Bitte Grund angeben")
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMaxLength(500);

            modal.addComponents(new ActionRowBuilder().addComponents(reason));
            await interaction.showModal(modal);
            return;
          }

          // Keine gepickten → direkt löschen
          let removed = 0;
          for (const sid of selected) {
            if (deleteSignupById(Number(sid), interaction.user.id)) removed++;
          }

          await updateRaidMessage(raidId).catch(() => {});
          await interaction.update({
            content: `✅ ${removed} Anmeldung(en) entfernt.`,
            components: [],
          });
          return;
        }
      }

      // ---------- Modal-Submit ----------
      if (interaction.isModalSubmit()) {
        const id = String(interaction.customId || "");

        // Booster-Modal
        if (id.startsWith("raid-note:")) {
          const [, raidIdStr, charIdStr, roleValue, savedValue] = id.split(":");
          const raidId = Number(raidIdStr);
          const characterId = Number(charIdStr);
          const note = interaction.fields.getTextInputValue("note") || null;

          await interaction.deferReply({ ephemeral: true });

          if (isAlreadyPickedHere(raidId, characterId)) {
            await interaction.editReply({ content: "❌ Dieser Charakter ist in **diesem Raid** bereits gepickt." });
            return;
          }
          if (isCharLockedForCycle(raidId, characterId)) {
            await interaction.editReply({ content: "❌ Dieser Charakter ist im aktuellen **Cycle in dieser Schwierigkeit** bereits gepickt." });
            return;
          }
          if (hasSignupInRaid(raidId, characterId, interaction.user.id)) {
            await interaction.editReply({ content: "❌ Dieser Charakter ist in diesem Raid bereits **angemeldet**." });
            return;
          }

          await upsertSignup({
            raidId,
            userId: interaction.user.id,
            characterId,
            role: roleValue,
            saved: savedValue,
            signupClass: null,
            note,
          });

          await updateRaidMessage(raidId).catch(() => {});
          await interaction.editReply({ content: "✅ Angemeldet." });
          return;
        }

        // Lootbuddy-Modal
        if (id.startsWith("raid-note-lb:")) {
          const [, raidIdStr, cls] = id.split(":");
          const raidId = Number(raidIdStr);
          const note = interaction.fields.getTextInputValue("note") || null;

          await interaction.deferReply({ ephemeral: true });

          await upsertSignup({
            raidId,
            userId: interaction.user.id,
            characterId: null,
            role: "lootbuddy",
            saved: "unsaved",
            signupClass: cls,
            note,
          });

          await updateRaidMessage(raidId).catch(() => {});
          await interaction.editReply({
            content: `✅ Als **Lootbuddy (${cls})** angemeldet.`,
          });
          return;
        }

        // ❗ UNSIGN-GRUND (für gepickte Signups) + Benachrichtigung an Raidlead
        if (id.startsWith("raid-unsign-reason:")) {
          const [, raidIdStr, idsStr] = id.split(":");
          const raidId = Number(raidIdStr);
          const selectedIds = idsStr.split(",").map((x) => Number(x)).filter(Boolean);
          const reason = (interaction.fields.getTextInputValue("reason") || "").trim();

          await interaction.deferReply({ ephemeral: true });

          // Hol Details der ausgewählten Signups und filtere nur picked für Benachrichtigung
          const entries = getSignupsByIds(selectedIds, interaction.user.id);
          const pickedEntries = entries.filter((e) => Number(e.picked) === 1);

          // Grund protokollieren (in note mitschreiben), dann löschen
          try {
            const suffix = ` | [UNSIGN] ${reason}`;
            const stmt = db.prepare(`UPDATE signups SET note=COALESCE(note,'') || ? WHERE id=? AND user_id=?`);
            for (const sid of selectedIds) {
              try { stmt.run(suffix, sid, interaction.user.id); } catch {}
            }
          } catch {}

          let removed = 0;
          for (const sid of selectedIds) {
            if (deleteSignupById(Number(sid), interaction.user.id)) removed++;
          }

          // Raidlead benachrichtigen (nur wenn es gepickte darunter gab)
          if (pickedEntries.length > 0) {
            await notifyRaidleadPickedUnsign(raidId, interaction.user.id, pickedEntries, reason);
          }

          await updateRaidMessage(raidId).catch(() => {});
          await interaction.editReply({ content: `✅ ${removed} Anmeldung(en) mit Grund entfernt.` });
          return;
        }
      }
    } catch (e) {
      console.error("[interactionCreate] error:", e?.message || e);
      try {
        if (interaction?.replied || interaction?.deferred) {
          await interaction.followUp({ ephemeral: true, content: "Es ist ein Fehler aufgetreten." });
        } else {
          await interaction.reply({ ephemeral: true, content: "Es ist ein Fehler aufgetreten." });
        }
      } catch {}
    }
  });
}

/* =============================================================================
   Roles / Permissions
============================================================================= */

async function getGuild() {
  if (!_ready) await startBot();
  const gid = process.env.GUILD_ID || CONFIG.guildId;
  return getClient().guilds.fetch(gid);
}

export async function ensureMemberRaidleadFlag(discordUserId) {
  try {
    const guild = await getGuild();
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return;

    const raidleadRoleId = process.env.RAIDLEAD_ROLE_ID || "";
    const hasRole = raidleadRoleId ? member.roles.cache.has(raidleadRoleId) : false;

    const isOwner = guild.ownerId === member.id;
    const perms   = member.permissions;
    const isAdmin = perms?.has(PermissionsBitField.Flags.Administrator) || perms?.has(PermissionsBitField.Flags.ManageGuild);

    const isRaidlead = hasRole || isOwner || isAdmin ? 1 : 0;
    if (typeof Users?.setRaidlead === "function") {
      Users.setRaidlead(discordUserId, isRaidlead);
    }
  } catch (e) {
    console.warn("ensureMemberRaidleadFlag:", e?.message || e);
  }
}

export async function hasElevatedRaidPermissions(discordUserId) {
  try {
    const guild = await getGuild();
    const member = await guild.members.fetch(discordUserId).catch(() => null);
    if (!member) return false;
    const elevatedRoleId = process.env.ELEVATED_ROLE_ID || process.env.ELEVATGED_ROLE_ID || "";
    if (elevatedRoleId && member.roles.cache.has(elevatedRoleId)) return true;
    if (guild.ownerId === member.id) return true;
    const perms = member.permissions;
    if (perms?.has(PermissionsBitField.Flags.Administrator) || perms?.has(PermissionsBitField.Flags.ManageGuild)) return true;
    return false;
  } catch {
    return false;
  }
}

/* =============================================================================
   Channel Utilities
============================================================================= */

function buildChannelName(raid) {
  try {
    const dtStr = raid.datetime || "";
    const d = new Date(dtStr.replace(" ", "T"));
    const tag = ["So","Mo","Di","Mi","Do","Fr","Sa"][isNaN(d) ? 0 : (d.getDay()+6)%7] || "So";
    const hh = isNaN(d) ? "00" : String(d.getHours()).padStart(2,"0");
    const mm = isNaN(d) ? "00" : String(d.getMinutes()).padStart(2,"0");
    const diff = String(raid.difficulty || "Normal");
    const loot = String(raid.loot_type || "").toUpperCase() || "UNSAVED";
    return `${tag}-${diff}-${loot}-${hh}:${mm}`;
  } catch {
    const dt = (raid.datetime || "").replace(/[ :]/g, "-").replace(/--/g, "-");
    const diff = String(raid.difficulty || "n");
    const loot = String(raid.loot_type || "unsaved");
    const safe = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 90);
    return safe(`raid-${dt}-${diff}-${loot}`);
  }
}

async function ensureRaidMessageFirstPost(channel, raid) {
  const fetched = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (fetched) {
    const mine = fetched
      .filter((m) => m.author?.id === getClient().user?.id)
      .find((m) => (m.embeds?.[0]?.footer?.text || "").includes(`RID:${raid.id}`));
    if (mine) {
      const payload = await buildRaidMessageFull(raid);
      await mine.edit({ ...payload, allowedMentions: { parse: ["users"] } });
      try { db.prepare("UPDATE raids SET message_id=? WHERE id=?").run(mine.id, raid.id); } catch {}
      return mine;
    }
  }

  const payload = await buildRaidMessageFull(raid);
  const msg = await channel.send({ ...payload, allowedMentions: { parse: ["users"] } });
  try { db.prepare("UPDATE raids SET message_id=? WHERE id=?").run(msg.id, raid.id); } catch {}
  return msg;
}
