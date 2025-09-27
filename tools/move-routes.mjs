// tools/move-routes.mjs
// Run from project root: node tools/move-routes.mjs [--dry]
import fs from "fs/promises";
import path from "path";

const ROOT = process.cwd();
const DRY = process.argv.includes("--dry");

const serverDir = path.join(ROOT, "client", "src", "server");
const routesDir = path.join(serverDir, "routes");

// bekannte Route-Dateien, die evtl. noch nicht *.routes.js heißen
const extraRouteFiles = [
  "raidleads.js",
  "schedule.js",
  "raiderio.js",
  "wcl.js",
  "users.js",
  "roster.js",
  "presets.js",
  "pick.js",
  "pcr.js",
  "cycle.js"
];

const exists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };
const ensureDir = async (p) => { if (!DRY) await fs.mkdir(p, { recursive: true }); };
const rel = (p) => path.relative(ROOT, p);
const read = (p) => fs.readFile(p, "utf8");
const write = (p, s) => (DRY ? console.log(`[dry] write ${rel(p)}`) : fs.writeFile(p, s, "utf8"));

const addJsIfMissing = (spec) => {
  if (/\.[a-zA-Z0-9]+$/.test(spec) || spec.endsWith("/")) return spec;
  return `${spec}.js`;
};
const baseName = (file) => file.replace(/\\/g, "/").replace(/\.js$/i, "").split("/").pop();
const toRoutesName = (name) => `${baseName(name)}.routes.js`;

const moveOrCopy = async (src, dest) => {
  if (DRY) { console.log(`[dry] move ${rel(src)} -> ${rel(dest)}`); return; }
  if (await exists(dest)) await fs.rm(dest, { force: true, recursive: true });
  try { await fs.rename(src, dest); }
  catch { await fs.cp(src, dest, { recursive: true }); await fs.rm(src, { force: true, recursive: true }); }
};

// small helper: posix relative path with ./ prefix
const relFrom = (from, to) => {
  let r = path.relative(from, to).replace(/\\/g, "/");
  if (!r.startsWith(".")) r = "./" + r;
  return r;
};

