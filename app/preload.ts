"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electron", {
  clipboard: {
    write: (text) => electron_1.ipcRenderer.invoke("clipboard:write", text),
    writeAndPaste: (text) =>
      electron_1.ipcRenderer.invoke("clipboard:writeAndPaste", text),
    writeAndEnter: (text) =>
      electron_1.ipcRenderer.invoke("clipboard:writeAndEnter", text),
    read: () => electron_1.ipcRenderer.invoke("clipboard:read"),
  },
  keyboard: {
    pressEnter: () => electron_1.ipcRenderer.invoke("keyboard:pressEnter"),
  },
  system: {
    test: () => electron_1.ipcRenderer.invoke("system:test"),
    lockScreen: () => electron_1.ipcRenderer.invoke("system:lockScreen"),
    mediaControl: (action) =>
      electron_1.ipcRenderer.invoke("system:mediaControl", action),
    launchApp: (appName) =>
      electron_1.ipcRenderer.invoke("system:launchApp", appName),
    openTerminal: () => electron_1.ipcRenderer.invoke("system:openTerminal"),
    playPause: () => electron_1.ipcRenderer.invoke("system:playPause"),
    nextTrack: () => electron_1.ipcRenderer.invoke("system:nextTrack"),
    previousTrack: () => electron_1.ipcRenderer.invoke("system:previousTrack"),
    adjustVolume: (percentage) =>
      electron_1.ipcRenderer.invoke("system:adjustVolume", percentage),
    adjustSystemVolume: (percentage) =>
      electron_1.ipcRenderer.invoke("system:adjustSystemVolume", percentage),
    openFiles: () => electron_1.ipcRenderer.invoke("system:openFiles"),
  },
});
//# sourceMappingURL=preload.js.map
