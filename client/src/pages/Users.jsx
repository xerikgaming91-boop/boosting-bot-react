// client/src/pages/Users.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

/* ---------- Klassen-Icons (gleich wie im Raid UI) ---------- */
const CLASS_ICON_FILE = {
  deathknight: "deathknight.png",
  demonhunter: "demonhunter.png",
  druid: "druid.png",
  evoker: "evoker.png",
  hunter: "hunter.png",
  mage: "mage.png",
  monk: "monk.png",
  paladin: "paladin.png",
  priest: "priest.png",
  rogue: "rogue.png",
  shaman: "shaman.png",
  warlock: "warlock.png",
  warrior: "warrior.png",
};
const CLASS_ICON_BASE_PRIMARY = "/icons/classes/64/";
const CLASS_ICON_BASE_FALLBACK = "/icons/classes/32/";

function normalizeClassName(raw) {
  if (!raw) return "";
  const s = String(raw).toLowerCase().trim().replace(/\s+/g, "");
  const map = { dk: "deathknight", deathnight: "deathknight", dh: "demonhunter" };
  return map[s] || s;
}

function ClassIcon({ klass, size = 18, title }) {
  if (!klass) return null;
  const file = CLASS_ICON_FILE[String(klass)];
  if (!file) return null;
  const [src, setSrc] = useState(CLASS_ICON_BASE_PRIMARY + file);
  return (
    <img
      src={src}
      onError={() => setSrc(CLASS_ICON_BASE_FALLBACK + file)}
      width={size}
      height={size}
      alt={String(klass)}
      title={title || String(klass)}
      className="inline-block rounded-sm align-[-3px]"
    />
  );
}

/* ---------- API Helpers ---------- */
async function apiGet(url) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const j = await r.json().catch(() => ({}));
  if (j && typeof j === "object" && "ok" in j) return j.data ?? j;
  return j;
}

/* ---------- Kleine UI ---------- */
const pill = "px-2 py-[3px] rounded-md text-[12px] font-medium bg-slate-700/60 text-slate-200";
const tag = "inline-flex items-center gap-1 px-2 py-[2px] rounded-md text-[12px] bg-slate-700/50 text-slate-200 ring-1 ring-slate-600/30";

function FlagPills({ user }) {
  const flags = [];
  if (user?.is_elevated) flags.push("elevated");
  if (user?.is_admin) flags.push("admin");
  if (user?.is_raidlead) flags.push("raidlead");
  if (user?.is_booster) flags.push("booster");
  if (user?.is_customer) flags.push("customer");
  if (flags.length === 0) return <span className="text-[12px] text-slate-400">–</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className={pill}>{f}</span>
      ))}
    </div>
  );
}

function CharBadge({ c }) {
  const k = normalizeClassName(c.class || c.char_class || c.wowclass || "");
  const name = c.name || c.char_name || c.character_name || "–";
  const realm = c.realm || c.char_realm || c.server || "";
  const ilvl = Number(c.ilvl || c.item_level || c.char_ilvl || 0);
  return (
    <span className={tag} title={`${name}${realm ? `-${realm}` : ""}${ilvl ? ` • ${ilvl} ilvl` : ""}`}>
      <ClassIcon klass={k} />
      <span className="truncate max-w-[140px]">{name}</span>
      {ilvl ? <span className="text-[11px] text-slate-300">• {ilvl}</span> : null}
    </span>
  );
}

