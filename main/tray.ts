import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';

// Type assertion helper for isQuitting flag
const appWithQuitting = app as typeof app & { isQuitting?: boolean };
import * as path from 'path';

let tray: Tray | null = null;

export function createTray(mainWindow: BrowserWindow) {
  const iconPath = getIconPath();
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon);
  tray.setToolTip('OpenAI Realtime API');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        mainWindow.show();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        appWithQuitting.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  return tray;
}

function getIconPath(): string {
  const basePath = app.isPackaged
    ? path.join(process.resourcesPath, 'icons')
    : path.join(app.getAppPath(), 'resources', 'icons');

  // Use different icons based on platform
  if (process.platform === 'win32') {
    return path.join(basePath, 'tray-icon.ico');
  } else if (process.platform === 'darwin') {
    // macOS prefers template images
    return path.join(basePath, 'iconTemplate.png');
  } else {
    return path.join(basePath, 'tray-icon.png');
  }
}

export function updateTrayIcon(isRecording: boolean) {
  if (!tray) return;

  // In the future, we can swap icons here to show recording state
  // const iconName = isRecording ? 'tray-icon-recording.png' : 'tray-icon.png';
  // const iconPath = path.join(app.getAppPath(), 'resources', 'icons', iconName);
  // tray.setImage(nativeImage.createFromPath(iconPath));
}

