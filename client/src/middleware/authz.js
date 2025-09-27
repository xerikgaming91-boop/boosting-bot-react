// src/middleware/authz.js
import fetch from "node-fetch";

/**
 * Stellt sicher, dass der User eingeloggt ist (Passport Session vorhanden).
 * Für API-Clients gibt's 401 JSON, für Browser-HTML ein Redirect auf /login.
 */
export function ensureAuthenticated(req, res, next) {
  const ok = typeof req.isAuthenticated === "function" ? req.isAuthenticated() : !!req.user;
  if (ok) return next();

  if (req.accepts("html")) {
    return res.redirect("/auth/login?next=" + encodeURIComponent(req.originalUrl || "/"));
  }
  return res.status(401).json({ error: "Not authenticated" });
}

/**
 * Liefert Rollen-IDs aus der Session (beim Login hinterlegt).
 */
export function getSessionRoleIds(req) {
  return Array.isArray(req.session?.discordRoleIds) ? req.session.discordRoleIds : [];
}

/**
 * Erlaubt Zugriff, wenn der User mindestens eine der übergebenen Rollen hat.
 */
export function ensureHasAnyRole(allowedRoleIds = []) {
  return (req, res, next) => {
    try {
      const userRoles = getSessionRoleIds(req);
      const ok = userRoles.some(r => allowedRoleIds.includes(r));
      if (!ok) {
        if (req.accepts("html")) return res.status(403).send("Forbidden");
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    } catch (err) {
      console.error("ensureHasAnyRole error:", err);
      return res.status(500).json({ error: "Role check failed" });
    }
  };
}

/**
 * Holt GuildMember-Rollen aus Discord und legt sie in der Session ab.
 * Call das im Auth-Callback nach erfolgreichem Login.
 */
export async function hydrateRolesIntoSession({ req, discordUserId }) {
  const guildId = process.env.GUILD_ID;
  const token = process.env.DISCORD_TOKEN;

  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bot ${token}` }
  });

  if (!resp.ok) {
    console.warn("Failed to fetch guild member:", await resp.text());
    req.session.discordRoleIds = [];
    return [];
  }

  const member = await resp.json();
  const roleIds = Array.isArray(member.roles) ? member.roles : [];
  req.session.discordRoleIds = roleIds;
  return roleIds;
}
