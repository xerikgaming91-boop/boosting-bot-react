// src/server/schedule.js
// Schreibt NUR die Listen in #current / #next mit Links auf die ECHTEN Raid-Textchannels.
// Es werden KEINE zusätzlichen Kanäle erstellt oder verschoben.

import { ChannelType } from "discord.js";
import { CONFIG } from "../config.js";
import { db, Users } from "../db.js";
import { getClient } from "../bot.js";

/* ───────── Zeit/Cycle ───────── */
const pad = (n) => String(n).padStart(2, "0");
const parseDb = (s) => (s ? new Date(String(s).replace(" ", "T")) : null);
const toSql = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function startOfCycle(dateLike) {
  const d = new Date(dateLike || Date.now());
  const wd = d.getDay(); // So=0..Sa=6, Mi=3
  const s = new Date(d);
  s.setHours(0,0,0,0);
  const diff = (wd - 3 + 7) % 7; // bis Mittwoch 00:00
  s.setDate(s.getDate() - diff);
  return s;
}
function endOfCycle(dateLike) {
  const s = startOfCycle(dateLike);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23,59,59,999);
  return e;
}
function ranges() {
  const now = new Date();
  const curS = startOfCycle(now), curE = endOfCycle(now);
  const nextS = new Date(curS); nextS.setDate(nextS.getDate() + 7);
  const nextE = new Date(curE); nextE.setDate(nextE.getDate() + 7);
  return {
    current: { start: curS, end: curE, startSql: toSql(curS), endSql: toSql(curE) },
    next:    { start: nextS, end: nextE, startSql: toSql(nextS), endSql: toSql(nextE) },
  };
}

/* ───────── Discord: Kategorie & Marker (#current/#next) ───────── */
async function getCategory(guild, wantName) {
  const byId = process.env.SCHEDULE_CATEGORY_ID || CONFIG.scheduleCategoryId || "";
  if (byId) {
    const cat = await guild.channels.fetch(byId).catch(() => null);
    if (cat && cat.type === ChannelType.GuildCategory) return cat;
  }
  const byName = process.env.SCHEDULE_CATEGORY_NAME || wantName || "Weekly Raid Schedule";
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === byName.toLowerCase()
  ) || null;
}
async function findMarker(guild, parent, kind /* "CURRENT"|"NEXT" */) {
  if (!parent) return null;
  const tag = `SCHEDULE:MARKER=${kind}`;

  // per Topic
  let ch = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.parentId === parent.id && (c.topic || "").includes(tag)
  );
  if (ch) return ch;

  // Namensvarianten zulassen (nur adoptieren, nicht erstellen)
  const preferName =
    kind === "CURRENT"
      ? (process.env.SCHEDULE_CURRENT_NAME || "💰-current-id")
      : (process.env.SCHEDULE_NEXT_NAME || "🐣-next-id");
  const variants = new Set([
    preferName,
    kind === "CURRENT" ? "💰-current-id" : "🐣-next-id",
    kind === "CURRENT" ? "current-id" : "next-id",
    kind === "CURRENT" ? "💰-current" : "🐣-next",
    kind === "CURRENT" ? "current" : "next",
  ]);
  for (const name of variants) {
    const f = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.parentId === parent.id && c.name === name
    );
    if (f) {
      try { await f.setTopic(tag); } catch {}
      return f;
    }
  }
  return null; // Marker fehlen -> nichts tun
}

/* ───────── Daten ───────── */
function listRaidsBetween(startSql, endSql) {
  try {
    return db.prepare(
      `SELECT r.*, u.username AS lead_name
         FROM raids r
    LEFT JOIN users u ON u.discord_id = r.created_by
        WHERE r.datetime BETWEEN ? AND ?
        ORDER BY r.datetime ASC`
    ).all(startSql, endSql) || [];
  } catch {
    return [];
  }
}

/* ───────── Rendering ───────── */
const WD = ["So","Mo","Di","Mi","Do","Fr","Sa"];
const up = s => String(s||"").toUpperCase();

function oneLine(raid) {
  const dt = parseDb(raid.datetime);
  const date = dt ? `${WD[dt.getDay()]} ${pad(dt.getDate())}.${pad(dt.getMonth()+1)} ${pad(dt.getHours())}:${pad(dt.getMinutes())}` : "TBA";
  const diff = up(raid.difficulty || "");
  const loot = up(raid.loot_type || "");
  const lead = raid.lead_name || "—";

  if (raid.channel_id) {
    return `• <#${raid.channel_id}> — **${diff} ${loot}** — ${date} — Lead: ${lead}`;
  } else {
    return `• *(kein Textchannel)* — **${diff} ${loot}** — ${date} — Lead: ${lead}`;
  }
}

function buildList(raids) {
  if (!raids.length) return "_(keine Raids in diesem Cycle)_";
  return raids.map(oneLine).join("\n");
}

async function replaceContent(channel, content) {
  if (!channel) return;
  try {
    const msgs = await channel.messages.fetch({ limit: 20 }).catch(() => null);
    if (msgs) {
      const mine = msgs.filter((m) => m.author?.id === channel.client.user.id);
      for (const [,m] of mine) { try { await m.delete(); } catch {} }
    }
    await channel.send({ content, allowedMentions: { parse: [] } });
  } catch (e) {
    console.warn("schedule.replaceContent:", e?.message || e);
  }
}

/* ───────── Public: Nur Listen in #current / #next schreiben ───────── */
export async function rebuildScheduleBoards() {
  const client = getClient();
  if (!client || !client.user) return;

  const guild = await client.guilds.fetch(CONFIG.guildId || process.env.GUILD_ID);
  const parent = await getCategory(guild, "Weekly Raid Schedule");
  if (!parent) return;

  const chCurrent = await findMarker(guild, parent, "CURRENT");
  const chNext    = await findMarker(guild, parent, "NEXT");
  if (!chCurrent && !chNext) return;

  const { current, next } = ranges();
  const raidsCur = listRaidsBetween(current.startSql, current.endSql);
  const raidsNext = listRaidsBetween(next.startSql, next.endSql);

  if (chCurrent) {
    const textCur =
      `**Aktueller Cycle** \`${toSql(current.start).slice(0,10)} – ${toSql(current.end).slice(0,10)}\`\n` +
      buildList(raidsCur);
    await replaceContent(chCurrent, textCur);
  }

  if (chNext) {
    const textNext =
      `**Nächster Cycle** \`${toSql(next.start).slice(0,10)} – ${toSql(next.end).slice(0,10)}\`\n` +
      buildList(raidsNext);
    await replaceContent(chNext, textNext);
  }
}
