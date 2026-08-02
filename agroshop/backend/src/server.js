import { createApp } from "./app.js";
import { DB_FILE } from "./db/connection.js";
import { initAutoBackupScheduler } from "./lib/backupScheduler.js";

const PORT = Number(process.env.PORT || 5174);

createApp().listen(PORT, () => {
  console.log(`AgroShop API   → http://localhost:${PORT}/api`);
  console.log(`SQLite file    → ${DB_FILE}`);
  console.log(`Offline only. Nothing leaves this computer.`);
  initAutoBackupScheduler();
});
