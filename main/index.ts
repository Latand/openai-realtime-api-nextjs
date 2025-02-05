import {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  globalShortcut,
} from "electron";
import * as path from "path";
import { format } from "url";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { mcpService } from "./mcp-service";

const execAsync = promisify(exec);
const isDevelopment = process.env.NODE_ENV !== "production";

let mainWindow: BrowserWindow | null = null;

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 400,
    height: 400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    autoHideMenuBar: true,
    frame: true,
    alwaysOnTop: true,
    x: 1000,
  });

  if (isDevelopment) {
    setTimeout(() => {
      window.loadURL("http://localhost:3000");
      // window.webContents.openDevTools();
    }, 1000);
  } else {
    window.loadURL(
      format({
        pathname: path.join(__dirname, "../renderer/out/index.html"),
        protocol: "file",
        slashes: true,
      })
    );
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
    mainWindow = createMainWindow();
  }
});

// Create main BrowserWindow when electron is ready
app.on("ready", async () => {
  mainWindow = createMainWindow();

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
});

// Function to simulate keyboard actions
async function simulateKeyPress(key: string): Promise<void> {
  if (process.platform === "linux") {
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await execAsync(`xdotool key ${key}`);
    } catch (error) {
      console.error("Failed to simulate key press:", error);
    }
  }
}

// Function to simulate paste keystroke
async function simulatePaste(): Promise<void> {
  if (process.platform === "linux") {
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await execAsync("xdotool key ctrl+v");
    } catch (error) {
      console.error("Failed to simulate paste:", error);
    }
  }
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
    console.log(`[SystemVolume] Setting volume to ${percentage}%`);
    const command = `wpctl set-volume @DEFAULT_AUDIO_SINK@ ${percentage}%`;
    await execAsync(command);
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

// Function to type text using xdotool
async function typeText(text: string): Promise<void> {
  try {
    await execAsync(`xdotool type "${text}"`);
  } catch (error) {
    console.error("Failed to type text:", error);
    throw error;
  }
}

// Clipboard controls
ipcMain.handle("clipboard:writeAndPaste", async (_, text: string) => {
  try {
    await clipboard.writeText(text);
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

// Add a helper function for command execution with logging
async function execWithLogging(command: string, context: string) {
  console.log(`[${context}] Executing command: ${command}`);
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stdout) console.log(`[${context}] stdout:`, stdout.trim());
    if (stderr) console.warn(`[${context}] stderr:`, stderr.trim());
    return { stdout, stderr };
  } catch (error) {
    console.error(`[${context}] Command failed:`, error);
    throw error;
  }
}

ipcMain.handle("system:openSpotify", () => {
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
        const { stdout } = await execAsync("pidof spotify");
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

ipcMain.handle("system:adjustVolume", (_, percentage: number) => {
  return new Promise((resolve) => {
    // Convert percentage to decimal (0-1 range)
    const volume = Math.min(Math.max(percentage, 0), 100) / 100;

    // Use D-Bus to set Spotify's volume specifically with correct variant syntax
    const command = `dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Set string:"org.mpris.MediaPlayer2.Player" string:"Volume" variant:double:${volume}`;

    console.log(`[Volume] Executing command: ${command}`);
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        resolve({ success: false, error: error.message });
        return;
      }
      if (stderr) {
        console.error(`Stderr: ${stderr}`);
      }
      console.log(`Output: ${stdout}`);
      resolve({ success: true });
    });
  });
});
