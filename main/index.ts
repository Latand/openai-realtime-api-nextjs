import {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  screen,
} from "electron";
import * as path from "path";
import next from "next";
import { createServer, Server } from "http";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { mcpService } from "./mcp-service";

const execFileAsync = promisify(execFile);
const isDevelopment = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
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
});

app.on("will-quit", async () => {
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
