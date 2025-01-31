import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  clipboard: {
    writeText: (text: string) => ipcRenderer.invoke("clipboard:write", text),
    writeAndPaste: (text: string) =>
      ipcRenderer.invoke("clipboard:writeAndPaste", text),
    writeAndEnter: (text: string) =>
      ipcRenderer.invoke("clipboard:writeAndEnter", text),
    readText: () => ipcRenderer.invoke("clipboard:read"),
  },
  keyboard: {
    pressEnter: () => ipcRenderer.invoke("keyboard:pressEnter"),
  },
  system: {
    test: () => ipcRenderer.invoke("system:test"),
    openSpotify: () => ipcRenderer.invoke("system:openSpotify"),
    controlMusic: (action: string) =>
      ipcRenderer.invoke("system:controlMusic", action),
    adjustVolume: (percentage: number) =>
      ipcRenderer.invoke("system:adjustVolume", percentage),
    adjustSystemVolume: (percentage: number) =>
      ipcRenderer.invoke("system:adjustSystemVolume", percentage),
  },
});
