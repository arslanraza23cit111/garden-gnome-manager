import { Router } from "express";
import path from "node:path";
import { ValidationError, required } from "../lib/util.js";
import { getSetting, setSetting, LAST_BACKUP_KEY, LAST_BACKUP_PATH_KEY, LAST_AUTO_BACKUP_KEY, LAST_AUTO_BACKUP_STATUS_KEY, LAST_AUTO_BACKUP_ERROR_KEY } from "../lib/settings.js";
import { runBackupToFolder } from "../lib/backup.js";

const router = Router();

router.get("/backup/last", (_req, res) => {
  res.json({
    lastBackupAt: getSetting(LAST_BACKUP_KEY),
    lastBackupPath: getSetting(LAST_BACKUP_PATH_KEY),
    lastAutoBackupAt: getSetting(LAST_AUTO_BACKUP_KEY),
    lastAutoBackupStatus: getSetting(LAST_AUTO_BACKUP_STATUS_KEY),
    lastAutoBackupError: getSetting(LAST_AUTO_BACKUP_ERROR_KEY),
  });
});

router.post("/backup", (req, res) => {
  const folder = String(req.body?.folder ?? "").trim();
  required(folder, "Backup folder");

  const target = path.resolve(folder);
  try {
    const result = runBackupToFolder(target, req.user?.id ?? null);
    const timestamp = result.timestamp;
    setSetting(LAST_BACKUP_KEY, timestamp);
    res.status(201).json({ destination: result.destination, timestamp, folder: result.folder });
  } catch (err) {
    throw new ValidationError(`Backup failed: ${err.message}`);
  }
});

export default router;
