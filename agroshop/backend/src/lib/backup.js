import fs from "node:fs";
import path from "node:path";
import { getDb, DB_FILE } from "../db/connection.js";
import { logActivity } from "./auth.js";
import { setSetting, LAST_BACKUP_PATH_KEY } from "./settings.js";

export const BACKUP_FILE_PATTERN = /^agroshop-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/;
export const BACKUP_FILENAME_PREFIX = "agroshop-backup-";
export const BACKUP_KEEP_LIMIT = 7;

export function rotateBackups(folder, keep = BACKUP_KEEP_LIMIT) {
  const entries = fs.readdirSync(folder, { withFileTypes: true });
  const backups = entries
    .filter((entry) => entry.isFile() && BACKUP_FILE_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  while (backups.length > keep) {
    const oldest = backups.shift();
    try {
      fs.rmSync(path.join(folder, oldest));
    } catch {
      // best-effort cleanup, keep going
    }
  }
}

export function runBackupToFolder(folder, userId = null) {
  const target = path.resolve(folder);
  fs.mkdirSync(target, { recursive: true });
  if (!fs.statSync(target).isDirectory()) throw new Error("Destination is not a folder");

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const destination = path.join(target, `${BACKUP_FILENAME_PREFIX}${stamp}.db`);

  try {
    getDb().pragma("wal_checkpoint(TRUNCATE)");
  } catch {
    /* non-fatal */
  }

  fs.copyFileSync(DB_FILE, destination);
  rotateBackups(target, BACKUP_KEEP_LIMIT);
  setSetting(LAST_BACKUP_PATH_KEY, target);
  logActivity(userId, "backup", "settings", null, destination);
  return { destination, timestamp: now.toISOString(), folder: target };
}
