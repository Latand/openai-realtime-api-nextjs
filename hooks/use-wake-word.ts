import { useState, useEffect, useCallback, useRef } from "react";
import { usePorcupine } from "@picovoice/porcupine-react";
import { PorcupineKeyword } from "@picovoice/porcupine-web";

export interface WakeWordConfig {
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

  // We only want to call init() once, so we store a promise reference
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  const {
    init,
    release,
    start: startPorcupine,
    stop: stopPorcupine,
    isListening,
    error,
    keywordDetection,
  } = usePorcupine();

  // Initialize porcupine
  const initialize = useCallback(async () => {
    if (!mountedRef.current) return;
    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    initPromiseRef.current = (async () => {
      try {
        await init(config.accessKey, config.keywords, config.porcupineModel);
        if (!mountedRef.current) return;
        setIsReady(true);
      } catch (err) {
        console.error("Failed to initialize wake word detection:", err);
        setIsReady(false);
        throw err;
      }
    })();

    return initPromiseRef.current;
  }, [init, config]);

  // Start detection
  const start = useCallback(async () => {
    if (!mountedRef.current) return;

    // If not ready, init first
    if (!isReady) {
      await initialize();
    }

    // Once ready, or after init, if not listening -> start
    if (!isListening) {
      await startPorcupine();
    }
  }, [isReady, isListening, startPorcupine, initialize]);

  // Stop detection
  const stop = useCallback(async () => {
    if (isListening) {
      await stopPorcupine();
    }
  }, [isListening, stopPorcupine]);

  // On mount/unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      initPromiseRef.current = null;
      release();
      setIsReady(false);
    };
  }, [release]);

  // Listen for detection
  useEffect(() => {
    if (!mountedRef.current || !isReady) return;

    if (keywordDetection && config.onWakeWord) {
      config.onWakeWord();
    }
  }, [keywordDetection, isReady, config]);

  return {
    start,
    stop,
    isReady,
    isListening,
    error,
  };
}
