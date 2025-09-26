import { useEffect, useMemo, useState } from "react";

/**
 * Kleine Icon-Map für Klassen. Du kannst die URLs später gern durch eure
 * Assets ersetzen. Fallback: Klassenname als Badge.
 */
const CLASS_ICONS = {
  "Death Knight":
    "https://wow.zamimg.com/images/wow/icons/large/classicon_deathknight.jpg",
  "Demon Hunter":
    "https://wow.zamimg.com/images/wow/icons/large/classicon_demonhunter.jpg",
  Druid: "https://wow.zamimg.com/images/wow/icons/large/classicon_druid.jpg",
  Evoker:
    "https://wow.zamimg.com/images/wow/icons/large/classicon_evoker.jpg",
  Hunter:
    "https://wow.zamimg.com/images/wow/icons/large/classicon_hunter.jpg",
  Mage: "https://wow.zamimg.com/images/wow/icons/large/classicon_mage.jpg",
  Monk: "https://wow.zamimg.com/images/wow/icons/large/classicon_monk.jpg",
  Paladin:
    "https://wow.zamimg.com/images/wow/icons/large/classicon_paladin.jpg",
  Priest:
    "https://wow.zamimg.com/images/wow/icons/large/classicon_priest.jpg",
  Rogue: "https://wow.zamimg.com/images/wow/icons/large/classicon_rogue.jpg",
  Shaman:
    "https://wow.zamimg.com/images/wow/icons/large/classicon_shaman.jpg",
  Warlock:
    "https://wow.zamimg.com/images/wow/icons/large/classicon_warlock.jpg",
  Warrior:
    "https://wow.zamimg.com/images/wow/icons/large/classicon_warrior.jpg",
};

function toSlugRealm(realm = "") {
  return String(realm).toLowerCase().replace(/\s+/g, "-");
}
function ensureRegion(region = "eu") {
  return String(region || "eu").toLowerCase();
}
function rioUrl({ region, realm, name }) {
  if (!region || !realm || !name) return null;
  return `https://raider.io/characters/${ensureRegion(region)}/${toSlugRealm(
    realm
  )}/${encodeURIComponent(name)}`;
}
function wclUrl({ region, realm, name, wcl_url }) {
  if (wcl_url) return wcl_url;
  if (!region || !realm || !name) return null;
  return `https://www.warcraftlogs.com/character/${ensureRegion(
    region
  )}/${toSlugRealm(realm)}/${encodeURIComponent(name)}`;
}

export default function UserCharsModal({ open, onClose, user }) {
  const [loading, setLoading] = useState(false);
  const [chars, setChars] = useState([]);
  const [error, setError] = useState(null);

  const userId = user?.id || user?.discord_id || user;

  useEffect(() => {
    if (!open || !userId) return;
    let abort = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/users/${userId}/characters`);
        const json = await res.json();
        if (abort) return;
        if (!res.ok || !json?.ok) throw new Error(json?.error || "request failed");
        setChars(json.chars || json.data || []);
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        if (!abort) setLoading(false);
      }
    })();
    return () => {
      abort = true;
    };
  }, [open, userId]);

  const title = useMemo(
    () => (user?.username ? `Chars von ${user.username}` : "Chars"),
    [user]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      {/* modal */}
      <div className="relative mx-4 w-full max-w-3xl rounded-2xl bg-slate-900 text-slate-100 shadow-xl ring-1 ring-white/10">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-md bg-slate-800 px-3 py-1 text-sm hover:bg-slate-700"
          >
            Schließen
          </button>
        </div>

        <div className="p-4">
          {loading && (
            <div className="py-8 text-center text-slate-300">Lade Charaktere…</div>
          )}
          {error && (
            <div className="rounded-md bg-red-900/40 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
          {!loading && !error && (!chars || chars.length === 0) && (
            <div className="py-10 text-center text-slate-400">
              Keine Charaktere gefunden.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {chars?.map((c) => {
              const ico = CLASS_ICONS[c.class?.trim()] || null;
              const rio = rioUrl(c);
              const wcl = wclUrl(c);
              return (
                <div
                  key={c.id || `${c.name}-${c.realm}-${c.region}`}
                  className="rounded-xl border border-white/10 bg-slate-800/60 p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
                      {ico ? (
                        <img
                          src={ico}
                          alt={c.class || "class"}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-slate-300">
                          {c.class || "Unknown"}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {c.name} <span className="text-slate-400">•</span>{" "}
                        <span className="text-slate-300">{c.class}</span>
                        {c.spec ? (
                          <>
                            {" "}
                            <span className="text-slate-500">/</span>{" "}
                            <span className="text-slate-300">{c.spec}</span>
                          </>
                        ) : null}
                      </div>
                      <div className="text-xs text-slate-400">
                        {c.realm?.toUpperCase?.() || c.realm} •{" "}
                        {(c.region || "EU").toUpperCase()}
                      </div>
                    </div>
                    <div className="ml-auto text-right text-sm font-semibold">
                      {c.ilvl ? `${c.ilvl} ilvl` : <span className="text-slate-400">—</span>}
                      {c.rio_score ? (
                        <div className="text-xs font-normal text-slate-300">
                          RIO: {c.rio_score}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {rio && (
                      <a
                        href={rio}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md bg-indigo-600/90 px-2.5 py-1 text-xs font-medium hover:bg-indigo-600"
                        title="Raider.IO öffnen"
                      >
                        Raider.IO
                      </a>
                    )}
                    {wcl && (
                      <a
                        href={wcl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md bg-amber-600/90 px-2.5 py-1 text-xs font-medium hover:bg-amber-600"
                        title="Warcraft Logs öffnen"
                      >
                        WCL
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
