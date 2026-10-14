// The only bridge between the page and the computer: open/save projects, save the finished film.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studio", {
  openProject: () => ipcRenderer.invoke("project:open"),
  saveProject: (text, suggested) => ipcRenderer.invoke("project:save", { text, suggested }),
  chooseVideo: (suggested) => ipcRenderer.invoke("video:choose", suggested),
  writeVideo: (filePath, data) => ipcRenderer.invoke("video:write", { filePath, data }),
  selftest: () => ipcRenderer.invoke("app:selftest"),
  quit: () => ipcRenderer.invoke("app:quit"),
});
