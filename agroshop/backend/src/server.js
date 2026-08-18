import { createApp } from "./app.js";
import { DB_FILE } from "./db/connection.js";
import { initAutoBackupScheduler } from "./lib/backupScheduler.js";

const PORT = Number(process.env.PORT || 5174);

const server = createApp().listen(PORT, () => {
  console.log(`AgroShop API   → http://localhost:${PORT}/api`);
  console.log(`SQLite file    → ${DB_FILE}`);
  console.log(`Offline only. Nothing leaves this computer.`);
  initAutoBackupScheduler();
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `AgroShop API could not start because port ${PORT} is already in use. Close the other AgroShop/npm/node process, or start the API with a different PORT.`,
    );
    process.exit(1);
  }

  throw error;
});
