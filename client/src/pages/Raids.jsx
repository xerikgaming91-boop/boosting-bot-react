import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useWhoAmI from "../hooks/useWhoAmI.js";
/* 🔹 NEU: Preset-Dropdown */
import PresetSelect from "../components/PresetSelect.jsx";

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

function Message({type="info",children}) {
  const cls =
    type==="error" ? "border-rose-600/50 bg-rose-950/30 text-rose-200" :
    type==="success" ? "border-emerald-600/50 bg-emerald-950/30 text-emerald-200" :
    "border-slate-600/50 bg-slate-800/40 text-slate-200";
  return <div className={`p-3 rounded border ${cls}`}>{children}</div>;
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
  const [notice, setNotice] = useState(null);
  useEffect(()=>{ if(!notice) return; const t=setTimeout(()=>setNotice(null),3000); return ()=>clearTimeout(t);},[notice]);

  // create form (Titel wird automatisch generiert)
  const [busy, setBusy] = useState(false);
  const [datetime, setDatetime] = useState("");
  const [difficulty, setDifficulty] = useState("Heroic");
  const [lootType, setLootType] = useState("unsaved");
  const [description, setDescription] = useState("");
  const [mythicBosses, setMythicBosses] = useState(8);

  /* 🔹 NEU: Preset-Auswahl */
  const [presetId, setPresetId] = useState(null);
  const [presetPreview, setPresetPreview] = useState(null);

  // Raidlead (nur Admin)
  const [raidLeads, setRaidLeads] = useState([]);
  const [createdBy, setCreatedBy] = useState("");
  const [loadLeadsBusy, setLoadLeadsBusy] = useState(false);

  const loadingRef = useRef(false);
  const pollRef = useRef(null);
  const esRef = useRef(null);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setErr(null);
    try {
      const { data } = await api("/api/raids");
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e);
    } finally {
      loadingRef.current = false;
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

  // 🔴 Live-Updates: SSE (falls vorhanden) + Fallback-Polling
  useEffect(() => {
    if (!user) return;

    // helper: start polling
    const startPoll = () => {
      stopPoll();
      const fn = async () => {
        if (document.hidden) return; // Pause im Hintergrund
        await load();
      };
      pollRef.current = window.setInterval(fn, 10000);
    };
    const stopPoll = () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    // try SSE
    try {
      const es = new EventSource("/api/raids/events", { withCredentials: true });
      esRef.current = es;
      const onMsg = () => load();
      es.addEventListener("message", onMsg);
      es.addEventListener("raid", onMsg);
      es.onerror = () => {
        // wenn SSE nicht geht → auf Polling umschalten
        try { es.close(); } catch {}
        esRef.current = null;
        startPoll();
      };
      es.onopen = () => {
        // wenn SSE offen ist, kein Polling nötig
        stopPoll();
      };
    } catch {
      // kein SSE → Polling
      startPoll();
    }

    const onVis = () => {
      if (document.hidden) return;
      load(); // beim Zurückkehren in den Tab sofort aktualisieren
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (esRef.current) {
        try { esRef.current.close(); } catch {}
        esRef.current = null;
      }
      stopPoll();
    };
  }, [user, load]);

  function toDbDate(localValue) {
    if (!localValue) return "";
    return localValue.replace("T", " ") + ":00";
  }

  // Loot-Optionen je nach Difficulty (Mythic → ohne "Saved")
  const lootOptions = useMemo(
    () => (difficulty === "Mythic" ? LOOTS.filter(l => l.value !== "saved") : LOOTS),
    [difficulty]
  );

  // Wenn auf Mythic gewechselt wird und "saved" gesetzt war → auf unsaved umstellen
  useEffect(() => {
    if (difficulty === "Mythic" && lootType === "saved") {
      setLootType("unsaved");
    }
  }, [difficulty, lootType]);

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
      if (difficulty === "Mythic" && lootType === "saved") {
        throw new Error("Bei Mythic gibt es keinen 'Saved'-Lockout. Bitte anderen Loot-Typ wählen.");
      }

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
        /* 🔹 NEU: preset_id mitsenden, falls gewählt */
        ...(presetId ? { preset_id: Number(presetId) } : {}),
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
      setPresetId(null);
      setPresetPreview(null);
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    setErr(null);
    try {
      await api(`/api/raids/${id}`, { method: "DELETE" });
      await load();
      setNotice({type:"success",text:"Raid wurde erfolgreich gelöscht."});
    } catch (e) {
      setErr(e);
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
      {notice ? (<Message type={notice.type}>{notice.text}</Message>) : null}
      {err ? (<Message type="error">{String(err.message || err)}</Message>) : null}

      {canCreate && (
        <Card id="create" title="Neuen Raid erstellen">
          <form onSubmit={onCreate} className="grid gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Titel (automatisch)</label>
              <div className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 text-slate-100">
                {titlePreview}
              </div>
              <p className="text-[12px] text-slate-400 mt-1">
                Zusammensetzung: Manaforge + Difficulty + Bosse/8 + LootType
              </p>
            </div>

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

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1">Loot-Typ</label>
                <select
                  className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  value={lootType}
                  onChange={(e) => setLootType(e.target.value)}
                  required
                >
                  {(difficulty === "Mythic" ? LOOTS.filter(l=>l.value!=="saved") : LOOTS).map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                {difficulty === "Mythic" && (
                  <div className="text-[12px] text-slate-400 mt-1">
                    Hinweis: Bei Mythic gibt es keinen „Saved“-Lockout.
                  </div>
                )}
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

            {/* 🔹 NEU: Preset-Auswahl */}
            <div>
              <label className="block text-sm text-slate-300 mb-1">Roster-Preset</label>
              <div className="flex items-center gap-3">
                <PresetSelect
                  value={presetId}
                  onChange={setPresetId}
                  onApplyPreview={setPresetPreview}
                />
                {presetPreview ? (
                  <span className="text-xs text-slate-400">
                    Tanks {presetPreview.tanks} • Healer {presetPreview.healers} • DPS {presetPreview.dps} • Loot {presetPreview.lootbuddies}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500">Optional</span>
                )}
              </div>
            </div>

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
