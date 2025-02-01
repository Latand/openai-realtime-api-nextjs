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

  // const initialize = useCallback(async () => {
  //   if (!mountedRef.current) return;
  //   if (initPromiseRef.current) {
  //     return initPromiseRef.current;
  //   }
  //   console.log("[useWakeWord] Starting initialization of Porcupine...");
  //   initPromiseRef.current = (async () => {
  //     try {
  //       await init(config.accessKey, config.keywords, config.porcupineModel);
  //       if (!mountedRef.current) return;
  //       setIsReady(true);
  //       console.log("[useWakeWord] Porcupine initialized successfully.");
  //     } catch (err) {
  //       console.error(
  //         "[useWakeWord] Failed to initialize wake word detection:",
  //         err
  //       );
  //       setIsReady(false);
  //       throw err;
  //     }
  //   })();
  //   return initPromiseRef.current;
  // }, [init, config]);

  // const initWakeWord = useCallback(async () => {
  //   console.log("[useWakeWord] initWakeWord called.");
  //   if (!mountedRef.current) {
  //     console.log(
  //       "[useWakeWord] Component is unmounted. Exiting initWakeWord."
  //     );
  //     return;
  //   }
  //   if (!isReady) {
  //     console.log("[useWakeWord] Not ready. Initializing...");
  //     await initialize();
  //   }
  //   if (!isListening) {
  //     console.log("[useWakeWord] Starting Porcupine listener.");
  //     await startPorcupine();
  //   } else {
  //     console.log("[useWakeWord] Porcupine is already listening.");
  //   }
  // }, [isReady, isListening, initialize, startPorcupine]);

  // const stop = useCallback(async () => {
  //   if (isListening) {
  //     console.log("[useWakeWord] Stopping Porcupine listener.");
  //     await stopPorcupine();
  //     release();
  //     setIsReady(false);
  //     // Clear the initialization promise to force a fresh initialization next time.
  //     initPromiseRef.current = null;
  //     console.log("[useWakeWord] Porcupine stopped and resources released.");
  //   } else {
  //     console.log("[useWakeWord] Porcupine is not listening. No need to stop.");
  //   }
  // }, [isListening, stopPorcupine, release]);

  // useEffect(() => {
  //   mountedRef.current = true;
  //   console.log("[useWakeWord] Component mounted.");
  //   return () => {
  //     console.log("[useWakeWord] Component unmounting. Cleaning up...");
  //     mountedRef.current = false;
  //     initPromiseRef.current = null;
  //     release();
  //     setIsReady(false);
  //   };
  // }, [release]);

  // Reset previous detection state when engine starts listening.

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
