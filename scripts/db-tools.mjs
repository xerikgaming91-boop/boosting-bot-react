// scripts/db-tools.mjs
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

const DB_PATH = path.resolve(process.cwd(), "data.sqlite");

function openDb() {
  if (!fs.existsSync(DB_PATH)) {
    console.log("Kein data.sqlite gefunden – nichts zu tun.");
    process.exit(0);
  }
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  return db;
}

function wipeRaids() {
  const db = openDb();
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM signups").run();
    db.prepare("DELETE FROM raids").run();
  });
  tx();

  try { db.prepare("VACUUM").run(); } catch {}
  console.log("✅ Alle Raids & Signups gelöscht.");
  db.close();
}

function wipeAll() {
  // Hard reset: Datei löschen
  if (fs.existsSync(DB_PATH)) {
    fs.rmSync(DB_PATH);
    console.log("✅ data.sqlite gelöscht (Hard Reset).");
  } else {
    console.log("ℹ️ data.sqlite existiert nicht – nichts zu tun.");
  }
}

const cmd = (process.argv[2] || "").toLowerCase();
if (cmd === "wipe-raids") {
  wipeRaids();
} else if (cmd === "wipe-all") {
  wipeAll();
} else {
  console.log(`Benutzung:
  node scripts/db-tools.mjs wipe-raids   # löscht NUR raids + signups
  node scripts/db-tools.mjs wipe-all     # löscht komplette DB-Datei (Hard Reset)
`);
  process.exit(1);
}
