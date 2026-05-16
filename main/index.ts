import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local before anything else
dotenv.config({ path: path.join(__dirname, "../.env.local") });
dotenv.config({ path: path.join(__dirname, "../.env") });

import {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  screen,
  globalShortcut,
} from "electron";
import next from "next";
import { createServer, Server } from "http";
import { execFile, spawn, exec } from "child_process";
import * as fs from "fs";
import { promisify } from "util";
import { mcpService } from "./mcp-service";
import { createTray } from "./tray";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const isDevelopment = !app.isPackaged;

type CliActions = {
  toggleWhisper: boolean;
};

const pendingCliActions: CliActions = {
  toggleWhisper: false,
};

function parseCliActions(argv: string[]): CliActions {
  return {
    toggleWhisper: argv.includes("--toggle-whisper"),
  };
}

function queueCliActions(argv: string[]) {
  const actions = parseCliActions(argv);
  pendingCliActions.toggleWhisper =
    pendingCliActions.toggleWhisper || actions.toggleWhisper;
}

function getCliSwitchValue(name: string): string | null {
  const prefix = `--${name}=`;
  const valueArg = process.argv.find((arg) => arg.startsWith(prefix));
  if (valueArg) {
    return valueArg.slice(prefix.length);
  }

  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }

  return null;
}

const isLinuxWaylandSession =
  process.platform === "linux" &&
  (process.env.XDG_SESSION_TYPE === "wayland" || Boolean(process.env.WAYLAND_DISPLAY));

if (isLinuxWaylandSession) {
  const existingFeatures = (getCliSwitchValue("enable-features") ?? "")
    .split(",")
    .map((feature) => feature.trim())
    .filter(Boolean);
  const requiredFeatures = ["GlobalShortcutsPortal"];
  const mergedFeatures = Array.from(new Set([...existingFeatures, ...requiredFeatures]));
  app.commandLine.appendSwitch("enable-features", mergedFeatures.join(","));

  // Avoid forcing ozone platform here to keep app startup stable across
  // different Wayland stacks. User can still override with CLI flags.
  if (!getCliSwitchValue("ozone-platform") && !getCliSwitchValue("ozone-platform-hint")) {
    app.commandLine.appendSwitch("ozone-platform-hint", "auto");
  }

  console.log(
    "[Startup] Wayland session detected. Enabled GlobalShortcutsPortal."
  );
}

queueCliActions(process.argv);
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let transcriptionWindow: BrowserWindow | null = null;
const textImprovementWindows: Map<number, BrowserWindow> = new Map();
let nextServer: Server | null = null;
let nextServerUrl: string | null = null;

function dispatchPendingCliActions() {
  if (!mainWindow) {
    return;
  }

  const dispatch = () => {
    if (pendingCliActions.toggleWhisper) {
      pendingCliActions.toggleWhisper = false;
      console.log("[CLI] --toggle-whisper received");
      mainWindow?.webContents.send("shortcut:toggleWhisper");
    }
  };

  // Give renderer a brief moment to attach IPC listeners after page load.
  if (mainWindow.webContents.isLoadingMainFrame()) {
    mainWindow.webContents.once("did-finish-load", () => {
      setTimeout(dispatch, 300);
    });
    return;
  }

  setTimeout(dispatch, 150);
}

type VolumeBackend = "wpctl" | "pactl";

const transcriptionAudioDuckState = {
  isDucked: false,
  originalVolumePercentage: null as number | null,
  targetVolumePercentage: 20,
};

let transcriptionAudioQueue: Promise<unknown> = Promise.resolve();

