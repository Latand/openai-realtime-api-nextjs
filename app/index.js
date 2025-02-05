"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const url_1 = require("url");
const child_process_1 = require("child_process");
const util_1 = require("util");
const mcp_service_1 = require("./mcp-service");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const isDevelopment = process.env.NODE_ENV !== "production";
let mainWindow = null;
function createMainWindow() {
    const window = new electron_1.BrowserWindow({
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
    }
    else {
        window.loadURL((0, url_1.format)({
            pathname: path.join(__dirname, "../renderer/out/index.html"),
            protocol: "file",
            slashes: true,
        }));
    }
    window.on("closed", () => {
        mainWindow = null;
    });
    return window;
}
// Handle errors
electron_1.app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        electron_1.app.quit();
    }
});
electron_1.app.on("activate", () => {
    if (mainWindow === null) {
        mainWindow = createMainWindow();
    }
});
// Create main BrowserWindow when electron is ready
electron_1.app.on("ready", async () => {
    mainWindow = createMainWindow();
    // Initialize MCP service
    await mcp_service_1.mcpService.initialize();
    mcp_service_1.mcpService.setupIPC();
    // Add IPC handler for dev tools
    electron_1.ipcMain.handle("window:toggleDevTools", () => {
        mainWindow?.webContents.toggleDevTools();
    });
});
electron_1.app.on("will-quit", async () => {
    // Cleanup MCP service
    await mcp_service_1.mcpService.disconnect();
});
// Function to simulate keyboard actions
async function simulateKeyPress(key) {
    if (process.platform === "linux") {
        try {
            await new Promise((resolve) => setTimeout(resolve, 500));
            await execAsync(`xdotool key ${key}`);
        }
        catch (error) {
            console.error("Failed to simulate key press:", error);
        }
    }
}
// Function to simulate paste keystroke
async function simulatePaste() {
    if (process.platform === "linux") {
        try {
            await new Promise((resolve) => setTimeout(resolve, 500));
            await execAsync("xdotool key ctrl+v");
        }
        catch (error) {
            console.error("Failed to simulate paste:", error);
        }
    }
}
// Handle keyboard operations
electron_1.ipcMain.handle("keyboard:pressEnter", async () => {
    try {
        await simulateKeyPress("Return");
        return { success: true };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { success: false, error: errorMessage };
    }
});
// Handle clipboard operations
electron_1.ipcMain.handle("clipboard:write", async (_, text) => {
    try {
        electron_1.clipboard.writeText(text);
        return { success: true };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { success: false, error: errorMessage };
    }
});
async function adjustSystemVolume(percentage) {
    try {
        console.log(`[SystemVolume] Setting volume to ${percentage}%`);
        const command = `wpctl set-volume @DEFAULT_AUDIO_SINK@ ${percentage}%`;
        await execAsync(command);
        return { success: true };
    }
    catch (error) {
        console.error("[SystemVolume] Failed to adjust volume:", error);
        throw error;
    }
}
// System controls
electron_1.ipcMain.handle("system:adjustSystemVolume", async (_, percentage) => {
    try {
        const result = await adjustSystemVolume(percentage);
        return result;
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
});
// Function to type text using xdotool
async function typeText(text) {
    try {
        await execAsync(`xdotool type "${text}"`);
    }
    catch (error) {
        console.error("Failed to type text:", error);
        throw error;
    }
}
// Clipboard controls
electron_1.ipcMain.handle("clipboard:writeAndPaste", async (_, text) => {
    try {
        await electron_1.clipboard.writeText(text);
        return { success: true };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
});
electron_1.ipcMain.handle("clipboard:read", async () => {
    try {
        const text = electron_1.clipboard.readText();
        return { success: true, text };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { success: false, error: errorMessage };
    }
});
// Add a helper function for command execution with logging
async function execWithLogging(command, context) {
    console.log(`[${context}] Executing command: ${command}`);
    try {
        const { stdout, stderr } = await execAsync(command);
        if (stdout)
            console.log(`[${context}] stdout:`, stdout.trim());
        if (stderr)
            console.warn(`[${context}] stderr:`, stderr.trim());
        return { stdout, stderr };
    }
    catch (error) {
        console.error(`[${context}] Command failed:`, error);
        throw error;
    }
}
electron_1.ipcMain.handle("system:openSpotify", () => {
    return new Promise((resolve) => {
        // Use spawn with shell option to handle the command better
        const spotify = (0, child_process_1.spawn)("spotify", [], {
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
            }
            catch (error) {
                console.error("Failed to verify Spotify process:", error);
                resolve({
                    success: false,
                    error: "Failed to verify if Spotify started",
                });
            }
        }, 1000);
    });
});
electron_1.ipcMain.handle("system:adjustVolume", (_, percentage) => {
    return new Promise((resolve) => {
        // Convert percentage to decimal (0-1 range)
        const volume = Math.min(Math.max(percentage, 0), 100) / 100;
        // Use D-Bus to set Spotify's volume specifically with correct variant syntax
        const command = `dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Set string:"org.mpris.MediaPlayer2.Player" string:"Volume" variant:double:${volume}`;
        console.log(`[Volume] Executing command: ${command}`);
        (0, child_process_1.exec)(command, (error, stdout, stderr) => {
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
//# sourceMappingURL=index.js.map