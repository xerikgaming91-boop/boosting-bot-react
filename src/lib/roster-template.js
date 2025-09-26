// src/lib/roster-template.js
//
// Roster-Posting mit Preset-Kapazitäten und optimierter Darstellung:
// - Titelzeile oben (Raidtitel)
// - Kopf: "**Current Roster (N)** (2x <:tank:…> | 1x <:heal:…> | ...)"
// - Rollenblöcke mit "Header (x/y)" und Zeilen mit Rollen-Emoji
// - freie Slots als "Missing"
// - Spieler: @mention + Klassen-Emoji + Saved/Unsaved-Emoji (<:Saved:…>/<:Lootshare:…>)
// - Lootbuddies-Block wird ausgeblendet, wenn cap=0 und keiner gepickt ist
// - KEIN Lead-Ping unten

import { db, Raids, Signups, Presets } from "./db.js";

/** dieselben Emoji-Typen wie im Embed */
const EMOJI = {
  dps:  "<:dps:1410398124090064957>",
  tank: "<:tank:1410398280679952484>",
  heal: "<:heal:1410398229832667177>",
  loot: "<:Lootshare:1418723379510509610>", // korrekt: Lootshare
};

/** Saved/Unsaved: Custom-Emojis */
const SAVED_EMOJI   = "<:Saved:1418723719072714812>";
const UNSAVED_EMOJI = "<:Lootshare:1418723379510509610>";

const ROLE_META = {
  tank:   { label: "Tanks",       emoji: EMOJI.tank },
  healer: { label: "Healers",     emoji: EMOJI.heal },
  dps:    { label: "DPS",         emoji: EMOJI.dps  },
  loot:   { label: "Lootbuddies", emoji: EMOJI.loot },
};

/* ---------- Klassen-Emojis (wie in bot.js) ---------- */
const CLASS_EMOJI = {
  Evoker:       { name: "Evoker",  id: "1410398715222691972" },
  Shaman:       { name: "Shaman",  id: "1410398490126848122" },
  Mage:         { name: "Mage",    id: "1410398574038221000" },
  Monk:         { name: "Monk",    id: "1410398330412077156" },
  Paladin:      { name: "Paladin", id: "1410399362705522699" },
  Priest:       { name: "Priest",  id: "1410398598033703073" },
  Rogue:        { name: "Rogue",   id: "1410398518530670613" },
  Warlock:      { name: "Warlock", id: "1410399511502655560" },
  Warrior:      { name: "Warrior", id: "1410398635220537406" },
  Druid:        { name: "Druid",   id: "1410398827436965980" },
  "Death Knight": { name: "dk", id: "1410398938581700680" },
  "Demon Hunter": { name: "dh", id: "1410398548989706290" },
};
function toTitleClass(any) {
  if (!any) return null;
  const key = String(any).trim().toLowerCase().replace(/[\s_-]+/g, "");
  const map = {
    dk: "Death Knight", deathknight: "Death Knight", deathnight: "Death Knight",
    dh: "Demon Hunter", demonhunter: "Demon Hunter",
    druid: "Druid", evoker: "Evoker", hunter: "Hunter", mage: "Mage",
    monk: "Monk", paladin: "Paladin", priest: "Priest", rogue: "Rogue",
    shaman: "Shaman", warlock: "Warlock", warrior: "Warrior",
  };
  return map[key] || null;
}
function classEmojiByAny(any) {
  const title = toTitleClass(any);
  if (!title) return "";
  const e = CLASS_EMOJI[title];
  return e ? `<:${e.name}:${e.id}>` : "";
}

/* ---------- Helfer ---------- */
const roleKey = (s) => String(s.role || s.slot || "").toLowerCase();
const mention = (id) => (id ? `<@${id}>` : "unbekannt");

function loadPickedSignups(raidId) {
  try {
    if (typeof Signups?.listForRaidWithChars === "function") {
      return (Signups.listForRaidWithChars(raidId) || []).filter((s) => Number(s.picked) === 1);
    }
  } catch {}
  try {
    return db.prepare(`SELECT * FROM signups WHERE raid_id=? AND picked=1 ORDER BY id`).all(raidId);
  } catch {
    return [];
  }
}

/** eine Rollenliste generieren – jede Zeile mit dem Rollen-Emoji */
function buildRoleBlock({ role, cap, items }) {
  const meta = ROLE_META[role];
  const used = (items || []).slice(0, Math.max(0, cap || items.length));
  const free = Math.max(0, (cap || 0) - used.length);

  const lines = [];
  for (const n of used) lines.push(`${meta.emoji} ${n}`);
  for (let i = 0; i < free; i++) lines.push(`${meta.emoji} Missing`);

  const header =
    typeof cap === "number" && cap >= 0
      ? `${meta.emoji} ${meta.label} (${used.length}/${cap})`
      : `${meta.emoji} ${meta.label}`;

  return { header, lines };
}