function clampPercentage(percentage: number) {
  const value = Number(percentage);
  if (!Number.isFinite(value)) {
    throw new Error("Invalid percentage");
  }
  return Math.min(Math.max(value, 0), 100);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function withSerializedTranscriptionAudioTask<T>(task: () => Promise<T>): Promise<T> {
  const run = transcriptionAudioQueue.then(task, task);
  transcriptionAudioQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function withVolumeBackend<T>(
  operationName: string,
  operation: (backend: VolumeBackend) => Promise<T>
): Promise<T> {
  const backends: VolumeBackend[] = ["wpctl", "pactl"];
  const errors: string[] = [];

  for (const backend of backends) {
    try {
      return await operation(backend);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${backend}: ${message}`);
    }
  }

  throw new Error(
    `${operationName} failed. Tried backends: ${errors.join(" | ")}`
  );
}

async function getSystemVolumePercentage(): Promise<number> {
  if (process.platform !== "linux") {
    throw new Error("System volume control is only supported on Linux");
  }

  return withVolumeBackend("Get system volume", async (backend) => {
    if (backend === "wpctl") {
      const { stdout } = await execFileAsync("wpctl", [
        "get-volume",
        "@DEFAULT_AUDIO_SINK@",
      ]);
      const match = stdout.match(/Volume:\s*([0-9.]+)/i);
      if (!match) {
        throw new Error(`Unexpected wpctl output: ${stdout.trim()}`);
      }
      return clampPercentage(parseFloat(match[1]) * 100);
    }

    const { stdout } = await execFileAsync("pactl", [
      "get-sink-volume",
      "@DEFAULT_SINK@",
    ]);
    const match = stdout.match(/(\d+)%/);
    if (!match) {
      throw new Error(`Unexpected pactl output: ${stdout.trim()}`);
    }
    return clampPercentage(Number(match[1]));
  });
}

async function setSystemVolumePercentage(percentage: number): Promise<void> {
  if (process.platform !== "linux") {
    throw new Error("System volume control is only supported on Linux");
  }

  const safePercentage = clampPercentage(percentage);
  await withVolumeBackend("Set system volume", async (backend) => {
    if (backend === "wpctl") {
      await execFileAsync("wpctl", [
        "set-volume",
        "@DEFAULT_AUDIO_SINK@",
        `${safePercentage}%`,
      ]);
      return;
    }

    await execFileAsync("pactl", [
      "set-sink-volume",
      "@DEFAULT_SINK@",
      `${safePercentage}%`,
    ]);
  });
}

async function fadeSystemVolume(
  fromPercentage: number,
  toPercentage: number,
  durationMs: number
): Promise<void> {
  const from = clampPercentage(fromPercentage);
  const to = clampPercentage(toPercentage);
  const safeDuration = Math.max(0, Math.floor(durationMs));

  if (safeDuration === 0 || Math.abs(to - from) < 0.5) {
    await setSystemVolumePercentage(to);
    return;
  }

  const stepCount = Math.max(1, Math.round(safeDuration / 40));
  const stepDurationMs = safeDuration / stepCount;

  for (let step = 1; step <= stepCount; step += 1) {
    const nextValue = from + (to - from) * (step / stepCount);
    await setSystemVolumePercentage(nextValue);
    if (step < stepCount) {
      await sleep(stepDurationMs);
    }
  }
}

async function duckTranscriptionSystemAudio(
  targetPercentage = 20,
  durationMs = 300
) {
  if (process.platform !== "linux") {
    return { success: true, skipped: true };
  }

  return withSerializedTranscriptionAudioTask(async () => {
    if (transcriptionAudioDuckState.isDucked) {
      return {
        success: true,
        alreadyDucked: true,
        targetVolumePercentage: transcriptionAudioDuckState.targetVolumePercentage,
      };
    }

    let originalVolume: number | null = null;
    try {
      originalVolume = await getSystemVolumePercentage();
      const clampedTarget = clampPercentage(targetPercentage);
      await fadeSystemVolume(originalVolume, clampedTarget, durationMs);

      transcriptionAudioDuckState.isDucked = true;
      transcriptionAudioDuckState.originalVolumePercentage = originalVolume;
      transcriptionAudioDuckState.targetVolumePercentage = clampedTarget;

      return {
        success: true,
        originalVolumePercentage: originalVolume,
        targetVolumePercentage: clampedTarget,
      };
    } catch (error) {
      if (originalVolume !== null) {
        try {
          await setSystemVolumePercentage(originalVolume);
        } catch (restoreError) {
          console.warn(
            "[SystemVolume] Failed to recover original volume after duck failure:",
            restoreError
          );
        }
      }
      transcriptionAudioDuckState.isDucked = false;
      transcriptionAudioDuckState.originalVolumePercentage = null;
      throw error;
    }
  });
}

async function restoreTranscriptionSystemAudio(durationMs = 400) {
  if (process.platform !== "linux") {
    return { success: true, skipped: true };
  }

  return withSerializedTranscriptionAudioTask(async () => {
    if (
      !transcriptionAudioDuckState.isDucked ||
      transcriptionAudioDuckState.originalVolumePercentage === null
    ) {
      return { success: true, skipped: true };
    }

    const restoreTo = clampPercentage(
      transcriptionAudioDuckState.originalVolumePercentage
    );
    let currentVolume = transcriptionAudioDuckState.targetVolumePercentage;

    try {
      currentVolume = await getSystemVolumePercentage();
    } catch (error) {
      console.warn(
        "[SystemVolume] Failed to read current volume before restore, using fallback:",
        error
      );
    }

    try {
      await fadeSystemVolume(currentVolume, restoreTo, durationMs);
      return { success: true, restoredVolumePercentage: restoreTo };
    } finally {
      transcriptionAudioDuckState.isDucked = false;
      transcriptionAudioDuckState.originalVolumePercentage = null;
      transcriptionAudioDuckState.targetVolumePercentage = restoreTo;
    }
  });
}

async function startNextServer(): Promise<string> {
  if (nextServerUrl) {
    return nextServerUrl;
  }

  // In production, asarUnpack puts files in app.asar.unpacked
  let appPath = app.getAppPath();
  if (app.isPackaged && appPath.includes("app.asar")) {
    appPath = appPath.replace("app.asar", "app.asar.unpacked");
  }

  // Load API keys from userData and set as env vars for Next.js API routes
  const apiKeysFile = path.join(app.getPath("userData"), "api-keys.json");
  if (fs.existsSync(apiKeysFile)) {
    try {
      const keys = JSON.parse(fs.readFileSync(apiKeysFile, "utf-8"));
      if (keys.apiKey) process.env.OPENAI_API_KEY = keys.apiKey;
      if (keys.anthropicKey) process.env.ANTHROPIC_API_KEY = keys.anthropicKey;
      if (keys.picovoiceKey) process.env.PICOVOICE_ACCESS_KEY = keys.picovoiceKey;
      console.log("[NextServer] Loaded API keys from userData");
    } catch (e) {
      console.error("[NextServer] Failed to load API keys:", e);
    }
  }

  console.log("[NextServer] Starting Next.js server...");
  console.log("[NextServer] App path:", appPath);
  console.log("[NextServer] Is packaged:", app.isPackaged);

  try {
    const nextApp = next({ dev: false, dir: appPath });
    const handle = nextApp.getRequestHandler();

    console.log("[NextServer] Preparing Next.js app...");
    await nextApp.prepare();
    console.log("[NextServer] Next.js app prepared successfully");

    nextServer = createServer((req, res) => {
      handle(req, res);
    });

    return new Promise((resolve, reject) => {
      nextServer?.once("error", (err) => {
        console.error("[NextServer] Server error:", err);
        reject(err);
      });
      nextServer?.listen(0, "127.0.0.1", () => {
        const address = nextServer?.address();
        if (address && typeof address === "object") {
          nextServerUrl = `http://127.0.0.1:${address.port}`;
          console.log("[NextServer] Server started at:", nextServerUrl);
          resolve(nextServerUrl);
          return;
        }
        reject(new Error("Failed to start Next.js server"));
      });
    });
  } catch (error) {
    console.error("[NextServer] Failed to start:", error);
    throw error;
  }
}

