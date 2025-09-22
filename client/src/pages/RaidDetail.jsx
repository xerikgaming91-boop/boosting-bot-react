import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";

/* ---------------------------------------------------------
   KONFIG
--------------------------------------------------------- */
const MIN_GAP_MINUTES = 90; // Abstand zwischen Raids für Konflikt
const DIFFICULTY_OPTIONS = ["Normal", "Heroic", "Mythic"];
const LOOT_OPTIONS = ["saved", "unsaved", "vip", "community"];

/* ---------------------------------------------------------
   Icons
--------------------------------------------------------- */
const ROLE_ICON_FILE = { tank: "tank.png", healer: "heal.png", dps: "dps.png", lootbuddy: "loot.png" };
const ROLE_ICON_BASE = "/icons/roles/";
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
const CLASS_ICON_BASE_PRIMARY = "/icons/classes/";
const CLASS_ICON_BASE_FALLBACK = "/icons/classes/icons/classes/";

/* ---------------------------------------------------------
   API Helpers
--------------------------------------------------------- */
async function apiGet(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json().catch(() => ({}));
  if (json && typeof json === "object" && "ok" in json) return json.data ?? json;
  return json;
}
async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` – ${text}` : ""}`);
  }
  return res.json().catch(() => ({}));
}
async function apiPut(url, body) {
  const res = await fetch(url, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` – ${text}` : ""}`);
  }
  return res.json().catch(() => ({}));
}

/* ---------------------------------------------------------
   Utils
--------------------------------------------------------- */
const firstNonEmpty = (...vals) => {
  for (const v of vals) if (v !== undefined && v !== null && String(v) !== "") return v;
  return undefined;
};
const pad2 = (n) => String(n).padStart(2, "0");

function lootLabel(v) {
  const map = { unsaved: "Unsaved", saved: "Saved", vip: "VIP", community: "Community" };
  return map[String(v)] || String(v);
}
function buildTitle({ base = "Manaforge", difficulty, bosses, lootType }) {
  const b = Number.isFinite(+bosses) ? Math.max(0, Math.min(8, Number(bosses))) : 0;
  const loot = lootLabel(lootType);
  return `${base} ${difficulty} ${b}/8 ${loot}`.replace(/\s{2,}/g, " ").trim();
}

function normalizeClassName(raw) {
  if (!raw) return "";
  const s = String(raw).toLowerCase().trim();
  const compact = s.replace(/[\s_-]+/g, "");
  const map = { dk: "deathknight", deathnight: "deathknight", dh: "demonhunter" };
  return map[compact] || compact;
}

