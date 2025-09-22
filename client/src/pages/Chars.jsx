import React, { useEffect, useState } from "react";

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

function Message({type="info",children}){return (<div className={`p-3 rounded border ${type==="error"?"border-rose-600/50 bg-rose-950/30 text-rose-200":type==="success"?"border-emerald-600/50 bg-emerald-950/30 text-emerald-200":"border-slate-600/50 bg-slate-800/40 text-slate-200"}`}>{children}</div>);}

export default function Chars() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [notice, setNotice] = useState(null);
  useEffect(()=>{ if(!notice) return; const t=setTimeout(()=>setNotice(null),3000); return ()=>clearTimeout(t);},[notice]);

  // Import-Form
  const [name, setName] = useState("");
  const [realm, setRealm] = useState("");
  const [region, setRegion] = useState("eu");
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    try {
      const { data } = await api("/api/me/chars");
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function onImport(e) {
    e.preventDefault();
    setErr(null);
    try {
      setBusy(true);
      await api("/api/me/chars/import", {
        method: "POST",
        body: JSON.stringify({ name, realm, region }),
      });
      setName(""); setRealm(""); setRegion("eu");
      await load();
      setNotice({type:"success",text:"Charakter importiert."});
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id) {
    setErr(null);
    try {
      await api(`/api/me/chars/${id}/delete`, { method: "POST" });
      await load();
      setNotice({type:"success",text:"Charakter wurde erfolgreich gelöscht."});
    } catch (e) {
      setErr(e);
    }
  }

  return (
    <div className="space-y-6">{" "}
      {notice ? (<Message type={notice.type}>{notice.text}</Message>) : null}

      {err ? (<Message type="error">{String(err.message || err)}</Message>) : null}

      <section className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold">Char importieren</h2>
        </div>
        <div className="p-4">
          <form onSubmit={onImport} className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Name</label>
              <input
                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Thrall"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Realm</label>
              <input
                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={realm}
                onChange={(e) => setRealm(e.target.value)}
                placeholder="z. B. Blackhand"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Region</label>
              <select
                className="w-full rounded bg-slate-900 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="eu">EU</option>
                <option value="us">US</option>
                <option value="tw">TW</option>
                <option value="kr">KR</option>
                <option value="cn">CN</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {busy ? "Importiere…" : "Importieren"}
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-semibold">Meine Charaktere</h2>
        </div>
        <div className="p-4">
          {loading ? (
            <div className="text-slate-400">Lade…</div>
          ) : list.length === 0 ? (
            <div className="text-slate-400">Noch keine Charaktere importiert.</div>
          ) : (
            <ul className="grid md:grid-cols-2 gap-3">
              {list.map((c) => (
                <li key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-slate-400">
                        {c.class} {c.spec ? `• ${c.spec}` : ""} • {c.realm.toUpperCase()} • {c.region.toUpperCase()}
                      </div>
                      <div className="text-xs text-slate-500">
                        ilvl {c.ilvl ?? "?"} • RIO {c.rio_score ?? "?"} {c.wcl_url ? "• WCL ✓" : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => onDelete(c.id)}
                      className="px-3 py-1.5 rounded bg-rose-700 hover:bg-rose-600 text-sm"
                    >
                      Löschen
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