async function stopNextServer() {
  if (!nextServer) return;
  await new Promise<void>((resolve) => {
    nextServer?.close(() => resolve());
  });
  nextServer = null;
  nextServerUrl = null;
}

async function createMainWindow(): Promise<BrowserWindow> {
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 400;
  const windowHeight = 400;

  const window = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    autoHideMenuBar: true,
    frame: true,
    backgroundColor: "#020617",
    alwaysOnTop: true,
    x: screenWidth - windowWidth, // Touch the right edge
    y: Math.floor((screenHeight - windowHeight) / 2), // Center vertically
  });

  // Make window visible on all workspaces
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  if (isDevelopment) {
    setTimeout(() => {
      void window.loadURL("http://localhost:3000");
      // window.webContents.openDevTools();
    }, 1000);
  } else {
    try {
      console.log("[MainWindow] Starting production mode...");
      const serverUrl = await startNextServer();
      console.log("[MainWindow] Loading URL:", serverUrl);
      await window.loadURL(serverUrl);
      console.log("[MainWindow] URL loaded successfully");
    } catch (error) {
      console.error("[MainWindow] Failed to start Next.js server:", error);
      // Show error page in window
      window.webContents.loadURL(`data:text/html,<html><body style="background:#1e1e1e;color:#fff;font-family:sans-serif;padding:20px;"><h1>Failed to start</h1><pre>${String(error)}</pre></body></html>`);
    }
  }

  window.on("closed", () => {
    mainWindow = null;
  });

  return window;
}

// Handle errors
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    void createMainWindow().then((window) => {
      mainWindow = window;
      dispatchPendingCliActions();
    });
  }
});

// Create transcription window
async function createTranscriptionWindow(): Promise<BrowserWindow> {
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 450;
  const windowHeight = 300;

  const isMac = process.platform === "darwin";

  const window = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.floor((screenWidth - windowWidth) / 2),
    y: 50,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    autoHideMenuBar: true,
    frame: false,
    transparent: false,
    backgroundColor: "#020617",
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false, // Don't show immediately - we'll use showInactive
    focusable: false, // Prevent focus stealing
    // macOS specific - enable window to be movable by dragging background
    ...(isMac && {
      titleBarStyle: "customButtonsOnHover" as const,
      trafficLightPosition: { x: -100, y: -100 }, // Hide traffic lights off-screen
    }),
  });

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const url = isDevelopment
    ? "http://localhost:3000/transcription"
    : `${nextServerUrl}/transcription`;

  await window.loadURL(url);

  // Show window without stealing focus from other apps
  window.showInactive();

  // Re-enable focusable for later interactions
  window.setFocusable(true);

  window.on("closed", () => {
    transcriptionWindow = null;
    mainWindow?.webContents.send("transcription:windowClosed");
  });

  return window;
}

// Create text improvement window
async function createTextImprovementWindow(initialText?: string): Promise<BrowserWindow> {
  const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 520;
  const windowHeight = 400;

  // Offset each new window slightly so they don't stack exactly
  const windowCount = textImprovementWindows.size;
  const offset = windowCount * 30;

  const isMac = process.platform === "darwin";

  const window = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.floor((screenWidth - windowWidth) / 2) + offset,
    y: 60 + offset,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    autoHideMenuBar: true,
    frame: false,
    transparent: false,
    backgroundColor: "#0a0f14",
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false, // Don't show immediately - we'll use showInactive
    focusable: false, // Prevent focus stealing
    // macOS specific - enable window to be movable by dragging background
    ...(isMac && {
      titleBarStyle: "customButtonsOnHover" as const,
      trafficLightPosition: { x: -100, y: -100 }, // Hide traffic lights off-screen
    }),
  });

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Build URL (no query params - we'll pass text via IPC)
  const url = isDevelopment
    ? "http://localhost:3000/text-improvement"
    : `${nextServerUrl}/text-improvement`;

  console.log("[TextImprovement] Loading URL:", url);
  await window.loadURL(url);
  console.log("[TextImprovement] URL loaded successfully");

  // Show window without stealing focus from other apps
  window.showInactive();

  // Re-enable focusable for later interactions
  window.setFocusable(true);

  // Send initial text via IPC after window loads
  if (initialText) {
    console.log("[TextImprovement] Sending initial text via IPC, length:", initialText.length);
    window.webContents.send("textImprovement:initialText", { text: initialText });
  }

  if (isDevelopment) {
    // window.webContents.openDevTools({ mode: 'detach' });
  }

  const windowId = window.id;
  textImprovementWindows.set(windowId, window);

  window.on("closed", () => {
    textImprovementWindows.delete(windowId);
    mainWindow?.webContents.send("textImprovement:windowClosed", { windowId });
  });

  return window;
}

// Create main BrowserWindow when electron is ready
// Type assertion for isQuitting flag
const appWithQuitting = app as typeof app & { isQuitting?: boolean };

app.on("second-instance", (_event, argv) => {
  queueCliActions(argv);

  if (!mainWindow) {
    return;
  }

  dispatchPendingCliActions();
});

