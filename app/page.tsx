"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useWakeWord } from "@/hooks/use-wake-word";
import useWebRTCAudioSession from "@/hooks/use-webrtc";
import { useToolsFunctions } from "@/hooks/use-tools";
import {
  TranslationsProvider,
  useTranslations,
} from "@/components/translations-context";
import { BroadcastButton } from "@/components/broadcast-button";
import { StatusDisplay } from "@/components/status";
import { tools } from "@/lib/tools";
import { VoiceSelector } from "@/components/voice-select";

export default function Page() {
  return (
    <TranslationsProvider>
      <AppContent />
    </TranslationsProvider>
  );
}

function AppContent() {
  const [voice, setVoice] = useState("coral");
  const { t } = useTranslations();

  // Delay constants.
  const DEBOUNCE_DELAY = 3000; // (Unused in this simplified version)
  const MANUAL_STOP_DELAY = 10000; // Delay after manual stop before rearming auto wake word.
  const REINIT_DELAY = 1000; // Reduced delay after natural session end before rearming wake word.

  // State flags.
  const [manualStop, setManualStop] = useState(false); // True if session was manually stopped.
  const [autoWakeWordEnabled, setAutoWakeWordEnabled] = useState(true); // Controls auto wake word detection.
  const [justReinitialized, setJustReinitialized] = useState(false); // True briefly after rearming wake word detection.

  // Initialize the WebRTC session hook.
  const {
    status,
    isSessionActive,
    startSession,
    handleStartStopClick,
    registerFunction,
  } = useWebRTCAudioSession(voice, tools);

  // Ref to track previous session state.
  const prevSessionActiveRef = useRef(isSessionActive);

  // Initialize the tools functions hook.
  const toolsFunctions = useToolsFunctions();

  // Register tool functions.
  useEffect(() => {
    Object.entries(toolsFunctions).forEach(([name, func]) => {
      const functionNames = {
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
            console.log("🛑 Manually stopping voice session");
            onButtonClick();
          }
          return result;
        });
      } else {
        registerFunction(functionNames[name], func);
      }
    });
  }, [registerFunction, toolsFunctions]);

  // Create a ref to hold the actual stopWakeWord function.
  const stopWakeWordRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Wake word callback: simply start a new session if conditions are met.
  function handleWakeWord() {
    if (isSessionActive) return;
    if (!autoWakeWordEnabled) {
      console.log("Auto wake word disabled; ignoring trigger.");
      return;
    }
    if (justReinitialized) {
      console.log(
        "Ignoring wake word trigger immediately after reinitialization."
      );
      return;
    }
    console.log("Wake word detected.");
    if (manualStop) {
      setManualStop(false);
    }
    // Stop wake word detection (if running) and start a session.
    stopWakeWordRef
      .current()
      .catch((err) => console.error("Error stopping wake word:", err));
    startSession();
  }

  // Wake word configuration using the custom Hi-Jarvis model.
  const wakeWordConfig = {
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

  // Initialize the wake word hook.
  const {
    start: startWakeWord,
    stop: stopWakeWord,
    isReady: wakeReady,
    isListening: wakeListening,
    error: wakeError,
  } = useWakeWord(wakeWordConfig);

  // Update the ref with the actual stopWakeWord function.
  useEffect(() => {
    stopWakeWordRef.current = stopWakeWord;
  }, [stopWakeWord]);

  // Effect: Manage wake word detection on session transitions.
  useEffect(() => {
    if (prevSessionActiveRef.current && !isSessionActive) {
      console.log("Session stopped.");
      // Only reinitialize wake word detection on a natural session end.
      if (autoWakeWordEnabled && !manualStop) {
        console.log(
          "Reinitializing wake word listening after natural session end."
        );
        setJustReinitialized(true);
        // Force a reset of the engine: call stopWakeWord() then startWakeWord() after a delay.
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
        console.log(
          "Session stopped manually; not reinitializing wake word automatically."
        );
      }
    } else if (!prevSessionActiveRef.current && isSessionActive) {
      // When session starts, stop wake word detection.
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

  // On mount, start wake word detection if enabled.
  useEffect(() => {
    if (!isSessionActive && autoWakeWordEnabled) {
      console.log("Initial wake word start.");
      startWakeWord().catch((err) => {
        console.error("Error starting wake word on mount:", err);
      });
    }
    return () => {
      stopWakeWord().catch((err) => {
        console.error("Error stopping wake word on unmount:", err);
      });
    };
  }, [isSessionActive, autoWakeWordEnabled]);

  // Wrapped button click handler.
  const onButtonClick = useCallback(() => {
    if (isSessionActive) {
      // Manual stop: stop session, mark manualStop, disable auto wake word.
      handleStartStopClick();
      setManualStop(true);
      setAutoWakeWordEnabled(false);
      // Re-enable auto wake word detection after MANUAL_STOP_DELAY.
      setTimeout(() => {
        console.log("Re-enabling auto wake word after manual stop.");
        setAutoWakeWordEnabled(true);
        setManualStop(false);
      }, MANUAL_STOP_DELAY);
    } else {
      // Manual start: start session and disable auto wake word during session.
      handleStartStopClick();
      setManualStop(false);
      setAutoWakeWordEnabled(false);
    }
  }, [isSessionActive, handleStartStopClick]);

  return (
    <main className="h-full flex flex-col items-center justify-center p-4">
      <div className="mb-4">
        <VoiceSelector value={voice} onValueChange={setVoice} />
      </div>
      <div className="flex flex-col items-center gap-4">
        <StatusDisplay status={status} />
        <BroadcastButton
          isSessionActive={isSessionActive}
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
