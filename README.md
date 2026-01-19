# OpenAI Realtime Voice Assistant

A cross-platform voice assistant application using OpenAI's Realtime API with WebRTC. Built with Next.js 15 and Electron, featuring real-time voice conversations, wake word detection, multiple transcription modes, and extensible tool integrations.

## Features

### Voice Conversation
- **Real-time Voice Chat**: Two-way voice conversations using OpenAI's Realtime API via WebRTC
- **Multiple Voice Options**: Select from available OpenAI voices (default: Coral)
- **Audio Visualization**: Live waveform display for both user and assistant audio
- **Session Timer**: Track conversation duration
- **Microphone Controls**: Mute/unmute during active sessions

### Wake Word Detection
- **Hands-free Activation**: Say "Hi Celestial" to start a voice session
- **Picovoice Porcupine**: Offline wake word detection using Picovoice engine
- **Configurable Sensitivity**: Adjustable detection threshold

### Transcription Modes
- **Real-time Transcription (Ctrl+Shift+T)**: Live speech-to-text using OpenAI's real-time transcription with local VAD
- **Whisper Transcription (Ctrl+Shift+R)**: Higher quality transcription - records audio then transcribes via Whisper API
- **Text Improvement (Ctrl+Shift+G)**: Capture speech and improve/reformat text using AI
- **Floating Overlay Windows**: Transcription appears in draggable, always-on-top windows

### Tool System
The assistant can execute various tools during conversation:
- `getCurrentTime` - Get current time and timezone
- `launchWebsite` - Open URLs in browser
- `pasteText` - Paste text at cursor position
- `copyToClipboard` / `readClipboard` - Clipboard operations
- `scrapeWebsite` - Extract content from web pages (requires FireCrawl API)
- `adjustSystemVolume` - Control system volume (Linux)
- `askClaude` / `getClaudeOutput` - Delegate complex queries to Claude CLI
- `saveConversationSummary` / `stopSession` - Session management

### Conversation Memory
- **Conversation Compacts**: Automatic summarization of past conversations
- **Persistent Notes**: Long-term facts about the user
- **Custom System Prompts**: Customize assistant behavior
- **Memory Injection**: Previous context injected into new sessions

### MCP Integration
- Dynamic tool loading from Model Context Protocol servers
- Spotify control via MCP (when configured)

### Desktop Features (Electron)
- **System Tray**: Minimize to tray, quick access menu
- **Global Shortcuts**: Work even when app is not focused
- **Always-on-Top**: Optional floating window mode
- **Auto-launch**: Start with system
- **Cost Tracking**: Monitor API usage costs

## Requirements

- Node.js 18+
- OpenAI API Key (with Realtime API access)
- Optional: Anthropic API Key (for askClaude tool)
- Optional: Picovoice Access Key (for wake word detection)
- Optional: FireCrawl API Key (for website scraping)

## Installation

### 1. Clone the Repository
```bash
git clone https://github.com/cameronking4/openai-realtime-api-nextjs.git
cd openai-realtime-api-nextjs
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Create a `.env.local` file in the root directory:
```env
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key       # Optional: for askClaude tool
PICOVOICE_ACCESS_KEY=your-picovoice-access-key # Optional: for wake word
FIRECRAWL_API_KEY=your-firecrawl-api-key       # Optional: for web scraping

# Optional: session security
SESSION_SECRET=your-session-secret
NEXT_PUBLIC_SESSION_SECRET=your-session-secret
```

For Electron builds, API keys can also be configured in the Settings page and are stored securely in the user data directory.

## Development

### Web Development (Next.js only)
```bash
npm run dev
```
Opens at `http://localhost:3000` with Turbopack hot reload.

### Electron Development
```bash
npm run electron-dev
```
Runs Next.js dev server and Electron concurrently.

## Building for Production

### Build Next.js Web App
```bash
npm run build
```

### Build Electron Desktop App
```bash
# Clean build (recommended)
rm -rf .next && npm run build

# Full Electron package
npm run electron-build
```

### Cross-Platform Builds
```bash
# Linux AppImage
npx electron-builder --linux AppImage

# Windows (creates portable zip)
npx electron-builder --win zip

# macOS Intel
npx electron-builder --mac zip --x64

# macOS Apple Silicon
npx electron-builder --mac zip --arm64
```

Output files are created in the `dist/` directory.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Shift+T | Toggle real-time transcription |
| Ctrl+Shift+R | Toggle Whisper transcription |
| Ctrl+Shift+M | Mute/unmute microphone |
| Ctrl+Shift+G | Open text improvement window |

## Project Structure

```
app/
  (main)/          # Primary voice chat interface
  (overlay)/       # Overlay windows (transcription, text improvement)
  api/             # API routes (session, scrape, compact, etc.)
components/        # React UI components
hooks/
  use-webrtc.ts    # Core WebRTC connection and audio streaming
  use-wake-word.ts # Picovoice wake word detection
  use-tools.ts     # Tool function implementations
  use-transcription.ts # Whisper transcription hook
lib/
  tools.ts         # Tool definitions for the Realtime API
  conversation-memory.ts # Memory and context persistence
  mcp-client.ts    # MCP integration
main/              # Electron main process
  index.ts         # Main entry, window management, IPC handlers
  preload.ts       # Context bridge for renderer
  tray.ts          # System tray
  mcp-service.ts   # MCP server communication
```

## Configuration

### MCP Servers
Configure MCP servers via environment variables:
```env
MCP_SPOTIFY_DIR=/path/to/spotify-mcp
MCP_SPOTIFY_COMMAND=uv
MCP_SPOTIFY_ENTRY=spotify-mcp
```

### Wake Word
The default wake word is "Hi Celestial". Custom wake words require generating a `.ppn` file via Picovoice Console and placing it in `public/models/`.

## Platform Notes

- **Linux**: Full support including system volume control (requires `wpctl`) and keyboard simulation (requires `xdotool`)
- **macOS**: Requires microphone permissions; code signing needed for distribution
- **Windows**: Full support; some features may require running as administrator

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Desktop**: Electron 34
- **UI**: Tailwind CSS, shadcn/ui, Framer Motion
- **Audio**: WebRTC, Web Audio API
- **Wake Word**: Picovoice Porcupine
- **AI**: OpenAI Realtime API, Anthropic Claude

## License

This project is licensed under the MIT License. See the `LICENSE` file for details.

## Acknowledgements

- [OpenAI](https://openai.com/) for the Realtime API
- [Picovoice](https://picovoice.ai/) for wake word detection
- [skrivov/openai-voice-webrtc-next](https://github.com/skrivov/openai-voice-webrtc-next) for the original WebRTC implementation
- [Next.js](https://nextjs.org/) and [Electron](https://www.electronjs.org/) for the framework
