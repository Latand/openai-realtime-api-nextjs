import { execFile } from 'child_process';
import { promisify } from 'util';
import { KeyboardSimulator, VolumeController, SpotifyController, PlatformModule } from './types';

const execFileAsync = promisify(execFile);

class MacKeyboardSimulator implements KeyboardSimulator {
  async pressKey(key: string): Promise<void> {
    let script = '';
    // Basic mapping, can be expanded
    if (key === 'Return') {
      script = 'tell application "System Events" to key code 36';
    } else {
      // Fallback for simple characters
      script = `tell application "System Events" to keystroke "${key}"`;
    }
    await execFileAsync('osascript', ['-e', script]);
  }

  async paste(): Promise<void> {
    await execFileAsync('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']);
  }

  async pressEnter(): Promise<void> {
    await execFileAsync('osascript', ['-e', 'tell application "System Events" to key code 36']);
  }
}

class MacVolumeController implements VolumeController {
  async setVolume(percentage: number): Promise<void> {
    const value = Math.min(Math.max(percentage, 0), 100);
    await execFileAsync('osascript', ['-e', `set volume output volume ${value}`]);
  }

  async getVolume(): Promise<number> {
    try {
      const { stdout } = await execFileAsync('osascript', ['-e', 'output volume of (get volume settings)']);
      return parseInt(stdout.trim(), 10);
    } catch (error) {
      console.error('Failed to get volume:', error);
      return 0;
    }
  }

  async setMuted(muted: boolean): Promise<void> {
    await execFileAsync('osascript', ['-e', `set volume output muted ${muted}`]);
  }
}

class MacSpotifyController implements SpotifyController {
  async open(): Promise<void> {
    await execFileAsync('open', ['-a', 'Spotify']);
  }

  async setVolume(percentage: number): Promise<void> {
    const value = Math.min(Math.max(percentage, 0), 100);
    await execFileAsync('osascript', ['-e', `tell application "Spotify" to set sound volume to ${value}`]);
  }
}

class MacFocusManager {
  async saveFocus(): Promise<string | null> {
    // Stub for macOS
    return null;
  }

  async restoreFocus(windowId: string): Promise<void> {
    // Stub for macOS
  }
}

export function createMacPlatform(): PlatformModule {
  return {
    keyboard: new MacKeyboardSimulator(),
    volume: new MacVolumeController(),
    spotify: new MacSpotifyController(),
    focus: new MacFocusManager()
  };
}
