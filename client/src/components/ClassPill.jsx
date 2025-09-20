// client/src/components/ClassPill.jsx
import React from "react";
import { getClassTheme, canonClass } from "/src/ui/classTheme.js";

/**
 * Props:
 *  - classNameLike: string (z.B. "Death Knight", "mage"...)
 *  - spec?: string
 *  - compact?: boolean
 *  - showIcon?: boolean (default true)
 *  - style / className: optional
 */
export default function ClassPill({
  classNameLike,
  spec,
  compact = false,
  showIcon = true,
  style = {},
  className = "",
}) {
  const theme = getClassTheme(classNameLike);
  const slug = canonClass(classNameLike);

  const baseStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: compact ? "0.15rem 0.55rem" : "0.3rem 0.7rem",
    borderRadius: "999px",
    background: theme.bg,
    color: theme.text,
    border: `1px solid ${theme.ring}`,
    fontSize: compact ? "0.8rem" : "0.9rem",
    lineHeight: 1.1,
    whiteSpace: "nowrap",
  };

  return (
    <span
      title={theme.name}
      className={`class-pill ${className}`.trim()}
      style={{ ...baseStyle, ...style }}
      data-class={slug}
    >
      {showIcon && <span aria-hidden="true">{theme.icon}</span>}
      <span style={{ fontWeight: 600 }}>{theme.name}</span>
      {spec ? <span style={{ opacity: 0.9 }}>· {spec}</span> : null}
    </span>
  );
}
