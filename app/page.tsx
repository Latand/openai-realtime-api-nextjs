"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useWakeWord } from "@/hooks/use-wake-word";
import useWebRTCAudioSession, { Tool } from "@/hooks/use-webrtc";
import { useMCPFunctions, useToolsFunctions } from "@/hooks/use-tools";
import { TranslationsProvider } from "@/components/translations-context";
import { BroadcastButton } from "@/components/broadcast-button";
import { StatusDisplay } from "@/components/status";
import { MicrophoneSelector } from "@/components/microphone-select";
import { TranscriptWindow } from "@/components/transcript-window";
import { SummariesWindow } from "@/components/summaries-window";
import { tools } from "@/lib/tools";
import { playSound } from "@/lib/tools";
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
      playSound("/sounds/app-init.mp3");
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
  const [voice] = useState("coral");
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState<string>("");
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
  const wakeWordEnabled = autoWakeWordEnabled;

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

  const justReinitTimeoutRef = useRef<number | null>(null);

  // Handle wake word detection
  const handleWakeWord = useCallback(() => {
    debug("handleWakeWord triggered.");
    if (isSessionActive) return;
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
  }, [isSessionActive, justReinitialized, manualStop, startSession]);

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
    sessionStoppedByLLMRef.current = false; // Clear LLM stop flag on manual start
    setManualStop(false);
    setAutoWakeWordEnabled(true);
    setJustReinitialized(false);
    playSound("/sounds/on-wakeword.mp3");
    startSession();
  }, [isSessionActive, startSession]);

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
    <main className="h-full flex flex-col justify-center p-4">
      <div className="mb-4 max-w-xs mx-auto w-full">
        <MicrophoneSelector
          value={selectedMicrophoneId}
          onValueChange={setSelectedMicrophoneId}
          disabled={isSessionActive}
        />
      </div>
      <div className="flex flex-col items-center gap-4">
        <StatusDisplay status={status} />
        <div className="flex gap-2 w-full max-w-xs">
          <BroadcastButton
            isSessionActive={isSessionActive}
            detected={Boolean(detected)}
            onClick={onButtonClick}
          />
          <button
            onClick={() => setIsTranscriptOpen(true)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md transition-colors flex items-center gap-2"
            title="Open Transcript"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </button>
          <button
            onClick={() => setIsSummariesOpen(true)}
            className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-md transition-colors flex items-center gap-2"
            title="View Memories"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a10 10 0 0 1 10 10c0 5.52-4.48 10-10 10S2 17.52 2 12 6.48 2 12 2" />
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v4" />
              <path d="M12 18v4" />
            </svg>
          </button>
        </div>
      </div>
      <TranscriptWindow
        conversation={conversation}
        isOpen={isTranscriptOpen}
        onClose={() => setIsTranscriptOpen(false)}
        onClear={clearConversation}
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
      {wakeWordEnabled && wakeError && !wakeListening && !wakeReady && (
        <p className="text-red-500 mt-2">
          Wake Word Error: {wakeError.message}
        </p>
      )}
      <p className="mt-2">
        {!wakeWordEnabled ? (
          <span className="flex items-center gap-2">
            Wake word disabled
            <button
              onClick={() => {
                setAutoWakeWordEnabled(true);
                setManualStop(false);
              }}
              className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            >
              Enable
            </button>
          </span>
        ) : wakeListening ? (
          "Listening for wake word..."
        ) : wakeReady ? (
          "Ready (not listening)"
        ) : (
          "Initializing wake word..."
        )}
      </p>
    </main>
  );
}
