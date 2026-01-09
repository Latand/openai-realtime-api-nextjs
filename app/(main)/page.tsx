"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useWakeWord } from "@/hooks/use-wake-word";
import useWebRTCAudioSession, { Tool } from "@/hooks/use-webrtc";
import useRealtimeTranscription from "@/hooks/use-realtime-transcription";
import useTranscription from "@/hooks/use-transcription";
import { useMCPFunctions, useToolsFunctions } from "@/hooks/use-tools";
import { TranslationsProvider } from "@/components/translations-context";
import { BroadcastButton } from "@/components/broadcast-button";
import { StatusDisplay } from "@/components/status";
import { MicrophoneSelector } from "@/components/microphone-select";
import { VoiceSelector } from "@/components/voice-select";
import { TranscriptWindow } from "@/components/transcript-window";
import { SummariesWindow } from "@/components/summaries-window";
import { AudioVisualizer } from "@/components/audio-visualizer";
import { SessionTimer } from "@/components/session-timer";
import { ShortcutsHint } from "@/components/shortcuts-hint";
import { ChatInput } from "@/components/chat-input";
import { tools } from "@/lib/tools";
import { playSound } from "@/lib/tools";
import { Conversation } from "@/lib/conversations";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Settings, Mic, MessageSquare } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import { CostMonitorModal } from "@/components/cost-monitor-modal";
import {
  loadCompactsFromFile,
  formatCompactsForPrompt,
  compactAndSaveConversation,
  deleteCompact,
  clearCompacts,
  ConversationCompact,
  loadPersistentNotes,
  formatPersistentNotesForPrompt,
  addPersistentNote,
  deletePersistentNote,
  updatePersistentNote,
  clearPersistentNotes,
  loadSystemPrompt,
  saveSystemPrompt,
  resetSystemPrompt,
  getDefaultSystemPrompt,
} from "@/lib/conversation-memory";
// Constants
const REINIT_DELAY = 1000;
const INIT_SOUND_DELAY = 500;

// Types
type WakeWordConfig = {
  enabled: boolean;
  sessionActive: boolean;
  onWakeWord: () => void;
  porcupineModel: {
    publicPath: string;
    customWritePath: string;
    forceWrite: boolean;
  };
  keywords: Array<{
    label: string;
    publicPath: string;
    sensitivity: number;
    customWritePath: string;
    forceWrite: boolean;
  }>;
  accessKey: string;
  deviceId?: string;
};

type ToolHandler = (...args: unknown[]) => unknown;

const debug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === "development") {
    console.log("[AppContent Debug]", ...args);
  }
};

export default function Page() {
  return (
    <TranslationsProvider>
      <AppContent />
    </TranslationsProvider>
  );
}

function useToolRegistration(
  registerFunction: (name: string, func: ToolHandler) => void,
  toolsFunctions: Record<string, ToolHandler>,
  mcpTools: Record<string, ToolHandler>,
  stopSessionHandler: () => void,
  disableWakeWord: () => void
) {
  useEffect(() => {
    // First, create a mapping of internal function names to API function names
    const functionNames: Record<string, string> = {
      timeFunction: "getCurrentTime",
      launchWebsite: "launchWebsite",
      copyToClipboard: "copyToClipboard",
      scrapeWebsite: "scrapeWebsite",
      pasteText: "pasteText",
      adjustSystemVolume: "adjustSystemVolume",
      stopSession: "stopSession",
      launchApp: "launchApp",
      openTerminal: "openTerminal",
      openFiles: "openFiles",
      readClipboard: "readClipboard",
      askClaude: "askClaude",
      getClaudeOutput: "getClaudeOutput",
      saveConversationSummary: "saveConversationSummary",
    };

    // Register regular tools
    Object.entries(toolsFunctions).forEach(([name, func]) => {
      const apiName = functionNames[name];
      if (apiName) {
        debug("Registering tool function:", apiName, "for key:", name);

        if (name === "stopSession") {
          registerFunction(apiName, async (...args: unknown[]) => {
            const result = await (
              func as (...args: unknown[]) => Promise<{ success: boolean }>
            )(...args);
            if (result.success) {
              console.log("🛑 LLM stopping voice session - disabling wake word");
              disableWakeWord();
              stopSessionHandler();
              return result;
            }
            return result;
          });
        } else {
          registerFunction(apiName, func);
        }
      }
    });

    // Register MCP tools
    if (mcpTools && Object.keys(mcpTools).length > 0) {
      debug("Registering MCP tools:", Object.keys(mcpTools));
      Object.entries(mcpTools).forEach(([name, func]) => {
        debug("Registering MCP function:", name);
        registerFunction(name, func);
      });
    }
  }, [registerFunction, toolsFunctions, stopSessionHandler, mcpTools, disableWakeWord]);
}