app.on("ready", async () => {
  mainWindow = await createMainWindow();
  dispatchPendingCliActions();

  // Create system tray
  createTray(mainWindow);

  // Handle window close - hide to tray instead of quitting
  mainWindow.on("close", (event) => {
    if (!appWithQuitting.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Initialize MCP service
  await mcpService.initialize();
  mcpService.setupIPC();

  // Add IPC handler for dev tools
  ipcMain.handle("window:toggleDevTools", () => {
    mainWindow?.webContents.toggleDevTools();
  });

  // Transcription window handlers
  ipcMain.handle("transcription:openWindow", async () => {
    if (transcriptionWindow) {
      // Don't focus - keep user's current window focused
      return { success: true, alreadyOpen: true };
    }
    try {
      transcriptionWindow = await createTranscriptionWindow();
      return { success: true };
    } catch (error) {
      console.error("Failed to create transcription window:", error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("transcription:closeWindow", () => {
    if (transcriptionWindow) {
      transcriptionWindow.close();
      transcriptionWindow = null;
    }
    return { success: true };
  });

  ipcMain.handle("transcription:updateText", (_, text: string, interim: string) => {
    if (transcriptionWindow) {
      transcriptionWindow.webContents.send("transcription:textUpdate", { text, interim });
    }
    return { success: true };
  });

  ipcMain.handle("transcription:updateState", (_, state: { isListening?: boolean; isRecording: boolean; isProcessing: boolean; recordingDuration: number }) => {
    if (transcriptionWindow) {
      transcriptionWindow.webContents.send("transcription:stateUpdate", state);
    }
    return { success: true };
  });

  ipcMain.handle("transcription:clear", () => {
    // Notify main window to clear transcription data in the hook
    mainWindow?.webContents.send("transcription:clear");
    return { success: true };
  });

  ipcMain.handle("transcription:stop", () => {
    // Notify main window to stop transcription
    mainWindow?.webContents.send("transcription:stop");
    return { success: true };
  });

  ipcMain.handle("transcription:cancelWhisper", () => {
    // Notify main window to cancel Whisper recording (stop without transcribing)
    mainWindow?.webContents.send("transcription:cancelWhisper");
    return { success: true };
  });

  ipcMain.handle("transcription:retryLast", () => {
    // Notify main window to retry the last Whisper recording
    mainWindow?.webContents.send("transcription:retryLast");
    return { success: true };
  });

  ipcMain.handle("transcription:startDrag", () => {
    console.log("[Drag] startDrag called, window exists:", !!transcriptionWindow);
    if (transcriptionWindow) {
      transcriptionWindow.setMovable(true);
      const [x, y] = transcriptionWindow.getPosition();
      console.log("[Drag] Window position:", x, y);
      return { success: true, x, y };
    }
    return { success: false };
  });

  ipcMain.handle("transcription:moveWindow", (_, deltaX: number, deltaY: number) => {
    if (transcriptionWindow) {
      const [currentX, currentY] = transcriptionWindow.getPosition();
      const newX = currentX + deltaX;
      const newY = currentY + deltaY;
      console.log("[Drag] Moving window:", { deltaX, deltaY, currentX, currentY, newX, newY });
      transcriptionWindow.setPosition(newX, newY);
      return { success: true };
    }
    console.log("[Drag] moveWindow called but no window");
    return { success: false };
  });

  // Text Improvement window handlers
  ipcMain.handle("textImprovement:openWindow", async (_, initialText?: string) => {
    console.log("[TextImprovement] openWindow called, initialText length:", initialText?.length || 0);
    try {
      // Always create a new window
      const window = await createTextImprovementWindow(initialText);
      console.log("[TextImprovement] Window created successfully, id:", window.id);
      return { success: true, windowId: window.id };
    } catch (error) {
      console.error("[TextImprovement] Failed to create window:", error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("textImprovement:closeWindow", (event) => {
    // Find and close the window that sent this message
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow) {
      textImprovementWindows.delete(senderWindow.id);
      senderWindow.close();
    }
    return { success: true };
  });

  ipcMain.handle("textImprovement:saveSettings", async (_, settings: any) => {
    try {
      fs.writeFileSync(TEXT_IMPROVEMENT_SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle("textImprovement:loadSettings", async () => {
    try {
      if (!fs.existsSync(TEXT_IMPROVEMENT_SETTINGS_FILE)) {
        return { success: true, settings: {} };
      }
      const data = fs.readFileSync(TEXT_IMPROVEMENT_SETTINGS_FILE, "utf-8");
      return { success: true, settings: JSON.parse(data) };
    } catch (error) {
      return { success: false, error: String(error), settings: {} };
    }
  });

  ipcMain.handle("textImprovement:resize", (event, width: number, height: number) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow) {
      senderWindow.setSize(width, height);
    }
    return { success: true };
  });

  // Register global shortcuts
  // Using Ctrl+Shift for better compatibility across apps
  const transcriptionRegistered = globalShortcut.register("CommandOrControl+Shift+T", () => {
    console.log("[GlobalShortcut] Ctrl+Shift+T pressed - toggle real-time transcription");
    mainWindow?.webContents.send("shortcut:toggleTranscription");
  });
  console.log("[GlobalShortcut] Ctrl+Shift+T registered:", transcriptionRegistered);

  const whisperRegistered = globalShortcut.register("CommandOrControl+Shift+R", () => {
    console.log("[GlobalShortcut] Ctrl+Shift+R pressed - toggle Whisper transcription");
    mainWindow?.webContents.send("shortcut:toggleWhisper");
  });
  console.log("[GlobalShortcut] Ctrl+Shift+R registered:", whisperRegistered);

  const muteRegistered = globalShortcut.register("CommandOrControl+Shift+M", () => {
    console.log("[GlobalShortcut] Ctrl+Shift+M pressed - toggle mute");
    mainWindow?.webContents.send("shortcut:toggleMute");
  });
  console.log("[GlobalShortcut] Ctrl+Shift+M registered:", muteRegistered);

  const textImprovementRegistered = globalShortcut.register("CommandOrControl+Shift+G", () => {
    console.log("[GlobalShortcut] Ctrl+Shift+G pressed - toggle text improvement");
    mainWindow?.webContents.send("shortcut:toggleTextImprovement");
  });
  console.log("[GlobalShortcut] Ctrl+Shift+G registered:", textImprovementRegistered);

  console.log("[GlobalShortcut] Registration summary:", {
    transcriptionRegistered,
    whisperRegistered,
    muteRegistered,
    textImprovementRegistered,
  });
});

app.on("will-quit", async () => {
  // Unregister all global shortcuts
  globalShortcut.unregisterAll();

  try {
    await restoreTranscriptionSystemAudio(150);
  } catch (error) {
    console.warn("[SystemVolume] Failed to restore volume on quit:", error);
  }

  // Cleanup MCP service
  await mcpService.disconnect();
  await stopNextServer();
});

// Function to simulate keyboard actions
async function simulateKeyPress(key: string): Promise<void> {
  if (process.platform !== "linux") {
    throw new Error("Keyboard simulation is only supported on Linux");
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
  await execFileAsync("xdotool", ["key", key]);
}

// Function to simulate paste keystroke
async function simulatePaste(): Promise<void> {
  await simulateKeyPress("ctrl+v");
}

// Handle keyboard operations
ipcMain.handle("keyboard:pressEnter", async () => {
  try {
    await simulateKeyPress("Return");
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { success: false, error: errorMessage };
  }
});

// Handle clipboard operations
ipcMain.handle("clipboard:write", async (_, text: string) => {
  try {
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { success: false, error: errorMessage };
  }
});

async function adjustSystemVolume(
  percentage: number
): Promise<{ success: boolean }> {
  try {
    const safePercentage = clampPercentage(percentage);
    console.log(`[SystemVolume] Setting volume to ${safePercentage}%`);
    await setSystemVolumePercentage(safePercentage);
    return { success: true };
  } catch (error) {
    console.error("[SystemVolume] Failed to adjust volume:", error);
    throw error;
  }
}

// System controls
ipcMain.handle("system:adjustSystemVolume", async (_, percentage: number) => {
  try {
    const result = await adjustSystemVolume(percentage);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle(
  "transcription:duckSystemAudio",
  async (
    _,
    options?: { targetPercentage?: number; durationMs?: number }
  ) => {
    try {
      const targetPercentage =
        typeof options?.targetPercentage === "number"
          ? options.targetPercentage
          : 20;
      const durationMs =
        typeof options?.durationMs === "number" ? options.durationMs : 300;
      return await duckTranscriptionSystemAudio(targetPercentage, durationMs);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);

ipcMain.handle(
  "transcription:restoreSystemAudio",
  async (_, options?: { durationMs?: number }) => {
    try {
      const durationMs =
        typeof options?.durationMs === "number" ? options.durationMs : 400;
      return await restoreTranscriptionSystemAudio(durationMs);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);

// Clipboard controls
ipcMain.handle("clipboard:writeAndPaste", async (_, text: string) => {
  try {
    await clipboard.writeText(text);
    await simulatePaste();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("clipboard:writeAndEnter", async (_, text: string) => {
  try {
    await clipboard.writeText(text);
    await simulatePaste();
    await simulateKeyPress("Return");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("clipboard:read", async () => {
  try {
    const text = clipboard.readText();
    return { success: true, text };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return { success: false, error: errorMessage };
  }
});

// Conversation memory file storage
const COMPACTS_FILE = path.join(app.getPath("userData"), "conversation-compacts.json");
const PERSISTENT_NOTES_FILE = path.join(app.getPath("userData"), "persistent-notes.json");
const TEXT_IMPROVEMENT_SETTINGS_FILE = path.join(app.getPath("userData"), "text-improvement-settings.json");
const SYSTEM_PROMPT_FILE = path.join(app.getPath("userData"), "system-prompt.txt");
const APP_SETTINGS_FILE = path.join(app.getPath("userData"), "app-settings.json");
const COST_LOGS_FILE = path.join(app.getPath("userData"), "cost-logs.json");

ipcMain.handle("memory:saveCompacts", async (_, compacts: unknown[]) => {
  try {
    fs.writeFileSync(COMPACTS_FILE, JSON.stringify(compacts, null, 2), "utf-8");
    console.log("[Memory] Saved compacts to file:", COMPACTS_FILE);
    return { success: true };
  } catch (error) {
    console.error("[Memory] Failed to save compacts:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("memory:loadCompacts", async () => {
  try {
    if (!fs.existsSync(COMPACTS_FILE)) {
      console.log("[Memory] No compacts file found");
      return { success: true, compacts: [] };
    }
    const data = fs.readFileSync(COMPACTS_FILE, "utf-8");
    const compacts = JSON.parse(data);
    console.log("[Memory] Loaded compacts from file:", compacts.length);
    return { success: true, compacts };
  } catch (error) {
    console.error("[Memory] Failed to load compacts:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error), compacts: [] };
  }
});

ipcMain.handle("memory:savePersistentNotes", async (_, notes: string[]) => {
  try {
    fs.writeFileSync(PERSISTENT_NOTES_FILE, JSON.stringify(notes, null, 2), "utf-8");
    console.log("[Memory] Saved persistent notes:", notes.length);
    return { success: true };
  } catch (error) {
    console.error("[Memory] Failed to save persistent notes:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("memory:loadPersistentNotes", async () => {
  try {
    if (!fs.existsSync(PERSISTENT_NOTES_FILE)) {
      console.log("[Memory] No persistent notes file found");
      return { success: true, notes: [] };
    }
    const data = fs.readFileSync(PERSISTENT_NOTES_FILE, "utf-8");
    const notes = JSON.parse(data);
    console.log("[Memory] Loaded persistent notes:", notes.length);
    return { success: true, notes };
  } catch (error) {
    console.error("[Memory] Failed to load persistent notes:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error), notes: [] };
  }
});

ipcMain.handle("memory:saveSystemPrompt", async (_, prompt: string) => {
  try {
    fs.writeFileSync(SYSTEM_PROMPT_FILE, prompt, "utf-8");
    console.log("[Memory] Saved system prompt, length:", prompt.length);
    return { success: true };
  } catch (error) {
    console.error("[Memory] Failed to save system prompt:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("memory:loadSystemPrompt", async () => {
  try {
    if (!fs.existsSync(SYSTEM_PROMPT_FILE)) {
      console.log("[Memory] No system prompt file found");
      return { success: true, prompt: null };
    }
    const prompt = fs.readFileSync(SYSTEM_PROMPT_FILE, "utf-8");
    console.log("[Memory] Loaded system prompt, length:", prompt.length);
    return { success: true, prompt };
  } catch (error) {
    console.error("[Memory] Failed to load system prompt:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error), prompt: null };
  }
});

// App settings (microphone, etc.)
ipcMain.handle("settings:save", async (_, settings: Record<string, unknown>) => {
  try {
    // Load existing settings and merge
    let existing: Record<string, unknown> = {};
    if (fs.existsSync(APP_SETTINGS_FILE)) {
      existing = JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, "utf-8"));
    }
    const merged = { ...existing, ...settings };
    fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(merged, null, 2), "utf-8");
    console.log("[Settings] Saved:", Object.keys(settings));
    return { success: true };
  } catch (error) {
    console.error("[Settings] Failed to save:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("settings:load", async () => {
  try {
    if (!fs.existsSync(APP_SETTINGS_FILE)) {
      console.log("[Settings] No settings file found");
      return { success: true, settings: {} };
    }
    const settings = JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, "utf-8"));
    console.log("[Settings] Loaded:", Object.keys(settings));
    return { success: true, settings };
  } catch (error) {
    console.error("[Settings] Failed to load:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error), settings: {} };
  }
});

// API Keys file (separate from settings for security)
const API_KEYS_FILE = path.join(app.getPath("userData"), "api-keys.json");

ipcMain.handle("settings:getApiKey", async () => {
  try {
    if (!fs.existsSync(API_KEYS_FILE)) {
      console.log("[Settings] No API keys file found");
      return { apiKey: "", anthropicKey: "", picovoiceKey: "" };
    }
    const data = JSON.parse(fs.readFileSync(API_KEYS_FILE, "utf-8"));
    console.log("[Settings] Loaded API keys");
    return {
      apiKey: data.apiKey || "",
      anthropicKey: data.anthropicKey || "",
      picovoiceKey: data.picovoiceKey || "",
    };
  } catch (error) {
    console.error("[Settings] Failed to load API keys:", error);
    return { apiKey: "", anthropicKey: "", picovoiceKey: "" };
  }
});

ipcMain.handle("settings:saveApiKey", async (_, apiKey: string, anthropicKey: string, picovoiceKey: string) => {
  try {
    const data = { apiKey, anthropicKey, picovoiceKey };
    fs.writeFileSync(API_KEYS_FILE, JSON.stringify(data, null, 2), "utf-8");
    // Also update env vars so Next.js API routes can use them immediately
    if (apiKey) process.env.OPENAI_API_KEY = apiKey;
    if (anthropicKey) process.env.ANTHROPIC_API_KEY = anthropicKey;
    if (picovoiceKey) process.env.PICOVOICE_ACCESS_KEY = picovoiceKey;
    console.log("[Settings] Saved API keys and updated env vars");
    return { success: true };
  } catch (error) {
    console.error("[Settings] Failed to save API keys:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("settings:getAutoLaunch", async () => {
  try {
    if (!fs.existsSync(APP_SETTINGS_FILE)) {
      return { isEnabled: false };
    }
    const settings = JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, "utf-8"));
    return { isEnabled: settings.autoLaunch ?? false };
  } catch (error) {
    console.error("[Settings] Failed to get auto-launch:", error);
    return { isEnabled: false };
  }
});

ipcMain.handle("settings:setAutoLaunch", async (_, enabled: boolean, isHidden: boolean) => {
  try {
    // Save to settings file
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(APP_SETTINGS_FILE)) {
      settings = JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, "utf-8"));
    }
    settings.autoLaunch = enabled;
    settings.autoLaunchHidden = isHidden;
    fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");

    // Actually set auto-launch using Electron's API
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: isHidden,
    });

    console.log("[Settings] Auto-launch set to:", enabled);
    return { success: true };
  } catch (error) {
    console.error("[Settings] Failed to set auto-launch:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

// Cost tracker file storage (replaces IndexedDB which doesn't work reliably in packaged apps)
interface CostLog {
  id?: number;
  timestamp: string;
  model: string;
  type: string;
  tokens?: number;
  seconds?: number;
  cost: number;
  metadata?: Record<string, unknown>;
}

const REALTIME_PRICING: Record<string, {
  audio_input_per_1m: number;
  audio_cached_input_per_1m: number;
  audio_output_per_1m: number;
  text_input_per_1m: number;
  text_cached_input_per_1m: number;
  text_output_per_1m: number;
  image_input_per_1m: number;
  image_cached_input_per_1m: number;
}> = {
  "gpt-realtime-2": {
    audio_input_per_1m: 32,
    audio_cached_input_per_1m: 0.4,
    audio_output_per_1m: 64,
    text_input_per_1m: 4,
    text_cached_input_per_1m: 0.4,
    text_output_per_1m: 24,
    image_input_per_1m: 5,
    image_cached_input_per_1m: 0.5,
  },
  "gpt-realtime-1.5": {
    audio_input_per_1m: 32,
    audio_cached_input_per_1m: 0.4,
    audio_output_per_1m: 64,
    text_input_per_1m: 4,
    text_cached_input_per_1m: 0.4,
    text_output_per_1m: 16,
    image_input_per_1m: 5,
    image_cached_input_per_1m: 0.5,
  },
  "gpt-realtime": {
    audio_input_per_1m: 32,
    audio_cached_input_per_1m: 0.4,
    audio_output_per_1m: 64,
    text_input_per_1m: 4,
    text_cached_input_per_1m: 0.4,
    text_output_per_1m: 16,
    image_input_per_1m: 5,
    image_cached_input_per_1m: 0.5,
  },
};

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function calculateRealtimeLogCost(model: string, usage: Record<string, unknown>) {
  const prices = REALTIME_PRICING[model];
  if (!prices) return null;

  const inputDetails = usage.input_token_details as Record<string, unknown> | undefined;
  const outputDetails = usage.output_token_details as Record<string, unknown> | undefined;
  if (!inputDetails && !outputDetails) return null;

  let cost = 0;

  if (inputDetails) {
    const cachedDetails =
      inputDetails.cached_tokens_details as Record<string, unknown> | undefined;
    const textTokens = readNumber(inputDetails.text_tokens);
    const audioTokens = readNumber(inputDetails.audio_tokens);
    const imageTokens = readNumber(inputDetails.image_tokens);
    const cachedTextTokens = Math.min(textTokens, readNumber(cachedDetails?.text_tokens));
    const cachedAudioTokens = Math.min(audioTokens, readNumber(cachedDetails?.audio_tokens));
    const cachedImageTokens = Math.min(imageTokens, readNumber(cachedDetails?.image_tokens));
    let remainingCachedTokens = Math.max(
      0,
      readNumber(inputDetails.cached_tokens) -
        cachedTextTokens -
        cachedAudioTokens -
        cachedImageTokens
    );

    const fallbackCachedTextTokens = Math.min(
      Math.max(0, textTokens - cachedTextTokens),
      remainingCachedTokens
    );
    remainingCachedTokens -= fallbackCachedTextTokens;
    const fallbackCachedImageTokens = Math.min(
      Math.max(0, imageTokens - cachedImageTokens),
      remainingCachedTokens
    );
    remainingCachedTokens -= fallbackCachedImageTokens;
    const fallbackCachedAudioTokens = Math.min(
      Math.max(0, audioTokens - cachedAudioTokens),
      remainingCachedTokens
    );

    const totalCachedTextTokens = cachedTextTokens + fallbackCachedTextTokens;
    const totalCachedAudioTokens = cachedAudioTokens + fallbackCachedAudioTokens;
    const totalCachedImageTokens = cachedImageTokens + fallbackCachedImageTokens;

    cost += ((textTokens - totalCachedTextTokens) / 1_000_000) * prices.text_input_per_1m;
    cost += (totalCachedTextTokens / 1_000_000) * prices.text_cached_input_per_1m;
    cost += ((audioTokens - totalCachedAudioTokens) / 1_000_000) * prices.audio_input_per_1m;
    cost += (totalCachedAudioTokens / 1_000_000) * prices.audio_cached_input_per_1m;
    cost += ((imageTokens - totalCachedImageTokens) / 1_000_000) * prices.image_input_per_1m;
    cost += (totalCachedImageTokens / 1_000_000) * prices.image_cached_input_per_1m;
  }

  if (outputDetails) {
    cost += (readNumber(outputDetails.text_tokens) / 1_000_000) * prices.text_output_per_1m;
    cost += (readNumber(outputDetails.audio_tokens) / 1_000_000) * prices.audio_output_per_1m;
  }

  return cost;
}

function withRecalculatedRealtimeCost(log: CostLog): CostLog {
  if (!log.model.startsWith("gpt-realtime")) return log;
  const usage = log.metadata;
  if (!usage) return log;
  const recalculatedCost = calculateRealtimeLogCost(log.model, usage);
  if (recalculatedCost === null || Math.abs(recalculatedCost - log.cost) < 1e-12) {
    return log;
  }
  return {
    ...log,
    cost: recalculatedCost,
    metadata: {
      ...usage,
      local_cost_recalculated: true,
    },
  };
}

ipcMain.handle("costTracker:addLog", async (_, log: Omit<CostLog, "id" | "timestamp"> & { timestamp?: string }) => {
  try {
    let logs: CostLog[] = [];
    if (fs.existsSync(COST_LOGS_FILE)) {
      logs = JSON.parse(fs.readFileSync(COST_LOGS_FILE, "utf-8"));
    }

    const entry: CostLog = {
      ...log,
      id: logs.length > 0 ? Math.max(...logs.map(l => l.id || 0)) + 1 : 1,
      timestamp: log.timestamp || new Date().toISOString(),
    };

    const pricedEntry = withRecalculatedRealtimeCost(entry);
    logs.push(pricedEntry);
    fs.writeFileSync(COST_LOGS_FILE, JSON.stringify(logs, null, 2), "utf-8");
    console.log("[CostTracker] Added log:", pricedEntry.model, pricedEntry.cost);
    return { success: true, id: entry.id };
  } catch (error) {
    console.error("[CostTracker] Failed to add log:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("costTracker:getLogs", async (_, period?: 'day' | 'week' | 'month' | 'all') => {
  try {
    if (!fs.existsSync(COST_LOGS_FILE)) {
      return { success: true, logs: [], totalCost: 0, byModel: {} };
    }

    let allLogs: CostLog[] = JSON.parse(fs.readFileSync(COST_LOGS_FILE, "utf-8"));
    const recalculatedLogs = allLogs.map(withRecalculatedRealtimeCost);
    if (
      recalculatedLogs.some((log, index) => log.cost !== allLogs[index]?.cost)
    ) {
      allLogs = recalculatedLogs;
      fs.writeFileSync(COST_LOGS_FILE, JSON.stringify(allLogs, null, 2), "utf-8");
      console.log("[CostTracker] Recalculated realtime cost logs with cached-token pricing");
    }

    let logs = allLogs;

    // Filter by period if specified
    if (period && period !== 'all') {
      const now = new Date();
      const startDate = new Date();

      if (period === 'day') startDate.setDate(now.getDate() - 1);
      if (period === 'week') startDate.setDate(now.getDate() - 7);
      if (period === 'month') startDate.setMonth(now.getMonth() - 1);

      logs = logs.filter(log => new Date(log.timestamp) >= startDate);
    }

    // Calculate stats
    const stats = logs.reduce((acc, log) => {
      acc.totalCost += log.cost;
      acc.byModel[log.model] = (acc.byModel[log.model] || 0) + log.cost;
      return acc;
    }, { totalCost: 0, byModel: {} as Record<string, number> });

    console.log("[CostTracker] Loaded logs:", logs.length, "total:", stats.totalCost);
    return { success: true, logs, ...stats };
  } catch (error) {
    console.error("[CostTracker] Failed to load logs:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error), logs: [], totalCost: 0, byModel: {} };
  }
});

ipcMain.handle("costTracker:clearLogs", async () => {
  try {
    fs.writeFileSync(COST_LOGS_FILE, "[]", "utf-8");
    console.log("[CostTracker] Cleared all logs");
    return { success: true };
  } catch (error) {
    console.error("[CostTracker] Failed to clear logs:", error);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
});

ipcMain.handle("system:openSpotify", () => {
  if (process.platform !== "linux") {
    return Promise.resolve({
      success: false,
      error: "Spotify launch is only supported on Linux",
    });
  }
  return new Promise((resolve) => {
    // Use spawn with shell option to handle the command better
    const spotify = spawn("spotify", [], {
      detached: true,
      stdio: "ignore",
      shell: true,
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ":0", // Ensure X11 display is set
      },
    });

    spotify.on("error", (error) => {
      console.error("Failed to start Spotify:", error);
      resolve({ success: false, error: error.message });
    });

    // Detach from parent process
    spotify.unref();

    // Wait a bit to check if process started
    setTimeout(async () => {
      try {
        const { stdout } = await execFileAsync("pidof", ["spotify"]);
        console.log("Spotify started, PID:", stdout.trim());
        resolve({ success: true });
      } catch (error) {
        console.error("Failed to verify Spotify process:", error);
        resolve({
          success: false,
          error: "Failed to verify if Spotify started",
        });
      }
    }, 1000);
  });
});

// Store pending Claude responses with output buffer
interface ClaudeRequest {
  status: 'pending' | 'done' | 'error';
  response?: string;
  error?: string;
  pid?: number;
  stdout: string;
  stderr: string;
  startTime: number;
}
const pendingClaudeResponses: Map<string, ClaudeRequest> = new Map();

ipcMain.handle("system:askClaude", async (_, query: string) => {
  try {
    if (!query || typeof query !== "string") {
      return { success: false, error: "Invalid query" };
    }

    const requestId = Date.now().toString();
    console.log("[AskClaude] Starting query:", query.substring(0, 100), "ID:", requestId);

    // Store pending status with buffers
    pendingClaudeResponses.set(requestId, {
      status: 'pending',
      stdout: '',
      stderr: '',
      startTime: Date.now()
    });

    // Run Claude using spawn for real-time output
    const claudePath = `${process.env.HOME}/.bun/bin/claude`;
    console.log("[AskClaude] Running:", claudePath, "Query length:", query.length);

    const child = spawn(claudePath, [
      "--dangerously-skip-permissions",
      "--output-format", "text",
      "-p",
      query
    ], {
      env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'] // ignore stdin, pipe stdout/stderr
    });

    const request = pendingClaudeResponses.get(requestId)!;
    request.pid = child.pid;

    console.log("[AskClaude] Child PID:", child.pid);

    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      request.stdout += chunk;
      console.log("[AskClaude] STDOUT:", chunk.substring(0, 100));
    });

    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      request.stderr += chunk;
      console.log("[AskClaude] STDERR:", chunk.substring(0, 200));
    });

    child.on('close', (code) => {
      console.log("[AskClaude] Exited code:", code, "stdout:", request.stdout.length, "stderr:", request.stderr.length);
      clearInterval(checkInterval);
      if (code === 0 && request.stdout) {
        request.status = 'done';
        request.response = request.stdout.trim();
        mainWindow?.webContents.send("claude:response", { requestId, response: request.stdout.trim() });
      } else {
        request.status = 'error';
        request.error = request.stderr || `Exit code ${code}`;
        mainWindow?.webContents.send("claude:error", { requestId, error: request.error });
      }
    });

    child.on('error', (err) => {
      console.error("[AskClaude] Spawn error:", err.message);
      clearInterval(checkInterval);
      request.status = 'error';
      request.error = err.message;
      mainWindow?.webContents.send("claude:error", { requestId, error: err.message });
    });

    // Check status every 10 seconds
    const checkInterval = setInterval(() => {
      console.log("[AskClaude] PID:", child.pid, "running, stdout:", request.stdout.length, "stderr:", request.stderr.length);
    }, 10000);

    // Return immediately with the request ID and PID
    return {
      success: true,
      pending: true,
      requestId,
      pid: child.pid,
      message: `Processing your request (ID: ${requestId}, PID: ${child.pid}). Use getClaudeOutput to check progress.`
    };
  } catch (error) {
    console.error("[AskClaude] Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("system:getClaudeOutput", async (_, requestId: string) => {
  const request = pendingClaudeResponses.get(requestId);
  if (!request) {
    return { success: false, error: "Request not found" };
  }
  const elapsedSec = Math.floor((Date.now() - request.startTime) / 1000);
  return {
    success: true,
    status: request.status,
    pid: request.pid,
    elapsedSeconds: elapsedSec,
    stdoutLength: request.stdout.length,
    stderrLength: request.stderr.length,
    // Return last 500 chars of stdout for progress
    stdoutTail: request.stdout.slice(-500),
    response: request.response,
    error: request.error
  };
});

ipcMain.handle("system:adjustVolume", async (_, percentage: number) => {
  try {
    if (process.platform !== "linux") {
      return {
        success: false,
        error: "Spotify volume control is only supported on Linux",
      };
    }
    const volume = clampPercentage(percentage) / 100;
    const args = [
      "--print-reply",
      "--dest=org.mpris.MediaPlayer2.spotify",
      "/org/mpris/MediaPlayer2",
      "org.freedesktop.DBus.Properties.Set",
      "string:org.mpris.MediaPlayer2.Player",
      "string:Volume",
      `variant:double:${volume}`,
    ];
    await execFileAsync("dbus-send", args);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
