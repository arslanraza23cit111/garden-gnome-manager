const path = require("node:path");
const { app, BrowserWindow } = require("electron");

const PORT = Number(process.env.PORT || 5174);

let server;

async function startBackend() {
  process.env.AGROSHOP_DATA_DIR = path.join(app.getPath("userData"), "data");

  const { createApp } = await import("../backend/src/app.js");

  return new Promise((resolve, reject) => {
    server = createApp()
      .listen(PORT, "127.0.0.1", () => resolve(server))
      .on("error", reject);
  });
}

function createWindow() {
  const win = new BrowserWindow({
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

  win.loadURL(`http://localhost:${PORT}`);
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
