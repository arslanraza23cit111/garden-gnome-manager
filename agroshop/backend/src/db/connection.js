import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "../..");

export const DATA_DIR = process.env.AGROSHOP_DATA_DIR || path.join(BACKEND_ROOT, "data");
export const DB_FILE = process.env.AGROSHOP_DB_FILE || path.join(DATA_DIR, "agroshop.db");

let db;

/** Opens (and migrates) the single local SQLite file. */
export function getDb() {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  db = new Database(DB_FILE);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  return db;
}

/** Wraps a function so every statement inside runs in ONE atomic transaction. */
export function tx(fn) {
  return getDb().transaction(fn);
}
