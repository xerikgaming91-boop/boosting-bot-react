import { useEffect, useMemo, useState } from "react";
import UserCharsModal from "../components/UserCharsModal.jsx";

/**
 * Kleine Badge-Komponente
 */
function Badge({ children, intent = "default" }) {
  const cl =
    intent === "success"
      ? "bg-emerald-700/40 text-emerald-200 ring-emerald-500/30"
      : intent === "warn"
      ? "bg-amber-700/40 text-amber-200 ring-amber-500/30"
      : intent === "danger"
      ? "bg-rose-700/40 text-rose-200 ring-rose-500/30"
      : "bg-slate-700/40 text-slate-200 ring-white/10";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${cl}`}>
      {children}
    </span>
  );
}

/**
 * Initials/Fallback Avatar
 */
function Avatar({ name }) {
  const initials = (name || "?")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-slate-200 ring-1 ring-white/10">
      {initials}
    </div>
  );
}

/**
 * Kompakte Anzeige von 1–2 Chars als Chips
 */
function CharChip({ c }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-slate-800/70 px-2 py-0.5 text-xs ring-1 ring-white/10">
      <span className="truncate max-w-[9rem]">{c.name}</span>
      {typeof c.ilvl !== "undefined" && c.ilvl !== null ? (
        <span className="text-slate-400">{c.ilvl}</span>
      ) : null}
    </div>
  );
}

export default function UsersPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [users, setUsers] = useState([]);

  const [q, setQ] = useState("");
  const [charsModalOpen, setCharsModalOpen] = useState(false);
  const [charsModalUser, setCharsModalUser] = useState(null);

  async function load() {
    try {
      setLoading(true);
      setErr(null);
      // Schnell: reine Userliste (die Char-Details holt das Modal später)
      const res = await fetch(`/api/users`);
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "users fetch failed");
      setUsers(json.data || []);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return users;
    return users.filter((u) => {
      const hay =
        [
          u.username,
          u.discord_id,
          u.discord_name,
          u.discord_tag,
          u.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
      return hay.includes(needle);
    });
  }, [users, q]);

  function openCharsModal(user) {
    setCharsModalUser(user);
    setCharsModalOpen(true);
  }
  function closeCharsModal() {
    setCharsModalOpen(false);
    setCharsModalUser(null);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-slate-100">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Benutzerverwaltung</h1>
          <p className="text-sm text-slate-400">Verknüpfte Benutzer, Rollen &amp; Charaktere</p>
        </div>
        <div className="relative">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Suchen… (Name, Discord, …)"
            className="w-72 rounded-md border-0 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-400 ring-1 ring-white/10 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900">
        <div className="grid grid-cols-12 border-b border-white/10 bg-slate-900/60 px-4 py-3 text-xs uppercase tracking-wide text-slate-400">
          <div className="col-span-4">Benutzer</div>
          <div className="col-span-3">Discord</div>
          <div className="col-span-2">Rollen</div>
          <div className="col-span-3">Chars</div>
        </div>

        {loading && (
          <div className="px-4 py-12 text-center text-slate-400">Lade Benutzer…</div>
        )}
        {err && !loading && (
          <div className="px-4 py-6 text-rose-300">Fehler: {err}</div>
        )}
        {!loading && !err && filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-slate-400">Keine Benutzer gefunden.</div>
        )}

        <ul className="divide-y divide-white/5">
          {filtered.map((u) => (
            <li key={u.id || u.discord_id} className="grid grid-cols-12 gap-3 px-4 py-3">
              {/* Benutzer */}
              <div className="col-span-4 flex items-center gap-3">
                <Avatar name={u.username} />
                <div className="min-w-0">
                  <div className="truncate font-medium">{u.username || "N/A"}</div>
                  <div className="text-xs text-slate-400">
                    ID: {u.id || u.discord_id}
                  </div>
                </div>
              </div>

              {/* Discord */}
              <div className="col-span-3 min-w-0">
                <div className="truncate text-sm">
                  {u.discord_name || "@"}
                  {u.discord_tag ? (
                    <span className="text-slate-400">#{u.discord_tag}</span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-400">
                  ID: {u.discord_id || "—"}
                </div>
              </div>

              {/* Rollen */}
              <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                {u.is_raidlead ? <Badge>raidlead</Badge> : null}
                {u.is_elevated ? <Badge intent="success">elevated</Badge> : null}
                {u.is_admin ? <Badge intent="warn">admin</Badge> : null}
              </div>

              {/* Chars */}
              <div className="col-span-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  {/* Optional: wenn du /api/users?expand=chars verwendest, kannst du hier aus json.charsMap befüllen.
                      Wir zeigen als Demo einfach den Button; Preview kann später ergänzt werden. */}
                  <span className="text-xs text-slate-400 hidden sm:inline">
                    {/* Platz für kompakte Chips falls vorhanden */}
                  </span>
                </div>
                <div className="shrink-0">
                  <button
                    onClick={() => openCharsModal(u)}
                    className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 hover:bg-slate-700"
                  >
                    Chars anzeigen
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Modal */}
      <UserCharsModal open={charsModalOpen} onClose={closeCharsModal} user={charsModalUser} />
    </div>
  );
}
