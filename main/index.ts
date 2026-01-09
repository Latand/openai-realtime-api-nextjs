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

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const isDevelopment = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let transcriptionWindow: BrowserWindow | null = null;
const textImprovementWindows: Map<number, BrowserWindow> = new Map();
let nextServer: Server | null = null;
let nextServerUrl: string | null = null;

function clampPercentage(percentage: number) {
  const value = Number(percentage);
  if (!Number.isFinite(value)) {
    throw new Error("Invalid percentage");
  }
  return Math.min(Math.max(value, 0), 100);
}

async function startNextServer(): Promise<string> {
  if (nextServerUrl) {
    return nextServerUrl;
  }

  const appPath = app.getAppPath();
  const nextApp = next({ dev: false, dir: appPath });
  const handle = nextApp.getRequestHandler();

  await nextApp.prepare();

  nextServer = createServer((req, res) => {
    handle(req, res);
  });

  return new Promise((resolve, reject) => {
    nextServer?.once("error", reject);
    nextServer?.listen(0, "127.0.0.1", () => {
      const address = nextServer?.address();
      if (address && typeof address === "object") {
        nextServerUrl = `http://127.0.0.1:${address.port}`;
        resolve(nextServerUrl);
        return;
      }
      reject(new Error("Failed to start Next.js server"));
    });
  });
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
      const serverUrl = await startNextServer();
      await window.loadURL(serverUrl);
    } catch (error) {
      console.error("Failed to start Next.js server:", error);
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
    });
  }
});

// Create transcription window
async function createTranscriptionWindow(): Promise<BrowserWindow> {
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;
  const windowWidth = 450;
  const windowHeight = 300;

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
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
  });

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const url = isDevelopment
    ? "http://localhost:3000/transcription"
    : `${nextServerUrl}/transcription`;

  await window.loadURL(url);

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
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
  });

  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Build URL (no query params - we'll pass text via IPC)
  const url = isDevelopment
    ? "http://localhost:3000/text-improvement"
    : `${nextServerUrl}/text-improvement`;

  console.log("[TextImprovement] Loading URL:", url);
  await window.loadURL(url);
  console.log("[TextImprovement] URL loaded successfully");

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
app.on("ready", async () => {
  mainWindow = await createMainWindow();

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
      transcriptionWindow.focus();
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

  ipcMain.handle("transcription:updateState", (_, state: { isRecording: boolean; isProcessing: boolean; recordingDuration: number }) => {
    if (transcriptionWindow) {
      transcriptionWindow.webContents.send("transcription:stateUpdate", state);
    }
    return { success: true };
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
  globalShortcut.register("CommandOrControl+Shift+T", () => {
    console.log("[GlobalShortcut] Ctrl+Shift+T pressed - toggle real-time transcription");
    mainWindow?.webContents.send("shortcut:toggleTranscription");
  });

  globalShortcut.register("CommandOrControl+Shift+R", () => {
    console.log("[GlobalShortcut] Ctrl+Shift+R pressed - toggle Whisper transcription");
    mainWindow?.webContents.send("shortcut:toggleWhisper");
  });

  globalShortcut.register("CommandOrControl+Shift+M", () => {
    console.log("[GlobalShortcut] Ctrl+Shift+M pressed - toggle mute");
    mainWindow?.webContents.send("shortcut:toggleMute");
  });

  globalShortcut.register("CommandOrControl+Shift+G", () => {
    console.log("[GlobalShortcut] Ctrl+Shift+G pressed - toggle text improvement");
    mainWindow?.webContents.send("shortcut:toggleTextImprovement");
  });

  console.log("[GlobalShortcut] Registered Ctrl+Shift+T, Ctrl+Shift+R and Ctrl+Shift+M");
});

app.on("will-quit", async () => {
  // Unregister all global shortcuts
  globalShortcut.unregisterAll();

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
    if (process.platform !== "linux") {
      throw new Error("System volume control is only supported on Linux");
    }
    const safePercentage = clampPercentage(percentage);
    console.log(`[SystemVolume] Setting volume to ${safePercentage}%`);
    await execFileAsync("wpctl", [
      "set-volume",
      "@DEFAULT_AUDIO_SINK@",
      `${safePercentage}%`,
    ]);
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