(async () => {
  if (!(await exists(serverDir))) {
    console.error(`❌ Not found: ${rel(serverDir)} (run from project root)`);
    process.exit(1);
  }
  await ensureDir(routesDir);

  // 1) Move/rename routes into routesDir
  const entries = await fs.readdir(serverDir, { withFileTypes: true });
  const toMove = [];

  for (const e of entries) {
    if (!e.isFile()) continue;
    if (e.name.endsWith(".routes.js")) {
      toMove.push({ src: path.join(serverDir, e.name), destName: e.name });
    }
  }
  for (const nm of extraRouteFiles) {
    const p = path.join(serverDir, nm);
    if (await exists(p)) toMove.push({ src: p, destName: toRoutesName(nm) });
  }

  if (toMove.length) {
    console.log("➡️  verschiebe/benenne nach server/routes/:");
    for (const { src, destName } of toMove) {
      console.log("  -", path.basename(src), "->", destName);
      await moveOrCopy(src, path.join(routesDir, destName));
    }
  }

  // 1b) In-place rename inside routesDir if still not *.routes.js
  const inRoutes = (await fs.readdir(routesDir, { withFileTypes: true }).catch(() => []))
    .filter((d) => d.isFile());
  for (const e of inRoutes) {
    const p = path.join(routesDir, e.name);
    if (!e.name.endsWith(".routes.js") && e.name.endsWith(".js")) {
      const target = path.join(routesDir, toRoutesName(e.name));
      console.log("  ↪︎ rename in place:", e.name, "->", path.basename(target));
      if (!DRY) {
        if (await exists(target)) await fs.rm(target, { force: true, recursive: true });
        await fs.rename(p, target);
      }
    }
  }

  // 2) Build set/map of current routes
  const routeFiles = (await fs.readdir(routesDir)).filter((f) => f.endsWith(".routes.js"));
  const routeBases = new Set(routeFiles.map((f) => baseName(f).replace(/\.routes$/, "")));
  const routeTargetByBase = Object.fromEntries(
    [...routeBases].map((b) => [b, path.join(routesDir, `${b}.routes.js`)])
  );

  // 3) Patch server.js to import from ./routes/<name>.routes.js
  const serverJs = path.join(serverDir, "server.js");
  if (await exists(serverJs)) {
    let code = await read(serverJs);
    const before = code;

    // A) ./<x>.routes(.js)?  -> ./routes/<x>.routes.js
    code = code.replace(
      /from\s+(['"])\.\/((?!routes\/)[\w.\-\/]+?\.routes)(?:\.js)?\1/g,
      (_m, q, mod) => `from ${q}./routes/${mod}.js${q}`
    );
    // B) ensure .js for existing ./routes/<x>.routes
    code = code.replace(
      /from\s+(['"])(\.\/routes\/[\w.\-\/]+?\.routes)(?!\.js)\1/g,
      (_m, q, mod) => `from ${q}${mod}.js${q}`
    );
    // C) known non-.routes names to ./routes/<base>.routes.js
    for (const b of Object.keys(routeTargetByBase)) {
      const rx = new RegExp(
        `from\\s+(['"])\\.(?:\\/|\\\\)(?:routes\\/${b}(?:\\.routes)?|${b})(?:\\.js)?\\1`,
        "g"
      );
      code = code.replace(rx, (_m, q) => `from ${q}./routes/${b}.routes.js${q}`);
    }
    // D) generic: add .js to relative imports
    code = code.replace(
      /from\s+(['"])(\.\.?\/[^'"]+)(\1)/g,
      (_m, q1, spec, q3) => `from ${q1}${addJsIfMissing(spec)}${q3}`
    );

    if (code !== before) { await write(serverJs, code); console.log("🛠️  server.js: Importe angepasst"); }
    else { console.log("ℹ️ server.js: keine Import-Anpassungen nötig"); }
  } else {
    console.log("⚠️  client/src/server/server.js nicht gefunden – übersprungen.");
  }

  // 4) Patch ALL other server files (e.g. scheduler.js) to point to routes/<base>.routes.js
  // Walk client/src/server recursively, skip routesDir itself (die Routen patchen wir separat in Schritt 5)
  const walk = async (dir) => {
    const out = [];
    for (const d of await fs.readdir(dir, { withFileTypes: true })) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (path.resolve(p) === path.resolve(routesDir)) continue; // skip routes
        out.push(...await walk(p));
      } else if (d.isFile() && d.name.endsWith(".js")) {
        out.push(p);
      }
    }
    return out;
  };
  const otherServerFiles = (await walk(serverDir)).filter((p) => !p.startsWith(routesDir));

  for (const file of otherServerFiles) {
    let code = await read(file);
    const before = code;
    const fileDir = path.dirname(file);

    code = code.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g, (_m, q1, spec) => {
      let s = spec.replace(/\\/g, "/");

      // normalize no-ext form
      const noExt = s.replace(/\.[a-zA-Z0-9]+$/, "");
      const name = noExt.split("/").pop(); // last segment
      const base = name.replace(/\.routes$/, "");

      if (routeBases.has(base)) {
        // compute proper relative path to routes/<base>.routes.js
        const targetAbs = routeTargetByBase[base];
        const newSpec = relFrom(fileDir, targetAbs);
        return `from ${q1}${addJsIfMissing(newSpec)}${q1}`;
      }
      // otherwise, leave as-is (but ensure .js)
      s = addJsIfMissing(s);
      return `from ${q1}${s}${q1}`;
    });

    if (code !== before) {
      await write(file, code);
      console.log(`🛠️  ${rel(file)}: Importe angepasst`);
    }
  }

  // 5) Patch inside route files (relative to routes dir)
  for (const f of routeFiles) {
    const p = path.join(routesDir, f);
    let code = await read(p);
    const before = code;

    code = code.replace(/from\s+(['"])(\.\.?\/[^'"]+)\1/g, (_m, q1, spec) => {
      let s = spec.replace(/\\/g, "/");
      const noExt = s.replace(/\.[a-zA-Z0-9]+$/, "");
      const name = noExt.split("/").pop();
      const base = name.replace(/\.routes$/, "");

      if (routeBases.has(base)) {
        // imports to another route should be './<base>.routes.js'
        return `from ${q1}./${base}.routes.js${q1}`;
      }

      // helper files up one level: if starts with "./", make it "../"
      if (s.startsWith("./")) s = "../" + s.slice(2);
      s = addJsIfMissing(s);
      return `from ${q1}${s}${q1}`;
    });

    if (code !== before) {
      await write(p, code);
      console.log(`🛠️  routes/${f}: Importe angepasst`);
    }
  }

  console.log(DRY ? "✅ Dry-run beendet." : "✅ Fertig. Starte jetzt: npm run dev");
})().catch((err) => {
  console.error("❌ Fehler:", err);
  process.exit(1);
});
