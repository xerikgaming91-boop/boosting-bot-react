// client/src/components/PostRosterButton.jsx
import { useState } from "react";

export default function PostRosterButton({ raidId, className = "", title = "Roster posten" }) {
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(null);
  const [err, setErr] = useState("");

  const postRoster = async () => {
    setBusy(true);
    setOk(null);
    setErr("");
    try {
      const res = await fetch(`/api/raids/${raidId}/post-roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Fehler beim Posten");
      }
      setOk(true);
    } catch (e) {
      setOk(false);
      setErr(e.message || "Fehler");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={`btn btn-ghost ${className}`}
        onClick={postRoster}
        disabled={busy}
        title="Roster im Raid-Channel posten"
      >
        {busy ? "Poste…" : title}
      </button>
      {ok === true && <span className="text-green-500 text-sm">Gepostet.</span>}
      {ok === false && <span className="text-red-500 text-sm">Fehler: {err}</span>}
    </div>
  );
}
