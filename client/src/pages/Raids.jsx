import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useWhoAmI from "../hooks/useWhoAmI.js";

async function api(url, opts = {}) {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let msg = `${opts.method || "GET"} ${url} → ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg += `: ${j.error}`; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

const DIFFS = [
  { value: "Normal", label: "Normal" },
  { value: "Heroic", label: "Heroic" },
  { value: "Mythic", label: "Mythic" },
];

const LOOTS = [
  { value: "unsaved", label: "Unsaved" },
  { value: "saved", label: "Saved" },
  { value: "vip", label: "VIP" },
  { value: "community", label: "Community" },
];

function lootLabel(v) {
  const map = { unsaved: "Unsaved", saved: "Saved", vip: "VIP", community: "Community" };
  return map[String(v)] || String(v);
}

function buildTitle({ base = "Manaforge", difficulty, bosses, lootType }) {
  const b = Number.isFinite(+bosses) ? Math.max(0, Math.min(8, Number(bosses))) : 0;
  const loot = lootLabel(lootType);
  return `${base} ${difficulty} ${b}/8 ${loot}`.replace(/\s{2,}/g, " ").trim();
}

function Card({ title, children, right, id }) {
  return (
    <section id={id} className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h2 className="font-semibold">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function Raids() {
  const nav = useNavigate();
  const { user, loading: meLoading } = useWhoAmI();
  const isAdmin = !!user?.is_elevated;
  const isLead = !!user?.is_raidlead;
  const canCreate = !!user && (isLead || isAdmin);

  const [list, setList] = useState([]);
  const [err, setErr] = useState(null);

  // create form (Titel wird automatisch generiert)
  const [busy, setBusy] = useState(false);
  const [datetime, setDatetime] = useState("");
  const [difficulty, setDifficulty] = useState("Heroic");
  const [lootType, setLootType] = useState("unsaved");
  const [description, setDescription] = useState("");
  const [mythicBosses, setMythicBosses] = useState(8);

  // Raidlead (nur Admin)
  const [raidLeads, setRaidLeads] = useState([]);
  const [createdBy, setCreatedBy] = useState("");
  const [loadLeadsBusy, setLoadLeadsBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { data } = await api("/api/raids");
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e);
    }
  }, []);

  const loadLeads = useCallback(async () => {
    if (!isAdmin) return;
    try {
      setLoadLeadsBusy(true);
      const { data } = await api("/api/admin/raidleads");
      setRaidLeads(Array.isArray(data) ? data : []);
      const me = data?.find?.((u) => String(u.id) === String(user.id));
      setCreatedBy(me ? String(user.id) : String(data?.[0]?.id || ""));
    } catch (e) {
      setErr(e);
    } finally {
      setLoadLeadsBusy(false);
    }
  }, [isAdmin, user?.id]);

  useEffect(() => {
    if (user) {
      load();
      if (isAdmin) loadLeads();
    }
  }, [user, isAdmin, load, loadLeads]);

  function toDbDate(localValue) {
    if (!localValue) return "";
    return localValue.replace("T", " ") + ":00";
  }

  const titlePreview = useMemo(() => {
    const bosses = difficulty === "Mythic" ? mythicBosses : 8;
    return buildTitle({ difficulty, bosses, lootType });
  }, [difficulty, mythicBosses, lootType]);

  async function onCreate(e) {
    e.preventDefault();
    setErr(null);
    try {
      setBusy(true);

      if (!difficulty) throw new Error("Bitte Difficulty wählen.");
      if (!lootType) throw new Error("Bitte Loot-Typ wählen.");
      const bosses = difficulty === "Mythic" ? mythicBosses : 8;
      if (difficulty === "Mythic" && (!Number.isInteger(+bosses) || +bosses < 0 || +bosses > 8)) {
        throw new Error("Bitte Mythic-Bossanzahl zwischen 0 und 8 setzen.");
      }

      const body = {
        title: buildTitle({ difficulty, bosses, lootType }),
        datetime: toDbDate(datetime),
        difficulty,
        loot_type: lootType,
        description,
      };
      if (difficulty === "Mythic") body.mythic_bosses = Number(bosses);
      if (isAdmin && createdBy) body.created_by = createdBy;

      const res = await api("/api/raids", {
        method: "POST",
        body: JSON.stringify(body),
      });

      await load();
      if (res?.data?.id) nav(`/raids/${res.data.id}`);

      setDatetime("");
      setDescription("");
      setDifficulty("Heroic");
      setLootType("unsaved");
      setMythicBosses(8);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    if (!confirm("Diesen Raid wirklich löschen?")) return;
    try {
      await api(`/api/raids/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      alert(e.message || e);
    }
  }

  const rows = useMemo(
    () =>
      list
        .slice()
        .sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)))
        .map((r) => {
          const bosses = r.difficulty === "Mythic" && r.mythic_bosses != null ? r.mythic_bosses : 8;
          const displayTitle = buildTitle({
            difficulty: r.difficulty,
            bosses,
            lootType: r.loot_type,
          });

          const canManage =
            !!user &&
            (user.is_elevated || (user.is_raidlead && String(r.created_by) === String(user.id)));
          return (
            <li
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-900/40 px-4 py-3"
            >
              <div>
                {/* ---> Hier jetzt der generierte Titel */}
                <div className="font-medium">{displayTitle}</div>
                <div className="text-xs text-slate-400">
                  📅 {r.datetime} • ⚔️ {r.difficulty}
                  {r.difficulty === "Mythic" && r.mythic_bosses != null ? ` ${r.mythic_bosses}/8` : " 8/8"} • 💎 {r.loot_type}
                  {r.lead_user ? <> • 👤 Lead: @{r.lead_user.username}</> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/raids/${r.id}`}
                  className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm"
                >
                  Details
                </Link>
                {canManage && (
                  <button
                    onClick={() => onDelete(r.id)}
                    className="px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-600 text-sm"
                  >
                    Löschen
                  </button>
                )}
              </div>
            </li>
          );
        }),
    [list, user]
  );

  if (meLoading) return <div className="p-6">Lade…</div>;
  if (!user) {
    return (
      <Card title="Anmeldung erforderlich">
        <p className="text-slate-300 mb-3">Du musst angemeldet sein, um diese Seite zu sehen.</p>
        <a href="/login" className="inline-block px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500">
          Mit Discord anmelden
        </a>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {err ? (
        <div className="p-3 rounded border border-rose-600/50 bg-rose-950/30 text-rose-200">
          {String(err.message || err)}
        </div>
      ) : null}

      {canCreate && (
        <Card id="create" title="Neuen Raid erstellen">
          <form onSubmit={onCreate} className="grid gap-4">
            {/* Titel-Vorschau (auto) */}
            <div>
              <label className="block text-sm text-slate-300 mb-1">Titel (automatisch)</label>
              <div className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100">
                {titlePreview}
              </div>
              <p className="text-[12px] text-slate-400 mt-1">
                Zusammensetzung: Manaforge + Difficulty + Bosse/8 + LootType
              </p>
            </div>

            {/* Datum + Difficulty */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Datum &amp; Uhrzeit</label>
                <input
                  type="datetime-local"
                  className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={datetime}
                  onChange={(e) => setDatetime(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">Difficulty</label>
                <select
                  className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  required
                >
                  {DIFFS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                {difficulty === "Mythic" && (
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-sm text-slate-300 whitespace-nowrap">Mythic Bosse</label>
                    <input
                      type="number"
                      min={0}
                      max={8}
                      step={1}
                      className="w-24 rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-center"
                      value={mythicBosses}
                      onChange={(e) =>
                        setMythicBosses(e.target.value === "" ? 0 : Math.max(0, Math.min(8, Number(e.target.value))))
                      }
                    />
                    <span className="text-sm text-slate-400">/ 8</span>
                  </div>
                )}
              </div>
            </div>

            {/* Loot-Type + Raidlead */}
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Loot-Typ</label>
                <select
                  className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
                  <label className="block text-sm text-slate-300 mb-1">Raid Lead (nur Admins)</label>
                  {loadLeadsBusy ? (
                    <div className="text-slate-400 py-2">Lade Raidleads…</div>
                  ) : raidLeads.length ? (
                    <select
                      className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                      value={createdBy}
                      onChange={(e) => setCreatedBy(e.target.value)}
                    >
                      {raidLeads.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.username || u.tag || u.name || u.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-slate-400 py-2">Keine Raidleads gefunden.</div>
                  )}
                </div>
              )}
            </div>

            {/* Beschreibung */}
            <div>
              <label className="block text-sm text-slate-300 mb-1">Beschreibung (optional)</label>
              <textarea
                rows={4}
                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Kurze Infos, Anforderungen, Treffpunkt…"
              />
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy ? "Erstelle…" : "Raid erstellen"}
              </button>
            </div>
          </form>
        </Card>
      )}

      <Card title="Geplante Raids">
        {list.length === 0 ? (
          <div className="text-slate-400">Keine Raids gefunden.</div>
        ) : (
          <ul className="space-y-2">{rows}</ul>
        )}
      </Card>
    </div>
  );
}
