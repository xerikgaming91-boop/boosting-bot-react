import { Characters } from './db.js';
import { fetchFromRaiderIO } from './raiderio.js';
import { maybeAddWarcraftLogsInfo } from './wcl.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Einen einzelnen Charakter mit Raider.IO (und optional WCL) synchronisieren.
 * Schreibt: class, spec, ilvl, rio_score, wcl_rank, wcl_url, updated_at, last_synced_at
 */
async function syncOneCharacter(c, onUpdate) {
  try {
    const rio = await fetchFromRaiderIO(c.region, c.realm, c.name);
    const merged = await maybeAddWarcraftLogsInfo({
      ...rio,
      name: c.name,
      realm: c.realm,
      region: c.region
    });

    Characters.updateStats(c.id, {
      className: merged.class,
      spec: merged.spec,
      ilvl: merged.ilvl,
      rio_score: merged.rio_score,
      wcl_rank: merged.wcl_rank || null,
      wcl_url: merged.wcl_url || null
    });

    onUpdate?.(null, c);
  } catch (err) {
    onUpdate?.(err, c);
  }
}

/**
 * Startet einen Intervall-Job, der alle X Minuten alle Chars aktualisiert.
 * ENV: CHARS_SYNC_INTERVAL_MIN (Default: 60, Minimum: 5)
 */
export function startCharacterSync() {
  const minutes = Math.max(5, parseInt(process.env.CHARS_SYNC_INTERVAL_MIN || '60', 10) || 60);
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const all = Characters.listAll();
      for (const c of all) {
        await syncOneCharacter(c, (err) => {
          if (err) {
            console.warn(
              `⚠️ Sync-Fehler für ${c.name}-${c.realm} (${c.region}):`,
              err?.message || err
            );
          }
        });
        // sanftes Rate-Limit pro Charakter
        await sleep(1000);
      }
      console.log(`🔄 Raider.IO Sync abgeschlossen (${all.length} Chars).`);
    } catch (e) {
      console.warn('⚠️ Charakter-Sync abgebrochen:', e?.message || e);
    } finally {
      running = false;
    }
  };

  // Erstlauf kurz nach Start
  setTimeout(run, 2500);

  // Regelmäßiger Intervall
  const handle = setInterval(run, minutes * 60 * 1000);
  console.log(`⏰ Charakter-Auto-Sync aktiv: alle ${minutes} Minuten.`);
  return () => clearInterval(handle);
}

/**
 * Manuelles, einmaliges Synchronisieren (z. B. per Admin-Route).
 */
export async function runCharacterSyncOnce() {
  const all = Characters.listAll();
  for (const c of all) {
    await syncOneCharacter(c, (err) => {
      if (err) {
        console.warn(
          `⚠️ Sync-Fehler für ${c.name}-${c.realm} (${c.region}):`,
          err?.message || err
        );
      }
    });
    await sleep(1000);
  }
  return { ok: true, count: all.length };
}
