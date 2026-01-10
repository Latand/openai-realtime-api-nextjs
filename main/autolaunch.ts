import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface AutoLaunchOptions {
  isHidden?: boolean;
}

export class AutoLauncher {
  async enable(options: AutoLaunchOptions = {}): Promise<void> {
    if (process.platform === 'linux') {
      await this.enableLinux(options);
    } else {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: options.isHidden || false,
        path: app.getPath('exe'),
      });
    }
  }

  async disable(): Promise<void> {
    if (process.platform === 'linux') {
      await this.disableLinux();
    } else {
      app.setLoginItemSettings({
        openAtLogin: false,
      });
    }
  }

  async isEnabled(): Promise<boolean> {
    if (process.platform === 'linux') {
      return this.isEnabledLinux();
    } else {
      const settings = app.getLoginItemSettings();
      return settings.openAtLogin;
    }
  }

  // Linux specific implementation using .desktop file
  private getDesktopFilePath(): string {
    const autostartDir = path.join(os.homedir(), '.config', 'autostart');
    if (!fs.existsSync(autostartDir)) {
      fs.mkdirSync(autostartDir, { recursive: true });
    }
    return path.join(autostartDir, `${app.name}-autostart.desktop`);
  }

  private async enableLinux(options: AutoLaunchOptions): Promise<void> {
    const desktopFile = this.getDesktopFilePath();
    const exePath = app.getPath('exe');
    
    const content = `[Desktop Entry]
Type=Application
Version=1.0
Name=${app.name}
Comment=${app.name} startup script
Exec="${exePath}"${options.isHidden ? ' --hidden' : ''}
StartupNotify=false
Terminal=false
`;

    await fs.promises.writeFile(desktopFile, content, { mode: 0o755 });
  }

  private async disableLinux(): Promise<void> {
    const desktopFile = this.getDesktopFilePath();
    if (fs.existsSync(desktopFile)) {
      await fs.promises.unlink(desktopFile);
    }
  }

  private async isEnabledLinux(): Promise<boolean> {
    const desktopFile = this.getDesktopFilePath();
    return fs.existsSync(desktopFile);
  }
}

export const autoLauncher = new AutoLauncher();

