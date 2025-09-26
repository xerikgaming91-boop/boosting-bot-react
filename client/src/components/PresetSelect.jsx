import React, { useEffect, useState } from "react";

/**
 * PresetSelect
 * - Lädt /api/presets (nur lesen)
 * - Übergibt die ausgewählte preset_id via onChange(Number|null)
 * - Optional zeigt onApplyPreview(preset) die Werte neben dem Dropdown
 *
 * Props:
 *   value?: number|null
 *   onChange?: (id:number|null)=>void
 *   onApplyPreview?: (presetObj|null)=>void
 *   className?: string
 */
export default function PresetSelect({ value = null, onChange, onApplyPreview, className = "" }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const res = await fetch("/api/presets", { credentials: "include" });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j?.ok === false) throw new Error(j?.error || `HTTP ${res.status}`);
        if (alive) setList(Array.isArray(j.data) ? j.data : []);
      } catch (e) {
        if (alive) setErr(String(e?.message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const current = value != null ? String(value) : "";

  function handleChange(e) {
    const val = e.target.value;
    const id = val ? Number(val) : null;
    onChange?.(id);
    const p = list.find((x) => String(x.id) === String(val)) || null;
    onApplyPreview?.(p);
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <select
        className="bg-slate-900/60 border border-slate-700 rounded px-3 py-2 text-slate-100"
        value={current}
        onChange={handleChange}
        disabled={loading || !!err}
      >
        <option value="">{loading ? "Lade Presets…" : "– Preset wählen –"}</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.tanks}/{p.healers}/{p.dps}/{p.lootbuddies})
          </option>
        ))}
      </select>

      {err ? <span className="text-xs text-rose-400">Fehler: {err}</span> : null}
    </div>
  );
}
