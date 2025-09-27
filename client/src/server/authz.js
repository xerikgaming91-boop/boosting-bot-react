// client/src/server/authz.js
// Einfache Rollenprüfungen auf Basis von req.user.{role|roles} (z. B. aus Passport/Session)

const ROLE_RANK = {
  guest: 0,      // nicht eingeloggt
  member: 1,
  raidlead: 2,
  admin: 3,
};

// Ermittelt den "höchsten" Rang aus möglichen Quellen
function getUserRank(req) {
  // Variante A: einzelne Rolle als String (z. B. req.user.role = "admin")
  const single = req?.user?.role?.toLowerCase?.();
  if (single && ROLE_RANK[single] !== undefined) return ROLE_RANK[single];

  // Variante B: mehrere Rollen (z. B. req.user.roles = ["member","raidlead"])
  const many = Array.isArray(req?.user?.roles) ? req.user.roles.map(r => String(r).toLowerCase()) : [];
  let rank = 0;
  for (const r of many) if (ROLE_RANK[r] !== undefined) rank = Math.max(rank, ROLE_RANK[r]);
  return rank;
}

// Middleware: benötigt mind. diese Rolle
export function requireRole(minRole = "member") {
  const need = ROLE_RANK[minRole] ?? ROLE_RANK.member;
  return function (req, res, next) {
    if (!req.isAuthenticated?.() || !req.user) {
      // nicht eingeloggt
      return res.status(401).json({ ok: false, error: "unauthorized", login: "/auth/discord" });
    }
    const have = getUserRank(req);
    if (have < need) {
      return res.status(403).json({ ok: false, error: "forbidden", need: minRole });
    }
    next();
  };
}
