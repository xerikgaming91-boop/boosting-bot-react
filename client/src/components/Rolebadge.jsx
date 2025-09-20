import React from "react";

const map = {
  tank:  { label: "Tank",  cls: "rb rb--tank"  },
  heal:  { label: "Healer",cls: "rb rb--heal"  },
  dps:   { label: "DPS",   cls: "rb rb--dps"   },
};

export default function RoleBadge({ role }) {
  const r = map[String(role || "").toLowerCase()] || null;
  if (!r) return null;
  return <span className={r.cls}>{r.label}</span>;
}
