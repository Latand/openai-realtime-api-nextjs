# Plan: Smart Transcription with Pause Detection

## Problem Statement
Current transcription modes:
1. **Whisper mode** - Records until manual stop, sends entire audio (keep as-is)
2. **Realtime mode** - Uses OpenAI Realtime API (hide, don't delete)

**New feature needed:** Smart transcription that:
- Automatically detects pauses (2-3 seconds of silence)
- Sends chunk to Whisper API during pause
- Shows result and continues listening
- Accumulates all transcriptions in window
- Uses same shortcut/button as current Realtime mode

---

## Architecture Overview

```
State Machine:
IDLE → LISTENING → RECORDING → PROCESSING → LISTENING → ... → IDLE

Audio Pipeline:
Microphone → MediaRecorder → VAD Analysis → Chunk Buffer → Whisper API
```

---

## Senior Developer Tasks

### 1. Design VAD (Voice Activity Detection) Algorithm

**Approach: RMS-based with hysteresis**
```
Constants:
    SPEECH_THRESHOLD = 0.02      // Start recording when RMS exceeds this
    SILENCE_THRESHOLD = 0.008    // Consider silence when RMS drops below
    PAUSE_DURATION = 2500        // ms of silence before sending chunk
    MIN_RECORDING_DURATION = 500 // Ignore very short sounds

Algorithm:
    every 50ms:
        rms = calculateRMS(audioData)

        if state == LISTENING:
            if rms > SPEECH_THRESHOLD:
                state = RECORDING
                startTime = now()

        if state == RECORDING:
            if rms < SILENCE_THRESHOLD:
                if silenceStart == null:
                    silenceStart = now()
                elif now() - silenceStart > PAUSE_DURATION:
                    if now() - startTime > MIN_RECORDING_DURATION:
                        state = PROCESSING
                        sendChunkToWhisper()
                    else:
                        state = LISTENING  // Too short, ignore
            else:
                silenceStart = null  // Reset silence timer
```

### 2. Design State Management

**State interface:**
```
SmartTranscriptionState:
    status: 'idle' | 'listening' | 'recording' | 'processing'
    transcription: string           // Accumulated text
    chunks: TranscriptionChunk[]    // History with timestamps
    currentRMS: number              // For UI visualization
    error: string | null
```

### 3. Design Hook API

```
useSmartTranscription(options):
    Input:
        pauseDuration?: number
        speechThreshold?: number
        silenceThreshold?: number
        deviceId?: string

    Output:
        state: SmartTranscriptionState
        isActive: boolean
        toggle(): void
        clear(): void
```

### 4. Code Review & Performance Optimization
- Review WebAudio memory usage
- Ensure proper cleanup on unmount
- Optimize RMS calculation (avoid GC pressure)

---

## Middle Developer Tasks

### 1. Create Type Definitions

**File: `types/smart-transcription.ts`**
```
Types to define:
    - SmartTranscriptionState (enum)
    - VADConfig (interface)
    - TranscriptionChunk (interface)
    - SmartTranscriptionSession (interface)
    - UseSmartTranscriptionOptions (interface)
    - UseSmartTranscriptionReturn (interface)
```

### 2. Implement VAD Processor

**File: `lib/audio/vad-processor.ts`**

**Class structure:**
```
VADProcessor:
    Properties:
        audioContext: AudioContext
        analyserNode: AnalyserNode
        sourceNode: MediaStreamAudioSourceNode
        config: VADConfig
        state: VADState
        silenceStartTime: number | null
        recordingStartTime: number | null
        dataArray: Uint8Array

    Constructor(config: VADConfig)

    Methods:
        connect(stream: MediaStream): void
        disconnect(): void
        start(): void
        stop(): void
        calculateRMS(): number
        processFrame(): VADEvent | null

    Callbacks:
        onSpeechStart?: () => void
        onSpeechEnd?: () => void
        onStateChange?: (state) => void
```

**RMS Calculation pseudocode:**
```
calculateRMS():
    analyserNode.getByteTimeDomainData(dataArray)
    sum = 0
    for each sample in dataArray:
        normalized = (sample - 128) / 128  // Convert to -1..1 range
        sum += normalized * normalized
    rms = sqrt(sum / dataArray.length)
    return rms
```

### 3. Implement Audio Chunk Manager

**File: `lib/audio/audio-chunk-manager.ts`**

**Class structure:**
```
AudioChunkManager:
    Properties:
        mediaRecorder: MediaRecorder | null
        chunks: Blob[]
        stream: MediaStream | null
        mimeType: string

    Methods:
        startRecording(stream: MediaStream): void
        stopAndGetAudio(): Promise<Blob>
        getAccumulatedAudio(): Promise<Blob>
        clear(): void
        isRecording(): boolean
```

**Key considerations:**
- Use `timeslice` parameter in MediaRecorder for continuous chunks
- Determine best mimeType: `audio/webm;codecs=opus` preferred
- Handle browser differences gracefully

### 4. Implement Main Hook

**File: `hooks/use-smart-transcription.ts`**

**Hook structure:**
```
useSmartTranscription(options):
    // State
    state = useState(initial)
    vadProcessor = useRef(null)
    chunkManager = useRef(null)
    transcription = useState('')
    isActive = useState(false)

    // Initialize on mount
    useEffect:
        vadProcessor.current = new VADProcessor(config)
        chunkManager.current = new AudioChunkManager()
        return cleanup

    // Toggle function
    toggle = useCallback:
        if isActive:
            stop()
        else:
            start()

    // Start function
    start = async:
        stream = await navigator.mediaDevices.getUserMedia({audio: deviceId})
        vadProcessor.connect(stream)
        chunkManager.startRecording(stream)
        vadProcessor.start()

        vadProcessor.onSpeechEnd = async:
            audio = await chunkManager.getAccumulatedAudio()
            result = await sendToWhisper(audio)
            transcription += result.text + '\n'
            chunkManager.clear()

    // Stop function
    stop = async:
        vadProcessor.stop()
        // Send remaining audio
        audio = await chunkManager.stopAndGetAudio()
        if audio.size > minSize:
            result = await sendToWhisper(audio)
            transcription += result.text
        cleanup()

    return { state, isActive, toggle, clear, transcription }
```

### 5. Integrate with Transcription Window

**Modify: `app/(overlay)/transcription/page.tsx`**

**Changes:**
- Import and use `useSmartTranscription` hook
- Display accumulated transcription text
- Show state indicator (listening/recording/processing)
- Add clear button
- Add copy-all button
- Show RMS meter (optional visual feedback)

---

## Junior Developer Tasks

### 1. Create Audio Utilities

**File: `lib/audio/audio-utils.ts`**

**Functions to implement:**
```
getBestMimeType():
    // Check MediaRecorder.isTypeSupported()
    // Return first supported: webm/opus, webm, mp4, etc.

blobToFile(blob, filename):
    // Convert Blob to File for FormData

formatDuration(ms):
    // Format milliseconds to "MM:SS" string
```

### 2. Update IPC for Smart Transcription

**Modify: `main/preload.ts`**

**Add to contextBridge:**
```
smartTranscription: {
    onToggle: (callback) => ipcRenderer.on('smart-transcription:toggle', callback)
    reportState: (state) => ipcRenderer.send('smart-transcription:state', state)
}
```

**Modify: `types/electron-window.d.ts`**

**Add types for new IPC methods**

### 3. Update Main Process Shortcut

**Modify: `main/index.ts`**

**In globalShortcut registration:**
```
Current: Ctrl+Shift+R triggers realtime transcription
Change: Ctrl+Shift+R triggers smart transcription
Keep: Old realtime code but don't expose it
```

### 4. Create UI Components

**State indicator component:**
```
SmartTranscriptionStatus:
    Props: state, currentRMS

    Render:
        if state == 'listening': Pulsing mic icon, "Listening..."
        if state == 'recording': Red dot, waveform, "Recording..."
        if state == 'processing': Spinner, "Transcribing..."
```

### 5. Testing

**Test cases:**
- [ ] Start/stop toggle works
- [ ] Voice detection triggers recording
- [ ] Silence detection triggers API call
- [ ] Multiple chunks accumulate correctly
- [ ] Clear button works
- [ ] Copy button works
- [ ] Window can be closed mid-recording (cleanup)
- [ ] Different microphones work (deviceId)

---

## Files to Create

| File | Purpose |
|------|---------|
| `types/smart-transcription.ts` | Type definitions |
| `lib/audio/vad-processor.ts` | Voice Activity Detection |
| `lib/audio/audio-chunk-manager.ts` | Audio buffer management |
| `lib/audio/audio-utils.ts` | Helper functions |
| `hooks/use-smart-transcription.ts` | Main React hook |

## Files to Modify

| File | Changes |
|------|---------|
| `main/index.ts` | Change Ctrl+Shift+R behavior |
| `main/preload.ts` | Add IPC for smart transcription |
| `types/electron-window.d.ts` | Add IPC types |
| `app/(overlay)/transcription/page.tsx` | Integrate new hook, update UI |

---

## Migration Strategy

1. Keep existing `use-realtime-transcription.ts` - don't delete
2. Create new `use-smart-transcription.ts` alongside
3. Change shortcut to use new implementation
4. Old realtime code remains for future reference or alternative mode

---

## Estimated Effort

| Role | Time |
|------|------|
| Senior | 2-3 hours (architecture, VAD algorithm, review) |
| Middle | 6-8 hours (core implementation) |
| Junior | 3-4 hours (utilities, UI, testing) |
| **Total** | **~12-15 hours** |
