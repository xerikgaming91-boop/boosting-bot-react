// Konstruiert den offiziellen Warcraft-Logs Profil-Link aus Region/Realm/Name.
// Keine externen Requests nötig, robust bei Leer- und Sonderzeichen.
export async function maybeAddWarcraftLogsInfo(basics) {
  const region = String(basics.region || 'eu').trim().toLowerCase();
  const realm = String(basics.realm || '').trim().toLowerCase().replace(/\s+/g, '-');
  const name  = String(basics.name  || basics.character || '').trim();

  let wcl_url = null;
  if (region && realm && name) {
    // WCL ist case-insensitive, aber schöner mit originaler Schreibweise des Namens:
    const encRealm = encodeURIComponent(realm);
    const encName  = encodeURIComponent(name);
    wcl_url = `https://www.warcraftlogs.com/character/${region}/${encRealm}/${encName}`;
  }

  return { ...basics, wcl_url };
}
