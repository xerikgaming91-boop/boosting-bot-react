import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import useWhoAmI from "../hooks/useWhoAmI.js";

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

const DIFFS = ["Normal", "Heroic", "Mythic"];
const LOOTS = [
  { value: "unsaved", label: "Unsaved (frisch)" },
  { value: "saved", label: "Saved (gelockt)" },
  { value: "vip", label: "VIP" },
  { value: "community", label: "Community" },
];

/** ---- Klassen-Icons ------------------------------------------------------ */
/** öffentlicher Basispfad (Vite/CRA: Dateien unter client/public sind unter / verfügbar) */
const CLASS_ICON_BASE = "/icons/classes/icons/classes/";

/** Mapping von normalisierten Klassennamen → Icon-Datei */
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

/** Normalisiert diverse Varianten in der DB → kanonischer Klassenkey */
function normalizeClassName(raw) {
  if (!raw) return "";
  let s = String(raw).trim().toLowerCase();

  // Kürzel
  if (s === "dk") s = "deathknight";
  if (s === "dh") s = "demonhunter";

  // Leerzeichen entfernen (z.B. "death knight")
  s = s.replace(/\s+/g, "");

  // Fuzzy
  if (s.includes("death") && s.includes("knight")) s = "deathknight";
  if (s.includes("demon") && s.includes("hunter")) s = "demonhunter";

  return s;
}

/** Liefert einen <img> Tag oder null, wenn kein Icon vorhanden */
function ClassIcon({ className, size = 26, title }) {
  const key = normalizeClassName(className);
  const file = CLASS_ICON_FILE[key];
  if (!file) return null;
  const src = CLASS_ICON_BASE + file;
  return (
    <img
      src={src}
      width={size}
      height={size}
      alt={key}
      title={title || key}
      className="inline-block align-[-2px] mr-1 rounded-sm"
      loading="lazy"
    />
  );
}

/** ---- UI-Helfer ---------------------------------------------------------- */
function SignupLine({ s }) {
  // Klasse: serverseitig je nach Quelle auf verschiedenen Feldern
  const klass =
    s.signup_class ||
    s.char_class ||
    s.char_class_name ||
    (s.char && (s.char.class || s.char.class_name)) ||
    "";

  // Anzeigename
  const name =
    s.char_name ||
    (s.user_name
      ? `@${s.user_name}`
      : s.user_username
      ? `@${s.user_username}`
      : s.role || "—");

  const note = s.note ? String(s.note) : "";
  const lockout = s.lockout ? String(s.lockout) : "";

  return (
    <div className="flex items-center gap-2 py-0.5 min-w-0">
      <ClassIcon className={klass} />
      <span className="truncate">{name}</span>
      {lockout ? (
        <span className="ml-1 text-[11px] text-slate-400">• {lockout}</span>
      ) : null}
      {note ? (
        <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-700/40 text-[11px] text-slate-200">
          {note}
        </span>
      ) : null}
    </div>
  );
}

