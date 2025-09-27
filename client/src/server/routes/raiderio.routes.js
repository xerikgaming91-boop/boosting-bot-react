import fetch from 'node-fetch';

export async function fetchFromRaiderIO(region, realm, name) {
  const url = new URL('https://raider.io/api/v1/characters/profile');
  url.searchParams.set('region', region);
  url.searchParams.set('realm', realm);
  url.searchParams.set('name', name);
  url.searchParams.set('fields', 'gear,mythic_plus_scores_by_season:current');

  const res = await fetch(url.href, { headers: { 'User-Agent': 'boosting-bot/1.0' } });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Raider.IO error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const ilvl = data?.gear?.item_level_equipped ?? null;
  const mplus = data?.mythic_plus_scores_by_season?.[0]?.scores?.all ?? null;
  return {
    class: data?.class ?? null,
    spec: data?.active_spec_name ?? null,
    ilvl: ilvl ? Math.round(ilvl) : null,
    rio_score: mplus ? Math.round(mplus) : null
  };
}
