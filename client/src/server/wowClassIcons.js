// Kleine, vektorbasierte Klassen-Icons + Farben (keine externen Assets)
import React from "react";

export const CLASS_COLORS = {
  "death knight": "#C41F3B",
  "demon hunter": "#A330C9",
  druid: "#FF7D0A",
  evoker: "#33937F",
  hunter: "#ABD473",
  mage: "#69CCF0",
  monk: "#00FF96",
  paladin: "#F58CBA",
  priest: "#FFFFFF",
  rogue: "#FFF569",
  shaman: "#0070DE",
  warlock: "#9482C9",
  warrior: "#C79C6E",
};

export function normalizeClassName(raw) {
  if (!raw) return "";
  const s = String(raw).trim().toLowerCase();
  const map = {
    dk: "death knight",
    "deathknight": "death knight",
    "demonhunter": "demon hunter",
  };
  return map[s] || s;
}

function glyphPath(name) {
  // Sehr einfache, wiedererkennbare Formen (kein Blizzard-Artwork)
  switch (name) {
    case "warrior": // gekreuzte Klingen
      return (
        <>
          <path d="M10 6 L12 8 L6 14 L4 12 Z" />
          <path d="M14 6 L12 8 L18 14 L20 12 Z" />
        </>
      );
    case "paladin": // Hammer
      return (
        <>
          <rect x="7" y="6" width="6" height="5" rx="1" />
          <rect x="9.5" y="10" width="3" height="8" />
        </>
      );
    case "hunter": // Bogen + Sehne
      return (
        <>
          <path d="M6 6 C14 6, 14 18, 6 18" />
          <line x1="6" y1="6" x2="6" y2="18" />
        </>
      );
    case "rogue": // Dolch
      return (
        <>
          <path d="M12 5 L14 9 L12 13 L10 9 Z" />
          <rect x="11" y="13" width="2" height="6" rx="1" />
        </>
      );
    case "priest": // Kreuz
      return (
        <>
          <rect x="11" y="6" width="2" height="12" />
          <rect x="8" y="10" width="8" height="2" />
        </>
      );
    case "death knight": // Schädel angedeutet
      return (
        <>
          <circle cx="12" cy="9" r="3.5" />
          <rect x="9" y="12.5" width="6" height="4" rx="1.5" />
          <circle cx="11" cy="9" r="0.9" fill="var(--bg, #0b1020)" />
          <circle cx="13" cy="9" r="0.9" fill="var(--bg, #0b1020)" />
        </>
      );
    case "shaman": // Blitz/Runen
      return <path d="M9 6 L15 11 L12 11 L18 18 L10 13 L13 13 Z" />;
    case "mage": // Stern/Arcane
      return (
        <>
          <path d="M12 6 L13.5 10.5 L18 12 L13.5 13.5 L12 18 L10.5 13.5 L6 12 L10.5 10.5 Z" />
        </>
      );
    case "warlock": // Flamme
      return (
        <>
          <path d="M12 6 C15 8, 16 10, 15 12 C15 14, 13.5 15.5, 12 17 C10.5 15.5, 9 14, 9 12 C8 10, 9 8, 12 6 Z" />
        </>
      );
    case "monk": // Faust
      return (
        <>
          <rect x="8" y="9" width="8" height="6" rx="3" />
          <rect x="7" y="11" width="2" height="2" rx="1" />
        </>
      );
    case "druid": // Tatze
      return (
        <>
          <circle cx="9" cy="9" r="1.6" />
          <circle cx="12" cy="8.5" r="1.6" />
          <circle cx="15" cy="9" r="1.6" />
          <path d="M8.5 13 C9.5 11.5, 14.5 11.5, 15.5 13 C16.5 14.5, 15 16.5, 12 16.5 C9 16.5, 7.5 14.5, 8.5 13 Z" />
        </>
      );
    case "demon hunter": // Twinblades
      return (
        <>
          <path d="M6 12 C8 9, 10 9, 12 12 C10 15, 8 15, 6 12 Z" />
          <path d="M18 12 C16 9, 14 9, 12 12 C14 15, 16 15, 18 12 Z" />
        </>
      );
    case "evoker": // Flügel
      return <path d="M6 15 C9 9, 15 7, 18 9 C14 11, 12 13, 10 16 Z" />;
    default: // Fallback Punkt
      return <circle cx="12" cy="12" r="3" />;
  }
}

function getContrast(colorHex) {
  // einfache Kontrastberechnung: hell -> dunkles Glyph, sonst weiß
  const c = colorHex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 180 ? "#0b1020" : "#ffffff";
}

export function ClassIcon({ name, size = 28, ring = true }) {
  const n = normalizeClassName(name);
  const color = CLASS_COLORS[n] || "#888";
  const stroke = "rgba(0,0,0,.25)";
  const fg = getContrast(color);

  const s = size;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      aria-label={name}
      role="img"
      style={{ display: "inline-block", verticalAlign: "middle", borderRadius: "50%" }}
    >
      <defs>
        {ring && (
          <linearGradient id="ring" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,.35)" />
            <stop offset="100%" stopColor="rgba(0,0,0,.15)" />
          </linearGradient>
        )}
      </defs>
      <g>
        <circle cx="12" cy="12" r="11" fill={color} stroke={stroke} />
        {ring && <circle cx="12" cy="12" r="11" fill="url(#ring)" />}
        <g
          transform="translate(0,0)"
          fill={fg}
          stroke={fg}
          strokeWidth="0"
        >
          {glyphPath(n)}
        </g>
      </g>
    </svg>
  );
}

export function ClassPill({ name }) {
  const n = normalizeClassName(name);
  const color = CLASS_COLORS[n] || "#666";
  const fg = getContrast(color);
  return (
    <span
      className="badge"
      style={{
        background: "transparent",
        borderColor: color,
        color: fg,
        boxShadow: `0 0 0 2px ${color} inset`,
      }}
    >
      <ClassIcon name={name} size={18} ring={false} />{" "}
      <strong style={{ marginLeft: 6 }}>{String(name)}</strong>
    </span>
  );
}