const readDisplayName = (row, charMap) => {
  const ch = row.character_id ? charMap[row.character_id] : null;
  return firstNonEmpty(row.char_name, row.signup_name, ch?.name, "—");
};
const readClass = (row, charMap) => {
  const ch = row.character_id ? charMap[row.character_id] : null;
  return normalizeClassName(firstNonEmpty(row.signup_class, row.char_class, ch?.class, ""));
};
const readIlvl = (row, charMap) => {
  const ch = row.character_id ? charMap[row.character_id] : null;
  const n = Number(firstNonEmpty(row.char_ilvl, row.ilvl, ch?.ilvl, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* Zeit */
function parseDate(d) {
  if (!d) return null;
  const t = new Date(String(d).replace(" ", "T"));
  if (isNaN(+t)) return null;
  return t;
}
function minutesDiff(a, b) {
  return Math.abs((+a - +b) / 60000);
}
function fmtShort(dbStr) {
  const d = parseDate(dbStr);
  if (!d) return dbStr || "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}

/* Date helpers */
function toDatetimeLocalValue(dbStr) {
  if (!dbStr) return "";
  const d = new Date(String(dbStr).replace(" ", "T"));
  if (isNaN(+d)) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
}
function fromDatetimeLocalValue(localStr) {
  if (!localStr) return null;
  const d = new Date(localStr);
  if (isNaN(+d)) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}:00`;
}

/* ---------------------------------------------------------
   UI Helpers
--------------------------------------------------------- */
function RoleTitle({ role, text }) {
  const file = ROLE_ICON_FILE[role];
  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-200">
      {file ? <img src={ROLE_ICON_BASE + file} width={18} height={18} alt={role} className="inline-block align-[-3px]" /> : null}
      <span>{text}</span>
    </div>
  );
}
function ClassIcon({ klass, size = 20 }) {
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
      alt={klass}
      title={klass}
      className="inline-block align-[-3px] rounded-sm"
    />
  );
}

/* Buttons */
const btnBase =
  "inline-flex items-center justify-center h-7 px-3 rounded-md text-xs font-medium whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0";
const btnPick = `${btnBase} bg-emerald-600 hover:bg-emerald-500 text-white`;
const btnUnpick = `${btnBase} bg-rose-600 hover:bg-rose-500 text-white`;
const btnGhost = `${btnBase} bg-slate-700/40 hover:bg-slate-700/60 text-slate-100`;
const btnPrimary = `${btnBase} bg-sky-600 hover:bg-sky-500 text-white`;
const btnSecondary = `${btnBase} bg-slate-600 hover:bg-slate-500 text-white`;

/* Lockout-Badge */
function LockoutBadge({ value }) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (v === "unsaved") return <img src="/icons/roles/loot.png" width={16} height={16} alt="lootshare" title="lootshare" className="inline-block ml-1 align-[-3px]" />;
  if (v === "saved") return <img src="/icons/roles/saved.png" width={16} height={16} alt="saved" title="saved" className="inline-block ml-1 align-[-3px]" />;
  return <span className="shrink-0 ml-1 text-[11px] text-slate-400">• {value}</span>;
}

/* Signup-Zeile + Spalten */
function SignupRow({ s, charMap, onPick, onUnpick }) {
  const isLoot = String(s.role).toLowerCase() === "lootbuddy";
  const klass = readClass(s, charMap);
  const name = readDisplayName(s, charMap);
  const ilvl = isLoot ? null : readIlvl(s, charMap);
  const note = s.note ? String(s.note) : "";

  return (
    <div className="flex items-center justify-between gap-3 py-1 px-2 rounded-md hover:bg-slate-700/25">
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <ClassIcon klass={klass} size={22} />
        <span className="truncate">{name}</span>
        {ilvl ? <span className="shrink-0 ml-1 text-[11px] text-slate-300">• {ilvl} ilvl</span> : null}
        <LockoutBadge value={s.lockout} />
        {note ? <span className="shrink-0 ml-1 px-1.5 py-0.5 rounded bg-slate-700/40 text-[11px] text-slate-200">{note}</span> : null}
      </div>
      <div className="shrink-0">
        {!s.picked ? (
          <button onClick={() => onPick?.(s)} className={btnPick} title="In Roster verschieben">Pick</button>
        ) : (
          <button onClick={() => onUnpick?.(s)} className={btnUnpick} title="Aus Roster entfernen">Unpick</button>
        )}
      </div>
    </div>
  );
}
function RoleColumn({ title, role, items, charMap, onPick, onUnpick, emptyText = "keine" }) {
  return (
    <div className="flex-1 min-w-[320px]">
      <RoleTitle role={role} text={title} />
      <div className="mt-2 space-y-1">
        {items.length === 0 ? <div className="text-[12px] text-slate-400">{emptyText}</div> :
          items.map((s) => <SignupRow key={s.id} s={s} charMap={charMap} onPick={onPick} onUnpick={onUnpick} />)}
      </div>
    </div>
  );
}

/* Checklist */
const BUFF_CLASSES = ["priest","mage","warlock","druid","monk","demonhunter","shaman","evoker","warrior"];
const CLASS_LABEL = { priest:"Priest", mage:"Mage", warlock:"Warlock", druid:"Druid", monk:"Monk", demonhunter:"Demon Hunter", shaman:"Shaman", evoker:"Evoker", warrior:"Warrior" };
function ChecklistCard({ roster, charMap }) {
  const counts = useMemo(() => {
    const base = Object.fromEntries(BUFF_CLASSES.map((k) => [k, 0]));
    for (const s of roster) {
      const k = readClass(s, charMap);
      if (k in base) base[k] += 1;
    }
    return base;
  }, [roster, charMap]);
  return (
    <div className="bg-slate-800/60 rounded-xl p-4 w-full">
      <div className="text-slate-100 font-semibold mb-3">Checklist</div>
      <div>
        <div className="text-[13px] font-semibold text-slate-200 mb-2">Raidbuffs</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-y-2 gap-x-4">
          {BUFF_CLASSES.map((klass) => {
            const have = counts[klass] > 0;
            return (
              <div key={klass} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ClassIcon klass={klass} size={18} />
                  <span className="text-slate-300 text-sm">{CLASS_LABEL[klass]}</span>
                </div>
                <span className={have ? "text-emerald-400" : "text-rose-400"}>
                  {have ? `${counts[klass]}x` : "missing"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Cycle-Assignments (Anzeige andere Raids)
--------------------------------------------------------- */
function parseAssignments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") return Object.values(raw);
  return [];
}
function normalizeAssignmentEntry(entry) {
  if (!entry) return null;
  const user_id = firstNonEmpty(entry.user_id, entry.discord_id, entry.id, entry.userId, entry.discordId);
  const user_name = firstNonEmpty(entry.user_name, entry.username, entry.name, null);
  const list = Array.isArray(entry.entries) ? entry.entries : Array.isArray(entry.raids) ? entry.raids : [];
  const entries = list.map((r) => ({
    raid_id: firstNonEmpty(r.raid_id, r.id, r.raidId),
    title: firstNonEmpty(r.title, r.name, `Raid #${firstNonEmpty(r.raid_id, r.id, r.raidId) ?? "?"}`),
    datetime: firstNonEmpty(r.datetime, r.date, r.when, r.starts_at, r.start, ""),
    role: (firstNonEmpty(r.role, r.signup_role, r.kind, "") || "").toString().toLowerCase(),
    char_name: firstNonEmpty(r.char_name, r.character_name, r.char, ""),
    char_class: normalizeClassName(firstNonEmpty(r.char_class, r.character_class, r.class, "")),
  })).filter((r) => r.raid_id);
  return { user_id, user_name, entries };
}
/** Map: user_id -> { name, entries[] } */
function buildUserAssignmentsMap(assignments) {
  const map = new Map();
  for (const raw of parseAssignments(assignments)) {
    const norm = normalizeAssignmentEntry(raw);
    if (!norm?.user_id) continue;
    map.set(String(norm.user_id), { name: norm.user_name || "", entries: norm.entries || [] });
  }
  return map;
}

