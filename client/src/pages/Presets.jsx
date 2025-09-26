import React from "react";
import PresetManager from "../components/PresetManager.jsx";

export default function PresetsPage() {
  return (
    <div className="mx-auto max-w-5xl px-3 md:px-6 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-100">Raid-Größen Presets</h1>
        <p className="text-slate-400 text-sm">
          Lege Presets für Tank/Healer/DPS/Lootbuddy an (z.&nbsp;B. <code>2/1/7/1</code>) und
          verwende sie später bei der Raiderstellung über ein Dropdown.
        </p>
      </div>

      <PresetManager />

      <div className="mt-8 text-slate-400 text-sm">
        <p className="mb-1">Hinweise:</p>
        <ul className="list-disc ml-5 space-y-1">
          <li>Beim Anlegen eines Raids wird die aktuell gewählte Preset-Größe als <em>Snapshot</em> am Raid gespeichert.</li>
          <li>Änderungen an Presets wirken sich nicht rückwirkend auf bereits erstellte Raids aus.</li>
        </ul>
      </div>
    </div>
  );
}
