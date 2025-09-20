// src/lib/raidleads.js
import { CONFIG } from "./config.js";
import { Users } from "./db.js";
import { getClient } from "./bot.js";

/**
 * Liefert ausschließlich Mitglieder mit der RAIDLEAD_ROLE_ID.
 * Admins ohne Raidlead-Rolle werden NICHT zurückgegeben.
 */
export async function listRaidleadsFromGuild({ debug = false } = {}) {
  const roleId = process.env.RAIDLEAD_ROLE_ID;
  if (!roleId) {
    if (debug) console.warn("⚠️ RAIDLEAD_ROLE_ID fehlt in .env");
    return [];
  }

  const client = getClient();
  const guild = await client.guilds.fetch(CONFIG.guildId);

  // Cache füllen
  try { await guild.members.fetch(); } catch (e) { if (debug) console.warn("members.fetch():", e?.message || e); }
  try { await guild.roles.fetch(); } catch (e) { if (debug) console.warn("roles.fetch():", e?.message || e); }

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    if (debug) console.warn(`⚠️ Rolle ${roleId} nicht gefunden. Stimmt GUILD_ID & RAIDLEAD_ROLE_ID?`);
    return [];
  }

  if (debug) {
    console.log(`[raidleads] using role: ${role.name} (${role.id})`);
    console.log(`[raidleads] role.members.size = ${role.members.size}`);
  }

  const members = Array.from(role.members.values());
  const out = [];
  for (const m of members) {
    const id = m.user?.id || m.id;
    const username = m.user?.username || m.displayName || `user_${id}`;
    out.push({ id, username });
    try {
      Users.upsert({
        discord_id: id,
        username,
        avatar: m.user?.avatar || null,
        is_raidlead: 1,
      });
    } catch (e) {
      if (debug) console.warn("users upsert failed:", e?.message || e);
    }
  }

  // Dedup + sort
  const dedup = Object.values(
    out.reduce((acc, u) => { acc[u.id] = acc[u.id] ?? u; return acc; }, {})
  ).sort((a, b) => a.username.localeCompare(b.username));

  if (debug) console.log(`[raidleads] final count = ${dedup.length}`);
  return dedup;
}

/** Fallback: nur DB-Einträge, die als Raidlead markiert sind. */
export function listRaidleadsFromDb() {
  try {
    const all = Users.all?.() || [];
    return all
      .filter((u) => u.is_raidlead)
      .map((u) => ({ id: u.discord_id, username: u.username }))
      .sort((a, b) => a.username.localeCompare(b.username));
  } catch {
    return [];
  }
}

/** DEBUG: Rollenliste als Array {id, name, memberCount} */
export async function listAllRoles() {
  const client = getClient();
  const guild = await client.guilds.fetch(CONFIG.guildId);
  await guild.roles.fetch();
  return guild.roles.cache
    .map((r) => ({ id: r.id, name: r.name, memberCount: r.members?.size ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** DEBUG: Infos zur aktuell gesetzten RAIDLEAD_ROLE_ID */
export async function debugCurrentRaidleadRole() {
  const client = getClient();
  const guild = await client.guilds.fetch(CONFIG.guildId);
  await guild.members.fetch();
  await guild.roles.fetch();
  const roleId = process.env.RAIDLEAD_ROLE_ID || "";
  const role = roleId ? guild.roles.cache.get(roleId) : null;
  return {
    envRoleId: roleId || null,
    found: !!role,
    roleName: role?.name || null,
    memberCount: role?.members?.size ?? 0,
    sampleMembers: role ? Array.from(role.members.values()).slice(0, 20).map(m => ({
      id: m.user?.id || m.id,
      username: m.user?.username || m.displayName,
    })) : [],
  };
}
