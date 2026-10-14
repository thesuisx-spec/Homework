// Ukiyo-e Studio — Electron main process. Everything runs locally; the app never touches the network.
const { app, BrowserWindow, ipcMain, dialog, Menu, session } = require("electron");
const path = require("path");
const fs = require("fs/promises");

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: "Ukiyo-e Studio",
    backgroundColor: "#1b1814",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false, // exports keep encoding when the window is in the background
    },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  const shot = process.argv.indexOf("--shot");
  if (shot > 0) { // writes a screenshot of the window, for checking the interface
    win.webContents.once("did-finish-load", () => setTimeout(async () => {
      const img = await win.webContents.capturePage();
      await fs.writeFile(process.argv[shot + 1], img.toPNG());
      app.quit();
    }, +(process.env.SHOT_DELAY || 15000)));
  }
  if (process.argv.includes("--selftest")) {
    win.webContents.on("console-message", (e) => console.log("[page]", e.message));
  }
}

app.whenReady().then(() => {
  // offline by design: refuse any request that leaves the app's own files
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const ok = details.url.startsWith("file://") || details.url.startsWith("devtools://") || details.url.startsWith("data:") || details.url.startsWith("blob:");
    cb({ cancel: !ok });
  });
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

const projectFilters = [{ name: "Проект Ukiyo-e Studio", extensions: ["ukiyoe"] }];

ipcMain.handle("project:open", async () => {
  const r = await dialog.showOpenDialog(win, { title: "Открыть проект", filters: projectFilters, properties: ["openFile"] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { path: r.filePaths[0], text: await fs.readFile(r.filePaths[0], "utf8") };
});

ipcMain.handle("project:save", async (_e, { text, suggested }) => {
  const r = await dialog.showSaveDialog(win, { title: "Сохранить проект", defaultPath: suggested || "фильм.ukiyoe", filters: projectFilters });
  if (r.canceled || !r.filePath) return null;
  await fs.writeFile(r.filePath, text, "utf8");
  return r.filePath;
});

ipcMain.handle("video:choose", async (_e, suggested) => {
  const r = await dialog.showSaveDialog(win, { title: "Сохранить фильм", defaultPath: suggested || "фильм.mp4", filters: [{ name: "Видео MP4", extensions: ["mp4"] }] });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle("video:write", async (_e, { filePath, data }) => {
  await fs.writeFile(filePath, Buffer.from(data));
  return true;
});

// used by the automated export check: `electron . --selftest <out.mp4>`
ipcMain.handle("app:selftest", () => {
  const i = process.argv.indexOf("--selftest");
  return i > 0 ? process.argv[i + 1] || null : null;
});
ipcMain.handle("app:quit", () => app.quit());
