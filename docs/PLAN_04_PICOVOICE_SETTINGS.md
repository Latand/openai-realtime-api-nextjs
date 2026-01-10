# Plan: Add Picovoice Access Key to Settings

## Problem Statement
Currently, Picovoice access key is only read from `.env.local` file:
```
NEXT_PUBLIC_PICOVOICE_ACCESS_KEY=xxx
```

This doesn't work in production builds because:
1. `.env.local` is not included in the build
2. `NEXT_PUBLIC_*` vars are embedded at build time
3. Users cannot change the key without rebuilding

**Solution:** Add Picovoice key to the Settings page, stored alongside OpenAI/Anthropic keys.

---

## Current Key Storage Architecture

**OpenAI & Anthropic keys:**
```
Storage: ~/.config/webrtc-voice-next/app-settings.json
{
    "openaiApiKey": "sk-...",
    "anthropicApiKey": "sk-ant-..."
}

Load: main/index.ts → loadApiKeysFromSettings()
Save: IPC handler "settings:saveApiKey"
UI: app/(main)/settings/page.tsx
```

**Picovoice key (current):**
```
Storage: .env.local (build time only)
Load: process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY
Usage: app/(main)/page.tsx → useWakeWordConfig()
```

---

## Senior Developer Tasks

### 1. Design Key Flow

**New flow:**
```
User enters key in Settings
    ↓
Saved to app-settings.json via IPC
    ↓
Main process sets process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY
    ↓
Renderer receives key via IPC when needed
    ↓
useWakeWordConfig uses key from state (not env)
```

### 2. Security Consideration

**Question:** Should Picovoice key be exposed to renderer?

**Answer:** Yes, it must be - Porcupine runs in the browser (WebAssembly).
The key is already exposed via `NEXT_PUBLIC_*` pattern.

### 3. Review Implementation
- Ensure key is loaded before wake word initialization
- Handle case where key is changed while app is running (re-init Porcupine)

---

## Middle Developer Tasks

### 1. Update Settings Storage

**Modify: `main/index.ts`**

**Update `loadApiKeysFromSettings()` to also load Picovoice key:**
```
function loadApiKeysFromSettings():
    settings = read app-settings.json
    if settings.openaiApiKey:
        process.env.OPENAI_API_KEY = settings.openaiApiKey
    if settings.anthropicApiKey:
        process.env.ANTHROPIC_API_KEY = settings.anthropicApiKey
    if settings.picovoiceAccessKey:
        process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY = settings.picovoiceAccessKey
```

**Update IPC handler `settings:saveApiKey`:**
```
Current signature: (apiKey: string, anthropicKey?: string)
New signature: (apiKey: string, anthropicKey?: string, picovoiceKey?: string)

Add to handler:
    if picovoiceKey !== undefined:
        settings.picovoiceAccessKey = picovoiceKey
        process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY = picovoiceKey
```

**Update IPC handler `settings:getApiKey`:**
```
Current return: { apiKey, anthropicKey }
New return: { apiKey, anthropicKey, picovoiceKey }

Add to handler:
    keys.picovoiceKey = settings.picovoiceAccessKey ||
                        process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY || ""
```

### 2. Add IPC to Get Picovoice Key in Renderer

**New IPC handler: `settings:getPicovoiceKey`**
```
Purpose: Renderer needs the key for Porcupine initialization
Return: { success: boolean, key: string }
```

**Modify: `main/preload.ts`**

**Add to contextBridge:**
```
settings: {
    ...existing,
    getPicovoiceKey: () => ipcRenderer.invoke('settings:getPicovoiceKey'),
}
```

### 3. Update Settings Page UI

**Modify: `app/(main)/settings/page.tsx`**

**Add state:**
```
picovoiceKey, setPicovoiceKey = useState('')
```

