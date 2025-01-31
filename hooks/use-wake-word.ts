import { useEffect, useState, useCallback, useRef } from "react";
import { usePorcupine } from "@picovoice/porcupine-react";
import { PorcupineKeyword } from "@picovoice/porcupine-web";
// Get access key from environment variable
const ACCESS_KEY = process.env.NEXT_PUBLIC_PICOVOICE_ACCESS_KEY || "";

if (!ACCESS_KEY) {
  throw new Error(
    "NEXT_PUBLIC_PICOVOICE_ACCESS_KEY is not set in environment variables"
  );
}

// Sound effects with debounce to prevent multiple plays
let lastPlayTime = 0;
const DEBOUNCE_TIME = 1000; // 1 second

const playSound = async (soundName: string) => {
  const now = Date.now();
  if (now - lastPlayTime < DEBOUNCE_TIME) {
    console.log("Debouncing sound play:", soundName);
    return;
  }

  lastPlayTime = now;
  const audio = new Audio(`/sounds/${soundName}`);
  try {
    await audio.play();
  } catch (error) {
    console.error(`Failed to play sound ${soundName}:`, error);
  }
};

export type WakeWordConfig = {
  onWakeWord?: () => void;
  porcupineModel: {
    publicPath: string;
    customWritePath: string;
    forceWrite: boolean;
  };
  keywords: PorcupineKeyword[];
  accessKey: string;
};

export function useWakeWord(config: WakeWordConfig) {
  const [isReady, setIsReady] = useState(false);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);

  const {
    init,
    start: startPorcupine,
    stop: stopPorcupine,
    release,
    isLoaded,
    isListening,
    error,
    keywordDetection,
  } = usePorcupine();

  // Handle wake word detection
  useEffect(() => {
    if (!keywordDetection || !isReady || !mountedRef.current) return;

    console.log("🎯 Wake word detected:", keywordDetection.label);

    if (config.onWakeWord) {
      playSound("init_beep.mp3").then(() => {
        if (mountedRef.current) {
          config.onWakeWord?.();
        }
      });
    }
  }, [keywordDetection, config, isReady]);

  const initialize = useCallback(async () => {
    if (!mountedRef.current) return;
    if (initPromiseRef.current) return initPromiseRef.current;

    const initPromise = (async () => {
      try {
        console.log("🎤 Initializing wake word detection...");
        await init(config.accessKey, config.keywords, config.porcupineModel);

        if (!mountedRef.current) return;

        await startPorcupine();
        console.log("✅ Wake word detection initialized successfully");

        if (mountedRef.current) {
          setIsReady(true);
        }
      } catch (err) {
        console.error("❌ Failed to initialize wake word detection:", err);
        if (mountedRef.current) {
          setIsReady(false);
        }
        throw err;
      }
    })();

    initPromiseRef.current = initPromise;
    return initPromise;
  }, [init, startPorcupine, config]);

  const start = useCallback(async () => {
    if (!mountedRef.current) return;

    if (!isReady) {
      await initialize();
      return;
    }

    if (isListening) return;

    try {
      console.log("🎤 Starting wake word detection...");
      await startPorcupine();
      console.log("✅ Wake word detection started");
    } catch (err) {
      console.error("❌ Failed to start wake word detection:", err);
      throw err;
    }
  }, [isReady, isListening, startPorcupine, initialize]);

  const stop = useCallback(async () => {
    if (!isListening) return;

    try {
      console.log("🛑 Stopping wake word detection...");
      await stopPorcupine();
      console.log("✅ Wake word detection stopped");
    } catch (err) {
      console.error("❌ Failed to stop wake word detection:", err);
    }
  }, [isListening, stopPorcupine]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (isListening) {
        stopPorcupine().catch(console.error);
      }
      release();
      setIsReady(false);
      initPromiseRef.current = null;
    };
  }, [isListening, stopPorcupine, release]);

  return {
    start,
    stop,
    isReady,
    isListening,
    error,
  };
}
