import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

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
   API Helper – robust gegenüber {ok:true,data} oder {raid,signups}
--------------------------------------------------------- */
async function apiGet(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
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
  try {
    return await res.json();
  } catch {
    return {};
  }
}

/* ---------------------------------------------------------
   Normalizer & Feld-Leser
--------------------------------------------------------- */
const firstNonEmpty = (...vals) => {
  for (const v of vals) if (v !== undefined && v !== null && String(v) !== "") return v;
  return undefined;
};

/** Klassenname robust normalisieren (DK/DH Aliases etc.) */
function normalizeClassName(raw) {
  if (!raw) return "";
  const s = String(raw).toLowerCase().trim();
  if (!s) return "";

  // entferne Sonderzeichen/Spaces für Mapping
  const compact = s.replace(/[\s_-]+/g, "");

  // häufige Aliases
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

  // fallback: versuche mit spaces
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
  if (region && realm && name)
    return `https://www.warcraftlogs.com/character/${region}/${realm}/${name}`;
  return null;
};

/* ---------------------------------------------------------
   UI-Bausteine
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

function SignupRow({ s, charMap, onPick, onUnpick }) {
  const isLoot = String(s.role).toLowerCase() === "lootbuddy";
  const klass = readClass(s, charMap);
  const name = readDisplayName(s, charMap);
  const ilvl = isLoot ? null : readIlvl(s, charMap);
  const wcl = isLoot ? null : readWclUrl(s, charMap);
  const lockout = s.lockout ? String(s.lockout) : "";
  const note = s.note ? String(s.note) : "";

  return (
    <div className="flex items-center justify-between gap-2 py-0.5 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
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
        {ilvl ? <span className="ml-1 text-[11px] text-slate-300">• {ilvl} ilvl</span> : null}
        {lockout ? <span className="ml-1 text-[11px] text-slate-400">• {lockout}</span> : null}
        {note ? (
          <span className="ml-1 px-1.5 py-0.5 rounded bg-slate-700/40 text-[11px] text-slate-200">
            {note}
          </span>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {!s.picked ? (
          <button
            onClick={() => onPick?.(s)}
            className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px]"
            title="In Roster verschieben"
          >
            Pick
          </button>
        ) : (
          <button
            onClick={() => onUnpick?.(s)}
            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px]"
            title="Aus Roster entfernen"
          >
            Unpick
          </button>
        )}
      </div>
    </div>
  );
}

function RoleColumn({ title, role, items, charMap, onPick, onUnpick, emptyText = "keine" }) {
  return (
    <div className="flex-1 min-w-[260px]">
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

  useEffect(() => {
    let dead = false;
    (async () => {
      setBusy(true);
      try {
        await loadAll();
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

  // Gruppen
  const roster = useMemo(() => signups.filter((s) => s.picked), [signups]);
  const open = useMemo(() => signups.filter((s) => !s.picked), [signups]);

  const groupByRole = (arr) => ({
    tank: arr.filter((s) => String(s.role).toLowerCase() === "tank"),
    healer: arr.filter((s) => String(s.role).toLowerCase() === "healer"),
    dps: arr.filter((s) => String(s.role).toLowerCase() === "dps"),
    lootbuddy: arr.filter((s) => String(s.role).toLowerCase() === "lootbuddy"),
  });

  const rosterG = useMemo(() => groupByRole(roster), [roster]);
  const openG = useMemo(() => groupByRole(open), [open]);

  const totalRoster =
    rosterG.tank.length +
    rosterG.healer.length +
    rosterG.dps.length +
    rosterG.lootbuddy.length;
  const totalOpen =
    openG.tank.length + openG.healer.length + openG.dps.length + openG.lootbuddy.length;

  async function handlePick(s) {
    if (acting) return;
    setActing(true);
    try {
      await apiPost(`/api/raids/${id}/pick`, { signup_id: s.id });
      await loadAll();
    } catch (e) {
      alert(`Pick fehlgeschlagen: ${e.message}`);
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
    } catch (e) {
      alert(`Unpick fehlgeschlagen: ${e.message}`);
    } finally {
      setActing(false);
    }
  }

  if (busy) return <div className="p-6 text-slate-300">Lade …</div>;
  if (err) return <div className="p-6 text-red-400">Fehler: {err}</div>;
  if (!raid) return <div className="p-6 text-slate-300">Raid nicht gefunden.</div>;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6">
      {/* Kopfbereich */}
      <div className="bg-slate-800/60 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">{raid.title || `Raid #${id}`}</div>
            <div className="text-slate-400 text-sm">
              {raid.datetime} • {raid.difficulty} • {raid.loot_type}
            </div>
          </div>
          <div className="text-sm text-slate-300">
            <span className="mr-4">
              Roster: <strong>{totalRoster}</strong>
            </span>
            <span>
              Signups: <strong>{totalOpen}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* Roster */}
      <div className="bg-slate-800/50 rounded-xl p-4 mb-6">
        <div className="font-semibold mb-3">Roster (geplant)</div>
        <div className="grid grid-cols-4 gap-8">
          <RoleColumn
            title="Tanks"
            role="tank"
            items={rosterG.tank}
            charMap={charMap}
            onUnpick={handleUnpick}
          />
          <RoleColumn
            title="Healers"
            role="healer"
            items={rosterG.healer}
            charMap={charMap}
            onUnpick={handleUnpick}
          />
          <RoleColumn
            title="DPS"
            role="dps"
            items={rosterG.dps}
            charMap={charMap}
            onUnpick={handleUnpick}
          />
          <RoleColumn
            title="Lootbuddies"
            role="lootbuddy"
            items={rosterG.lootbuddy}
            charMap={charMap}
            onUnpick={handleUnpick}
          />
        </div>
      </div>

      {/* Signups */}
      <div className="bg-slate-800/50 rounded-xl p-4">
        <div className="font-semibold mb-3">Signups (offen)</div>
        <div className="grid grid-cols-4 gap-8">
          <RoleColumn
            title="Tanks"
            role="tank"
            items={openG.tank}
            charMap={charMap}
            onPick={handlePick}
          />
          <RoleColumn
            title="Healers"
            role="healer"
            items={openG.healer}
            charMap={charMap}
            onPick={handlePick}
          />
          <RoleColumn
            title="DPS"
            role="dps"
            items={openG.dps}
            charMap={charMap}
            onPick={handlePick}
          />
          <RoleColumn
            title="Lootbuddies"
            role="lootbuddy"
            items={openG.lootbuddy}
            charMap={charMap}
            onPick={handlePick}
          />
        </div>
      </div>
    </div>
  );
}