/** Haupt-Funktion für Discord-Text */
export function buildRosterText(raidId) {
  const raid = Raids.get ? Raids.get(raidId) : db.prepare(`SELECT * FROM raids WHERE id=?`).get(raidId);
  if (!raid) throw new Error("raid_not_found");

  // Preset-Kapazitäten laden: zuerst Snapshot am Raid, sonst Fallback auf Preset
  let caps = {
    tank:   Number(raid.cap_tanks || 0),
    healer: Number(raid.cap_healers || 0),
    dps:    Number(raid.cap_dps || 0),
    loot:   Number(raid.cap_lootbuddies || 0),
  };
  if ((!caps.tank && !caps.healer && !caps.dps && !caps.loot) && raid.preset_id) {
    try {
      const p = Presets.get(raid.preset_id);
      if (p) {
        caps = {
          tank:   Number(p.tanks || 0),
          healer: Number(p.healers || 0),
          dps:    Number(p.dps || 0),
          loot:   Number(p.lootbuddies || 0),
        };
      }
    } catch {}
  }

  const picked = loadPickedSignups(raidId);

  // Darstellung: @mention + Klassen-Emoji + saved/unsaved (Custom Emojis)
  const fmt = (s) => {
    const r = roleKey(s);
    const cls =
      (r === "loot" || r === "lootbuddy" || r === "lb")
        ? (s.signup_class || s.class || s.char_class || null)
        : (s.char_class || s.class || s.signup_class || null);

    const clsIcon = classEmojiByAny(cls);
    const savedVal = String(s.lockout || s.saved || "unsaved").toLowerCase();
    const lockEmoji = savedVal === "saved" ? SAVED_EMOJI : UNSAVED_EMOJI; // <:Saved:…> / <:Lootshare:…>
    return `${mention(s.user_id)}${clsIcon ? ` ${clsIcon}` : ""} ${lockEmoji}`;
  };

  const byRole = {
    tank:   picked.filter((s) => roleKey(s) === "tank").map(fmt),
    healer: picked.filter((s) => roleKey(s) === "healer" || roleKey(s) === "heal").map(fmt),
    dps:    picked.filter((s) => roleKey(s) === "dps").map(fmt),
    loot:   picked.filter((s) => {
              const r = roleKey(s);
              return r === "loot" || r === "lootbuddy" || r === "lb";
            }).map(fmt),
  };

  // Titel oben
  const titleTop = `**${raid.title || `Raid ${raid.id}`}**`;

  // Kopfzeile (Counts wie im Embed) – Loot nur zeigen, wenn cap>0 ODER es bereits LBs gibt
  const includeLootInHeader = (caps.loot > 0) || (byRole.loot.length > 0);
  const header =
    `**Current Roster (${picked.length})** (` +
    `${byRole.tank.length}x ${EMOJI.tank} | ` +
    `${byRole.healer.length}x ${EMOJI.heal} | ` +
    `${byRole.dps.length}x ${EMOJI.dps}` +
    (includeLootInHeader ? ` | ${byRole.loot.length}x ${EMOJI.loot}` : "") +
    `)`;

  // Rollenblöcke
  const blocks = [
    buildRoleBlock({ role: "tank",   cap: caps.tank,   items: byRole.tank }),
    buildRoleBlock({ role: "healer", cap: caps.healer, items: byRole.healer }),
    buildRoleBlock({ role: "dps",    cap: caps.dps,    items: byRole.dps }),
  ];
  // Loot nur anhängen, wenn cap>0 ODER gepickte vorhanden
  if (includeLootInHeader) {
    blocks.push(buildRoleBlock({ role: "loot", cap: caps.loot, items: byRole.loot }));
  }

  // Footer ohne Lead-Ping
  const footerInfo = `_Raid ${raid.id}_`;

  const out = [titleTop, header, ""];
  for (const b of blocks) {
    out.push(b.header);
    if (b.lines.length) out.push(b.lines.join("\n"));
    out.push("");
  }
  out.push(footerInfo);

  return {
    title: titleTop,
    header,
    blocks,
    footer: footerInfo,
    text: out.join("\n"),
    caps,
  };
}

/** Kompakter Header (optional) */
export function buildCompactHeader(raidId) {
  const raid = Raids.get ? Raids.get(raidId) : db.prepare(`SELECT * FROM raids WHERE id=?`).get(raidId);
  if (!raid) throw new Error("raid_not_found");

  // gleiche Cap-Ermittlung wie oben
  let caps = {
    tank:   Number(raid.cap_tanks || 0),
    healer: Number(raid.cap_healers || 0),
    dps:    Number(raid.cap_dps || 0),
    loot:   Number(raid.cap_lootbuddies || 0),
  };
  if ((!caps.tank && !caps.healer && !caps.dps && !caps.loot) && raid.preset_id) {
    try {
      const p = Presets.get(raid.preset_id);
      if (p) {
        caps = {
          tank:   Number(p.tanks || 0),
          healer: Number(p.healers || 0),
          dps:    Number(p.dps || 0),
          loot:   Number(p.lootbuddies || 0),
        };
      }
    } catch {}
  }

  const picked = loadPickedSignups(raidId);
  const cnt = {
    tank:   picked.filter((s) => roleKey(s) === "tank").length,
    healer: picked.filter((s) => roleKey(s) === "healer" || roleKey(s) === "heal").length,
    dps:    picked.filter((s) => roleKey(s) === "dps").length,
    loot:   picked.filter((s) => {
              const r = roleKey(s); return r === "loot" || r === "lootbuddy" || r === "lb";
            }).length,
  };

  const includeLoot = (caps.loot > 0) || (cnt.loot > 0);

  return `**${raid.title || `Raid ${raid.id}`}**\n**Current Roster (${picked.length})** (${cnt.tank}x ${EMOJI.tank} | ${cnt.healer}x ${EMOJI.heal} | ${cnt.dps}x ${EMOJI.dps}` +
    (includeLoot ? ` | ${cnt.loot}x ${EMOJI.loot}` : "") +
    `)  —  Ziel: (${caps.tank}/${caps.healer}/${caps.dps}/${includeLoot ? caps.loot : 0})`;
}
