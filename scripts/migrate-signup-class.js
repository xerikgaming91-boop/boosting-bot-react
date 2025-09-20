// scripts/migrate-signup-class.js
import Database from "better-sqlite3";
import { existsSync } from "fs";

const DB_PATH = "data.sqlite";

if (!existsSync(DB_PATH)) {
  console.error("DB nicht gefunden:", DB_PATH);
  process.exit(1);
}

const db = new Database(DB_PATH);

// Prüfen, ob Spalte schon existiert
const cols = db.prepare("PRAGMA table_info(signups)").all();
const hasCol = cols.some(c => c.name === "signup_class");

if (hasCol) {
  console.log("Spalte signup_class existiert bereits – nichts zu tun.");
  process.exit(0);
}

db.exec("ALTER TABLE signups ADD COLUMN signup_class TEXT;");
console.log("Spalte signup_class wurde hinzugefügt.");
