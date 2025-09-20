// client/src/ui/classTheme.js

// WoW Klassenfarben (offizielle Tints / übliche Hex-Werte)
const CLASS_COLORS = {
  warrior:       "#C79C6E",
  paladin:       "#F58CBA",
  hunter:        "#ABD473",
  rogue:         "#FFF569",
  priest:        "#FFFFFF",
  death_knight:  "#C41F3B",
  shaman:        "#0070DE",
  mage:          "#40C7EB",
  warlock:       "#8787ED",
  monk:          "#00FF96",
  druid:         "#FF7D0A",
  demon_hunter:  "#A330C9",
  evoker:        "#33937F",
};

const CLASS_DISPLAY = {
  warrior: "Warrior",
  paladin: "Paladin",
  hunter: "Hunter",
  rogue: "Rogue",
  priest: "Priest",
  death_knight: "Death Knight",
  shaman: "Shaman",
  mage: "Mage",
  warlock: "Warlock",
  monk: "Monk",
  druid: "Druid",
  demon_hunter: "Demon Hunter",
  evoker: "Evoker",
};

const CLASS_ICON = {
  warrior: "⚔️",
  paladin: "✨",
  hunter: "🏹",
  rogue: "🗡️",
  priest: "🕊️",
  death_knight: "💀",
  shaman: "🌊",
  mage: "❄️",
  warlock: "💜",
  monk: "🍃",
  druid: "🐻",
  demon_hunter: "👿",
  evoker: "🐲",
};

// Rollenfarben für Badges
const ROLE_COLORS = {
  tank:   "#2B6CB0", // blue
  healer: "#38A169", // green
  dps:    "#E53E3E", // red
};

// --- Utils ---
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const bigint = parseInt(h, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}
function withAlpha(hex, a) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Normalisiert Klassennamen:
 *  "Death Knight", "deathknight", "dk" -> "death_knight"
 *  "Demon Hunter", "demonhunter", "dh" -> "demon_hunter"
 */
export function canonClass(input) {
  if (!input) return "unknown";
  let s = String(input).trim().toLowerCase().replace(/\s+/g, "_");
  if (s === "dk" || s === "deathknight") s = "death_knight";
  if (s === "dh" || s === "demonhunter") s = "demon_hunter";
  const valid = new Set(Object.keys(CLASS_COLORS));
  return valid.has(s) ? s : "unknown";
}

/** Liefert Theme-Infos für eine Klasse. */
export function getClassTheme(clsLike) {
  const slug = canonClass(clsLike);
  const base = CLASS_COLORS[slug] || "#94a3b8"; // Fallback (Slate-400)
  const name = CLASS_DISPLAY[slug] || "Unknown";
  const icon = CLASS_ICON[slug] || "🔹";
  const bg   = withAlpha(base, 0.14);
  const ring = withAlpha(base, 0.45);
  const text = base;
  return { slug, name, color: base, bg, text, ring, icon };
}

/** Stil-Objekt für Badges/Pills (kompatibel zu Inline-Styles). */
export function getClassStyle(clsLike, { compact = false } = {}) {
  const t = getClassTheme(clsLike);
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: compact ? "0.15rem 0.55rem" : "0.3rem 0.7rem",
    borderRadius: "999px",
    backgroundColor: t.bg,
    color: t.text,
    border: `1px solid ${t.ring}`,
    fontSize: compact ? "0.8rem" : "0.9rem",
    lineHeight: 1.1,
    whiteSpace: "nowrap",
  };
}

/** Role-Theme + Style */
export function getRoleTheme(roleLike) {
  const r = String(roleLike || "dps").toLowerCase();
  const base = ROLE_COLORS[r] || ROLE_COLORS.dps;
  return {
    color: base,
    bg: withAlpha(base, 0.14),
    text: base,
    ring: withAlpha(base, 0.45),
  };
}
export function getRoleStyle(roleLike, { compact = true } = {}) {
  const t = getRoleTheme(roleLike);
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: compact ? "0.12rem 0.5rem" : "0.28rem 0.6rem",
    borderRadius: "999px",
    backgroundColor: t.bg,
    color: t.text,
    border: `1px solid ${t.ring}`,
    fontSize: compact ? "0.75rem" : "0.85rem",
    lineHeight: 1.1,
    whiteSpace: "nowrap",
  };
}

/** Nur das Emoji/Zeichen der Klasse. */
export function classIcon(clsLike) {
  return getClassTheme(clsLike).icon;
}
