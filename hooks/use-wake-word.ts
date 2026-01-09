import { useState, useEffect, useRef, useCallback } from "react";
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
  deviceId?: string;
}

export function useWakeWord(config: WakeWordConfig) {
  const [isReady, setIsReady] = useState(false);
  const [detected, setDetected] = useState(false);
  const initCalledRef = useRef(false);
  const currentDeviceIdRef = useRef<string | undefined>(config.deviceId);

  const {
    init,
    start,
    stop,
    release,
    isListening,
    isLoaded,
    error,
    keywordDetection,
  } = usePorcupine();

  // Initialize on first user interaction
  useEffect(() => {
    if (!config.accessKey || !config.enabled) return;

    const handleInteraction = async () => {
      if (initCalledRef.current) return;
      initCalledRef.current = true;

      console.log("[useWakeWord] User interacted, initializing Porcupine...");

      try {
        await init(config.accessKey, config.keywords, config.porcupineModel);
        console.log("[useWakeWord] init() done, isLoaded should be true now");
      } catch (err) {
        console.error("[useWakeWord] init failed:", err);
        initCalledRef.current = false;
      }
    };

    window.addEventListener("click", handleInteraction, { once: true });
    return () => window.removeEventListener("click", handleInteraction);
  }, [config.accessKey, config.enabled, config.keywords, config.porcupineModel, init]);

  // Start listening when loaded and enabled
  useEffect(() => {
    if (!isLoaded) {
      console.log("[useWakeWord] Not loaded yet, isLoaded:", isLoaded);
      return;
    }

    const shouldListen = config.enabled && !config.sessionActive;
    console.log("[useWakeWord] isLoaded:", isLoaded, "shouldListen:", shouldListen, "isListening:", isListening);

    // Check if device changed while listening
    const deviceChanged = currentDeviceIdRef.current !== config.deviceId;
    if (deviceChanged && isListening) {
      console.log("[useWakeWord] Device changed, restarting with new device:", config.deviceId);
      currentDeviceIdRef.current = config.deviceId;
      stop().then(() => {
        const startOptions = config.deviceId ? { deviceId: config.deviceId } : undefined;
        return start(startOptions);
      }).then(() => {
        console.log("[useWakeWord] Restarted with new device");
      }).catch(err => {
        console.error("[useWakeWord] restart error:", err);
      });
      return;
    }

    if (shouldListen && !isListening) {
      console.log("[useWakeWord] Starting with deviceId:", config.deviceId);
      currentDeviceIdRef.current = config.deviceId;
      const startOptions = config.deviceId ? { deviceId: config.deviceId } : undefined;
      start(startOptions).then(() => {
        console.log("[useWakeWord] start() resolved");
        setIsReady(true);
      }).catch(err => {
        console.error("[useWakeWord] start() error:", err);
      });
    } else if (!shouldListen && isListening) {
      console.log("[useWakeWord] Stopping...");
      stop().then(() => {
        console.log("[useWakeWord] stop() resolved");
        setIsReady(false);
      }).catch(err => {
        console.error("[useWakeWord] stop() error:", err);
      });
    }
  }, [isLoaded, config.enabled, config.sessionActive, config.deviceId, isListening, start, stop]);

  // Handle keyword detection with debounce
  const lastDetectionRef = useRef<number>(0);
  useEffect(() => {
    if (keywordDetection) {
      const now = Date.now();
      // Ignore detections within 2 seconds of last one
      if (now - lastDetectionRef.current < 2000) {
        console.log("[useWakeWord] Ignoring rapid detection");
        return;
      }
      lastDetectionRef.current = now;

      console.log("[useWakeWord] Keyword detected:", keywordDetection);
      setDetected(true);
      config.onWakeWord?.();
      const timer = setTimeout(() => setDetected(false), 800);
      return () => clearTimeout(timer);
    }
  }, [keywordDetection, config.onWakeWord]);

  // Debug state
  useEffect(() => {
    console.log("[useWakeWord] State:", { isLoaded, isListening, isReady, error: error?.message });
  }, [isLoaded, isListening, isReady, error]);

  return {
    startPorcupine: start,
    stopPorcupine: stop,
    isReady,
    isListening,
    error,
    reinitializeEngine: async () => {
      initCalledRef.current = false;
    },
    detected,
  };
}
