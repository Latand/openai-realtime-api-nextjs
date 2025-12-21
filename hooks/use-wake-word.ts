import { useState, useEffect, useRef } from "react";
import { usePorcupine } from "@picovoice/porcupine-react";
import { PorcupineKeyword } from "@picovoice/porcupine-web";

export interface WakeWordConfig {
  enabled: boolean;
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
  const isInitializingRef = useRef(false);
  const isInitializedRef = useRef(false);

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
    let cancelled = false;
    const initializeEngine = async () => {
      try {
        if (!config.enabled) {
          setIsReady(false);
          isInitializedRef.current = false;
          return;
        }
        if (!config.accessKey || config.keywords.length === 0) {
          setIsReady(false);
          isInitializedRef.current = false;
          return;
        }
        if (isInitializingRef.current) {
          return;
        }
        isInitializingRef.current = true;
        await init(config.accessKey, config.keywords, config.porcupineModel);
        if (cancelled) return;
        await startPorcupine();
        if (!cancelled) {
          setIsReady(true);
          isInitializedRef.current = true;
        }
      } catch (err) {
        console.error("Error initializing Porcupine:", err);
        if (!cancelled) {
          setIsReady(false);
        }
        isInitializedRef.current = false;
      } finally {
        isInitializingRef.current = false;
      }
    };

    initializeEngine();

    // Cleanup on unmount
    return () => {
      cancelled = true;
      if (isInitializedRef.current) {
        try {
          stopPorcupine();
        } catch (err) {
          console.error("Error stopping Porcupine during cleanup:", err);
        }
      }
      isInitializedRef.current = false;
      release();
    };
  }, [
    config.enabled,
    config.accessKey,
    config.keywords,
    config.porcupineModel,
    init,
    startPorcupine,
    release,
  ]);

  // Function to completely reinitialize the engine
  const reinitializeEngine = async () => {
    try {
      if (!config.enabled) {
        setIsReady(false);
        isInitializedRef.current = false;
        return;
      }
      if (!config.accessKey || config.keywords.length === 0) {
        setIsReady(false);
        isInitializedRef.current = false;
        return;
      }
      if (isInitializingRef.current) {
        return;
      }
      isInitializingRef.current = true;
      // First release current resources
      if (isInitializedRef.current) {
        await stopPorcupine();
      }
      isInitializedRef.current = false;
      // Then initialize and start detection again
      await init(config.accessKey, config.keywords, config.porcupineModel);
      await startPorcupine();
      setIsReady(true);
      isInitializedRef.current = true;
      console.log("[useWakeWord] Porcupine reinitialized successfully.");
    } catch (err) {
      console.error("Error reinitializing Porcupine:", err);
      isInitializedRef.current = false;
    } finally {
      isInitializingRef.current = false;
    }
  };

  const startWakeWord = async () => {
    if (!config.enabled || !isInitializedRef.current) {
      return;
    }
    try {
      await startPorcupine();
    } catch (err) {
      console.error("Error starting Porcupine:", err);
    }
  };

  const stopWakeWord = async () => {
    if (!config.enabled || !isInitializedRef.current) {
      return;
    }
    try {
      await stopPorcupine();
    } catch (err) {
      console.error("Error stopping Porcupine:", err);
    }
  };

  // Call onWakeWord on a fresh detection (transition from false to true).
  useEffect(() => {
    const isDetected = Boolean(keywordDetection);
    if (!isListening) {
      setDetected(false);
      return;
    }
    console.log(`Keyword detection: ${JSON.stringify(keywordDetection)}`);
    if (isDetected) {
      setDetected(true);
      if (config.onWakeWord) {
        console.log(
          "[useWakeWord] Fresh wake word detected. Calling onWakeWord callback."
        );
        config.onWakeWord();
      }
      const timeout = window.setTimeout(() => setDetected(false), 800);
      return () => window.clearTimeout(timeout);
    }
    setDetected(false);
  }, [keywordDetection, isListening, config.onWakeWord]);

  return {
    startPorcupine: startWakeWord,
    stopPorcupine: stopWakeWord,
    isReady,
    isListening,
    error,
    reinitializeEngine,
    release,
    detected,
  };
}
