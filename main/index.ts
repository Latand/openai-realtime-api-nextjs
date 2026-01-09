// ... existing code ...
  ipcMain.handle("transcription:updateText", (_, text: string, interim: string) => {
    if (transcriptionWindow) {
      transcriptionWindow.webContents.send("transcription:textUpdate", { text, interim });
    }
    return { success: true };
  });

  ipcMain.handle("transcription:updateState", (_, state: { isRecording: boolean; isProcessing: boolean; recordingDuration: number }) => {
    if (transcriptionWindow) {
      transcriptionWindow.webContents.send("transcription:stateUpdate", state);
    }
    return { success: true };
  });

  // Text Improvement window handlers
// ... existing code ...
