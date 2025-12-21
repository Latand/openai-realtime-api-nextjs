import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

contextBridge.exposeInMainWorld("electron", {
  onClaudeResponse: (callback: (data: { requestId: string; response: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { requestId: string; response: string }) => callback(data);
    ipcRenderer.on("claude:response", handler);
    return () => ipcRenderer.removeListener("claude:response", handler);
  },
  onClaudeError: (callback: (data: { requestId: string; error: string }) => void) => {
    const handler = (_event: IpcRendererEvent, data: { requestId: string; error: string }) => callback(data);
    ipcRenderer.on("claude:error", handler);
    return () => ipcRenderer.removeListener("claude:error", handler);
  },
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
    askClaude: (query: string) =>
      ipcRenderer.invoke("system:askClaude", query),
    getClaudeOutput: (requestId: string) =>
      ipcRenderer.invoke("system:getClaudeOutput", requestId),
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
