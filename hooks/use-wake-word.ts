import { useState, useEffect, useCallback, useRef } from "react";
import { usePorcupine } from "@picovoice/porcupine-react";
import { PorcupineKeyword } from "@picovoice/porcupine-web";

export interface WakeWordConfig {
  sessionActive: boolean;
  onWakeWord?: () => void;
  porcupineModel: {
    publicPath: string;
    customWritePath: string;
    forceWrite: boolean;
  };
  keywords: PorcupineKeyword[];
  accessKey: string;
}

export function useWakeWord(config: WakeWordConfig) {
  const [isReady, setIsReady] = useState(false);
  const [detected, setDetected] = useState<boolean>(false);

  const {
    init,
    release,
    start: startPorcupine,
    stop: stopPorcupine,
    isListening,
    error,
    keywordDetection,
  } = usePorcupine();

  // Initial initialization on mount
  useEffect(() => {
    const initializeEngine = async () => {
      try {
        await init(config.accessKey, config.keywords, config.porcupineModel);
        await startPorcupine();
      } catch (err) {
        console.error("Error initializing Porcupine:", err);
      }
    };

    initializeEngine();

    // Cleanup on unmount
    return () => {
      release();
    };
  }, [init, startPorcupine, release]);

  // Function to completely reinitialize the engine
  const reinitializeEngine = async () => {
    try {
      // First release current resources
      await stopPorcupine();
      // Then initialize and start detection again
      // await init(config.accessKey, config.keywords, config.porcupineModel);
      await startPorcupine();
      setIsReady(true);
      console.log("[useWakeWord] Porcupine reinitialized successfully.");
    } catch (err) {
      console.error("Error reinitializing Porcupine:", err);
    }
  };

  // Call onWakeWord on a fresh detection (transition from false to true).
  useEffect(() => {
    const detected = Boolean(keywordDetection);
    if (!isListening) return;
    console.log(`Keyword detection: ${JSON.stringify(keywordDetection)}`);
    if (detected && config.onWakeWord) {
      console.log(
        "[useWakeWord] Fresh wake word detected. Calling onWakeWord callback."
      );
      config.onWakeWord();
    }
    setDetected(false);
  }, [keywordDetection]);

  return {
    startPorcupine,
    stopPorcupine,
    isReady,
    isListening,
    error,
    reinitializeEngine,
    release,
    detected,
  };
}