function useWakeWordConfig(
  handleWakeWord: () => void,
  sessionActive: boolean,
  enabled: boolean,
  deviceId?: string
): WakeWordConfig {
  const porcupineModel = useMemo(
    () => ({
      publicPath: "/models/porcupine_params.pv",
      customWritePath: "porcupine_model.pv",
      forceWrite: true,
    }),
    []
  );
  const keywords = useMemo(
    () => [
      {
        label: "Hi Celestial",
        publicPath: "/models/Hi-Celestial.ppn",
        sensitivity: 0.6,
        customWritePath: "Hi-Celestial.ppn",
        forceWrite: true,
      },
    ],
    []
  );

  return useMemo(
    () => ({
      enabled,
      sessionActive,
      onWakeWord: handleWakeWord,
      porcupineModel,
      keywords,
      accessKey: process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY || "",
      deviceId,
    }),
    [enabled, handleWakeWord, sessionActive, porcupineModel, keywords, deviceId]
  );
}

function useSoundEffects(isSessionActive: boolean, justReinitialized: boolean) {
  useEffect(() => {
    const timer = setTimeout(() => {
      playSound("/sounds/application-start.mp3");
    }, INIT_SOUND_DELAY);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isSessionActive && justReinitialized) {
      playSound("/sounds/session-end.mp3");
    }
    if (isSessionActive) {
      playSound("/sounds/session-start.mp3");
    }
  }, [isSessionActive, justReinitialized]);
}

