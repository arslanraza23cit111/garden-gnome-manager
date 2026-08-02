import { getDb } from "../db/connection.js";
import { ValidationError } from "./util.js";

export const LAST_BACKUP_KEY = "last_backup_at";
export const LAST_BACKUP_PATH_KEY = "last_backup_path";
export const LAST_AUTO_BACKUP_KEY = "last_auto_backup_at";
export const LAST_AUTO_BACKUP_STATUS_KEY = "last_auto_backup_status";
export const LAST_AUTO_BACKUP_ERROR_KEY = "last_auto_backup_error";

const PROTECTED_IDENTITY_KEYS = new Set([
  "shop_name",
  "shop_address",
  "shop_phone",
  "shop_email",
  "shop_tagline",
]);

export function getSetting(key) {
  const row = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key);
  return row?.value ?? null;
}

export function setSetting(key, value) {
  if (PROTECTED_IDENTITY_KEYS.has(key)) {
    throw new ValidationError(`${key} is protected and may not be updated through settings`);
  }
  getDb().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`).run(key, value);
}
