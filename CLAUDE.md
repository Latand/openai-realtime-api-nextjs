# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenAI Realtime API voice chat application built with Next.js 15 and Electron. Supports both web deployment and cross-platform desktop app with system tray, overlay windows, and native OS integrations.

## Development Commands

```bash
# Web development (Next.js with Turbopack)
npm run dev

# Electron development (runs Next.js + Electron concurrently)
npm run electron-dev

# Build for production
npm run build              # Next.js only
npm run electron-build     # Full Electron package (builds Next.js, compiles main/, runs electron-builder)

# Lint
npm run lint
```

## Architecture

### Dual Runtime Structure

- **Next.js frontend** (`app/`, `components/`, `hooks/`, `lib/`): React app using App Router with route groups
- **Electron main process** (`main/`): Separate TypeScript compilation to `dist-electron/`, uses CommonJS modules

### Route Groups

- `app/(main)/` - Primary voice chat interface
- `app/(overlay)/` - Frameless overlay windows (transcription, text improvement)
- `app/api/` - API routes for session management, web scraping, text processing

### Key Hooks

- `hooks/use-webrtc.ts` - Core WebRTC connection to OpenAI Realtime API, audio streaming, tool function registration
- `hooks/use-transcription.ts` - Real-time transcription display
- `hooks/use-wake-word.ts` - Picovoice wake word detection
- `hooks/use-tools.ts` - Tool function implementations and MCP integration

### Electron IPC Bridge

`main/preload.ts` exposes APIs to renderer via `contextBridge`:
- `window.electron.clipboard` - Clipboard operations with paste simulation
- `window.electron.system` - Volume control, Claude CLI integration
- `window.electron.mcp` - MCP server communication (Spotify, etc.)
- `window.electron.memory` - Persistent conversation compacts and notes
- `window.electron.settings` - API keys stored in userData

### Tool System

Tools defined in `lib/tools.ts` are registered with the WebRTC session. The assistant can call:
- `getCurrentTime`, `stopSession`, `launchWebsite`, `pasteText`
- `adjustSystemVolume`, `scrapeWebsite`, `readClipboard`, `copyToClipboard`
- `askClaude` - Spawns Claude CLI for complex queries
- MCP tools dynamically loaded from configured servers

### Conversation Memory

`lib/conversation-memory.ts` handles:
- Conversation compacts (summaries persisted to file via Electron)
- Persistent notes (user-maintained context)
- System prompt customization

## Environment Variables

```env
OPENAI_API_KEY=             # Required for Realtime API
ANTHROPIC_API_KEY=          # For askClaude tool
PICOVOICE_ACCESS_KEY=       # For wake word detection
```

In Electron, API keys are stored in `userData/api-keys.json` and loaded into env at startup.

## Build Configuration

- `electron-builder.yml` - Packaging config for Windows (NSIS), macOS (DMG), Linux (AppImage/deb)
- `main/tsconfig.json` - Electron main process compiles separately to CommonJS
- Next.js static output is unpacked from ASAR for proper serving in production

## Cross-Platform Build Instructions

**IMPORTANT:** Before building, always clean and rebuild Next.js to avoid Turbopack/Webpack conflicts:

```bash
rm -rf .next && npm run build
```

### Build commands for each platform (run in parallel if needed):

```bash
# Linux AppImage
npx electron-builder --linux AppImage

# Windows (from Linux - creates win-unpacked folder, then zip manually)
npx electron-builder --win zip
# If wine errors occur, create zip manually:
cd dist && zip -r "OpenAI Realtime API-0.1.0-win.zip" win-unpacked/

# macOS Intel (x64)
npx electron-builder --mac zip --x64

# macOS Apple Silicon (M1/M2/M3 - arm64)
npx electron-builder --mac zip --arm64
```

### Output files:
- `OpenAI Realtime API-0.1.0.AppImage` - Linux
- `OpenAI Realtime API-0.1.0-win.zip` - Windows
- `OpenAI Realtime API-0.1.0-mac.zip` - macOS Intel
- `OpenAI Realtime API-0.1.0-arm64-mac.zip` - macOS Apple Silicon

### Notes:
- Always use **zip** format for distribution (not exe, dmg, etc.)
- macOS code signing is skipped when building from Linux
- Windows builds may fail with wine errors on Linux - the unpacked folder still works, just zip it manually

## Path Alias

`@/*` maps to project root (configured in `tsconfig.json`).
