"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld("electron", {
    clipboard: {
        writeAndPaste: (text) => electron_1.ipcRenderer.invoke("clipboard:writeAndPaste", text),
        writeAndEnter: (text) => electron_1.ipcRenderer.invoke("clipboard:writeAndEnter", text),
        readText: () => electron_1.ipcRenderer.invoke("clipboard:read"),
    },
    system: {
        adjustSystemVolume: (percentage) => electron_1.ipcRenderer.invoke("system:adjustSystemVolume", percentage),
    },
    window: {
        toggleDevTools: () => electron_1.ipcRenderer.invoke("window:toggleDevTools"),
    },
    mcp: {
        spotify: async (action, params = {}) => {
            return await electron_1.ipcRenderer.invoke("mcp:spotify", { action, params });
        },
        getTools: async () => {
            return await electron_1.ipcRenderer.invoke("mcp:getTools");
        },
    },
});
//# sourceMappingURL=preload.js.map