/** Box zeigt andere Raids (Roster + offene Anmeldungen werden berücksichtigt) */
function CycleConflictsBox({ visible, currentRaidId, signupsAll, charMap, userAssignments }) {
  if (!visible) return null;

  // Für alle Spieler, die im aktuellen Raid (Roster + offene) auftauchen:
  const rows = signupsAll
    .map((s) => {
      const key =
        firstNonEmpty(
          s.user_id, s.discord_id, s.signup_discord_id, s.discordId, s.signup_user_id,
          s.owner_id, s.ownerId, s.uid, s.userId, s.member_id, s.memberId, s.account_id
        ) || (s.character_id && charMap[s.character_id]?.user_id) || null;

      if (!key) return null;

      const info = userAssignments.get(String(key));
      const list = info?.entries || [];

      // Nur andere Raids (nicht der aktuelle)
      const others = list.filter((e) => String(e.raid_id) !== String(currentRaidId));

      // Name für die Überschrift: bevorzugt Discord-Name vom Server; Fallbacks aus Signup/Char
      const fallbackName =
        firstNonEmpty(
          s.signup_discord_name, s.discord_name, s.discord_tag, s.signup_name,
          (s.character_id && charMap[s.character_id]?.owner_name),
          readDisplayName(s, charMap),
          key
        ) || key;

      return {
        key: String(key),
        name: info?.name || fallbackName,
        others,
        signupId: s.id,
      };
    })
    .filter(Boolean);

  return (
    <div className="bg-slate-800/60 rounded-xl p-4 w-full">
      <div className="text-slate-100 font-semibold mb-3">Eingeplant (andere Raids)</div>

      {/* Empty-State: Box bleibt sichtbar */}
      {rows.every((r) => (r.others || []).length === 0) ? (
        <div className="text-sm text-slate-400 border border-slate-700/60 rounded-lg p-3">
          Keine anderen Picks/Anmeldungen gefunden.
        </div>
      ) : (
        <div className="space-y-3">
          {rows
            .filter((r) => (r.others || []).length > 0)
            .map((row) => (
              <div key={`conf-${row.signupId}`} className="border border-slate-700/60 rounded-lg p-3">
                <div className="text-slate-200 font-semibold mb-2">{row.name}</div>
                <ul className="text-sm text-slate-300 space-y-1">
                  {row.others.map((e, i) => (
                    <li key={`${row.key}-${e.raid_id}-${i}`} className="flex items-center justify-between gap-2">
                      {/* links: Char + Rolle */}
                      <div className="min-w-0 flex items-center gap-2">
                        {e.char_class ? <ClassIcon klass={e.char_class} size={18} /> : null}
                        <span className="truncate">{e.char_name || "–"}</span>
                        {e.role ? <span className="text-slate-400 text-xs">• {e.role}</span> : null}
                      </div>

                      {/* rechts: Zeit + Raid-Link */}
                      <div className="shrink-0 flex items-center gap-3">
                        <span className="text-slate-400 text-xs">{fmtShort(e.datetime)}</span>
                        <Link
                          to={`/raids/${e.raid_id}`}
                          className="text-xs underline decoration-dotted text-sky-300 hover:text-sky-200 truncate max-w-[220px]"
                          title={e.title}
                        >
                          {e.title}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Seite
--------------------------------------------------------- */
export default function RaidDetail() {
  const { id } = useParams();
  const [raid, setRaid] = useState(null);
  const [signups, setSignups] = useState([]);
  const [charMap, setCharMap] = useState({});
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState("");
  const [acting, setActing] = useState(false);

  // Edit
  const [whoami, setWhoami] = useState(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editState, setEditState] = useState({
    datetimeLocal: "",
    difficulty: "",
    mythic_bosses: 8,
    loot_type: "",
    description: "",
    created_by: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // Raidleads (nur elevated)
  const [raidleads, setRaidleads] = useState([]);
  const [raidleadErr, setRaidleadErr] = useState("");

  // Cycle
  const [assignments, setAssignments] = useState(() => new Map());
  const [cycleOk, setCycleOk] = useState(false);

  function fillEditFromRaid(r) {
    const dif = r?.difficulty || "";
       const bosses = dif === "Mythic" ? (Number.isFinite(+r?.mythic_bosses) ? Number(r.mythic_bosses) : 0) : 8;
    setEditState({
      datetimeLocal: toDatetimeLocalValue(r?.datetime || r?.date || r?.date_str),
      difficulty: dif,
      mythic_bosses: bosses,
      loot_type: r?.loot_type || "",
      description: r?.description || "",
      created_by: r?.created_by || r?.lead_user?.id || "",
    });
  }

  async function loadAll() {
    setErr("");
    const raidRes = await apiGet(`/api/raids/${id}`);
    const raidObj = raidRes?.raid || raidRes?.data || raidRes || null;

    const signupRes = await apiGet(`/api/raids/${id}/signups`);
    const list = Array.isArray(signupRes?.list) ? signupRes.list : Array.isArray(signupRes) ? signupRes : signupRes?.data || [];
    const cmap = signupRes?.charMap && typeof signupRes.charMap === "object" ? signupRes.charMap : {};

    setRaid(raidObj);
    setSignups(list);
    setCharMap(cmap);
    if (raidObj) fillEditFromRaid(raidObj);
  }

  async function loadWhoAmIAndPermissions(nextRaid) {
    try {
      const res = await apiGet(`/api/whoami`);
      const user = res?.user || null;
      setWhoami(user);
      const r = nextRaid || raid;
      const allowed = !!user && (user.is_elevated || user.is_raidlead || (r && String(r.created_by) === String(user.id)));
      setCanEdit(!!allowed);
    } catch {
      setWhoami(null);
      setCanEdit(false);
    }
  }

  async function loadRaidleadsIfAllowed() {
    setRaidleadErr("");
    try {
      if (!whoami?.is_elevated) {
        setRaidleads([]);
        return;
      }
      const list = await apiGet(`/api/admin/raidleads`);
      const arr = Array.isArray(list?.data) ? list.data : Array.isArray(list) ? list : [];
      setRaidleads(arr);
    } catch (e) {
      setRaidleadErr(String(e?.message || e));
      setRaidleads([]);
    }
  }

  async function loadCycleAssignments() {
    setCycleOk(false);
    try {
      const payload = await apiGet(`/api/raids/${id}/cycle-assignments`);
      setAssignments(buildUserAssignmentsMap(payload));
      setCycleOk(true);
    } catch {
      setAssignments(new Map());
      setCycleOk(false);
    }
  }

  useEffect(() => {
    let dead = false;
    (async () => {
      setBusy(true);
      try {
        await loadAll();
        await loadCycleAssignments();
        await loadWhoAmIAndPermissions();
      } catch (e) {
        if (!dead) setErr(String(e?.message || e));
      } finally {
        if (!dead) setBusy(false);
      }
    })();
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    (async () => {
      await loadRaidleadsIfAllowed();
    })();
  }, [whoami?.is_elevated]); // eslint-disable-line

  const roster = useMemo(() => signups.filter((s) => s.picked), [signups]);
  const open = useMemo(() => signups.filter((s) => !s.picked), [signups]);

  const groupByRole = (arr) => ({
    tank: arr.filter((s) => String(s.role).toLowerCase() === "tank"),
    dps: arr.filter((s) => String(s.role).toLowerCase() === "dps"),
    healer: arr.filter((s) => String(s.role).toLowerCase() === "healer"),
    lootbuddy: arr.filter((s) => String(s.role).toLowerCase() === "lootbuddy"),
  });

  const rosterG = useMemo(() => groupByRole(roster), [roster]);
  const openG = useMemo(() => groupByRole(open), [open]);

  function hasTimeConflictForSignup(signup) {
    if (!cycleOk || !raid) return false;
    const currentStart = parseDate(raid?.datetime || raid?.date || raid?.date_str);
    if (!currentStart) return false;

    const key =
      firstNonEmpty(
        signup.user_id, signup.discord_id, signup.signup_discord_id, signup.discordId, signup.signup_user_id,
        signup.owner_id, signup.ownerId, signup.uid, signup.userId, signup.member_id, signup.memberId, signup.account_id
      ) || (signup.character_id && charMap[signup.character_id]?.user_id) || null;

    if (!key) return false;

    const info = assignments.get(String(key));
    const list = info?.entries || [];
    const others = list.filter((e) => String(e.raid_id) !== String(id));
    for (const e of others) {
      const t = parseDate(e.datetime);
      if (!t) continue;
      if (minutesDiff(currentStart, t) < MIN_GAP_MINUTES) return true;
    }
    return false;
  }

  async function handlePick(s) {
    if (acting) return;
    if (hasTimeConflictForSignup(s)) {
      alert(`Pick blockiert: Dieser User ist zeitlich zu nah an einem anderen Raid im aktuellen Cycle eingeplant (weniger als ${MIN_GAP_MINUTES} Minuten Abstand).`);
      return;
    }
    setActing(true);
    try {
      await apiPost(`/api/raids/${id}/pick`, { signup_id: s.id });
      await loadAll();
      await loadCycleAssignments();
    } catch (e) {
      alert(`Pick fehlgeschlagen: ${String(e.message || e)}`);
    } finally {
      setActing(false);
    }
  }

  async function handleUnpick(s) {
    if (acting) return;
    setActing(true);
    try {
      await apiPost(`/api/raids/${id}/unpick`, { signup_id: s.id });
      await loadAll();
      await loadCycleAssignments();
    } catch (e) {
      alert(`Unpick fehlgeschlagen: ${String(e.message || e)}`);
    } finally {
      setActing(false);
    }
  }

  /* ---------------------- Edit-UI ---------------------- */
  const [titlePreview, setTitlePreview] = useState("");
  useEffect(() => {
    const bosses = editState.difficulty === "Mythic" ? editState.mythic_bosses : 8;
    setTitlePreview(buildTitle({ difficulty: editState.difficulty || "", bosses, lootType: editState.loot_type || "" }));
  }, [editState.difficulty, editState.mythic_bosses, editState.loot_type]);

  function startEdit() {
    setSaveErr("");
    fillEditFromRaid(raid);
    setEditMode(true);
  }
  function cancelEdit() {
    setSaveErr("");
    fillEditFromRaid(raid);
    setEditMode(false);
  }

  async function saveEdit() {
    if (!raid) return;
    setSaving(true);
    setSaveErr("");
    try {
      const bosses = editState.difficulty === "Mythic" ? editState.mythic_bosses : 8;
      const payload = {
        title: buildTitle({ difficulty: editState.difficulty, bosses, lootType: editState.loot_type }),
        datetime: fromDatetimeLocalValue(editState.datetimeLocal),
        difficulty: editState.difficulty,
        loot_type: editState.loot_type,
        description: editState.description || "",
      };
      if (editState.difficulty === "Mythic") {
        const m = Number(editState.mythic_bosses);
        if (!Number.isInteger(m) || m < 0 || m > 8) throw new Error("Bitte Mythic-Bossanzahl zwischen 0 und 8 setzen.");
        payload.mythic_bosses = m;
      } else {
        payload.mythic_bosses = 8; // Normal/HC immer 8/8
      }

      // Owner nur für Elevated änderbar
      const newOwner = editState.created_by || "";
      if (whoami?.is_elevated === true && String(newOwner) !== String(raid?.created_by) && newOwner !== "") {
        payload.created_by = newOwner;
      }

      if (!payload.title) throw new Error("Titel konnte nicht generiert werden.");
      if (!payload.datetime) throw new Error("Ungültiges Datum/Uhrzeit.");
      if (!payload.difficulty) throw new Error("Bitte Difficulty wählen.");
      if (!payload.loot_type) throw new Error("Bitte Loot Type wählen.");

      await apiPut(`/api/raids/${id}`, payload);
      await loadAll();
      await loadWhoAmIAndPermissions();
      setEditMode(false);
    } catch (e) {
      setSaveErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  // Titel dynamisch darstellen
  const headerTitle = useMemo(() => {
    if (!raid) return `Raid #${id}`;
    const bosses = raid.difficulty === "Mythic" && raid.mythic_bosses != null ? raid.mythic_bosses : 8;
    return buildTitle({ difficulty: raid.difficulty, bosses, lootType: raid.loot_type });
  }, [raid, id]);

  // Sichtbarkeit der Box: Raidlead ODER Elevated ODER Owner (immer – unabhängig vom Cycle)
  const canSeeCycleBox =
    (!!whoami && (whoami.is_raidlead || whoami.is_elevated)) ||
    (!!whoami && raid && String(raid.created_by) === String(whoami.id));

  return (
    <div className="mx-auto max-w-[1200px] px-2 md:px-4">
      {/* Kopf – Titel + Icon-Zeile */}
      <div className="bg-slate-800/60 rounded-xl p-4 mb-4 flex items-center justify-between">
        <div className="text-slate-100">
          <div className="font-semibold text-lg">{headerTitle}</div>
          <div className="text-sm text-slate-400">
            📅 {raid?.datetime || ""} • ⚔️ {raid?.difficulty}
            {raid?.difficulty === "Mythic" && Number.isFinite(+raid?.mythic_bosses) ? ` ${raid.mythic_bosses}/8` : " 8/8"}
            {raid?.loot_type ? ` • 💎 ${raid.loot_type}` : ""}
            {raid?.lead_user?.username ? ` • 👤 Lead: ${raid.lead_user.username}` : ""}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-sm text-slate-300 mr-2">
            <span className="mr-4">Roster: {roster.length}</span>
            <span>Signups: {open.length}</span>
          </div>
          {canEdit && !editMode ? (
            <button className={btnGhost} onClick={startEdit} title="Raid bearbeiten">
              Bearbeiten
            </button>
          ) : null}
        </div>
      </div>

      {/* Edit-Form */}
      {canEdit && editMode ? (
        <div className="bg-slate-800/60 rounded-xl p-4 mb-4">
          <div className="text-slate-100 font-semibold mb-3">Raid bearbeiten</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Titel-Vorschau (auto) */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-sm text-slate-300">Titel (automatisch)</label>
              <div className="bg-slate-900/60 border border-slate-700 rounded-md p-2 text-slate-100 text-sm">
                {titlePreview || "—"}
              </div>
              <span className="text-[12px] text-slate-400">
                Zusammensetzung: Manaforge + Difficulty + Bosse/8 + LootType
              </span>
            </div>

            {/* Datum/Uhrzeit */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-300">Datum & Uhrzeit</label>
              <input
                type="datetime-local"
                className="bg-slate-900/60 border border-slate-700 rounded-md p-2 text-slate-100 text-sm"
                value={editState.datetimeLocal}
                onChange={(e) => setEditState((s) => ({ ...s, datetimeLocal: e.target.value }))}
              />
            </div>

            {/* Difficulty (+ Mythic Bosse) */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-300">Difficulty</label>
              <select
                className="bg-slate-900/60 border border-slate-700 rounded-md p-2 text-slate-100 text-sm"
                value={editState.difficulty}
                onChange={(e) => {
                  const v = e.target.value;
                  setEditState((s) => ({
                    ...s,
                    difficulty: v,
                    mythic_bosses: v === "Mythic" ? s.mythic_bosses ?? 8 : 8,
                  }));
                }}
              >
                <option value="">– wählen –</option>
                {DIFFICULTY_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              {editState.difficulty === "Mythic" && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-sm text-slate-300 whitespace-nowrap">Mythic Bosse</label>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    step={1}
                    className="w-24 rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-center"
                    value={editState.mythic_bosses}
                    onChange={(e) =>
                      setEditState((s) => ({
                        ...s,
                        mythic_bosses: e.target.value === "" ? 0 : Math.max(0, Math.min(8, Number(e.target.value))),
                      }))
                    }
                  />
                  <span className="text-sm text-slate-400">/ 8</span>
                </div>
              )}
            </div>

            {/* Loot Type */}
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-300">Loot Type</label>
              <select
                className="bg-slate-900/60 border border-slate-700 rounded-md p-2 text-slate-100 text-sm"
                value={editState.loot_type}
                onChange={(e) => setEditState((s) => ({ ...s, loot_type: e.target.value }))}
              >
                <option value="">– wählen –</option>
                {LOOT_OPTIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>

            {/* Beschreibung */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-sm text-slate-300">Beschreibung</label>
              <textarea
                rows={3}
                className="bg-slate-900/60 border border-slate-700 rounded-md p-2 text-slate-100 text-sm"
                value={editState.description}
                onChange={(e) => setEditState((s) => ({ ...s, description: e.target.value }))}
                placeholder="Optionaler Hinweis zum Run…"
              />
            </div>

            {/* Owner nur für Elevated */}
            {whoami?.is_elevated ? (
              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-sm text-slate-300">
                  Raidlead (Owner)
                  <span className="ml-2 text-[11px] text-slate-400">Nur Rollen über Raidlead dürfen den Owner ändern</span>
                </label>
                <RaidleadSelector value={editState.created_by} onChange={(v) => setEditState((s)=>({ ...s, created_by: v }))} raidleads={raidleads} current={raid?.lead_user?.username} />
                {raidleadErr ? <div className="text-xs text-amber-400 mt-1">Hinweis: {raidleadErr}</div> : null}
              </div>
            ) : null}
          </div>

          {saveErr ? <div className="mt-3 text-sm text-rose-400 whitespace-pre-wrap">Fehler: {saveErr}</div> : null}

          <div className="mt-4 flex items-center gap-2">
            <button className={btnPrimary} onClick={saveEdit} disabled={saving}>
              {saving ? "Speichern…" : "Speichern"}
            </button>
            <button className={btnSecondary} onClick={cancelEdit} disabled={saving}>
              Abbrechen
            </button>
          </div>
        </div>
      ) : null}

      {/* Roster (geplant) */}
      <div className="bg-slate-800/60 rounded-xl p-4 mb-4">
        <div className="text-slate-100 font-semibold mb-2">Roster (geplant)</div>
        <div className="flex flex-wrap gap-8">
          <RoleColumn title="Tanks" role="tank" items={rosterG.tank} charMap={charMap} onPick={handlePick} onUnpick={handleUnpick} />
          <RoleColumn title="DPS" role="dps" items={rosterG.dps} charMap={charMap} onPick={handlePick} onUnpick={handleUnpick} />
        </div>
        <div className="mt-6 flex flex-wrap gap-8">
          <RoleColumn title="Healers" role="healer" items={rosterG.healer} charMap={charMap} onPick={handlePick} onUnpick={handleUnpick} />
          <RoleColumn title="Lootbuddies" role="lootbuddy" items={rosterG.lootbuddy} charMap={charMap} onPick={handlePick} onUnpick={handleUnpick} />
        </div>
      </div>

      {/* Signups (offen) */}
      <div className="bg-slate-800/60 rounded-xl p-4 mb-4">
        <div className="text-slate-100 font-semibold mb-2">Signups (offen)</div>
        <div className="flex flex-wrap gap-8">
          <RoleColumn title="Tanks" role="tank" items={openG.tank} charMap={charMap} onPick={handlePick} onUnpick={handleUnpick} />
          <RoleColumn title="DPS" role="dps" items={openG.dps} charMap={charMap} onPick={handlePick} onUnpick={handleUnpick} />
        </div>
        <div className="mt-6 flex flex-wrap gap-8">
          <RoleColumn title="Healers" role="healer" items={openG.healer} charMap={charMap} onPick={handlePick} onUnpick={handleUnpick} />
          <RoleColumn title="Lootbuddies" role="lootbuddy" items={openG.lootbuddy} charMap={charMap} onPick={handlePick} onUnpick={handleUnpick} />
        </div>
      </div>

      {/* Andere Raids – Box immer sichtbar (wenn berechtigt), auch außerhalb des Zeitfensters */}
      <div className="mt-6">
        <CycleConflictsBox
          visible={canSeeCycleBox}          // <- NICHT mehr an cycleOk gekoppelt
          currentRaidId={id}
          signupsAll={signups}
          charMap={charMap}
          userAssignments={assignments}
        />
      </div>

      {/* Checklist */}
      <div className="mt-6"><ChecklistCard roster={roster} charMap={charMap} /></div>

      {busy ? <div className="mt-4 text-slate-400 text-sm">Lade…</div> : null}
      {err ? <div className="mt-4 text-rose-400 text-sm whitespace-pre-wrap">Fehler: {err}</div> : null}
    </div>
  );
}

/* Kleine Hilfskomponente für den Owner-Selector */
function RaidleadSelector({ value, onChange, raidleads, current }) {
  return (
    <div className="flex gap-2 items-center">
      <select
        className="flex-1 bg-slate-900/60 border border-slate-700 rounded-md p-2 text-slate-100 text-sm"
        value={String(value || "")}
        onChange={(e) => onChange?.(e.target.value || "")}
      >
        <option value="">
          {current ? `Aktuell: ${current} (unverändert)` : "– wählen –"}
        </option>
        {raidleads.map((u) => (
          <option key={u.id} value={u.id}>
            {u.username || u.tag || u.name || u.id}
          </option>
        ))}
      </select>
    </div>
  );
}
