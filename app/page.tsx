"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useWakeWord } from "@/hooks/use-wake-word";
import useWebRTCAudioSession, { Tool } from "@/hooks/use-webrtc";
import { useMCPFunctions, useToolsFunctions } from "@/hooks/use-tools";
import {
  TranslationsProvider,
  useTranslations,
} from "@/components/translations-context";
import { BroadcastButton } from "@/components/broadcast-button";
import { StatusDisplay } from "@/components/status";
import { tools } from "@/lib/tools";
import { VoiceSelector } from "@/components/voice-select";
import { playSound } from "@/lib/tools";
// Constants
const REINIT_DELAY = 1000;
const INIT_SOUND_DELAY = 500;

// Types
type WakeWordConfig = {
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
  registerFunction: (name: string, func: Function) => void,
  toolsFunctions: Record<string, Function>,
  mcpTools: Record<string, Function>,
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

function useWakeWordConfig(handleWakeWord: () => void): WakeWordConfig {
  return {
    sessionActive: false,
    onWakeWord: handleWakeWord,
    porcupineModel: {
      publicPath: "/models/porcupine_params.pv",
      customWritePath: "porcupine_model.pv",
      forceWrite: true,
    },
    keywords: [
      {
        label: "Hi Jarvis",
        publicPath: "/models/Hi-Jarvis.ppn",
        sensitivity: 0.9,
        customWritePath: "Hi-Jarvis.ppn",
        forceWrite: true,
      },
    ],
    accessKey: process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY || "",
  };
}

function useSoundEffects(isSessionActive: boolean, justReinitialized: boolean) {
  const prevSessionActiveRef = useRef(isSessionActive);

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
      prevSessionActiveRef.current = isSessionActive;
    }
  }, [isSessionActive, justReinitialized]);
}

function AppContent() {
  // State management
  const [voice, setVoice] = useState("coral");
  const [manualStop, setManualStop] = useState(false);
  const [autoWakeWordEnabled, setAutoWakeWordEnabled] = useState(true);
  const [justReinitialized, setJustReinitialized] = useState(false);
  const [mcpDefinitions, setMcpDefinitions] = useState<Tool[]>([]);

  debug("AppContent initialized with voice:", voice);

  const toolsFunctions = useToolsFunctions();
  const {
    wrappedFunctions: mcpFunctions,
    toolDefinitions: mcpToolDefinitions,
  } = useMCPFunctions();

  // Initialize WebRTC session with all tools
  const {
    status,
    isSessionActive,
    startSession,
    handleStartStopClick,
    registerFunction,
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

  // Handle wake word detection
  const handleWakeWord = useCallback(() => {
    debug("handleWakeWord triggered.");
    if (isSessionActive) return;

    playSound("/sounds/on-wakeword.mp3");
    startSession();

    if (justReinitialized) {
      debug("Ignoring wake word trigger immediately after reinitialization.");
      return;
    }

    debug("Wake word detected.");
    if (manualStop) {
      setManualStop(false);
    }

    stopWakeWordRef
      .current()
      .catch((err) => console.error("Error stopping wake word:", err));
  }, [isSessionActive, justReinitialized, manualStop, startSession]);

  const wakeWordConfig = useWakeWordConfig(handleWakeWord);

  const {
    release,
    startPorcupine: startWakeWord,
    stopPorcupine: stopWakeWord,
    isReady: wakeReady,
    isListening: wakeListening,
    error: wakeError,
    reinitializeEngine,
    detected,
  } = useWakeWord(wakeWordConfig);

  useEffect(() => {
    stopWakeWordRef.current = stopWakeWord;
  }, [stopWakeWord]);

  // Manage wake word detection on session transitions
  useEffect(() => {
    debug("Session transition detected.", {
      prev: prevSessionActiveRef.current,
      current: isSessionActive,
    });

    if (prevSessionActiveRef.current && !isSessionActive) {
      debug("Session stopped.");

      if (autoWakeWordEnabled && !manualStop) {
        debug("Reinitializing wake word listening after natural session end.");
        setJustReinitialized(true);

        stopWakeWord()
          .then(() => {
            setTimeout(() => {
              startWakeWord().catch((err) => {
                console.error(
                  "Error starting wake word after session end:",
                  err
                );
              });
              setJustReinitialized(false);
            }, REINIT_DELAY);
          })
          .catch((err) => {
            console.error(
              "Error stopping wake word for reinitialization:",
              err
            );
          });
      } else {
        debug(
          "Session stopped manually; not reinitializing wake word automatically."
        );
        setJustReinitialized(true);
      }
    } else if (!prevSessionActiveRef.current && isSessionActive) {
      debug("Session started. Stopping wake word detection.");
      stopWakeWord().catch((err) => {
        console.error("Error stopping wake word during session:", err);
      });
    }
    prevSessionActiveRef.current = isSessionActive;
  }, [
    isSessionActive,
    startWakeWord,
    stopWakeWord,
    autoWakeWordEnabled,
    manualStop,
  ]);

  // Handle button click
  const onButtonClick = useCallback(() => {
    debug("Button clicked with detected:", detected);

    if (isSessionActive) {
      handleStartStopClick();
      setManualStop(true);
      setAutoWakeWordEnabled(false);
      reinitializeEngine();
      debug("Button clicked with session active.");
    } else {
      handleStartStopClick();
      setManualStop(false);
      playSound("/sounds/on-wakeword.mp3");
      startSession();
      debug("Button clicked with session INACTIVE.");
    }
  }, [
    isSessionActive,
    handleStartStopClick,
    detected,
    reinitializeEngine,
    startSession,
  ]);
  // Register tool functions
  useToolRegistration(
    registerFunction,
    toolsFunctions,
    mcpFunctions,
    onButtonClick
  );
  useEffect(() => {
    startWakeWord();
    return () => {};
  }, [startWakeWord]);
  // Handle sound effects
  useSoundEffects(isSessionActive, justReinitialized);

  return (
    <main className="h-full flex flex-col items-center justify-center p-4">
      <div className="mb-4">
        <VoiceSelector value={voice} onValueChange={setVoice} />
      </div>
      <div className="flex flex-col items-center gap-4">
        <StatusDisplay status={status} />
        <BroadcastButton
          isSessionActive={isSessionActive}
          detected={Boolean(detected)}
          onClick={onButtonClick}
        />
      </div>
      {wakeError && (
        <p className="text-red-500 mt-2">
          Wake Word Error: {wakeError.message}
        </p>
      )}
      <p className="mt-2">
        {wakeReady
          ? wakeListening
            ? "Listening for wake word..."
            : "Not listening"
          : "Initializing wake word..."}
      </p>
    </main>
  );
}
