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
const execAsync = (0, util_1.promisify)(child_process_1.exec);
const isDevelopment = process.env.NODE_ENV !== "production";
let mainWindow = null;
function createMainWindow() {
    const window = new electron_1.BrowserWindow({
        width: 1600,
        height: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js"),
        },
        autoHideMenuBar: true,
        frame: true,
    });
    if (isDevelopment) {
        setTimeout(() => {
            window.loadURL("http://localhost:3000");
            window.webContents.openDevTools();
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
electron_1.app.on("ready", () => {
    mainWindow = createMainWindow();
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
electron_1.ipcMain.handle("clipboard:writeAndPaste", async (_, text) => {
    try {
        electron_1.clipboard.writeText(text);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await simulatePaste();
        return { success: true };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { success: false, error: errorMessage };
    }
});
electron_1.ipcMain.handle("clipboard:writeAndEnter", async (_, text) => {
    try {
        electron_1.clipboard.writeText(text);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await simulatePaste();
        await new Promise((resolve) => setTimeout(resolve, 100));
        await simulateKeyPress("Return");
        return { success: true };
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        return { success: false, error: errorMessage };
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
// Add helper function to try different Spotify launch methods
async function tryLaunchSpotify(context) {
    console.log(`[${context}] Attempting to launch Spotify using different methods...`);
    // Try methods in sequence
    const methods = [
        {
            name: "flatpak",
            cmd: "flatpak run com.spotify.Client",
            check: async () => {
                try {
                    await execWithLogging("flatpak list | grep spotify", context);
                    return true;
                }
                catch {
                    return false;
                }
            },
        },
        {
            name: "snap",
            cmd: "snap run spotify",
            check: async () => {
                try {
                    await execWithLogging("snap list | grep spotify", context);
                    return true;
                }
                catch {
                    return false;
                }
            },
        },
        {
            name: "native",
            cmd: "spotify --no-zygote", // Try with --no-zygote to avoid GBM issues
            check: async () => {
                try {
                    await execWithLogging("which spotify", context);
                    return true;
                }
                catch {
                    return false;
                }
            },
        },
    ];
    for (const method of methods) {
        if (await method.check()) {
            console.log(`[${context}] Found ${method.name} installation, attempting to launch...`);
            try {
                // Use spawn instead of exec for better process handling
                const process = (0, child_process_1.spawn)(method.cmd.split(" ")[0], method.cmd.split(" ").slice(1), {
                    detached: true,
                    stdio: "ignore",
                });
                process.unref(); // Detach from parent process
                // Wait a bit and check if process is running
                await new Promise((resolve) => setTimeout(resolve, 3000));
                try {
                    const { stdout } = await execWithLogging("pidof spotify", context);
                    console.log(`[${context}] Successfully launched using ${method.name}, PID:`, stdout.trim());
                    return true;
                }
                catch (error) {
                    console.error(`[${context}] Process check failed after ${method.name} launch:`, error);
                }
            }
            catch (error) {
                console.error(`[${context}] Failed to launch using ${method.name}:`, error);
            }
        }
    }
    console.error(`[${context}] All launch methods failed`);
    return false;
}
// Handle system operations for music control
electron_1.ipcMain.handle("system:test", () => {
    return new Promise((resolve) => {
        (0, child_process_1.exec)('echo "Test from Electron"', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                resolve({ success: false, error: error.message });
                return;
            }
            if (stderr) {
                console.error(`Stderr: ${stderr}`);
            }
            console.log(`Output: ${stdout}`);
            resolve({ success: true, output: stdout });
        });
    });
});
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
electron_1.ipcMain.handle("system:controlMusic", (_, action) => {
    return new Promise((resolve) => {
        const command = "dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.mpris.MediaPlayer2.Player.PlayPause";
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
electron_1.ipcMain.handle("system:adjustSystemVolume", async (_, percentage) => {
    const maxRetries = 3;
    let retryCount = 0;
    const tryAdjustVolume = async () => {
        try {
            console.log(`[SystemVolume] Attempting to set volume to ${percentage}%`);
            const command = `wpctl set-volume @DEFAULT_AUDIO_SINK@ ${percentage}%`;
            const { stdout, stderr } = await execWithLogging(command, "SystemVolume");
            // Verify the volume was set correctly
            const verifyCommand = "wpctl get-volume @DEFAULT_AUDIO_SINK@";
            const { stdout: verifyStdout } = await execWithLogging(verifyCommand, "SystemVolume");
            if (verifyStdout.includes("Volume:")) {
                return { success: true };
            }
            else {
                throw new Error("Failed to verify volume change");
            }
        }
        catch (error) {
            console.error(`[SystemVolume] Attempt ${retryCount + 1} failed:`, error);
            if (retryCount < maxRetries) {
                retryCount++;
                console.log(`[SystemVolume] Retrying... (${retryCount}/${maxRetries})`);
                await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms before retry
                return tryAdjustVolume();
            }
            throw error;
        }
    };
    try {
        const result = await tryAdjustVolume();
        return result;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        console.error("[SystemVolume] All attempts failed:", errorMessage);
        return { success: false, error: errorMessage };
    }
});
//# sourceMappingURL=index.js.map