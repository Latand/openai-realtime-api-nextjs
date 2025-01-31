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
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const [prevKeywordDetection, setPrevKeywordDetection] =
    useState<boolean>(false);

  const {
    init,
    release,
    start: startPorcupine,
    stop: stopPorcupine,
    isListening,
    error,
    keywordDetection,
  } = usePorcupine();

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

  const start = useCallback(async () => {
    if (!mountedRef.current) return;
    if (!isReady) {
      await initialize();
    }
    if (!isListening) {
      await startPorcupine();
    }
  }, [isReady, isListening, startPorcupine, initialize]);

  const stop = useCallback(async () => {
    if (isListening) {
      await stopPorcupine();
      release();
      setIsReady(false);
      // Clear the initialization promise to force a fresh initialization next time.
      initPromiseRef.current = null;
    }
  }, [isListening, stopPorcupine, release]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      initPromiseRef.current = null;
      release();
      setIsReady(false);
    };
  }, [release]);

  // Reset previous detection state when engine starts listening.
  useEffect(() => {
    if (isListening) {
      setPrevKeywordDetection(false);
    }
  }, [isListening]);

  // Call onWakeWord on a fresh detection (transition from false to true).
  useEffect(() => {
    if (!mountedRef.current || !isReady) return;
    const detected = Boolean(keywordDetection);
    if (!prevKeywordDetection && detected && config.onWakeWord) {
      config.onWakeWord();
    }
    setPrevKeywordDetection(detected);
  }, [keywordDetection, isReady, config, prevKeywordDetection]);

  return {
    start,
    stop,
    isReady,
    isListening,
    error,
  };
}
