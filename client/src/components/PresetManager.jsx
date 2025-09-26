import React, { useEffect, useState } from "react";

/* kleine Fetch-Helpers */
async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: "include", ...opts });
  let json = {};
  try { json = await res.json(); } catch {}
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json;
}

function NumberField({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-sm text-slate-300">{label}</label>
      <input
        type="number"
        min={0}
        className="w-24 bg-slate-900/60 border border-slate-700 rounded px-3 py-1.5 text-slate-100"
        value={value}
        onChange={(e) => onChange?.(Math.max(0, Number(e.target.value || 0)))}
      />
    </div>
  );
}

function PresetRow({ item, onChange, onDelete }) {
  const [it, setIt] = useState(item);
  useEffect(() => setIt(item), [item]);

  const change = (k, v) => setIt((s) => ({ ...s, [k]: k === "name" ? v : Math.max(0, Number(v || 0)) }));
  const save = () => onChange?.(it);
  const del = () => onDelete?.(it.id);

  return (
    <div className="flex flex-wrap items-end gap-3 border border-slate-700/60 rounded-lg p-3">
      <div className="min-w-[220px]">
        <label className="block text-sm text-slate-300">Name</label>
        <input
          className="w-full bg-slate-900/60 border border-slate-700 rounded px-3 py-1.5 text-slate-100"
          value={it.name}
          onChange={(e) => change("name", e.target.value)}
        />
      </div>
      <NumberField label="Tanks" value={it.tanks} onChange={(v) => change("tanks", v)} />
      <NumberField label="Healer" value={it.healers} onChange={(v) => change("healers", v)} />
      <NumberField label="DPS" value={it.dps} onChange={(v) => change("dps", v)} />
      <NumberField label="Lootbuddy" value={it.lootbuddies} onChange={(v) => change("lootbuddies", v)} />
      <div className="flex gap-2 ml-auto">
        <button className="h-9 px-3 rounded bg-sky-600 hover:bg-sky-500 text-white" onClick={save}>
          Aktualisieren
        </button>
        <button className="h-9 px-3 rounded bg-rose-700 hover:bg-rose-600 text-white" onClick={del}>
          Löschen
        </button>
      </div>
    </div>
  );
}

export default function PresetManager() {
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ name: "", tanks: 0, healers: 0, dps: 0, lootbuddies: 0 });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    try {
      const j = await api("/api/presets");
      setList(Array.isArray(j.data) ? j.data : []);
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  useEffect(() => { load(); }, []);

  const onChange = (k, v) =>
    setForm((s) => ({ ...s, [k]: k === "name" ? v : Math.max(0, Number(v || 0)) }));

  const save = async () => {
    setSaving(true);
    setErr("");
    try {
      await api("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ name: "", tanks: 0, healers: 0, dps: 0, lootbuddies: 0 });
      await load();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setSaving(false);
    }
  };

  const update = async (it) => {
    await api(`/api/presets/${it.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(it),
    });
    await load();
  };

  const del = async (id) => {
    await api(`/api/presets/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-4">
      {/* Create */}
      <div className="bg-slate-800/60 rounded-xl p-4">
        <div className="text-slate-100 font-semibold mb-2">Neues Preset</div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <label className="block text-sm text-slate-300">Name</label>
            <input
              className="w-full bg-slate-900/60 border border-slate-700 rounded px-3 py-1.5 text-slate-100"
              value={form.name}
              onChange={(e) => onChange("name", e.target.value)}
              placeholder="z. B. 2/1/7 + 1 Loot"
            />
          </div>
          <NumberField label="Tanks" value={form.tanks} onChange={(v) => onChange("tanks", v)} />
          <NumberField label="Healer" value={form.healers} onChange={(v) => onChange("healers", v)} />
          <NumberField label="DPS" value={form.dps} onChange={(v) => onChange("dps", v)} />
          <NumberField label="Lootbuddy" value={form.lootbuddies} onChange={(v) => onChange("lootbuddies", v)} />
          <button
            className="h-9 px-3 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
            onClick={save}
            disabled={saving || !form.name.trim()}
          >
            {saving ? "Speichere…" : "Preset speichern"}
          </button>
        </div>
        {err ? <div className="text-rose-400 text-sm mt-2">Fehler: {err}</div> : null}
      </div>

      {/* List */}
      <div className="bg-slate-800/60 rounded-xl p-4">
        <div className="text-slate-100 font-semibold mb-2">Vorhandene Presets</div>
        <div className="space-y-2">
          {list.map((it) => (
            <PresetRow key={it.id} item={it} onChange={update} onDelete={del} />
          ))}
          {list.length === 0 ? (
            <div className="text-slate-400 text-sm">Noch keine Presets angelegt.</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
