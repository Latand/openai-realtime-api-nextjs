"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useWakeWord } from "@/hooks/use-wake-word";
import useWebRTCAudioSession, { Tool } from "@/hooks/use-webrtc";
import { useMCPFunctions, useToolsFunctions } from "@/hooks/use-tools";
import { TranslationsProvider } from "@/components/translations-context";
import { BroadcastButton } from "@/components/broadcast-button";
import { StatusDisplay } from "@/components/status";
import { tools } from "@/lib/tools";
import { playSound } from "@/lib/tools";
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
  stopSessionHandler: () => void
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
              console.log("🛑 Manually stopping voice session");
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
  }, [registerFunction, toolsFunctions, stopSessionHandler, mcpTools]);
}

function useWakeWordConfig(
  handleWakeWord: () => void,
  sessionActive: boolean,
  enabled: boolean
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
    }),
    [enabled, handleWakeWord, sessionActive, porcupineModel, keywords]
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
  const [manualStop, setManualStop] = useState(false);
  const [autoWakeWordEnabled, setAutoWakeWordEnabled] = useState(true);
  const [justReinitialized, setJustReinitialized] = useState(false);
  const [mcpDefinitions, setMcpDefinitions] = useState<Tool[]>([]);
  const wakeWordEnabled = autoWakeWordEnabled;

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
  } = useWebRTCAudioSession(voice, tools, mcpDefinitions);

  const prevSessionActiveRef = useRef(isSessionActive);
  const stopWakeWordRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Update MCP definitions when they're available
  useEffect(() => {
    if (Object.keys(mcpFunctions).length > 0) {
      debug("MCP tools registered:", Object.keys(mcpFunctions));
      setMcpDefinitions(mcpToolDefinitions as Tool[]);
    }
  }, [mcpFunctions, mcpToolDefinitions]);

  // Listen for Claude CLI responses
  useEffect(() => {
    if (!window.electron?.onClaudeResponse) return;

    const unsubscribeResponse = window.electron.onClaudeResponse((data) => {
      debug("Claude response received:", data.requestId);
      playSound("/sounds/session-start.mp3");

      // Format the response for the AI to speak naturally
      const prompt = `[SYSTEM: Claude CLI has finished processing and returned the following response. Please summarize this information concisely and speak it to the user in a natural, conversational way. Here is Claude's response:]\n\n${data.response}`;

      // If session is active, inject the response
      if (isSessionActive) {
        sendTextMessage(prompt);
      } else {
        // Start session and inject response after a delay
        startSession();
        setTimeout(() => {
          sendTextMessage(prompt);
        }, 2500);
      }
    });

    const unsubscribeError = window.electron.onClaudeError?.((data) => {
      debug("Claude error:", data.error);
      playSound("/sounds/session-end.mp3");
      if (isSessionActive) {
        sendTextMessage(`[SYSTEM: Claude CLI encountered an error: ${data.error}. Please inform the user about this error.]`);
      }
    });

    return () => {
      unsubscribeResponse?.();
      unsubscribeError?.();
    };
  }, [isSessionActive, sendTextMessage, startSession]);

  const justReinitTimeoutRef = useRef<number | null>(null);

  // Handle wake word detection
  const handleWakeWord = useCallback(() => {
    debug("handleWakeWord triggered.");
    if (isSessionActive) return;
    if (justReinitialized) {
      debug("Ignoring wake word trigger immediately after reinitialization.");
      return;
    }

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
    wakeWordEnabled
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
  // Register tool functions
  // Pass stopSession (not handleStopSession) so AI-initiated stops don't disable wake word
  useToolRegistration(
    registerFunction,
    toolsFunctions as Record<string, ToolHandler>,
    mcpFunctions as Record<string, ToolHandler>,
    stopSession
  );
  // Handle sound effects
  useSoundEffects(isSessionActive, justReinitialized);

  return (
    <main className="h-full flex flex-col justify-center p-4">
      {/* <div className="mb-4"> */}
      {/* <VoiceSelector value={voice} onValueChange={setVoice} /> */}
      {/* </div> */}
      <div className="flex flex-col items-center gap-4">
        <StatusDisplay status={status} />
        <BroadcastButton
          isSessionActive={isSessionActive}
          detected={Boolean(detected)}
          onClick={onButtonClick}
        />
      </div>
      {wakeWordEnabled && wakeError && !wakeListening && !wakeReady && (
        <p className="text-red-500 mt-2">
          Wake Word Error: {wakeError.message}
        </p>
      )}
      <p className="mt-2">
        {!wakeWordEnabled
          ? "Wake word disabled"
          : wakeListening
            ? "Listening for wake word..."
            : wakeReady
              ? "Ready (not listening)"
              : "Initializing wake word..."}
      </p>
    </main>
  );
}
