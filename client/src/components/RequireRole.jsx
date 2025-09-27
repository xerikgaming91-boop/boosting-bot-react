// client/src/components/RequireRole.jsx
import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

const ROLE_RANK = { guest: 0, member: 1, raidlead: 2, admin: 3 };

export default function RequireRole({ minRole = "member", children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, user: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me", { credentials: "include" });
        if (!alive) return;
        if (res.status === 401) {
          setState({ loading: false, user: null });
          return;
        }
        const data = await res.json();
        setState({ loading: false, user: data?.user ?? null });
      } catch {
        setState({ loading: false, user: null });
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state.loading) return null; // oder ein Spinner

  const user = state.user;
  if (!user) {
    // nicht eingeloggt → zur Login-Seite mit Rücksprung
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  const roles = (user.roles || (user.role ? [user.role] : [])).map(r => String(r).toLowerCase());
  const have = roles.reduce((acc, r) => Math.max(acc, ROLE_RANK[r] ?? 0), 0);
  const need = ROLE_RANK[minRole] ?? ROLE_RANK.member;

  if (have < need) {
    return <Navigate to="/forbidden" replace />;
  }

  return children;
}
