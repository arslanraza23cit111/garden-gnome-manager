import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { getDb, DB_FILE } from "../db/connection.js";
import { ValidationError, required } from "../lib/util.js";
import { logActivity } from "../lib/auth.js";

const router = Router();
const LAST_BACKUP_KEY = "last_backup_at";
const LAST_BACKUP_PATH_KEY = "last_backup_path";

function getSetting(key) {
  const row = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row?.value ?? null;
}

function setSetting(key, value) {
  getDb().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, value);
}

router.get("/backup/last", (_req, res) => {
  res.json({
    lastBackupAt: getSetting(LAST_BACKUP_KEY),
    lastBackupPath: getSetting(LAST_BACKUP_PATH_KEY),
  });
});

router.post("/backup", (req, res) => {
  const folder = String(req.body?.folder ?? "").trim();
  required(folder, "Backup folder");

  const target = path.resolve(folder);
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (err) {
    throw new ValidationError(`Cannot create or access folder: ${err.message}`);
  }
  if (!fs.statSync(target).isDirectory()) throw new ValidationError("Destination is not a folder");

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const destination = path.join(target, `agroshop-backup-${stamp}.db`);

  // Checkpoint the WAL so the copied file holds every committed write.
  try {
    getDb().pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    /* non-fatal */
  }

  try {
    fs.copyFileSync(DB_FILE, destination);
  } catch (err) {
    throw new ValidationError(`Backup failed: ${err.message}`);
  }

  const timestamp = now.toISOString();
  setSetting(LAST_BACKUP_KEY, timestamp);
  setSetting(LAST_BACKUP_PATH_KEY, target);
  logActivity(req.user?.id ?? null, "backup", "settings", null, destination);

  res.status(201).json({ destination, timestamp, folder: target });
});

export default router;