**Add to loadSettings:**
```
if window.electron?.settings?.getApiKey:
    result = await window.electron.settings.getApiKey()
    setPicovoiceKey(result.picovoiceKey || '')
```

**Add to handleSave:**
```
await window.electron.settings.saveApiKey(apiKey, anthropicKey, picovoiceKey)
```

**Add UI section (after Anthropic key):**
```
Section: "Wake Word Configuration"
Icon: Mic or Waveform
Fields:
    - Picovoice Access Key (password input with show/hide)
    - Helper text: "Get your free key at console.picovoice.ai"
    - Link to Picovoice Console
```

### 4. Update Wake Word Hook to Use Dynamic Key

**Modify: `app/(main)/page.tsx` - `useWakeWordConfig`**

**Current:**
```
accessKey: process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY || ""
```

**New:**
```
// Add state at component level
picovoiceKey, setPicovoiceKey = useState('')

// Load on mount
useEffect:
    if window.electron?.settings?.getPicovoiceKey:
        result = await window.electron.settings.getPicovoiceKey()
        setPicovoiceKey(result.key)

// Use in config
accessKey: picovoiceKey || process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY || ""
```

---

## Junior Developer Tasks

### 1. Update Type Definitions

**Modify: `types/electron-window.d.ts`**

**Update settings interface:**
```
settings: {
    saveApiKey: (
        apiKey: string,
        anthropicKey?: string,
        picovoiceKey?: string      // <-- ADD
    ) => Promise<{ success: boolean; error?: string }>

    getApiKey: () => Promise<{
        success: boolean
        apiKey?: string
        anthropicKey?: string
        picovoiceKey?: string      // <-- ADD
        error?: string
    }>

    getPicovoiceKey: () => Promise<{  // <-- ADD NEW METHOD
        success: boolean
        key?: string
        error?: string
    }>
}
```

### 2. Add Validation

**In Settings page:**
```
Validate Picovoice key format:
    - Should be base64-like string
    - Typically ends with "=="
    - Length check (roughly 40-60 characters)

Show warning if invalid format (but still allow save)
```

### 3. Add UI Feedback

**When Picovoice key is saved:**
- Show toast notification
- Indicate that wake word will reinitialize

**When wake word fails with new key:**
- Show clear error message
- Suggest checking key validity

### 4. Testing

**Test cases:**
- [ ] Save Picovoice key in settings
- [ ] Key persists after app restart
- [ ] Wake word works with valid key
- [ ] Clear error when key is invalid
- [ ] Key field is masked (password type)
- [ ] Show/hide toggle works
- [ ] Link to Picovoice console works

### 5. Update Settings Page Layout

**Current sections:**
1. API Configuration (OpenAI, Anthropic)
2. System Instructions
3. Voice & Audio
4. Application

**New layout:**
1. API Configuration (OpenAI, Anthropic)
2. **Wake Word Configuration** (NEW - Picovoice key)
3. System Instructions
4. Voice & Audio
5. Application

---

## Files to Modify

| File | Changes |
|------|---------|
| `main/index.ts` | Update loadApiKeysFromSettings, IPC handlers |
| `main/preload.ts` | Add getPicovoiceKey to contextBridge |
| `types/electron-window.d.ts` | Add picovoiceKey types |
| `app/(main)/settings/page.tsx` | Add Picovoice key input section |
| `app/(main)/page.tsx` | Load Picovoice key dynamically |

---

## Migration for Existing Users

**Scenario:** User has key in `.env.local` but not in settings

**Solution:**
1. On app start, check if settings has picovoiceKey
2. If not, fall back to process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY
3. User can optionally save to settings for persistence

**This is already handled by:**
```
accessKey: picovoiceKey || process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY || ""
```

---

## Estimated Effort

| Role | Time |
|------|------|
| Senior | 30 min (review) |
| Middle | 2-3 hours (implementation) |
| Junior | 1-2 hours (UI, testing) |
| **Total** | **~4-5 hours** |
