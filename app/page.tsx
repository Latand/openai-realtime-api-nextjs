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
import { playSound } from "@/lib/tools";

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

function AppContent() {
  const [voice, setVoice] = useState("coral");
  debug("AppContent initialized with voice:", voice);

  // Delay constants.
  const DEBOUNCE_DELAY = 3000; // (Unused in this simplified version)
  const MANUAL_STOP_DELAY = 1000; // Delay after manual stop before rearming auto wake word.
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
      const functionNames: Record<string, string> = {
        timeFunction: "getCurrentTime",
        launchWebsite: "launchWebsite",
        copyToClipboard: "copyToClipboard",
        scrapeWebsite: "scrapeWebsite",
        pasteText: "pasteText",
        openSpotify: "openSpotify",
        controlMusic: "controlMusic",
        adjustVolume: "adjustVolume",
        adjustSystemVolume: "adjustSystemVolume",
        stopSession: "stopSession",
      };
      console.log(
        "[AppContent] Registering tool function:",
        functionNames[name],
        "for key:",
        name
      );

      if (name === "stopSession") {
        registerFunction(functionNames[name], async (...args: unknown[]) => {
          const result = await (
            func as (...args: unknown[]) => Promise<{ success: boolean }>
          )(...args);
          if (result.success) {
            console.log("🛑 Manually stopping voice session");
            onButtonClick();
            playSound("/sounds/session-end.mp3");
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
    console.log("[AppContent] handleWakeWord triggered.");
    if (isSessionActive) return;
    playSound("/sounds/on-wakeword.mp3");
    startSession();
    // if (!autoWakeWordEnabled) {
    //   console.log("Auto wake word disabled; ignoring trigger.");
    //   return;
    // }
    if (justReinitialized) {
      console.log(
        "[AppContent] Ignoring wake word trigger immediately after reinitialization."
      );
      return;
    }
    console.log("[AppContent] Wake word detected.");
    if (manualStop) {
      setManualStop(false);
    }
    // Stop wake word detection (if running) and start a session.
    stopWakeWordRef
      .current()
      .catch((err) => console.error("Error stopping wake word:", err));
  }

  // Wake word configuration using the custom Hi-Jarvis model.
  const wakeWordConfig = {
    sessionActive: isSessionActive,
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
    release,
    startPorcupine: startWakeWord,
    stopPorcupine: stopWakeWord,
    isReady: wakeReady,
    isListening: wakeListening,
    error: wakeError,
    reinitializeEngine,
    detected,
  } = useWakeWord(wakeWordConfig);

  // Update the ref with the actual stopWakeWord function.
  useEffect(() => {
    stopWakeWordRef.current = stopWakeWord;
  }, [stopWakeWord]);

  // Effect: Manage wake word detection on session transitions.
  useEffect(() => {
    console.log(
      "[AppContent] Session transition detected. Previous active:",
      prevSessionActiveRef.current,
      "Current active:",
      isSessionActive
    );
    if (prevSessionActiveRef.current && !isSessionActive) {
      console.log("[AppContent] Session stopped.");
      // Only reinitialize wake word detection on a natural session end.
      if (autoWakeWordEnabled && !manualStop) {
        console.log(
          "[AppContent] Reinitializing wake word listening after natural session end."
        );
        setJustReinitialized(true);
        // Force a reset of the engine: call stopWakeWord() then startWakeWord() after a delay.
        stopWakeWord()
          .then(() => {
            setTimeout(() => {
              startWakeWord().catch((err) => {
                console.error(
                  "[AppContent] Error starting wake word after session end:",
                  err
                );
              });
              setJustReinitialized(false);
            }, REINIT_DELAY);
          })
          .catch((err) => {
            console.error(
              "[AppContent] Error stopping wake word for reinitialization:",
              err
            );
          });
      } else {
        console.log(
          "[AppContent] Session stopped manually; not reinitializing wake word automatically."
        );
        // Set justReinitialized to true briefly then reset it to false so that wake word triggering works later.
        setJustReinitialized(true);
        // setTimeout(() => {
        //   setJustReinitialized(false);
        // }, MANUAL_STOP_DELAY);
      }
    } else if (!prevSessionActiveRef.current && isSessionActive) {
      console.log(
        "[AppContent] Session started. Stopping wake word detection."
      );
      stopWakeWord().catch((err) => {
        console.error(
          "[AppContent] Error stopping wake word during session:",
          err
        );
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

  // // On mount, start wake word detection if enabled.
  // useEffect(() => {
  //   console.log("[AppContent] useEffect detected:", detected);
  //   if (!isSessionActive && detected) {
  //     // startSession();
  //     startWakeWord().catch((err) => {
  //       console.error("[AppContent] Error starting wake word on mount:", err);
  //     });
  //   }
  //   return () => {
  //     console.log(
  //       "[AppContent] Component unmounting, stopping wake word detection."
  //     );
  //     stopWakeWord().catch((err) => {
  //       console.error("[AppContent] Error stopping wake word on unmount:", err);
  //     });
  //   };
  // }, [isSessionActive]);

  // Wrapped button click handler.
  const onButtonClick = useCallback(() => {
    console.log("Button clicked with detected:", detected);
    if (isSessionActive) {
      // Manual stop: stop session, mark manualStop, disable auto wake word.
      handleStartStopClick();
      setManualStop(true);
      setAutoWakeWordEnabled(false);
      // Re-enable auto wake word detection after MANUAL_STOP_DELAY.
      // release();
      reinitializeEngine();
      // setTimeout(() => {
      //   console.log("Re-enabling auto wake word after manual stop.");
      //   setAutoWakeWordEnabled(true);
      //   setManualStop(false);
      // }, MANUAL_STOP_DELAY);
      console.log("Button clicked with session active.");
    } else {
      // Manual start: start session and disable auto wake word during session.
      // setDetected(true);
      handleStartStopClick();
      setManualStop(false);
      playSound("/sounds/on-wakeword.mp3");
      startSession();
      console.log("Button clicked with session INACTIVE.");
      // setAutoWakeWordEnabled(false);
    }
  }, [isSessionActive, handleStartStopClick]);

  useEffect(() => {
    startWakeWord();
    return () => {};
  }, []);

  // Play app initialization sound when AppContent mounts
  useEffect(() => {
    // Add a small delay before playing the initial sound
    const timer = setTimeout(() => {
      playSound("/sounds/app-init.mp3");
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  // Play sounds on session state change
  useEffect(() => {
    if (!isSessionActive && justReinitialized) {
      playSound("/sounds/session-end.mp3");
    }
    if (isSessionActive) {
      playSound("/sounds/session-start.mp3");
      prevSessionActiveRef.current = isSessionActive;
    }
  }, [isSessionActive]);

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
