import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  clipboard: {
    write: (text: string) => ipcRenderer.invoke("clipboard:write", text),
    writeAndPaste: (text: string) =>
      ipcRenderer.invoke("clipboard:writeAndPaste", text),
    writeAndEnter: (text: string) =>
      ipcRenderer.invoke("clipboard:writeAndEnter", text),
    readText: () => ipcRenderer.invoke("clipboard:read"),
  },
  system: {
    adjustSystemVolume: (percentage: number) =>
      ipcRenderer.invoke("system:adjustSystemVolume", percentage),
  },
  window: {
    toggleDevTools: () => ipcRenderer.invoke("window:toggleDevTools"),
  },
  mcp: {
    spotify: async (action: string, params = {}) => {
      return await ipcRenderer.invoke("mcp:spotify", { action, params });
    },
    getTools: async () => {
      return await ipcRenderer.invoke("mcp:getTools");
    },
  },
});
