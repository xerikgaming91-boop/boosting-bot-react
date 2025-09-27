const LOOT_LABEL = {
  saved: 'Saved',
  unsaved: 'Unsaved',
  vip: 'VIP',
  community: 'Community'
};

// Wochentag (de) kurz: Mo, Di, Mi, Do, Fr, Sa, So
function weekdayShortDE(date) {
  const i = date.getDay(); // 0 = So
  return ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][isNaN(i) ? 0 : i];
}
function pad2(n) { return String(n).padStart(2, '0'); }

// -------- Titel-Format --------
// Gewünscht: "Tag-Uhrzeit-Schwierigkeit-Loottype"
// Beispiel:  "Mo-20:00-Mythic-Unsaved"
export function buildAutoTitle({ datetime, difficulty, loot_type }) {
  const d = new Date(datetime);
  const tag = weekdayShortDE(d);
  const uhr = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const loot = LOOT_LABEL[(loot_type || '').toLowerCase()] || (loot_type || '');
  return `${tag}-${uhr}-${difficulty}${loot ? `-${loot}` : ''}`;
}

// Embed-Titel an gleicher Stelle wie Auto-Titel halten
export function prettyRaidTitle(raid) {
  return buildAutoTitle({
    datetime: raid.datetime,
    difficulty: raid.difficulty,
    loot_type: raid.loot_type
  });
}

// Channel-Name weiterhin ausführlich, inkl. Run-Type (wie zuvor gewünscht).
// Beispiel: "mo-2000-mythic-sales-unsaved"
function slug(x){
  return String(x||'').toLowerCase()
    .replace(/[ä]/g,'ae').replace(/[ö]/g,'oe').replace(/[ü]/g,'ue').replace(/ß/g,'ss')
    .replace(/[^a-z0-9\- ]+/g,'').replace(/\s+/g,'-').replace(/\-+/g,'-').substring(0, 90);
}

export function toDiscordChannelName(datetime, difficulty, runType, lootType){
  const d = new Date(datetime);
  const hh = pad2(d.getHours());
  const mm = pad2(d.getMinutes());
  const wd = ['so','mo','di','mi','do','fr','sa'][isNaN(d)?0:d.getDay()];
  const parts = [ `${wd}-${hh}${mm}`, slug(difficulty), slug(runType) ];
  if (lootType) parts.push(slug(lootType));
  return parts.filter(Boolean).join('-');
}

// (Falls du an anderer Stelle ein hübsches Datum brauchst)
export function prettyDateTime(iso){
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit'
  }).format(d).replace(',', '');
}
