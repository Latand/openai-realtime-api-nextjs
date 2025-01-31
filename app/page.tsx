"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import useWebRTCAudioSession from "@/hooks/use-webrtc";
import { useWakeWord } from "@/hooks/use-wake-word";
import { BroadcastButton } from "@/components/broadcast-button";
import { StatusDisplay } from "@/components/status";
import { tools } from "@/lib/tools";
import { TranslationsProvider } from "@/components/translations-context";
import { useToolsFunctions } from "@/hooks/use-tools";

function PageContent() {
  // Update this variable as needed
  const WAKE_WORD_COOLDOWN_MS = 5000;
  const [wakeWordStatus, setWakeWordStatus] = useState("Initializing...");
  const lastWakeWordTimeRef = useRef(0);

  const { status, isSessionActive, handleStartStopClick, registerFunction } =
    useWebRTCAudioSession("coral", tools);

  const {
    start: startWakeWord,
    stop: stopWakeWord,
    isReady,
    isListening,
    error,
  } = useWakeWord({
    onWakeWord: handleWakeWordDetected,
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
  });

  // Add debounce timeout ref
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const toolsFunctions = useToolsFunctions();
  function handleWakeWordDetected() {
    const now = Date.now();
    if (now - lastWakeWordTimeRef.current < WAKE_WORD_COOLDOWN_MS) {
      return;
    }
    lastWakeWordTimeRef.current = now;

    if (!isSessionActive) {
      console.log("Wake word detected -> starting session.");
      handleStartStopClick();
    }
  }

  // Manage initial wake word start/stop
  useEffect(() => {
    startWakeWord().catch((err) => {
      console.error("Error starting wake word detection:", err);
    });
    return () => {
      stopWakeWord().catch((err) => {
        console.error("Error stopping wake word detection:", err);
      });
    };
  }, [startWakeWord, stopWakeWord]);

  // Update UI status for the wake word with debouncing
  useEffect(() => {
    // Clear any pending timeout
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }

    // Set new status with a small delay to prevent rapid changes
    statusTimeoutRef.current = setTimeout(() => {
      if (error) {
        setWakeWordStatus(`Error: ${error.message}`);
      } else if (!isReady) {
        setWakeWordStatus("Initializing...");
      } else if (isSessionActive) {
        setWakeWordStatus("Session active - wake word disabled");
      } else if (isListening) {
        setWakeWordStatus("Ready - say 'Hi Jarvis'");
      } else {
        setWakeWordStatus("Paused");
      }
    }, 300); // 300ms debounce

    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, [error, isReady, isListening, isSessionActive]);

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
              error ? "text-red-500" : "text-green-500"
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
}

export default function Page() {
  return (
    <TranslationsProvider>
      <PageContent />
    </TranslationsProvider>
  );
}
