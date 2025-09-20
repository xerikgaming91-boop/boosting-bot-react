// client/src/pages/LoginRequired.jsx
import React from "react";

export default function LoginRequired({ needRaidlead = false, to = "/" }) {
  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Anmeldung erforderlich</h1>
      <p className="text-slate-300 mb-4">
        {needRaidlead
          ? "Diese Seite ist nur für Raid Leads zugänglich."
          : "Du musst angemeldet sein, um diese Seite zu sehen."}
      </p>
      <div className="flex gap-3">
        <a
          className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white"
          href={`/login?to=${encodeURIComponent(to)}`}
        >
          Mit Discord anmelden
        </a>
        <a className="px-4 py-2 rounded bg-slate-700 hover:bg-slate-600" href="/">
          Zur Startseite
        </a>
      </div>
    </div>
  );
}
