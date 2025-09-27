// tools/apply-auth-guards.mjs
// Run from project root: node tools/apply-auth-guards.mjs
import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const serverPath = path.join(ROOT, "client", "src", "server", "server.js");
const backupPath = serverPath + ".bak." + Date.now();

const MIDDLEWARE = `
// Min. Raidlead (oder Admin/Elevated)
async function requireRaidlead(req, res, next) {
  try {
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    // Admin/Elevated zählt immer
    if (await isElevated(req.user.id)) return next();
    const self = Users.get(req.user.id);
    if (self?.is_raidlead) return next();
    return res.status(403).json({ ok: false, error: "raidlead_required" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
}
`;

const GUARDS = `
// Zugriffsregeln:
app.use("/api/users",   ensureAuth, requireElevated, (req, res, next) => next()); // nur Admin
app.use("/api/presets", ensureAuth, requireRaidlead, (req, res, next) => next()); // min. Raidlead
`;

function insertAfter(source, anchorRegex, toInsert) {
  const m = source.match(anchorRegex);
  if (!m) return null;
  const idx = m.index + m[0].length;
  return source.slice(0, idx) + "\n\n" + toInsert + source.slice(idx);
}

(async () => {
  let code = await fs.readFile(serverPath, "utf8");

  // Backup anlegen
  await fs.writeFile(backupPath, code, "utf8");

  let changed = false;

  // 1) Middleware einfügen, falls noch nicht da
  if (!/function\s+requireRaidlead\s*\(/.test(code)) {
    // bevorzugt hinter requireElevated, sonst hinter ensureAuth, sonst am Ende vor "Server" Abschnitt
    const afterReqElev = insertAfter(code, /async\s+function\s+requireElevated[\s\S]*?\n}\s*/, MIDDLEWARE);
    if (afterReqElev) {
      code = afterReqElev;
    } else {
      const afterEnsure = insertAfter(code, /function\s+ensureAuth[\s\S]*?\n}\s*/, MIDDLEWARE);
      if (afterEnsure) {
        code = afterEnsure;
      } else {
        // Fallback: vor dem "Server"-Block oder ans Ende
        const beforeServer = code.indexOf("/* --------");
        if (beforeServer > -1) {
          code = code.slice(0, beforeServer) + MIDDLEWARE + "\n\n" + code.slice(beforeServer);
        } else {
          code += "\n\n" + MIDDLEWARE + "\n";
        }
      }
    }
    changed = true;
  }

  // 2) Guards einfügen, wenn nicht vorhanden
  if (!code.includes('app.use("/api/users",   ensureAuth, requireElevated') ||
      !code.includes('app.use("/api/presets", ensureAuth, requireRaidlead')) {

    // a) Versuch: direkt vor dem ersten Router-Mount (erste Zeile mit "app.use(" nach Kommentar "Router")
    let inserted = false;

    // Suche nach dem Kommentar-Block der Router
    const routerHeader = /\/\*\s*-{3,}[\s\S]{0,80}Router[\s\S]{0,80}-{3,}\s*\*\//i;
    const mHeader = code.match(routerHeader);
    if (mHeader) {
      const idx = mHeader.index + mHeader[0].length;
      code = code.slice(0, idx) + "\n\n" + GUARDS + code.slice(idx);
      inserted = true;
    }

    // b) Fallback: vor der ersten "app.use(" überhaupt
    if (!inserted) {
      const firstUse = code.indexOf("app.use(");
      if (firstUse > -1) {
        code = code.slice(0, firstUse) + "\n\n" + GUARDS + code.slice(firstUse);
        inserted = true;
      }
    }

    // c) Wenn immer noch nicht, ans Ende (funktioniert ebenfalls, nur später im Code)
    if (!inserted) {
      code += "\n\n" + GUARDS + "\n";
    }

    changed = true;
  }

  if (changed) {
    await fs.writeFile(serverPath, code, "utf8");
    console.log("✅ server.js gepatcht.");
    console.log("📦 Backup:", backupPath);
  } else {
    console.log("ℹ️ Keine Änderungen nötig – scheint bereits gepatcht.");
    console.log("📦 (trotzdem Backup erstellt):", backupPath);
  }
})().catch(err => {
  console.error("❌ Patch fehlgeschlagen:", err);
  process.exit(1);
});
