import { getSetting, setSetting, LAST_BACKUP_PATH_KEY, LAST_AUTO_BACKUP_KEY, LAST_AUTO_BACKUP_STATUS_KEY, LAST_AUTO_BACKUP_ERROR_KEY } from "./settings.js";
import { runBackupToFolder } from "./backup.js";

const DEFAULT_BACKUP_TIME = process.env.AGROSHOP_AUTO_BACKUP_TIME || "23:00";
const DAY_MS = 24 * 60 * 60 * 1000;

function parseBackupTime(value) {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
    return { hour, minute };
  }
  return { hour: 23, minute: 0 };
}

function msUntilNextRun(hour, minute) {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setHours(hour, minute, 0, 0);
  if (nextRun <= now) nextRun.setDate(nextRun.getDate() + 1);
  return nextRun.getTime() - now.getTime();
}

export async function runScheduledBackupOnce() {
  const folder = getSetting(LAST_BACKUP_PATH_KEY);
  if (!folder) {
    console.warn(
      "Automatic backup skipped: no backup folder configured. Set a backup folder in Settings to enable scheduled backups.",
    );
    return { skipped: true };
  }

  const timestamp = new Date().toISOString();
  try {
    const result = runBackupToFolder(folder, null);
    setSetting(LAST_AUTO_BACKUP_KEY, timestamp);
    setSetting(LAST_AUTO_BACKUP_STATUS_KEY, "success");
    setSetting(LAST_AUTO_BACKUP_ERROR_KEY, "");
    return { ...result, status: "success" };
  } catch (err) {
    console.error("Automatic backup failed:", err);
    setSetting(LAST_AUTO_BACKUP_KEY, timestamp);
    setSetting(LAST_AUTO_BACKUP_STATUS_KEY, "failure");
    setSetting(LAST_AUTO_BACKUP_ERROR_KEY, String(err.message));
    return { status: "failure", error: String(err.message) };
  }
}

export function initAutoBackupScheduler() {
  const { hour, minute } = parseBackupTime(DEFAULT_BACKUP_TIME);
  const delay = msUntilNextRun(hour, minute);

  setTimeout(() => {
    runScheduledBackupOnce().catch(() => undefined);
    setInterval(() => runScheduledBackupOnce().catch(() => undefined), DAY_MS);
  }, delay);
}
