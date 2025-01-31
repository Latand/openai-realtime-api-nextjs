"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import useWebRTCAudioSession from "@/hooks/use-webrtc";
import { useWakeWord } from "@/hooks/use-wake-word";
import { tools } from "@/lib/tools";
import { BroadcastButton } from "@/components/broadcast-button";
import { StatusDisplay } from "@/components/status";
import { motion } from "framer-motion";
import { useToolsFunctions } from "@/hooks/use-tools";
import { TranslationsProvider } from "@/components/translations-context";

const WAKE_WORD_CONFIG = {
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

const AppContent: React.FC = () => {
  const [voice] = useState("coral");
  const [wakeWordStatus, setWakeWordStatus] =
    useState<string>("Initializing...");
  const lastWakeWordTimeRef = useRef<number>(0);
  const WAKE_WORD_COOLDOWN = 5000; // 5 seconds cooldown

  const { status, isSessionActive, registerFunction, handleStartStopClick } =
    useWebRTCAudioSession(voice, tools);

  const toolsFunctions = useToolsFunctions();

  const handleWakeWord = useCallback(() => {
    const now = Date.now();
    if (now - lastWakeWordTimeRef.current < WAKE_WORD_COOLDOWN) {
      console.log("🔇 Wake word cooldown active");
      return;
    }

    if (isSessionActive) {
      console.log("🎙️ Session already active");
      return;
    }

    console.log("🎙️ Wake word detected! Starting session...");
    lastWakeWordTimeRef.current = now;
    handleStartStopClick();
  }, [isSessionActive, handleStartStopClick]);

  const {
    start: startWakeWord,
    stop: stopWakeWord,
    isReady: isWakeWordReady,
    isListening: isWakeWordListening,
    error: wakeWordError,
  } = useWakeWord({
    ...WAKE_WORD_CONFIG,
    onWakeWord: handleWakeWord,
  });

  // Initialize wake word
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        console.log("🎤 Starting wake word...");
        await startWakeWord();
      } catch (err) {
        console.error("Failed to start wake word:", err);
        if (mounted) {
          setWakeWordStatus(
            "Error: " + (err instanceof Error ? err.message : String(err))
          );
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [startWakeWord]);

  // Update status based on wake word state
  useEffect(() => {
    if (wakeWordError) {
      setWakeWordStatus(`Error: ${wakeWordError.message}`);
    } else if (isWakeWordReady && isWakeWordListening) {
      setWakeWordStatus("Ready - Say 'Hi Jarvis'");
    } else if (isWakeWordReady && !isWakeWordListening) {
      setWakeWordStatus("Paused");
    } else {
      setWakeWordStatus("Initializing...");
    }
  }, [isWakeWordReady, isWakeWordListening, wakeWordError]);

  // Handle session state changes
  useEffect(() => {
    const handleSessionChange = async () => {
      try {
        if (isSessionActive) {
          console.log("🎯 Session active, stopping wake word");
          await stopWakeWord();
        } else if (isWakeWordReady) {
          console.log("⏹️ Session ended, restarting wake word");
          await startWakeWord();
        }
      } catch (err) {
        console.error("Failed to handle session change:", err);
      }
    };

    handleSessionChange();
  }, [isSessionActive, isWakeWordReady, startWakeWord, stopWakeWord]);

  // Register tool functions
  useEffect(() => {
    Object.entries(toolsFunctions).forEach(([name, func]) => {
      const functionNames: Record<string, string> = {
        timeFunction: "getCurrentTime",
        launchWebsite: "launchWebsite",
        copyToClipboard: "copyToClipboard",
        scrapeWebsite: "scrapeWebsite",
        pressEnter: "pressEnter",
        openSpotify: "openSpotify",
        controlMusic: "controlMusic",
        adjustVolume: "adjustVolume",
        adjustSystemVolume: "adjustSystemVolume",
        stopSession: "stopSession",
      };

      if (name === "stopSession") {
        registerFunction(functionNames[name], async (...args: unknown[]) => {
          const result = await (
            func as (...args: unknown[]) => Promise<{ success: boolean }>
          )(...args);
          if (result.success) {
            console.log("🛑 Stopping voice session");
            handleStartStopClick();
          }
          return result;
        });
      } else {
        registerFunction(functionNames[name], func);
      }
    });
  }, [registerFunction, toolsFunctions, handleStartStopClick]);

  return (
    <main className="h-full flex items-center justify-center">
      <motion.div
        className="flex flex-col items-center gap-6 p-8 text-white"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="text-center mb-4">
          <div className="text-sm text-gray-400 mb-2">Wake Word Status:</div>
          <div
            className={`font-medium ${
              wakeWordError ? "text-red-500" : "text-green-500"
            }`}
          >
            {wakeWordStatus}
          </div>
        </div>
        <BroadcastButton
          isSessionActive={isSessionActive}
          onClick={handleStartStopClick}
        />
        {status && <StatusDisplay status={status} />}
      </motion.div>
    </main>
  );
};

const App: React.FC = () => {
  return (
    <TranslationsProvider>
      <AppContent />
    </TranslationsProvider>
  );
};

export default App;