/* ---------- Hauptseite ---------- */
export default function Users() {
  const [users, setUsers] = useState([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");

  // cache: userId -> characters[]
  const [chars, setChars] = useState({}); 
  const [loadingChars, setLoadingChars] = useState({}); // userId -> boolean

  // initial users laden
  useEffect(() => {
    let dead = false;
    (async () => {
      setBusy(true);
      setErr("");
      try {
        // versuche verschiedene bekannte Endpunkte
        let data = null;
        const tryUrls = [
          "/api/users?include=chars=1",
          "/api/admin/users",
          "/api/users",
        ];
        for (const u of tryUrls) {
          try {
            const res = await apiGet(u);
            if (Array.isArray(res?.data)) { data = res.data; break; }
            if (Array.isArray(res)) { data = res; break; }
            if (Array.isArray(res?.list)) { data = res.list; break; }
          } catch { /* try next */ }
        }
        if (!data) throw new Error("Keine Benutzerliste gefunden (API).");

        // falls API bereits characters liefert, in den Cache übernehmen
        const charCache = {};
        const mapped = data.map((u) => {
          const cu = { ...u };
          const cs = u.characters || u.chars || u.wowchars || null;
          if (Array.isArray(cs)) {
            charCache[String(u.id)] = cs;
          }
          return cu;
        });
        if (!dead) {
          setUsers(mapped);
          setChars((old) => ({ ...old, ...charCache }));
        }
      } catch (e) {
        if (!dead) setErr(String(e?.message || e));
      } finally {
        if (!dead) setBusy(false);
      }
    })();
    return () => { dead = true; };
  }, []);

  async function loadCharsForUser(userId) {
    const key = String(userId);
    if (loadingChars[key]) return;
    if (Array.isArray(chars[key])) return; // schon vorhanden
    setLoadingChars((m) => ({ ...m, [key]: true }));
    try {
      // mehrere mögliche API-Routen probieren
      const urls = [
        `/api/users/${key}/characters`,
        `/api/users/${key}/chars`,
        `/api/admin/users/${key}/characters`,
      ];
      let list = null;
      for (const u of urls) {
        try {
          const res = await apiGet(u);
          if (Array.isArray(res?.data)) { list = res.data; break; }
          if (Array.isArray(res)) { list = res; break; }
          if (Array.isArray(res?.list)) { list = res.list; break; }
        } catch { /* continue */ }
      }
      if (!list) list = []; // leer statt Fehler
      setChars((m) => ({ ...m, [key]: list }));
    } finally {
      setLoadingChars((m) => ({ ...m, [key]: false }));
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = [
        u.username, u.name, u.display_name, u.discord_name, u.discord_tag, u.discordId, u.id
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [users, query]);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <div className="text-[20px] font-semibold text-slate-100">Benutzerverwaltung</div>
          <div className="text-[13px] text-slate-400">Verknüpfte Benutzer, Rollen & Charaktere</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="h-8 px-3 rounded-md bg-slate-800/60 border border-slate-700 text-slate-100 text-sm"
            placeholder="Suchen… (Name, Discord, ID)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
      
        </div>
      </div>

      {busy ? <div className="text-slate-300">Lade Benutzer…</div> : null}
      {err ? <div className="text-rose-300">{err}</div> : null}

      {!busy && !err ? (
        <div className="rounded-xl bg-slate-800/60 ring-1 ring-slate-700/50">
          <div className="grid grid-cols-12 p-3 border-b border-slate-700/60 text-[12px] text-slate-300">
            <div className="col-span-3">Benutzer</div>
            <div className="col-span-3">Discord</div>
            <div className="col-span-3">Rollen</div>
            <div className="col-span-3">Chars</div>
          </div>

          <div className="divide-y divide-slate-700/60">
            {filtered.map((u) => {
              const key = String(u.id);
              const list = chars[key];
              return (
                <div key={key} className="grid grid-cols-12 gap-2 p-3 items-center">
                  {/* Benutzer */}
                  <div className="col-span-3">
                    <div className="text-slate-100 font-medium text-[14px]">{u.username || u.name || u.display_name || `User #${u.id}`}</div>
                    <div className="text-[12px] text-slate-400">ID: {u.id}</div>
                    {u.email ? <div className="text-[12px] text-slate-400 truncate">{u.email}</div> : null}
                  </div>

                  {/* Discord */}
                  <div className="col-span-3">
                    {u.discordId || u.discord_id ? (
                      <>
                        <div className="text-[14px] text-slate-100">@{u.discord_name || u.discord_tag || "—"}</div>
                        <div className="text-[12px] text-slate-400">ID: {u.discord_id || u.discordId}</div>
                      </>
                    ) : (
                      <div className="text-[12px] text-slate-400">nicht verknüpft</div>
                    )}
                  </div>

                  {/* Rollen */}
                  <div className="col-span-3">
                    <FlagPills user={u} />
                  </div>

                  {/* Chars */}
                  <div className="col-span-3">
                    {Array.isArray(list) ? (
                      list.length ? (
                        <div className="flex flex-wrap gap-1">
                          {list.map((c, i) => (<CharBadge key={`${key}-${i}`} c={c} />))}
                        </div>
                      ) : (
                        <span className="text-[12px] text-slate-400">keine Charaktere</span>
                      )
                    ) : (
                      <button
                        onClick={() => loadCharsForUser(key)}
                        disabled={!!loadingChars[key]}
                        className="px-2 py-[6px] rounded-md text-[12px] font-medium bg-slate-700 text-white hover:bg-slate-600"
                        title="Charaktere laden"
                      >
                        {loadingChars[key] ? "Lädt…" : "Chars anzeigen"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
