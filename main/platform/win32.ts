import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { KeyboardSimulator, VolumeController, SpotifyController, PlatformModule } from './types';

const execFileAsync = promisify(execFile);

class WindowsKeyboardSimulator implements KeyboardSimulator {
  async pressKey(key: string): Promise<void> {
    // Basic mapping for SendKeys
    let keys = key;
    if (key === 'Return') keys = '{ENTER}';
    
    // PowerShell command to send keys
    // Note: This is a basic implementation. For robust control, use @nut-tree/nut-js
    const script = `
      $wshell = New-Object -ComObject wscript.shell;
      $wshell.SendKeys('${keys}')
    `;
    
    const child = spawn('powershell', ['-Command', script]);
    await new Promise<void>((resolve, reject) => {
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`PowerShell exited with code ${code}`));
        });
        child.on('error', reject);
    });
  }

  async paste(): Promise<void> {
    // ^v is Ctrl+V in SendKeys
    await this.pressKey('^v');
  }

  async pressEnter(): Promise<void> {
    await this.pressKey('Return');
  }
}

class WindowsVolumeController implements VolumeController {
  async setVolume(percentage: number): Promise<void> {
    // Requires nircmd or similar for reliable absolute volume
    // nircmd.exe setsysvolume 65535 * percentage / 100
    const val = Math.floor(65535 * percentage / 100);
    try {
        await execFileAsync('nircmd.exe', ['setsysvolume', val.toString()]);
    } catch (e) {
        console.warn("nircmd.exe not found. Volume control on Windows requires nircmd to be in PATH.");
    }
  }

  async getVolume(): Promise<number> {
    // Hard to get without external tools like nircmd or custom C# wrapper
    return 0; 
  }

  async setMuted(muted: boolean): Promise<void> {
    try {
         await execFileAsync('nircmd.exe', ['mutesysvolume', muted ? '1' : '0']);
    } catch (e) {
         console.warn("nircmd.exe not found.");
    }
  }
}

class WindowsSpotifyController implements SpotifyController {
  async open(): Promise<void> {
    // Open via protocol handler
    const child = spawn('cmd', ['/c', 'start', 'spotify:']);
    await new Promise<void>((resolve, reject) => {
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command exited with code ${code}`));
        });
        child.on('error', reject);
    });
  }

  async setVolume(percentage: number): Promise<void> {
    console.warn("Spotify volume control not implemented on Windows");
  }
}

class WindowsFocusManager {
  async saveFocus(): Promise<string | null> {
    // Stub for Windows
    return null;
  }

  async restoreFocus(windowId: string): Promise<void> {
    // Stub for Windows
  }
}

export function createWindowsPlatform(): PlatformModule {
  return {
    keyboard: new WindowsKeyboardSimulator(),
    volume: new WindowsVolumeController(),
    spotify: new WindowsSpotifyController(),
    focus: new WindowsFocusManager()
  };
}