function RoleColumn({ title, items, onPickToggle, canPick, picked }) {
  // breite Boxen & dynamische Höhe: wir nutzen Grid außerhalb; hier nur min-w-0
  return (
    <div className="min-w-0">
      <div className="text-[13px] font-semibold text-slate-200 mb-1">{title}</div>
      {items.length === 0 ? (
        <div className="text-slate-400 text-sm">keine</div>
      ) : (
        <ul className="space-y-1">
          {items.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <SignupLine s={s} />
              {canPick ? (
                <button
                  onClick={() => onPickToggle(s.id, !picked)}
                  className={`shrink-0 px-2 py-0.5 rounded text-xs ${
                    picked
                      ? "bg-rose-700 hover:bg-rose-600"
                      : "bg-emerald-700 hover:bg-emerald-600"
                  }`}
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

/** ---- Seite -------------------------------------------------------------- */
export default function RaidDetail() {
  const { id } = useParams();
  const { user } = useWhoAmI();

  const [raid, setRaid] = useState(null);
  const [signups, setSignups] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  // Edit
  const [editMode, setEditMode] = useState(false);
  const [datetime, setDatetime] = useState("");
  const [difficulty, setDifficulty] = useState("Heroic");
  const [lootType, setLootType] = useState("unsaved");
  const [description, setDescription] = useState("");

  // Raidlead-wechsel (nur Admin)
  const [raidLeads, setRaidLeads] = useState([]);
  const [createdBy, setCreatedBy] = useState("");
  const isAdmin = !!user?.is_elevated;

  // Konflikte (user_id -> array)
  const [conflicts, setConflicts] = useState({});

  const isOwner = useMemo(() => {
    if (!user || !raid) return false;
    return (
      user.is_elevated ||
      (user.is_raidlead && String(raid.created_by) === String(user.id))
    );
  }, [user, raid]);

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

      const userIds = Array.from(
        new Set(suData.map((s) => String(s.user_id)).filter(Boolean))
      );
      if (userIds.length) {
        const res = await api(`/api/raids/${id}/conflicts`, {
          method: "POST",
          body: JSON.stringify({ user_ids: userIds, window_minutes: 120 }),
        });
        setConflicts(res.data || {});
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

  function toDbDate(localValue) {
    if (!localValue) return "";
    return localValue.replace("T", " ") + ":00";
  }

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

      await api(`/api/raids/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      await loadAll();
      setEditMode(false);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  async function togglePick(signupId, picked) {
    try {
      await api(`/api/signups/${signupId}/toggle-picked`, {
        method: "POST",
        body: JSON.stringify({ picked }),
      });
      await loadAll();
    } catch (e) {
      alert(e.message || e);
    }
  }

  // Gruppierung nach Rolle
  const picked = signups.filter((s) => s.picked);
  const open = signups.filter((s) => !s.picked);

  function groupByRole(list) {
    return {
      tank: list.filter((s) => s.role === "tank"),
      healer: list.filter((s) => s.role === "healer"),
      dps: list.filter((s) => s.role === "dps"),
      lootbuddy: list.filter((s) => s.role === "lootbuddy"),
    };
  }

  const pickedG = groupByRole(picked);
  const openG = groupByRole(open);

  const ConflictBadge = ({ items }) => {
    if (!items?.length) return null;
    return (
      <span
        title={items.map((r) => `${r.title} • ${r.datetime}`).join("\n")}
        className="ml-2 inline-flex items-center gap-1 rounded bg-rose-900/50 border border-rose-700 px-2 py-0.5 text-[10px] text-rose-200"
      >
        ⚠️ {items.length} Konflikt{items.length > 1 ? "e" : ""}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {err ? (
        <div className="p-3 rounded border border-rose-600/50 bg-rose-950/30 text-rose-200">
          {String(err.message || err)}
        </div>
      ) : null}

      {!raid ? (
        <div className="text-slate-400">Lade…</div>
      ) : (
        <>
          {/* Header + Edit */}
          <section className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{raid.title}</h2>
                <div className="text-sm text-slate-400">
                  👤 Lead: {raid.lead_user ? `@${raid.lead_user.username}` : "—"}
                </div>
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
                      <button
                        form="raid-edit-form"
                        type="submit"
                        disabled={busy}
                        className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-sm disabled:opacity-50"
                      >
                        {busy ? "Speichere…" : "Speichern"}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setEditMode(true)}
                      className="px-3 py-1.5 rounded bg-amber-700 hover:bg-amber-600 text-sm"
                    >
                      Bearbeiten
                    </button>
                  )}
                </div>
              )}
            </div>

            {!editMode ? (
              <div className="p-4 space-y-1 text-slate-300">
                <div>📅 {raid.datetime}</div>
                <div>
                  ⚔️ {raid.difficulty} • 💎 {raid.loot_type}
                </div>
                {raid.description ? (
                  <div className="pt-2 text-slate-300 whitespace-pre-wrap">
                    {raid.description}
                  </div>
                ) : null}
              </div>
            ) : (
              <form id="raid-edit-form" onSubmit={onSave} className="p-4 grid gap-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">
                      Datum &amp; Uhrzeit
                    </label>
                    <input
                      type="datetime-local"
                      className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
                      value={datetime}
                      onChange={(e) => setDatetime(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-300 mb-1">Schwierigkeit</label>
                    <select
                      className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      required
                    >
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
                    <select
                      className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
                      value={lootType}
                      onChange={(e) => setLootType(e.target.value)}
                      required
                    >
                      {LOOTS.map((l) => (
                        <option key={l.value} value={l.value}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isAdmin && (
                    <div>
                      <label className="block text-sm text-slate-300 mb-1">
                        Raid Lead (nur Admin)
                      </label>
                      <select
                        className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
                        value={createdBy}
                        onChange={(e) => setCreatedBy(e.target.value)}
                      >
                        {raidLeads.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.username} — {u.id}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-slate-300 mb-1">
                    Beschreibung (optional)
                  </label>
                  <textarea
                    rows={4}
                    className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Kurze Infos, Anforderungen, Treffpunkt…"
                  />
                </div>
              </form>
            )}
          </section>

          {/* Roster */}
          <section className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold">
                Roster (geplant) <span className="text-slate-400 font-normal">— {picked.length}</span>
              </h3>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <RoleColumn title="Tanks" items={pickedG.tank} onPickToggle={togglePick} canPick={isOwner} picked />
              <RoleColumn title="Healers" items={pickedG.healer} onPickToggle={togglePick} canPick={isOwner} picked />
              <RoleColumn title="DPS" items={pickedG.dps} onPickToggle={togglePick} canPick={isOwner} picked />
              <RoleColumn title="Lootbuddies" items={pickedG.lootbuddy} onPickToggle={togglePick} canPick={isOwner} picked />
            </div>
          </section>

          {/* Open signups */}
          <section className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold">
                Signups (offen) <span className="text-slate-400 font-normal">— {open.length}</span>
              </h3>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <RoleColumn title="Tanks" items={openG.tank} onPickToggle={togglePick} canPick={isOwner} picked={false} />
              <RoleColumn title="Healers" items={openG.healer} onPickToggle={togglePick} canPick={isOwner} picked={false} />
              <RoleColumn title="DPS" items={openG.dps} onPickToggle={togglePick} canPick={isOwner} picked={false} />
              <RoleColumn title="Lootbuddies" items={openG.lootbuddy} onPickToggle={togglePick} canPick={isOwner} picked={false} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
