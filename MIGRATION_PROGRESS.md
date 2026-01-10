# Migration Progress - v2 Cross-Platform

## Phase 1: Critical Fixes (Completed)
- [x] App Menu (macOS support for Copy/Paste) - Implemented in `main/menu.ts`
- [x] Claude CLI Path (Cross-platform support) - Updated in `main/index.ts` to use `app.getPath('home')`

## Phase 2: Platform Abstraction (Completed)
- [x] Created `main/platform/` architecture
- [x] Implemented `KeyboardSimulator` interface
  - [x] Linux: xdotool
  - [x] macOS: osascript
  - [x] Windows: PowerShell SendKeys (Basic)
- [x] Implemented `VolumeController` interface
  - [x] Linux: wpctl
  - [x] macOS: osascript
  - [x] Windows: nircmd stub / placeholder

## Phase 3: System Tray (Completed)
- [x] Created `main/tray.ts`
- [x] Integrated into `main/index.ts`
- [x] Generated icon assets in `resources/icons/`
- [x] Fixed Tray Icon paths for packaged app (ASAR compatibility)

## Phase 6: Spotify (Partial/Foundation)
- [x] Implemented `SpotifyController` interface
- [x] Moved Spotify logic to platform modules
  - [x] Linux: spawn + D-Bus
  - [x] macOS: open + AppleScript
  - [x] Windows: protocol handler

## Phase 7: Auto-launch (Completed)
- [x] Created `main/autolaunch.ts`
- [x] Implemented `app.setLoginItemSettings` for macOS/Windows
- [x] Implemented XDG autostart (.desktop) for Linux
- [x] Added IPC handlers: `settings:setAutoLaunch`, `settings:getAutoLaunch`

## Phase 8: Application Icons (Completed)
- [x] Designed `icon.svg` (Main) and `tray-icon.svg` (Tray)
- [x] Generated `icon.ico` (Windows)
- [x] Generated `icon.png` (Linux/Web/macOS fallback)
- [x] Generated tray icons (`tray-icon.ico`, `tray-icon.png`, `iconTemplate.png`)
- [x] Updated `electron-builder.yml` to include icons and `extraResources`

## Remaining Tasks
- **Phase 9 (Code Signing)**: Configure build process.
- **Phase 10 (Auto-updates)**: Configure electron-updater.
