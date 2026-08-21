const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const PORT = Number(process.env.PORT || 5174);
const DEFAULT_ADMIN_USERNAME = "admin";
const DEFAULT_ADMIN_PASSWORD = "admin123";

let server;
let mainWindow;

async function startBackend() {
  process.env.AGROSHOP_DATA_DIR = path.join(app.getPath("userData"), "data");

  const { createApp } = await import("../backend/src/app.js");
  const { getDb } = await import("../backend/src/db/connection.js");
  const { hashPassword } = await import("../backend/src/lib/auth.js");

  const expressApp = createApp();
  seedFirstRunAdmin(getDb(), hashPassword);

  return new Promise((resolve, reject) => {
    server = expressApp
      .listen(PORT, "127.0.0.1", () => resolve(server))
      .on("error", reject);
  });
}

function seedFirstRunAdmin(db, hashPassword) {
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM users`).get();
  if (count > 0) return;

  const username = process.env.AGROSHOP_ADMIN_USER || DEFAULT_ADMIN_USERNAME;
  const password = process.env.AGROSHOP_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role, is_active)
     VALUES (?, ?, ?, 'admin', 1)`,
  ).run(username, hashPassword(password), "Shop Owner");

  console.log(
    `AgroShop first launch: created admin user "${username}" with password "${password}". Change it after signing in.`,
  );
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: "AgroShop",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(async () => {
  await startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (server) server.close();
});
