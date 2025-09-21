// client/src/pages/RaidDetail.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import useWhoAmI from "../hooks/useWhoAmI.js";

/* -------------------------- kleine Fetch-Helper -------------------------- */
async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let msg = `${opts.method || "GET"} ${url} → ${res.status}`;
    try {
      const j = await res.json();
      if (j?.error) msg += `: ${j.error}`;
    } catch {}
    throw new Error(msg);
  }
  return res.json();
}

/* ------------------------------- Konstanten ------------------------------ */
const DIFFS = ["Normal", "Heroic", "Mythic"];
const LOOTS = [
  { value: "unsaved", label: "Unsaved (frisch)" },
  { value: "saved", label: "Saved (gelockt)" },
  { value: "vip", label: "VIP" },
  { value: "community", label: "Community" },
];

/* ----------------------- Klassen- / Rollen-Icons ------------------------- */
const CLASS_ICON_BASE = "/icons/classes/icons/classes/";
const CLASS_ICON_FILE = {
  warrior: "warrior.png",
  paladin: "paladin.png",
  hunter: "hunter.png",
  rogue: "rogue.png",
  priest: "priest.png",
  shaman: "shaman.png",
  mage: "mage.png",
  warlock: "warlock.png",
  monk: "monk.png",
  druid: "druid.png",
  deathknight: "deathknight.png",
  demonhunter: "demonhunter.png",
  evoker: "evoker.png",
};
function normalizeClassName(raw) {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();
  if (s === "dk") s = "deathknight";
  if (s === "dh") s = "demonhunter";
  s = s.replace(/\s+/g, "");
  if (s.includes("death") && s.includes("knight")) s = "deathknight";
  if (s.includes("demon") && s.includes("hunter")) s = "demonhunter";
  return s;
}
function ClassIcon({ className, size = 22, title }) {
  const key = normalizeClassName(className);
  const file = CLASS_ICON_FILE[key];
  if (!file) return null;
  return (
    <img
      src={CLASS_ICON_BASE + file}
      width={size}
      height={size}
      alt={key}
      title={title || key}
      className="inline-block align-[-3px] mr-1 rounded-sm"
      loading="lazy"
    />
  );
}
const ROLE_ICON_BASE = "/icons/roles/";
const ROLE_ICON_FILE = { tank: "tank.png", healer: "heal.png", dps: "dps.png", lootbuddy: "loot.png" };
function RoleTitle({ role, text }) {
  const file = ROLE_ICON_FILE[role];
  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-200">
      {file ? <img src={ROLE_ICON_BASE + file} width={18} height={18} alt={role} className="inline-block align-[-3px]" /> : null}
      <span>{text}</span>
    </div>
  );
}

/* ----------------------------- Anzeige-Helfer ---------------------------- */
function getSafe(val, ...alts) {
  if (val !== undefined && val !== null && val !== "") return val;
  for (const a of alts) if (a !== undefined && a !== null && a !== "") return a;
  return undefined;
}
function readIlvl(s, charMap) {
  const ch = s.character_id ? charMap.get(String(s.character_id)) : null;
  return getSafe(s.char_ilvl, s.ilvl, s.item_level, s.char?.ilvl, ch?.ilvl, ch?.item_level, ch?.ilvl_equipped);
}
function readLogsUrl(s, charMap) {
  // **wcl_url** bevorzugt aus characters
  const ch = s.character_id ? charMap.get(String(s.character_id)) : null;
  return getSafe(
    s.wcl_url,
    s.logs_url,
    s.warcraftlogs_url,
    s.char?.wcl_url,
    ch?.wcl_url,             // <—— wichtig
    ch?.logs_url,
    ch?.warcraftlogs_url
  );
}
function readClass(s, charMap) {
  const ch = s.character_id ? charMap.get(String(s.character_id)) : null;
  return getSafe(s.signup_class, s.char_class, s.char_class_name, s.char?.class, ch?.class, ch?.class_name, "");
}
function readDisplayName(s, charMap) {
  const ch = s.character_id ? charMap.get(String(s.character_id)) : null;
  return getSafe(
    s.char_name,
    ch?.name,
    s.user_name ? `@${s.user_name}` : s.user_username ? `@${s.user_username}` : s.role || "—"
  );
}

