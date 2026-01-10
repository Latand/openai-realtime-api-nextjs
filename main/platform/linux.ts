import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { KeyboardSimulator, VolumeController, SpotifyController, PlatformModule } from './types';

const execFileAsync = promisify(execFile);

class LinuxKeyboardSimulator implements KeyboardSimulator {
  async pressKey(key: string): Promise<void> {
    // Small delay to ensure focus is correct
    await new Promise((resolve) => setTimeout(resolve, 200));
    await execFileAsync('xdotool', ['key', key]);
  }

  async paste(): Promise<void> {
    await this.pressKey('ctrl+v');
  }

  async pressEnter(): Promise<void> {
    await this.pressKey('Return');
  }
}

class LinuxVolumeController implements VolumeController {
  async setVolume(percentage: number): Promise<void> {
    const value = Math.min(Math.max(percentage, 0), 100);
    // wpctl expects percentage as 0.75 or 75%
    await execFileAsync('wpctl', [
      'set-volume',
      '@DEFAULT_AUDIO_SINK@',
      `${value}%`
    ]);
  }

  async getVolume(): Promise<number> {
    try {
      // Output format: "Volume: 0.40" or "Volume: 0.40 [MUTED]"
      const { stdout } = await execFileAsync('wpctl', ['get-volume', '@DEFAULT_AUDIO_SINK@']);
      const match = stdout.match(/Volume:\s+(\d+(\.\d+)?)/);
      if (match && match[1]) {
        return Math.round(parseFloat(match[1]) * 100);
      }
      return 0;
    } catch (error) {
      console.error('Failed to get volume:', error);
      return 0;
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    await execFileAsync('wpctl', [
      'set-mute',
      '@DEFAULT_AUDIO_SINK@',
      muted ? '1' : '0'
    ]);
  }
}

class LinuxSpotifyController implements SpotifyController {
  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
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
        reject(error);
      });

      // Detach from parent process
      spotify.unref();

      // Wait a bit to check if process started
      setTimeout(async () => {
        try {
          const { stdout } = await execFileAsync("pidof", ["spotify"]);
          console.log("Spotify started, PID:", stdout.trim());
          resolve();
        } catch (error) {
          console.warn("Failed to verify Spotify process via pidof:", error);
          resolve();
        }
      }, 1000);
    });
  }

  async setVolume(percentage: number): Promise<void> {
    const volume = Math.min(Math.max(percentage, 0), 100) / 100;
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
  }
}

class LinuxFocusManager {
  async saveFocus(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync('xdotool', ['getwindowfocus']);
      const windowId = stdout.trim();
      console.log(`[Focus] Saved focus: ${windowId}`);
      return windowId;
    } catch (error) {
      console.warn('[Focus] Failed to save focus (xdotool might be missing):', error);
      return null;
    }
  }

  async restoreFocus(windowId: string): Promise<void> {
    if (!windowId) return;
    try {
      await execFileAsync('xdotool', ['windowactivate', windowId]);
      console.log(`[Focus] Restored focus: ${windowId}`);
    } catch (error) {
      console.warn('[Focus] Failed to restore focus:', error);
    }
  }
}

export function createLinuxPlatform(): PlatformModule {
  return {
    keyboard: new LinuxKeyboardSimulator(),
    volume: new LinuxVolumeController(),
    spotify: new LinuxSpotifyController(),
    focus: new LinuxFocusManager(),
    checkDependencies: async () => {
      const missing: string[] = [];
      const check = async (cmd: string) => {
        try {
          await execFileAsync('which', [cmd]);
          return true;
        } catch {
          return false;
        }
      };

      if (!(await check('xdotool'))) missing.push('xdotool');
      if (!(await check('wpctl'))) missing.push('wpctl');
      if (!(await check('dbus-send'))) missing.push('dbus-send');
      
      return {
        success: missing.length === 0,
        missing
      };
    }
  };
}
