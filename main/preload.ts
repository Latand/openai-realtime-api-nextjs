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
  // Global shortcut events
  onToggleTranscription: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("shortcut:toggleTranscription", handler);
    return () => ipcRenderer.removeListener("shortcut:toggleTranscription", handler);
  },
  onToggleWhisper: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("shortcut:toggleWhisper", handler);
    return () => ipcRenderer.removeListener("shortcut:toggleWhisper", handler);
  },
  onToggleMute: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("shortcut:toggleMute", handler);
    return () => ipcRenderer.removeListener("shortcut:toggleMute", handler);
  },
  onToggleTextImprovement: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("shortcut:toggleTextImprovement", handler);
    return () => ipcRenderer.removeListener("shortcut:toggleTextImprovement", handler);
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
  memory: {
    saveCompacts: (compacts: unknown[]) =>
      ipcRenderer.invoke("memory:saveCompacts", compacts),
    loadCompacts: () => ipcRenderer.invoke("memory:loadCompacts"),
    savePersistentNotes: (notes: string[]) =>
      ipcRenderer.invoke("memory:savePersistentNotes", notes),
    loadPersistentNotes: () => ipcRenderer.invoke("memory:loadPersistentNotes"),
    saveSystemPrompt: (prompt: string) =>
      ipcRenderer.invoke("memory:saveSystemPrompt", prompt),
    loadSystemPrompt: () => ipcRenderer.invoke("memory:loadSystemPrompt"),
  },
  settings: {
    save: (settings: Record<string, unknown>) =>
      ipcRenderer.invoke("settings:save", settings),
    load: () => ipcRenderer.invoke("settings:load"),
    getApiKey: () => ipcRenderer.invoke("settings:getApiKey"),
    saveApiKey: (apiKey: string, anthropicKey: string, picovoiceKey: string) =>
      ipcRenderer.invoke("settings:saveApiKey", apiKey, anthropicKey, picovoiceKey),
    getAutoLaunch: () => ipcRenderer.invoke("settings:getAutoLaunch"),
    setAutoLaunch: (enabled: boolean, isHidden: boolean) =>
      ipcRenderer.invoke("settings:setAutoLaunch", enabled, isHidden),
  },
  costTracker: {
    addLog: (log: { model: string; type: string; tokens?: number; seconds?: number; cost: number; metadata?: Record<string, unknown>; timestamp?: string }) =>
      ipcRenderer.invoke("costTracker:addLog", log),
    getLogs: (period?: 'day' | 'week' | 'month' | 'all') =>
      ipcRenderer.invoke("costTracker:getLogs", period),
    clearLogs: () => ipcRenderer.invoke("costTracker:clearLogs"),
  },
  transcription: {
    openWindow: () => ipcRenderer.invoke("transcription:openWindow"),
    closeWindow: () => ipcRenderer.invoke("transcription:closeWindow"),
    stop: () => ipcRenderer.invoke("transcription:stop"),
    clear: () => ipcRenderer.invoke("transcription:clear"),
    updateText: (text: string, interim: string) =>
      ipcRenderer.invoke("transcription:updateText", text, interim),
    updateState: (state: { isListening?: boolean; isRecording: boolean; isProcessing: boolean; recordingDuration: number }) =>
      ipcRenderer.invoke("transcription:updateState", state),
    startDrag: () => ipcRenderer.invoke("transcription:startDrag"),
    moveWindow: (deltaX: number, deltaY: number) =>
      ipcRenderer.invoke("transcription:moveWindow", deltaX, deltaY),
    onTextUpdate: (callback: (data: { text: string; interim: string }) => void) => {
      const handler = (_event: IpcRendererEvent, data: { text: string; interim: string }) => callback(data);
      ipcRenderer.on("transcription:textUpdate", handler);
      return () => ipcRenderer.removeListener("transcription:textUpdate", handler);
    },
    onStateUpdate: (callback: (data: { isRecording: boolean; isProcessing: boolean; recordingDuration: number }) => void) => {
      const handler = (_event: IpcRendererEvent, data: { isRecording: boolean; isProcessing: boolean; recordingDuration: number }) => callback(data);
      ipcRenderer.on("transcription:stateUpdate", handler);
      return () => ipcRenderer.removeListener("transcription:stateUpdate", handler);
    },
    onWindowClosed: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("transcription:windowClosed", handler);
      return () => ipcRenderer.removeListener("transcription:windowClosed", handler);
    },
    onStop: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("transcription:stop", handler);
      return () => ipcRenderer.removeListener("transcription:stop", handler);
    },
    onClear: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("transcription:clear", handler);
      return () => ipcRenderer.removeListener("transcription:clear", handler);
    },
  },
  textImprovement: {
    openWindow: (initialText?: string) => ipcRenderer.invoke("textImprovement:openWindow", initialText),
    closeWindow: () => ipcRenderer.invoke("textImprovement:closeWindow"),
    saveSettings: (settings: any) => ipcRenderer.invoke("textImprovement:saveSettings", settings),
    loadSettings: () => ipcRenderer.invoke("textImprovement:loadSettings"),
    resize: (width: number, height: number) => ipcRenderer.invoke("textImprovement:resize", width, height),
    onWindowClosed: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on("textImprovement:windowClosed", handler);
      return () => ipcRenderer.removeListener("textImprovement:windowClosed", handler);
    },
    onInitialText: (callback: (data: { text: string }) => void) => {
      const handler = (_: any, data: { text: string }) => callback(data);
      ipcRenderer.on("textImprovement:initialText", handler);
      return () => ipcRenderer.removeListener("textImprovement:initialText", handler);
    },
  },
});