function SignupLine({ s, role, charMap }) {
  const klass = readClass(s, charMap);
  const isLoot = role === "lootbuddy";
  const ilvl = isLoot ? null : readIlvl(s, charMap);
  const logsUrl = isLoot ? null : readLogsUrl(s, charMap);
  const name = readDisplayName(s, charMap);
  const note = s.note ? String(s.note) : "";
  const lockout = s.lockout ? String(s.lockout) : "";

  if (isLoot) {
    return (
      <div className="flex items-center gap-2 py-0.5 min-w-0">
        <ClassIcon className={klass} size={22} />
      </div>
    );
  }
  const NameEl = logsUrl ? (
    <a href={logsUrl} target="_blank" rel="noreferrer" className="truncate underline decoration-dotted text-sky-300 hover:text-sky-200" title="WarcraftLogs öffnen">
      {name}
    </a>
  ) : (
    <span className="truncate">{name}</span>
  );
  return (
    <div className="flex items-center gap-2 py-0.5 min-w-0">
      <ClassIcon className={klass} size={22} />
      {NameEl}
      {typeof ilvl === "number" || (typeof ilvl === "string" && ilvl) ? (
        <span className="ml-1 text-[11px] text-slate-300">• {ilvl} ilvl</span>
      ) : null}
      {lockout ? <span className="ml-1 text-[11px] text-slate-400">• {lockout}</span> : null}
      {note ? <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-700/40 text-[11px] text-slate-200">{note}</span> : null}
    </div>
  );
}

function RoleColumn({ role, title, items, onPickToggle, canPick, picked, charMap }) {
  return (
    <div className="min-w-0">
      <RoleTitle role={role} text={title} />
      {items.length === 0 ? (
        <div className="text-slate-400 text-sm mt-1">keine</div>
      ) : (
        <ul className="space-y-1 mt-1">
          {items.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <SignupLine s={s} role={role} charMap={charMap} />
              {canPick ? (
                <button
                  onClick={() => onPickToggle(s.id, !picked)}
                  className={`shrink-0 px-2 py-0.5 rounded text-xs ${picked ? "bg-rose-700 hover:bg-rose-600" : "bg-emerald-700 hover:bg-emerald-600"}`}
                  title={picked ? "Unpick" : "Pick"}
                >
                  {picked ? "Unpick" : "Pick"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------- Seite --------------------------------- */
export default function RaidDetail() {
  const { id } = useParams();
  const { user } = useWhoAmI();

  const [raid, setRaid] = useState(null);
  const [signups, setSignups] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [datetime, setDatetime] = useState("");
  const [difficulty, setDifficulty] = useState("Heroic");
  const [lootType, setLootType] = useState("unsaved");
  const [description, setDescription] = useState("");
  const [raidLeads, setRaidLeads] = useState([]);
  const [createdBy, setCreatedBy] = useState("");

  const [conflicts, setConflicts] = useState({});
  const [charMap, setCharMap] = useState(() => new Map()); // <— Characters nachladen

  const isAdmin = !!user?.is_elevated;
  const isOwner = useMemo(() => {
    if (!user || !raid) return false;
    return user.is_elevated || (user.is_raidlead && String(raid.created_by) === String(user.id));
  }, [user, raid]);

  function toDbDate(localValue) {
    if (!localValue) return "";
    return localValue.replace("T", " ") + ":00";
  }

  async function togglePick(signupId, picked) {
    await api(`/api/signups/${signupId}/toggle-picked`, {
      method: "POST",
      body: JSON.stringify({ picked }),
    });
    await loadAll(); // Embed/Listen aktualisieren
  }

  // ---- Characters nachladen (wcl_url etc.)
  async function fetchCharactersForSignups(su) {
    const ids = Array.from(new Set(su.map((s) => s.character_id).filter(Boolean))).map(String);
    if (ids.length === 0) return new Map();

    // bevorzugt: POST /api/characters/by-ids { ids:[...] }
    const tryCalls = [
      () => api("/api/characters/by-ids", { method: "POST", body: JSON.stringify({ ids }) }),
      () => api(`/api/characters?ids=${encodeURIComponent(ids.join(","))}`),
      () => api(`/api/chars?ids=${encodeURIComponent(ids.join(","))}`),
    ];

    let data = null;
    for (const fn of tryCalls) {
      try {
        const r = await fn();
        data = r?.data || r; // je nach Backend
        if (Array.isArray(data)) break;
      } catch {
        // ignore and try next
      }
    }
    const map = new Map();
    if (Array.isArray(data)) {
      for (const c of data) {
        const key = String(c.id || c.character_id || c.char_id);
        map.set(key, c);
      }
    }
    return map;
  }

  async function loadAll() {
    setErr(null);
    try {
      const { data } = await api(`/api/raids/${id}`);
      setRaid(data);
      if (data) {
        setDatetime((data.datetime || "").replace(" ", "T").slice(0, 16));
        setDifficulty(data.difficulty || "Heroic");
        setLootType(data.loot_type || "unsaved");
        setDescription(data.description || "");
        setCreatedBy(String(data.created_by || ""));
      }

      const su = await api(`/api/raids/${id}/signups`);
      const suData = su.data || [];
      setSignups(suData);

      // **Characters laden & mappen (inkl. wcl_url)**
      const map = await fetchCharactersForSignups(suData);
      setCharMap(map);

      const userIds = Array.from(new Set(suData.map((s) => String(s.user_id)).filter(Boolean)));
      if (userIds.length) {
        try {
          const res = await api(`/api/raids/${id}/conflicts`, {
            method: "POST",
            body: JSON.stringify({ user_ids: userIds, window_minutes: 120 }),
          });
          setConflicts(res.data || {});
        } catch {
          setConflicts({});
        }
      } else {
        setConflicts({});
      }

      if (isAdmin) {
        try {
          const rl = await api("/api/admin/raidleads");
          setRaidLeads(rl.data || []);
        } catch {}
      }
    } catch (e) {
      setErr(e);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isAdmin]);

  async function onSave(e) {
    e.preventDefault();
    try {
      setBusy(true);
      const body = {
        datetime: toDbDate(datetime),
        difficulty,
        loot_type: lootType,
        description,
      };
      if (isAdmin && createdBy) body.created_by = createdBy;
      await api(`/api/raids/${id}`, { method: "PUT", body: JSON.stringify(body) });
      await loadAll();
      setEditMode(false);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  // Gruppenbildung
  const picked = signups.filter((s) => s.picked);
  const open = signups.filter((s) => !s.picked);
  const byRole = (list) => ({
    tank: list.filter((s) => s.role === "tank"),
    healer: list.filter((s) => s.role === "healer"),
    dps: list.filter((s) => s.role === "dps"),
    lootbuddy: list.filter((s) => s.role === "lootbuddy"),
  });
  const pickedG = byRole(picked);
  const openG = byRole(open);

  return (
    <div className="space-y-6">
      {err ? (
        <div className="p-3 rounded border border-rose-600/50 bg-rose-950/30 text-rose-200">{String(err.message || err)}</div>
      ) : null}

      {!raid ? (
        <div className="text-slate-400">Lade…</div>
      ) : (
        <>
          {/* Header */}
          <section className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{raid.title}</h2>
                <div className="text-sm text-slate-400">👤 Lead: {raid.lead_user ? `@${raid.lead_user.username}` : "—"}</div>
              </div>
              {isOwner && (
                <div className="flex items-center gap-2">
                  {editMode ? (
                    <>
                      <button
                        onClick={() => {
                          setDatetime((raid.datetime || "").replace(" ", "T").slice(0, 16));
                          setDifficulty(raid.difficulty || "Heroic");
                          setLootType(raid.loot_type || "unsaved");
                          setDescription(raid.description || "");
                          setCreatedBy(String(raid.created_by || ""));
                          setEditMode(false);
                        }}
                        className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm"
                      >
                        Abbrechen
                      </button>
                      <button form="raid-edit-form" type="submit" disabled={busy} className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50">
                        {busy ? "Speichere…" : "Speichern"}
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setEditMode(true)} className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-sm">
                      Bearbeiten
                    </button>
                  )}
                </div>
              )}
            </div>

            {!editMode ? (
              <div className="p-4 space-y-1 text-slate-300">
                <div>📅 {raid.datetime}</div>
                <div>⚔️ {raid.difficulty} • 💎 {raid.loot_type}</div>
                {raid.description ? <div className="pt-2 text-slate-300 whitespace-pre-wrap">{raid.description}</div> : null}
              </div>
            ) : (
              <form id="raid-edit-form" onSubmit={onSave} className="p-4 grid gap-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Datum & Uhrzeit</label>
                    <input type="datetime-local" className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2" value={datetime} onChange={(e) => setDatetime(e.target.value)} required />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Schwierigkeit</label>
                    <select className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} required>
                      {DIFFS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Loot-Typ</label>
                    <select className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2" value={lootType} onChange={(e) => setLootType(e.target.value)} required>
                      {LOOTS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">Beschreibung (optional)</label>
                  <textarea rows={4} className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kurze Infos, Anforderungen, Treffpunkt…" />
                </div>
              </form>
            )}
          </section>

          {/* Roster */}
          <section className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold">
                Roster (geplant) <span className="text-slate-400 font-normal">— {signups.filter((s) => s.picked).length}</span>
              </h3>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <RoleColumn role="tank" title="Tanks" items={signups.filter((s) => s.picked && s.role === "tank")} onPickToggle={togglePick} canPick={isOwner} picked charMap={charMap} />
              <RoleColumn role="healer" title="Healers" items={signups.filter((s) => s.picked && s.role === "healer")} onPickToggle={togglePick} canPick={isOwner} picked charMap={charMap} />
              <RoleColumn role="dps" title="DPS" items={signups.filter((s) => s.picked && s.role === "dps")} onPickToggle={togglePick} canPick={isOwner} picked charMap={charMap} />
              <RoleColumn role="lootbuddy" title="Lootbuddies" items={signups.filter((s) => s.picked && s.role === "lootbuddy")} onPickToggle={togglePick} canPick={isOwner} picked charMap={charMap} />
            </div>
          </section>

          {/* Signups */}
          <section className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold">
                Signups (offen) <span className="text-slate-400 font-normal">— {signups.filter((s) => !s.picked).length}</span>
            </h3>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <RoleColumn role="tank" title="Tanks" items={signups.filter((s) => !s.picked && s.role === "tank")} onPickToggle={togglePick} canPick={isOwner} picked={false} charMap={charMap} />
              <RoleColumn role="healer" title="Healers" items={signups.filter((s) => !s.picked && s.role === "healer")} onPickToggle={togglePick} canPick={isOwner} picked={false} charMap={charMap} />
              <RoleColumn role="dps" title="DPS" items={signups.filter((s) => !s.picked && s.role === "dps")} onPickToggle={togglePick} canPick={isOwner} picked={false} charMap={charMap} />
              <RoleColumn role="lootbuddy" title="Lootbuddies" items={signups.filter((s) => !s.picked && s.role === "lootbuddy")} onPickToggle={togglePick} canPick={isOwner} picked={false} charMap={charMap} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
