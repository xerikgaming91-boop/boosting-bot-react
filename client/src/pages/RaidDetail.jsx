import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

/* ---------------------------------------------------------
   KONFIG
--------------------------------------------------------- */
const MIN_GAP_MINUTES = 90; // Mindestabstand zwischen zwei geplanten Raids eines Users, sonst Pick-Block

/* ---------------------------------------------------------
   Pfade zu Rollen- und Klassen-Icons
--------------------------------------------------------- */
const ROLE_ICON_FILE = {
  tank: "tank.png",
  healer: "heal.png",
  dps: "dps.png",
  lootbuddy: "loot.png",
};
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
  if (json && typeof json === "object" && "ok" in json) {
    if ("data" in json) return json.data;
    return json;
  }
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

/* ---------------------------------------------------------
   Normalizer & Feld-Leser
--------------------------------------------------------- */
const firstNonEmpty = (...vals) => {
  for (const v of vals) if (v !== undefined && v !== null && String(v) !== "") return v;
  return undefined;
};

function normalizeClassName(raw) {
  if (!raw) return "";
  const s = String(raw).toLowerCase().trim();
  const compact = s.replace(/[\s_-]+/g, "");
  if (["dk", "deathknight", "deathnight"].includes(compact)) return "deathknight";
  if (["dh", "demonhunter"].includes(compact)) return "demonhunter";
  if (compact === "druid") return "druid";
  if (compact === "evoker") return "evoker";
  if (compact === "hunter") return "hunter";
  if (compact === "mage") return "mage";
  if (compact === "monk") return "monk";
  if (compact === "paladin") return "paladin";
  if (compact === "priest") return "priest";
  if (compact === "rogue") return "rogue";
  if (compact === "shaman") return "shaman";
  if (compact === "warlock") return "warlock";
  if (compact === "warrior") return "warrior";
  if (s === "death knight") return "deathknight";
  if (s === "demon hunter") return "demonhunter";
  return compact;
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
const readWclUrl = (row, charMap) => {
  const ch = row.character_id ? charMap[row.character_id] : null;
  const direct = firstNonEmpty(row.char_wcl_url, row.wcl_url, ch?.wcl_url, "");
  if (direct) return direct;
  const region = firstNonEmpty(row.char_region, ch?.region, "");
  const realm = firstNonEmpty(row.char_realm, ch?.realm, "");
  const name = firstNonEmpty(row.char_name, ch?.name, "");
  if (region && realm && name) {
    return `https://www.warcraftlogs.com/character/${region}/${realm}/${name}`;
  }
  return null;
};

/* ---------------------------------------------------------
   User/ID Hilfen & Zeit
--------------------------------------------------------- */
function getUserKeyFromSignup(s, charMap) {
  // Versucht verschiedene Felder zu nutzen
  return (
    firstNonEmpty(
      s.user_id,
      s.discord_id,
      s.signup_discord_id,
      s.discordId,
      s.signup_user_id,
      s.owner_id,
      s.ownerId,
      s.uid,
      s.userId,
      s.member_id,
      s.memberId,
      s.account_id
    ) ||
    (s.character_id && charMap[s.character_id]?.user_id) ||
    null
  );
}

function parseDate(d) {
  if (!d) return null;
  const t = new Date(d);
  if (isNaN(+t)) return null;
  return t;
}
function minutesDiff(a, b) {
  return Math.abs((+a - +b) / 60000);
}

/* ---------------------------------------------------------
   UI Bestandteile
--------------------------------------------------------- */
function RoleTitle({ role, text }) {
  const file = ROLE_ICON_FILE[role];
  return (
    <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-200">
      {file ? (
        <img
          src={ROLE_ICON_BASE + file}
          width={18}
          height={18}
          alt={role}
          className="inline-block align-[-3px]"
        />
      ) : null}
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

/* Lockout -> Icon/Text */
function LockoutBadge({ value }) {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (v === "unsaved") {
    return (
      <img
        src="/icons/roles/loot.png"
        width={16}
        height={16}
        alt="lootshare"
        title="lootshare"
        className="inline-block ml-1 align-[-3px]"
      />
    );
  }
  if (v === "saved") {
    return (
      <img
        src="/icons/roles/saved.png"
        width={16}
        height={16}
        alt="saved"
        title="saved"
        className="inline-block ml-1 align-[-3px]"
      />
    );
  }
  return <span className="shrink-0 ml-1 text-[11px] text-slate-400">• {value}</span>;
}

/* Eine Signup-Zeile (overflow-safe) */
function SignupRow({ s, charMap, onPick, onUnpick }) {
  const isLoot = String(s.role).toLowerCase() === "lootbuddy";
  const klass = readClass(s, charMap);
  const name = readDisplayName(s, charMap);
  const ilvl = isLoot ? null : readIlvl(s, charMap);
  const wcl = isLoot ? null : readWclUrl(s, charMap);
  const note = s.note ? String(s.note) : "";

  return (
    <div className="flex items-center justify-between gap-3 py-1 px-2 rounded-md hover:bg-slate-700/25">
      {/* links */}
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <ClassIcon klass={klass} size={22} />
        {isLoot ? (
          <span className="truncate">{name}</span>
        ) : wcl ? (
          <a
            href={wcl}
            target="_blank"
            rel="noreferrer"
            className="truncate underline decoration-dotted text-sky-300 hover:text-sky-200"
            title="WarcraftLogs öffnen"
          >
            {name}
          </a>
        ) : (
          <span className="truncate">{name}</span>
        )}

        {/* ilvl */}
        {ilvl ? <span className="shrink-0 ml-1 text-[11px] text-slate-300">• {ilvl} ilvl</span> : null}

        {/* lockout -> Icon/Text */}
        <LockoutBadge value={s.lockout} />

        {/* note */}
        {note ? (
          <span className="shrink-0 ml-1 px-1.5 py-0.5 rounded bg-slate-700/40 text-[11px] text-slate-200">
            {note}
          </span>
        ) : null}
      </div>

      {/* rechts */}
      <div className="shrink-0">
        {!s.picked ? (
          <button onClick={() => onPick?.(s)} className={btnPick} title="In Roster verschieben">
            Pick
          </button>
        ) : (
          <button onClick={() => onUnpick?.(s)} className={btnUnpick} title="Aus Roster entfernen">
            Unpick
          </button>
        )}
      </div>
    </div>
  );
}

/* Spalte pro Rolle */
function RoleColumn({ title, role, items, charMap, onPick, onUnpick, emptyText = "keine" }) {
  return (
    <div className="flex-1 min-w-[380px]">
      <RoleTitle role={role} text={title} />
      <div className="mt-2 space-y-1">
        {items.length === 0 ? (
          <div className="text-[12px] text-slate-400">{emptyText}</div>
        ) : (
          items.map((s) => (
            <SignupRow key={s.id} s={s} charMap={charMap} onPick={onPick} onUnpick={onUnpick} />
          ))
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Checklist (nur gepickte Signups)
--------------------------------------------------------- */
const BUFF_CLASSES = [
  "priest",
  "mage",
  "warlock",
  "druid",
  "monk",
  "demonhunter",
  "shaman",
  "evoker",
  "warrior",
];
const CLASS_LABEL = {
  priest: "Priest",
  mage: "Mage",
  warlock: "Warlock",
  druid: "Druid",
  monk: "Monk",
  demonhunter: "Demon Hunter",
  shaman: "Shaman",
  evoker: "Evoker",
  warrior: "Warrior",
};

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
   NEU: Cycle-Konflikte
   - Lädt andere geplante Raids der User im aktuellen Cycle
   - Map: userKey -> [{raid_id, title, datetime, role}]
--------------------------------------------------------- */
function parseAssignments(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "object") return Object.values(raw);
  return [];
}
function normalizeAssignmentEntry(entry) {
  // Ziel: { user_id, username, entries: [{ raid_id, title, datetime, role }] }
  if (!entry) return null;
  const user_id = firstNonEmpty(entry.user_id, entry.discord_id, entry.id, entry.userId, entry.discordId);
  const username = firstNonEmpty(entry.username, entry.name, entry.display_name, entry.tag, "Unbekannt");
  const list = Array.isArray(entry.entries)
    ? entry.entries
    : Array.isArray(entry.raids)
    ? entry.raids
    : [];
  const entries = list
    .map((r) => ({
      raid_id: firstNonEmpty(r.raid_id, r.id, r.raidId),
      title: firstNonEmpty(r.title, r.name, `Raid #${firstNonEmpty(r.raid_id, r.id, r.raidId) ?? "?"}`),
      datetime: firstNonEmpty(r.datetime, r.date, r.when, r.starts_at, r.start, ""),
      role: (firstNonEmpty(r.role, r.signup_role, r.kind, "") || "").toString(),
    }))
    .filter((r) => r.raid_id);
  return { user_id, username, entries };
}
function buildUserAssignmentsMap(assignments) {
  const map = new Map();
  for (const raw of parseAssignments(assignments)) {
    const norm = normalizeAssignmentEntry(raw);
    if (!norm?.user_id) continue;
    map.set(String(norm.user_id), norm.entries || []);
  }
  return map;
}

function CycleConflictsBox({ visible, currentRaidId, picked, charMap, userAssignments }) {
  if (!visible) return null;
  // Nur zeigen, wenn es wirklich etwas zu zeigen gibt
  const rows = picked
    .map((s) => {
      const key = getUserKeyFromSignup(s, charMap);
      const list = key ? userAssignments.get(String(key)) || [] : [];
      const others = list.filter((e) => String(e.raid_id) !== String(currentRaidId));
      return { signup: s, others };
    })
    .filter((r) => r.others.length > 0);

  if (rows.length === 0) return null;

  return (
    <div className="bg-slate-800/60 rounded-xl p-4 w-full">
      <div className="text-slate-100 font-semibold mb-3">Eingeplant im aktuellen Cycle (andere Raids)</div>
      <div className="space-y-3">
        {rows.map(({ signup, others }) => {
          const name = readDisplayName(signup, charMap);
          return (
            <div key={`conf-${signup.id}`} className="border border-slate-700/60 rounded-lg p-3">
              <div className="text-slate-200 font-semibold mb-1">{name}</div>
              <ul className="text-sm text-slate-300 space-y-1">
                {others.map((e, i) => (
                  <li key={`${e.raid_id}-${i}`} className="flex items-center justify-between gap-2">
                    <span className="truncate">{e.title}</span>
                    <span className="shrink-0 text-slate-400 text-xs">
                      {e.datetime ? `${e.datetime}` : ""}
                      {e.role ? ` • ${e.role}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
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

  // Cycle Assignments (für Konfliktanzeige & Pick-Block)
  const [cycleData, setCycleData] = useState(null);
  const [cycleOk, setCycleOk] = useState(false);
  const [userAssignments, setUserAssignments] = useState(() => new Map());

  async function loadAll() {
    setErr("");
    const raidRes = await apiGet(`/api/raids/${id}`);
    const raidObj = raidRes?.raid || raidRes?.data || raidRes || null;

    const signupRes = await apiGet(`/api/raids/${id}/signups`);
    const list = Array.isArray(signupRes?.list)
      ? signupRes.list
      : Array.isArray(signupRes)
      ? signupRes
      : signupRes?.data || [];
    const cmap =
      signupRes?.charMap && typeof signupRes.charMap === "object" ? signupRes.charMap : {};

    setRaid(raidObj);
    setSignups(list);
    setCharMap(cmap);
  }

  async function loadCycleAssignments() {
    setCycleOk(false);
    setCycleData(null);
    try {
      const d = await apiGet(`/api/raids/${id}/cycle-assignments`);
      setCycleData(d);
      setCycleOk(true);
      setUserAssignments(buildUserAssignmentsMap(d));
      return;
    } catch (e1) {
      try {
        const d2 = await apiGet(`/api/raids/${id}/conflicts`);
        setCycleData(d2);
        setCycleOk(true);
        setUserAssignments(buildUserAssignmentsMap(d2));
        return;
      } catch (e2) {
        setCycleOk(false);
        setCycleData(null);
        setUserAssignments(new Map());
      }
    }
  }

  useEffect(() => {
    let dead = false;
    (async () => {
      setBusy(true);
      try {
        await loadAll();
        await loadCycleAssignments(); // NEU
      } catch (e) {
        if (!dead) setErr(String(e?.message || e));
      } finally {
        if (!dead) setBusy(false);
      }
    })();
    return () => {
      dead = true;
    };
  }, [id]);

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

  const totalRoster =
    rosterG.tank.length + rosterG.healer.length + rosterG.dps.length + rosterG.lootbuddy.length;
  const totalOpen =
    openG.tank.length + openG.healer.length + openG.dps.length + openG.lootbuddy.length;

  // Helper: prüfe Konflikt beim Pick
  function hasTimeConflictForSignup(signup) {
    if (!cycleOk || !raid) return false;
    const currentStart = parseDate(raid?.datetime || raid?.date || raid?.date_str);
    if (!currentStart) return false;

    const userKey = getUserKeyFromSignup(signup, charMap);
    if (!userKey) return false;

    const list = userAssignments.get(String(userKey)) || [];
    // Ignoriere aktuellen Raid
    const others = list.filter((e) => String(e.raid_id) !== String(id));
    if (others.length === 0) return false;

    for (const e of others) {
      const t = parseDate(e.datetime);
      if (!t) continue;
      if (minutesDiff(currentStart, t) < MIN_GAP_MINUTES) {
        return true;
      }
    }
    return false;
  }

  async function handlePick(s) {
    if (acting) return;
    // Block, wenn Konflikt
    if (hasTimeConflictForSignup(s)) {
      alert(
        `Pick blockiert: Dieser User ist zeitlich zu nah an einem anderen Raid im aktuellen Cycle eingeplant (weniger als ${MIN_GAP_MINUTES} Minuten Abstand).`
      );
      return;
    }
    setActing(true);
    try {
      await apiPost(`/api/raids/${id}/pick`, { signup_id: s.id });
      await loadAll();             // Listen & Zähler aktualisieren
      await loadCycleAssignments(); // Konflikt-Box aktualisieren
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

  return (
    <div className="mx-auto max-w-[1200px] px-2 md:px-4">
      {/* Kopf */}
      <div className="bg-slate-800/60 rounded-xl p-4 mb-4 flex items-center justify-between">
        <div className="text-slate-100">
          <div className="font-semibold">{raid?.title || raid?.name || `Raid #${id}`}</div>
          <div className="text-sm text-slate-400">
            {raid?.date_str || raid?.date || ""}
            {raid?.difficulty ? ` • ${raid.difficulty}` : ""}
            {raid?.loot_type ? ` • ${raid.loot_type}` : ""}
          </div>
        </div>
        <div className="text-sm text-slate-300">
          <span className="mr-4">Roster: {totalRoster}</span>
          <span>Signups: {totalOpen}</span>
        </div>
      </div>

      {/* Roster (geplant) – 2 Reihen: Tanks & DPS / Healers & Lootbuddies */}
      <div className="bg-slate-800/60 rounded-xl p-4 mb-4">
        <div className="text-slate-100 font-semibold mb-2">Roster (geplant)</div>

        {/* Reihe 1: Tanks + DPS */}
        <div className="flex flex-wrap gap-8">
          <RoleColumn
            title="Tanks"
            role="tank"
            items={rosterG.tank}
            charMap={charMap}
            onPick={handlePick}
            onUnpick={handleUnpick}
            emptyText="keine"
          />
          <RoleColumn
            title="DPS"
            role="dps"
            items={rosterG.dps}
            charMap={charMap}
            onPick={handlePick}
            onUnpick={handleUnpick}
            emptyText="keine"
          />
        </div>

        {/* Reihe 2: Healers + Lootbuddies */}
        <div className="mt-6 flex flex-wrap gap-8">
          <RoleColumn
            title="Healers"
            role="healer"
            items={rosterG.healer}
            charMap={charMap}
            onPick={handlePick}
            onUnpick={handleUnpick}
            emptyText="keine"
          />
          <RoleColumn
            title="Lootbuddies"
            role="lootbuddy"
            items={rosterG.lootbuddy}
            charMap={charMap}
            onPick={handlePick}
            onUnpick={handleUnpick}
            emptyText="keine"
          />
        </div>
      </div>

      {/* Signups (offen) – ebenfalls 2 Reihen */}
      <div className="bg-slate-800/60 rounded-xl p-4 mb-4">
        <div className="text-slate-100 font-semibold mb-2">Signups (offen)</div>

        {/* Reihe 1: Tanks + DPS */}
        <div className="flex flex-wrap gap-8">
          <RoleColumn
            title="Tanks"
            role="tank"
            items={openG.tank}
            charMap={charMap}
            onPick={handlePick}
            onUnpick={handleUnpick}
            emptyText="keine"
          />
          <RoleColumn
            title="DPS"
            role="dps"
            items={openG.dps}
            charMap={charMap}
            onPick={handlePick}
            onUnpick={handleUnpick}
            emptyText="keine"
          />
        </div>

        {/* Reihe 2: Healers + Lootbuddies */}
        <div className="mt-6 flex flex-wrap gap-8">
          <RoleColumn
            title="Healers"
            role="healer"
            items={openG.healer}
            charMap={charMap}
            onPick={handlePick}
            onUnpick={handleUnpick}
            emptyText="keine"
          />
          <RoleColumn
            title="Lootbuddies"
            role="lootbuddy"
            items={openG.lootbuddy}
            charMap={charMap}
            onPick={handlePick}
            onUnpick={handleUnpick}
            emptyText="keine"
          />
        </div>
      </div>

      {/* Checklist (nur gepickte) */}
      <ChecklistCard roster={roster} charMap={charMap} />

      {/* NEU: Konflikt-Übersicht für Raidlead (optional, wenn Endpoint existiert) */}
      <div className="mt-6">
        <CycleConflictsBox
          visible={cycleOk}
          currentRaidId={id}
          picked={roster}
          charMap={charMap}
          userAssignments={userAssignments}
        />
      </div>

      {/* Status */}
      {busy ? <div className="mt-4 text-slate-400 text-sm">Lade…</div> : null}
      {err ? (
        <div className="mt-4 text-rose-400 text-sm whitespace-pre-wrap">Fehler: {err}</div>
      ) : null}
    </div>
  );
}