function AppContent() {
  // State management
  const [voice, setVoice] = useState("coral");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>("");
  const [microphoneLoaded, setMicrophoneLoaded] = useState(false);
  const [manualStop, setManualStop] = useState(false);
  const [autoWakeWordEnabled, setAutoWakeWordEnabled] = useState(true);
  const [justReinitialized, setJustReinitialized] = useState(false);
  const [mcpDefinitions, setMcpDefinitions] = useState<Tool[]>([]);
  const [previousConversations, setPreviousConversations] = useState<string>("");
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [isSummariesOpen, setIsSummariesOpen] = useState(false);
  const [compacts, setCompacts] = useState<ConversationCompact[]>([]);
  const [persistentNotes, setPersistentNotes] = useState<string[]>([]);
  const [systemPrompt, setSystemPrompt] = useState<string>(getDefaultSystemPrompt());
  const [transcriptionEntries, setTranscriptionEntries] = useState<Conversation[]>([]);
  const [isTextImprovementOpen, setIsTextImprovementOpen] = useState(false);
  const wakeWordEnabled = autoWakeWordEnabled;

  // Real-time transcription mode hook (Ctrl+Shift+T)
  const {
    isActive: isTranscribing,
    isConnecting: isTranscribingConnecting,
    transcription: realtimeTranscription,
    interimTranscription,
    error: transcriptionError,
    currentVolume: transcriptionVolume, // Get volume
    start: startTranscription,
    stop: stopTranscription,
    stopAndGetText: stopTranscriptionAndGetText,
    clear: clearTranscription,
  } = useRealtimeTranscription(selectedMicrophoneId);

  // Whisper transcription mode hook (Ctrl+Shift+R) - better quality, record then transcribe
  const {
    isRecording: isWhisperRecording,
    isProcessing: isWhisperProcessing,
    error: whisperError,
    startRecording: startWhisperRecording,
    stopRecording: stopWhisperRecording,
  } = useTranscription(selectedMicrophoneId);

  // Track which transcription mode is active
  const [whisperText, setWhisperText] = useState("");
  const whisperStartTimeRef = useRef<number>(0);

  // Load previous conversation compacts on mount
  const loadMemory = useCallback(async () => {
    // Load compacts
    const loadedCompacts = await loadCompactsFromFile();
    debug("[Memory] Got compacts:", loadedCompacts.length);
    setCompacts(loadedCompacts);

    // Load persistent notes
    const loadedNotes = await loadPersistentNotes();
    debug("[Memory] Got persistent notes:", loadedNotes.length);
    setPersistentNotes(loadedNotes);

    // Load system prompt
    const loadedPrompt = await loadSystemPrompt();
    if (loadedPrompt) {
      debug("[Memory] Got custom system prompt, length:", loadedPrompt.length);
      setSystemPrompt(loadedPrompt);
    } else {
      setSystemPrompt(getDefaultSystemPrompt());
    }

    // Combine compacts and notes for context
    let contextMemory = "";
    if (loadedCompacts.length > 0) {
      contextMemory += formatCompactsForPrompt(loadedCompacts);
    }
    if (loadedNotes.length > 0) {
      contextMemory += formatPersistentNotesForPrompt(loadedNotes);
    }

    if (contextMemory) {
      debug("[Memory] Formatted for prompt:", contextMemory.slice(0, 200));
      setPreviousConversations(contextMemory);
    } else {
      setPreviousConversations("");
    }
  }, []);

  useEffect(() => {
    loadMemory();
  }, [loadMemory]);

  debug("AppContent initialized with voice:", voice);

  const toolsFunctions = useToolsFunctions();
  const {
    wrappedFunctions: mcpFunctions,
    toolDefinitions: mcpToolDefinitions,
  } = useMCPFunctions();

  // Store pending Claude requests: requestId -> callId
  const pendingClaudeRequests = useRef<Map<string, string>>(new Map());

  // Initialize WebRTC session with all tools
  const {
    status,
    isSessionActive,
    startSession,
    stopSession,
    registerFunction,
    sendTextMessage,
    sendFunctionOutput,
    conversation,
    clearConversation,
    isMuted,
    toggleMute,
    currentVolume,
  } = useWebRTCAudioSession(voice, tools, mcpDefinitions, previousConversations, selectedMicrophoneId, systemPrompt);

  const prevSessionActiveRef = useRef(isSessionActive);
  const stopWakeWordRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const isSessionActiveRef = useRef(isSessionActive);
  const sessionStoppedByLLMRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  // Update MCP definitions when they're available
  useEffect(() => {
    if (Object.keys(mcpFunctions).length > 0) {
      debug("MCP tools registered:", Object.keys(mcpFunctions));
      setMcpDefinitions(mcpToolDefinitions as Tool[]);
    }
  }, [mcpFunctions, mcpToolDefinitions]);

  // Store functions in refs to avoid recreating listeners
  const sendTextMessageRef = useRef(sendTextMessage);
  const startSessionRef = useRef(startSession);
  useEffect(() => {
    sendTextMessageRef.current = sendTextMessage;
    startSessionRef.current = startSession;
  }, [sendTextMessage, startSession]);

  // Listen for Claude CLI responses - only set up once
  useEffect(() => {
    if (!window.electron?.onClaudeResponse) return;

    const unsubscribeResponse = window.electron.onClaudeResponse((data) => {
      debug("Claude response received:", data.requestId);
      playSound("/sounds/claude-response.mp3");

      // Format the response for the AI to speak naturally
      const prompt = `[SYSTEM: Claude CLI has finished processing and returned the following response. Please summarize this information concisely and speak it to the user in a natural, conversational way. Here is Claude's response:]\n\n${data.response}`;

      // If session is active, inject the response
      if (isSessionActiveRef.current) {
        sendTextMessageRef.current(prompt);
      } else if (!sessionStoppedByLLMRef.current) {
        // Only auto-start if session wasn't intentionally stopped by LLM
        startSessionRef.current();
        setTimeout(() => {
          sendTextMessageRef.current(prompt);
        }, 2500);
      } else {
        debug("Claude response received but session was stopped by LLM - not auto-starting");
      }
    });

    const unsubscribeError = window.electron.onClaudeError?.((data) => {
      debug("Claude error:", data.error);
      playSound("/sounds/session-end.mp3");
      if (isSessionActiveRef.current) {
        sendTextMessageRef.current(`[SYSTEM: Claude CLI encountered an error: ${data.error}. Please inform the user about this error.]`);
      }
    });

    return () => {
      unsubscribeResponse?.();
      unsubscribeError?.();
    };
  }, []); // Empty deps - only set up once

  // Send transcription updates to the separate window
  useEffect(() => {
    if (isTranscribing || isTranscribingConnecting) {
      window.electron?.transcription?.updateText?.(realtimeTranscription, interimTranscription);
    }
  }, [realtimeTranscription, interimTranscription, isTranscribing, isTranscribingConnecting]);

  // Update transcription window for Whisper mode recording status
  // Note: Processing state is handled directly in handleWhisperToggle for better timing
  useEffect(() => {
    if (isWhisperRecording) {
      window.electron?.transcription?.updateText?.("", "Recording... (Whisper mode - press Ctrl+Shift+R to stop)");
    }
  }, [isWhisperRecording]);

  // Listen for transcription window closed event
  useEffect(() => {
    const unsubscribe = window.electron?.transcription?.onWindowClosed?.(() => {
      console.log("[Transcription] Window closed externally");
      if (isTranscribing) {
        stopTranscription();
      }
      // Note: Can't easily stop Whisper recording here since stopWhisperRecording returns a promise
      // The window close will just close the UI, recording will stop on next toggle
    });
    return () => unsubscribe?.();
  }, [isTranscribing, stopTranscription]);

  // Listen for transcription stop event from IPC
  useEffect(() => {
    const unsubscribe = window.electron?.transcription?.onStop?.(() => {
      console.log("[Transcription] Stop command received from IPC");
      if (isTranscribing) {
        stopTranscription();
      }
      if (isWhisperRecording) {
        // We can't await the result here easily, but we can stop recording
        stopWhisperRecording().then(result => {
           if (result?.text) {
             window.electron?.transcription?.updateText?.(result.text, "");
           }
        });
      }
    });
    return () => unsubscribe?.();
  }, [isTranscribing, stopTranscription, isWhisperRecording, stopWhisperRecording]);

  // Listen for text improvement window closed
  useEffect(() => {
    const unsubscribe = window.electron?.textImprovement?.onWindowClosed?.(() => {
      console.log("[TextImprovement] Window closed");
      setIsTextImprovementOpen(false);
    });
    return () => unsubscribe?.();
  }, []);

  // Handle Whisper transcription toggle (Ctrl+Shift+R) - better quality
  const handleWhisperToggle = useCallback(async () => {
    // Don't allow during active voice session or other transcription
    if (isSessionActive) {
      toast.error("Stop voice session first to use transcription mode");
      return;
    }
    if (isTranscribing || isTranscribingConnecting) {
      toast.error("Stop real-time transcription first");
      return;
    }

    if (isWhisperRecording) {
      // Calculate recording duration before stopping
      const recordingDuration = (Date.now() - whisperStartTimeRef.current) / 1000;

      // Send processing state BEFORE awaiting the result
      console.log("[Whisper] Sending processing state, duration:", recordingDuration);
      await window.electron?.transcription?.updateText?.("", "");
      // With new state sync, we don't need updateProcessingState explicitly if hooks handle it
      // But updateProcessingState handles the duration logic in the main process which then sends to window
      // Actually we are syncing state from hooks now.
      
      // Stop recording and transcribe (this awaits the API call)
      const result = await stopWhisperRecording();

      if (result?.text) {
        // Copy to clipboard
        try {
          if (window.electron?.clipboard) {
            await window.electron.clipboard.write(result.text);
          } else {
            await navigator.clipboard.writeText(result.text);
          }
          toast.success("Transcription copied to clipboard");
        } catch (err) {
          console.error("Failed to copy transcription:", err);
        }

        // Show the transcription result in the window
        await window.electron?.transcription?.updateText?.(result.text, "");
      } else {
        // No result - show error status
        await window.electron?.transcription?.updateText?.("", "Transcription failed");
        toast.error("Transcription failed");
      }
      // Don't close the window - keep it open for history
    } else {
      // Open window if not already open, then start recording
      const windowResult = await window.electron?.transcription?.openWindow?.();
      if (windowResult?.success || windowResult?.alreadyOpen) {
        // Track recording start time for progress bar
        whisperStartTimeRef.current = Date.now();
        // Update window to show "Recording..." status
        await window.electron?.transcription?.updateText?.("", "Recording... (Whisper mode - press Ctrl+Shift+R to stop)");
        await startWhisperRecording();
      } else {
        toast.error("Failed to open transcription window");
      }
    }
  }, [isSessionActive, isTranscribing, isTranscribingConnecting, isWhisperRecording, startWhisperRecording, stopWhisperRecording]);

  // Handle real-time transcription toggle (Ctrl+Shift+T)
  const handleTranscriptionToggle = useCallback(async () => {
    // Don't allow transcription during active voice session
    if (isSessionActive) {
      toast.error("Stop voice session first to use transcription mode");
      return;
    }
    if (isWhisperRecording || isWhisperProcessing) {
      toast.error("Stop Whisper recording first");
      return;
    }

    if (isTranscribing || isTranscribingConnecting) {
      // Stop and wait for final transcription (waits up to 5 seconds for pending audio)
      const finalText = await stopTranscriptionAndGetText();

      // Copy the final text to clipboard
      if (finalText) {
        try {
          if (window.electron?.clipboard) {
            await window.electron.clipboard.write(finalText);
          } else {
            await navigator.clipboard.writeText(finalText);
          }
          toast.success("Transcription copied to clipboard");
        } catch (err) {
          console.error("Failed to copy transcription:", err);
        }
      }
      // Don't close the window automatically so user can review/improve
      // await window.electron?.transcription?.closeWindow?.();
    } else {
      // Clear previous transcription before starting new session
      clearTranscription();
      // Open window first, then start transcription
      const result = await window.electron?.transcription?.openWindow?.();
      if (result?.success) {
        await startTranscription();
      } else {
        toast.error("Failed to open transcription window");
      }
    }
  }, [isSessionActive, isTranscribing, isTranscribingConnecting, isWhisperRecording, isWhisperProcessing, startTranscription, stopTranscriptionAndGetText, clearTranscription]);

  // Handle text improvement toggle (Ctrl+Shift+G)
  const handleTextImprovementToggle = useCallback(async () => {
    // Warn if voice session is active
    if (isSessionActive) {
      toast.warning("Voice session is active. Text improvement window will open.");
    }

    try {
      let initialText: string | undefined;

      // If whisper transcription is active, stop it and use its text
      if (isWhisperRecording) {
        console.log("[TextImprovement] Stopping whisper transcription to capture text");

        // Close the transcription window first
        await window.electron?.transcription?.closeWindow?.();

        // Stop recording and get the transcribed text
        const transcriptionResult = await stopWhisperRecording();

        if (transcriptionResult?.text) {
          initialText = transcriptionResult.text;
          // Also write to clipboard as backup
          if (window.electron?.clipboard) {
            await window.electron.clipboard.write(transcriptionResult.text);
          }
          toast.success("Transcription captured for improvement");
        }
      }

      // Open a new text improvement window (always creates new instance)
      // Pass initialText directly if we have it from transcription
      console.log("[TextImprovement] Opening window with text:", initialText?.substring(0, 50));
      const result = await window.electron?.textImprovement?.openWindow?.(initialText);
      console.log("[TextImprovement] Window open result:", result);
      if (result?.success) {
        setIsTextImprovementOpen(true);
      } else {
        console.error("[TextImprovement] Failed to open window:", result);
        toast.error("Failed to open text improvement window");
      }
    } catch (err) {
      console.error("Failed to open text improvement window:", err);
      toast.error("Failed to open text improvement window");
    }
  }, [isSessionActive, isWhisperRecording, stopWhisperRecording]);

  // Global shortcut listeners
  useEffect(() => {
    // Electron global shortcuts (work even when window is not focused)
    const unsubscribeTranscription = window.electron?.onToggleTranscription?.(() => {
      console.log("[GlobalShortcut] Ctrl+Shift+T received - real-time transcription");
      handleTranscriptionToggle();
    });

    const unsubscribeWhisper = window.electron?.onToggleWhisper?.(() => {
      console.log("[GlobalShortcut] Ctrl+Shift+R received - Whisper transcription");
      handleWhisperToggle();
    });

    const unsubscribeMute = window.electron?.onToggleMute?.(() => {
      console.log("[GlobalShortcut] Ctrl+Shift+M received - toggle mute");
      if (isSessionActive) {
        toggleMute();
        toast.info(isMuted ? "Microphone unmuted" : "Microphone muted");
      }
    });

    const unsubscribeTextImprovement = window.electron?.onToggleTextImprovement?.(() => {
      console.log("[GlobalShortcut] Ctrl+Shift+G received - text improvement");
      handleTextImprovementToggle();
    });

    // Fallback: web keyboard listener for non-Electron environments
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        handleTranscriptionToggle();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleWhisperToggle();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        if (isSessionActive) {
          toggleMute();
          toast.info(isMuted ? "Microphone unmuted" : "Microphone muted");
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        handleTextImprovementToggle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      unsubscribeTranscription?.();
      unsubscribeWhisper?.();
      unsubscribeMute?.();
      unsubscribeTextImprovement?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleTranscriptionToggle, handleWhisperToggle, isSessionActive, toggleMute, isMuted, handleTextImprovementToggle]);

  const justReinitTimeoutRef = useRef<number | null>(null);

  // Handle wake word detection
  const handleWakeWord = useCallback(() => {
    debug("handleWakeWord triggered.");
    if (isSessionActive) return;
    if (isTranscribing || isTranscribingConnecting) {
      debug("Ignoring wake word - transcription mode is active.");
      return;
    }
    if (justReinitialized) {
      debug("Ignoring wake word trigger immediately after reinitialization.");
      return;
    }

    sessionStoppedByLLMRef.current = false; // Clear LLM stop flag on wake word start
    playSound("/sounds/on-wakeword.mp3");
    startSession();

    debug("Wake word detected.");
    if (manualStop) {
      setManualStop(false);
      setAutoWakeWordEnabled(true);
    }

    stopWakeWordRef
      .current()
      .catch((err) => console.error("Error stopping wake word:", err));
  }, [isSessionActive, isTranscribing, isTranscribingConnecting, justReinitialized, manualStop, startSession]);

  const wakeWordConfig = useWakeWordConfig(
    handleWakeWord,
    isSessionActive,
    wakeWordEnabled,
    selectedMicrophoneId
  );

  const {
    startPorcupine: startWakeWord,
    stopPorcupine: stopWakeWord,
    isReady: wakeReady,
    isListening: wakeListening,
    error: wakeError,
    reinitializeEngine,
    detected,
  } = useWakeWord(wakeWordConfig);

  useEffect(() => {
    return () => {
      if (justReinitTimeoutRef.current) {
        window.clearTimeout(justReinitTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    stopWakeWordRef.current = stopWakeWord;
  }, [stopWakeWord]);

  // Manage wake word timing flags on session transitions
  useEffect(() => {
    if (!wakeWordEnabled) {
      return;
    }
    debug("Session transition detected.", {
      prev: prevSessionActiveRef.current,
      current: isSessionActive,
    });

    if (prevSessionActiveRef.current && !isSessionActive) {
      debug("Session stopped.");

      if (autoWakeWordEnabled && !manualStop) {
        debug("Resetting wake word cooldown after natural session end.");
        setJustReinitialized(true);
        if (justReinitTimeoutRef.current) {
          window.clearTimeout(justReinitTimeoutRef.current);
        }
        justReinitTimeoutRef.current = window.setTimeout(() => {
          setJustReinitialized(false);
        }, REINIT_DELAY);
      } else {
        debug(
          "Session stopped manually; not reinitializing wake word automatically."
        );
        setJustReinitialized(true);
        if (justReinitTimeoutRef.current) {
          window.clearTimeout(justReinitTimeoutRef.current);
        }
        justReinitTimeoutRef.current = window.setTimeout(() => {
          setJustReinitialized(false);
        }, REINIT_DELAY);
      }
    }
    prevSessionActiveRef.current = isSessionActive;
  }, [isSessionActive, autoWakeWordEnabled, manualStop, wakeWordEnabled]);

  // Handle button click
  const handleStopSession = useCallback(() => {
    if (!isSessionActive) return;

    stopSession();
    setManualStop(true);
    setAutoWakeWordEnabled(false);
    setJustReinitialized(true);
    if (justReinitTimeoutRef.current) {
      window.clearTimeout(justReinitTimeoutRef.current);
    }
    justReinitTimeoutRef.current = window.setTimeout(() => {
      setJustReinitialized(false);
    }, REINIT_DELAY);
  }, [isSessionActive, stopSession]);

  const handleStartSession = useCallback(() => {
    if (isSessionActive) return;
    if (isTranscribing || isTranscribingConnecting) {
      toast.error("Stop transcription first to start voice session");
      return;
    }
    sessionStoppedByLLMRef.current = false; // Clear LLM stop flag on manual start
    setManualStop(false);
    setAutoWakeWordEnabled(true);
    setJustReinitialized(false);
    playSound("/sounds/on-wakeword.mp3");
    startSession();
  }, [isSessionActive, isTranscribing, isTranscribingConnecting, startSession]);

  const onButtonClick = useCallback(() => {
    debug("Button clicked with detected:", detected);

    if (isSessionActive) {
      handleStopSession();
      debug("Button clicked with session active.");
    } else {
      handleStartSession();
      debug("Button clicked with session INACTIVE.");
    }
  }, [
    isSessionActive,
    detected,
    handleStopSession,
    handleStartSession,
  ]);
  // Callback for when LLM stops session - add cooldown but keep wake word enabled
  const onLLMStopSession = useCallback(() => {
    // Mark that LLM intentionally stopped - prevents auto-restart
    sessionStoppedByLLMRef.current = true;
    // Add cooldown to prevent immediate wake word trigger, but don't permanently disable
    setJustReinitialized(true);
    if (justReinitTimeoutRef.current) {
      window.clearTimeout(justReinitTimeoutRef.current);
    }
    justReinitTimeoutRef.current = window.setTimeout(() => {
      setJustReinitialized(false);
    }, REINIT_DELAY);
    // Keep autoWakeWordEnabled = true so wake word resumes after cooldown
  }, []);

  // Register tool functions
  useToolRegistration(
    registerFunction,
    toolsFunctions as Record<string, ToolHandler>,
    mcpFunctions as Record<string, ToolHandler>,
    stopSession,
    onLLMStopSession
  );
  // Handle sound effects
  useSoundEffects(isSessionActive, justReinitialized);

  // Handle conversation compacting
  const handleCompactConversation = useCallback(
    async (additionalNotes: string) => {
      const result = await compactAndSaveConversation(conversation, additionalNotes);
      if (!result) {
        throw new Error("Failed to compact conversation");
      }
      debug("[Memory] Conversation compacted:", result.summary.slice(0, 100));
      await loadMemory(); // Refresh compacts list
    },
    [conversation, loadMemory]
  );

  // Handle deleting a single compact
  const handleDeleteCompact = useCallback(
    async (index: number) => {
      await deleteCompact(index);
      await loadMemory();
    },
    [loadMemory]
  );

  // Handle clearing all compacts
  const handleClearAllCompacts = useCallback(async () => {
    await clearCompacts();
    await loadMemory();
  }, [loadMemory]);

  // Handle persistent notes
  const handleAddNote = useCallback(
    async (note: string) => {
      await addPersistentNote(note);
      await loadMemory();
    },
    [loadMemory]
  );

  const handleDeleteNote = useCallback(
    async (index: number) => {
      await deletePersistentNote(index);
      await loadMemory();
    },
    [loadMemory]
  );

  const handleUpdateNote = useCallback(
    async (index: number, note: string) => {
      await updatePersistentNote(index, note);
      await loadMemory();
    },
    [loadMemory]
  );

  const handleClearAllNotes = useCallback(async () => {
    await clearPersistentNotes();
    await loadMemory();
  }, [loadMemory]);

  // Promote compact to persistent note (delete from compacts, add to notes)
  const handlePromoteCompact = useCallback(
    async (index: number) => {
      const compact = compacts[index];
      if (compact) {
        await addPersistentNote(compact.summary);
        await deleteCompact(index);
        await loadMemory();
      }
    },
    [compacts, loadMemory]
  );

  // Handle system prompt
  const handleSaveSystemPrompt = useCallback(
    async (prompt: string) => {
      await saveSystemPrompt(prompt);
      setSystemPrompt(prompt);
    },
    []
  );

  const handleResetSystemPrompt = useCallback(async () => {
    await resetSystemPrompt();
    setSystemPrompt(getDefaultSystemPrompt());
  }, []);

  return (
    <main className="h-screen w-screen flex flex-col justify-center bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 overflow-hidden relative">
      {/* Main Content */}
      <div className="flex flex-col items-center gap-6 max-w-md mx-auto w-full px-4 relative z-10">
        {/* Settings Dialog Trigger - Top Right or nicely placed */}
        <div className="absolute top-4 right-4 flex items-center gap-2">
          <CostMonitorModal />
          <ShortcutsHint />
          <Dialog>
            <DialogTrigger asChild>
              <button className="p-2 text-slate-400 hover:text-white bg-slate-800/50 rounded-lg hover:bg-slate-700/50 transition-colors">
                <Settings className="w-5 h-5" />
              </button>
            </DialogTrigger>
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Settings</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-4">
                  <MicrophoneSelector
                    value={selectedMicrophoneId}
                    onValueChange={setSelectedMicrophoneId}
                    disabled={isSessionActive}
                  />
                  <VoiceSelector
                    value={voice}
                    onValueChange={setVoice}
                  />
                  <div className="flex items-center justify-between space-x-2 bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                    <Label htmlFor="wake-word" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex flex-col gap-1">
                      <span>Wake Word</span>
                      <span className="text-xs font-normal text-slate-400">Listen for "Hi Celestial"</span>
                    </Label>
                    <Switch
                      id="wake-word"
                      checked={autoWakeWordEnabled}
                      onCheckedChange={(checked) => {
                        setAutoWakeWordEnabled(checked);
                        if (!checked) {
                          setManualStop(true);
                        } else {
                          setManualStop(false);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Visualizer & Broadcast Button */}
        <div className="w-full flex flex-col items-center justify-center py-4 relative">
          {/* Visualizer Background */}
          <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
             <AudioVisualizer 
                currentVolume={currentVolume} 
                isSessionActive={isSessionActive} 
                color={isSessionActive ? "#f59e0b" : "#64748b"}
             />
          </div>

          <div className="z-10 w-full max-w-[200px] flex flex-col items-center gap-2">
            <BroadcastButton
              isSessionActive={isSessionActive}
              detected={Boolean(detected)}
              onClick={onButtonClick}
            />
            <SessionTimer isActive={isSessionActive} />
          </div>
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-2 w-full justify-center">
          {/* Transcript Button */}
          <button
            onClick={() => setIsTranscriptOpen(true)}
            className="group p-2.5 bg-slate-800/60 hover:bg-slate-700/80 border border-slate-600/40 hover:border-slate-500/60 text-slate-400 hover:text-white rounded-lg transition-all duration-200"
            title="Transcript history"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </button>

          {/* Memories Button */}
          <button
            onClick={() => setIsSummariesOpen(true)}
            className="group p-2.5 bg-slate-800/60 hover:bg-blue-600/30 border border-slate-600/40 hover:border-blue-400/50 text-slate-400 hover:text-blue-300 rounded-lg transition-all duration-200"
            title="Memories & Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-700/50 mx-1" />

          {/* Real-time Transcription Button (Ctrl+Shift+T) */}
          <button
            onClick={handleTranscriptionToggle}
            disabled={isSessionActive}
            className={`group p-2.5 rounded-lg transition-all duration-200 ${
              isTranscribing
                ? "bg-red-500/30 hover:bg-red-500/40 border border-red-400/50 text-red-400"
                : isTranscribingConnecting
                ? "bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 cursor-wait"
                : isSessionActive
                ? "bg-slate-800/40 border border-slate-700/30 text-slate-600 cursor-not-allowed opacity-50"
                : "bg-slate-800/60 hover:bg-purple-600/30 border border-slate-600/40 hover:border-purple-400/50 text-slate-400 hover:text-purple-300"
            }`}
            title={isTranscribing ? "Stop Live (Ctrl+Shift+T)" : "Live transcription (Ctrl+Shift+T)"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              {isTranscribing ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              )}
            </svg>
          </button>

          {/* Whisper Transcription Button (Ctrl+Shift+R) */}
          <button
            onClick={handleWhisperToggle}
            disabled={isSessionActive || isTranscribing}
            className={`group p-2.5 rounded-lg transition-all duration-200 ${
              isWhisperRecording
                ? "bg-red-500/30 hover:bg-red-500/40 border border-red-400/50 text-red-400"
                : isWhisperProcessing
                ? "bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 cursor-wait"
                : isSessionActive || isTranscribing
                ? "bg-slate-800/40 border border-slate-700/30 text-slate-600 cursor-not-allowed opacity-50"
                : "bg-slate-800/60 hover:bg-orange-600/30 border border-slate-600/40 hover:border-orange-400/50 text-slate-400 hover:text-orange-300"
            }`}
            title={isWhisperRecording ? "Stop Whisper (Ctrl+Shift+R)" : "Whisper transcription (Ctrl+Shift+R)"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              {isWhisperRecording ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              )}
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-700/50 mx-1" />

          {/* Mute Button */}
          <button
            onClick={() => {
              toggleMute();
              toast.info(isMuted ? "Microphone unmuted" : "Microphone muted");
            }}
            disabled={!isSessionActive}
            className={`group p-2.5 rounded-lg transition-all duration-200 ${
              !isSessionActive
                ? "bg-slate-800/40 border border-slate-700/30 text-slate-600 cursor-not-allowed opacity-50"
                : isMuted
                ? "bg-red-500/30 hover:bg-red-500/40 border border-red-400/50 text-red-400"
                : "bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 hover:text-emerald-300"
            }`}
            title={isMuted ? "Unmute (Ctrl+Shift+M)" : "Mute (Ctrl+Shift+M)"}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              {isMuted ? (
                <>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                </>
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              )}
            </svg>
          </button>
        </div>

        {/* Chat Input */}
        <div className="w-full">
          <ChatInput
            onSendMessage={sendTextMessage}
            disabled={!isSessionActive}
          />
        </div>

        {/* Wake Word Status - compact */}
        <div className="text-center mt-2">
          {wakeWordEnabled && wakeError && !wakeListening && !wakeReady && (
            <p className="text-red-400 text-xs mb-1">
              Error: {wakeError.message}
            </p>
          )}
          <p className="text-xs text-slate-500">
            {!wakeWordEnabled ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                Wake word off
                <button
                  onClick={() => {
                    setAutoWakeWordEnabled(true);
                    setManualStop(false);
                  }}
                  className="text-xs px-1.5 py-0.5 rounded bg-slate-700/50 hover:bg-slate-600/50 text-slate-400 hover:text-slate-300 transition-colors ml-1"
                >
                  Enable
                </button>
              </span>
            ) : wakeListening ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Listening for &quot;Hi Celestial&quot;
              </span>
            ) : wakeReady ? (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                Ready
              </span>
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
                Initializing...
              </span>
            )}
          </p>
        </div>
      </div>
      <TranscriptWindow
        conversation={[...conversation, ...transcriptionEntries].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )}
        isOpen={isTranscriptOpen}
        onClose={() => setIsTranscriptOpen(false)}
        onClear={() => {
          clearConversation();
          setTranscriptionEntries([]);
        }}
        onCompact={handleCompactConversation}
      />
      <SummariesWindow
        compacts={compacts}
        persistentNotes={persistentNotes}
        systemPrompt={systemPrompt}
        defaultSystemPrompt={getDefaultSystemPrompt()}
        isOpen={isSummariesOpen}
        onClose={() => setIsSummariesOpen(false)}
        onDeleteCompact={handleDeleteCompact}
        onClearAllCompacts={handleClearAllCompacts}
        onAddNote={handleAddNote}
        onDeleteNote={handleDeleteNote}
        onUpdateNote={handleUpdateNote}
        onClearAllNotes={handleClearAllNotes}
        onPromoteCompact={handlePromoteCompact}
        onSaveSystemPrompt={handleSaveSystemPrompt}
        onResetSystemPrompt={handleResetSystemPrompt}
        onRefresh={loadMemory}
      />
    </main>
  );
}
