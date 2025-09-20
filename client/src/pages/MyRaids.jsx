import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

async function api(url) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

export default function MyRaids() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setErr(null);
      try {
        const { data } = await api("/api/me/raids");
        setList(Array.isArray(data) ? data : []);
      } catch (e) {
        setErr(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div>Lade…</div>;
  if (err) {
    return (
      <div className="p-3 rounded border border-rose-600/50 bg-rose-950/30 text-rose-200">
        {String(err.message || err)}
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-800/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h2 className="font-semibold">Meine Raids</h2>
      </div>
      <div className="p-4">
        {list.length === 0 ? (
          <div className="text-slate-400">Aktuell keine geplanten Raids.</div>
        ) : (
          <ul className="space-y-2">
            {list.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-900/40 px-4 py-3"
              >
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-slate-400">
                    📅 {r.datetime} • ⚔️ {r.difficulty} • 💎 {r.loot_type}
                  </div>
                </div>
                <Link
                  to={`/raids/${r.id}`}
                  className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-sm"
                >
                  Details
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
