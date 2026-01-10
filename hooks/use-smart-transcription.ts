"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { playSound } from "@/lib/tools";
import { addCostLog, PRICING } from "@/lib/cost-tracker";
import {
  savePendingTranscription,
  getPendingCount,
} from "@/lib/transcription-storage";
import {
  SmartTranscriptionState,
  SmartTranscriptionStatus,
  UseSmartTranscriptionOptions,
  UseSmartTranscriptionReturn,
  VADConfig,
  TranscriptionChunk,
} from "@/types/smart-transcription";
import { VADProcessor } from "@/lib/audio/vad-processor";
import { AudioChunkManager } from "@/lib/audio/audio-chunk-manager";
import { TRANSCRIPTION_STYLE_HINT } from "@/lib/text-improvement-prompts";
import { nanoid } from "nanoid";
import { toast } from "sonner";

const DEFAULT_VAD_CONFIG: VADConfig = {
  speechThreshold: 0.05, // Increased from 0.02 - less sensitive to background noise
  silenceThreshold: 0.02, // Increased from 0.008 - requires more quiet to detect silence
  pauseDuration: 2000, // 2s pause to trigger transcription
  minRecordingDuration: 500,
};

export function useSmartTranscription({
  pauseDuration = 2000,
  speechThreshold = 0.05,
  silenceThreshold = 0.02,
  deviceId,
  onTranscriptionComplete,
}: UseSmartTranscriptionOptions = {}): UseSmartTranscriptionReturn {
  const [status, setStatus] = useState<SmartTranscriptionStatus>("idle");
  const [transcription, setTranscription] = useState("");
  const [chunks, setChunks] = useState<TranscriptionChunk[]>([]);
  const [currentRMS, setCurrentRMS] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const vadProcessorRef = useRef<VADProcessor | null>(null);
  const chunkManagerRef = useRef<AudioChunkManager | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const statusRef = useRef<SmartTranscriptionStatus>("idle"); // Ref to access current status in callbacks
  const transcriptionRef = useRef(transcription);
  const toggleInFlightRef = useRef(false);
  const onTranscriptionCompleteRef = useRef(onTranscriptionComplete);

  useEffect(() => {
    transcriptionRef.current = transcription;
  }, [transcription]);

  useEffect(() => {
    onTranscriptionCompleteRef.current = onTranscriptionComplete;
  }, [onTranscriptionComplete]);

  // Update ref when state changes
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Build prompt for Whisper with previous context + style hints
  const buildTranscriptionPrompt = useCallback(() => {
    const parts: string[] = [];

    // Add style hint (Whisper uses last 224 tokens, so keep it concise)
    if (TRANSCRIPTION_STYLE_HINT) {
      parts.push(TRANSCRIPTION_STYLE_HINT.trim());
    }

    // Add previous transcription as context (last ~500 chars to stay within token limit)
    const prevText = transcriptionRef.current;
    if (prevText) {
      const contextText = prevText.length > 500 ? prevText.slice(-500) : prevText;
      parts.push(`Previous: ${contextText}`);
    }

    return parts.join("\n\n");
  }, []);

  // Transcribe function
  const transcribeBlob = useCallback(
    async (audioBlob: Blob, durationMs: number): Promise<string | null> => {
      try {
        playSound("/sounds/transcription-processing.mp3");

        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");

        // Add prompt with style + previous context
        const prompt = buildTranscriptionPrompt();
        if (prompt) {
          formData.append("prompt", prompt);
        }

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Transcription failed");
        }

        const data = await response.json();
        let text = data.text?.trim();

        // Filter out common Whisper hallucinations
        const HALLUCINATION_PATTERNS = [
          /дякую за перегляд/i,
          /до зустрічі/i,
          /підписуйтесь/i,
          /thanks for watching/i,
          /subscribe/i,
          /see you next time/i,
          /thank you for listening/i,
          /спасибо за просмотр/i,
          /до свидания/i,
        ];

        if (text && HALLUCINATION_PATTERNS.some(p => p.test(text))) {
          console.warn("[Transcription] Filtered hallucination:", text);
          text = null;
        }

        if (text) {
          const durationSec = durationMs / 1000;
          
          // Log cost
          const minutes = durationSec / 60;
          const cost = minutes * PRICING["whisper-1"].per_minute;
          addCostLog({
            model: "whisper-1",
            type: "transcription",
            seconds: durationSec,
            cost,
            metadata: { duration: durationSec },
          }).catch((e) => console.error("Failed to log cost:", e));

          playSound("/sounds/transcription-finished.mp3");

          // Show cost notification
          const costDisplay = cost < 0.01
            ? `$${cost.toFixed(4)}`
            : `$${cost.toFixed(2)}`;
          toast.info(`Transcription: ${costDisplay}`);

          // Add to chunks
          const newChunk: TranscriptionChunk = {
            id: nanoid(),
            text,
            timestamp: Date.now(),
            duration: durationMs,
          };

          const newTotal = transcriptionRef.current ? transcriptionRef.current + " " + text : text;

          setChunks((prev) => [...prev, newChunk]);
          setTranscription(newTotal);
          onTranscriptionCompleteRef.current?.(text);
          return text;
        }
        return null;
      } catch (err) {
        console.error("Error transcribing:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        toast.error(`Transcription failed: ${errorMessage}`);
        
        // Save for retry
        try {
            await savePendingTranscription(audioBlob, String(err));
        } catch (saveErr) {
            console.error("Failed to save pending:", saveErr);
        }
        return null;
      } finally {
        // If we were processing, go back to listening
        // Use functional update to avoid stale closure/race conditions
        setStatus((prev) => {
          if (prev === "processing") {
            return "listening";
          }
          return prev;
        });
      }
    },
    [buildTranscriptionPrompt]
  );

  const start = useCallback(async () => {
    try {
      if (statusRef.current !== "idle" || toggleInFlightRef.current) return;
      toggleInFlightRef.current = true;

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      if (deviceId) {
        audioConstraints.deviceId = { exact: deviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      streamRef.current = stream;

      // Initialize processors
      const config = {
        ...DEFAULT_VAD_CONFIG,
        pauseDuration,
        speechThreshold,
        silenceThreshold,
      };
      
      const vadProcessor = new VADProcessor(config);
      const chunkManager = new AudioChunkManager();

      vadProcessor.onRmsChange = (rms) => {
        setCurrentRMS(rms);
      };

      vadProcessor.onSpeechStart = () => {
        console.log("[Hook] Speech started");
        setStatus("recording");
        // chunkManager is already recording continuously
      };

      vadProcessor.onSpeechEnd = async () => {
        console.log("[Hook] Speech ended, processing...");
        setStatus("processing");

        const audioBlob = await chunkManager.getAccumulatedAudio();
        // Check if blob is empty or too small
        if (audioBlob.size < 100) {
            console.warn("[Hook] Audio blob too small, skipping transcription");
            setStatus("listening");
            chunkManager.clear();
            return;
        }

        const duration = 2000; // Estimated or placeholder

        chunkManager.clear();
        
        // Process in background
        transcribeBlob(audioBlob, duration);
      };

      vadProcessor.connect(stream);
      chunkManager.startRecording(stream);
      vadProcessor.start();

      vadProcessorRef.current = vadProcessor;
      chunkManagerRef.current = chunkManager;

      setStatus("listening");
      playSound("/sounds/session-start.mp3");
      setError(null);
    } catch (err) {
      console.error("Failed to start smart transcription:", err);
      setError(String(err));
    } finally {
      toggleInFlightRef.current = false;
    }
  }, [deviceId, pauseDuration, speechThreshold, silenceThreshold, transcribeBlob]);

  const stop = useCallback(async (): Promise<string> => {
    if (statusRef.current === "idle" || toggleInFlightRef.current) return transcriptionRef.current;
    toggleInFlightRef.current = true;
    try {
      vadProcessorRef.current?.stop();
      vadProcessorRef.current?.disconnect();
      
      let finalChunkText: string | null = null;

      // Process any remaining audio if it's substantial?
      // The plan says: "Send remaining audio... if audio.size > minSize"
      if (chunkManagerRef.current) {
          const audioBlob = await chunkManagerRef.current.stopAndGetAudio();
          if (audioBlob.size > 10000) { // arbitrary small size check (~few kb)
               // Maybe don't transcribe automatically on stop to avoid noise?
               // But if user was speaking and pressed stop, they probably want it.
               // Let's try to transcribe.
               setStatus("processing");
               finalChunkText = await transcribeBlob(audioBlob, 1000);
          }
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      vadProcessorRef.current = null;
      chunkManagerRef.current = null;

      setStatus("idle");
      setCurrentRMS(0);
      playSound("/sounds/session-end.mp3");

      let finalText = transcriptionRef.current;
      if (finalChunkText) {
          finalText = finalText ? finalText + " " + finalChunkText : finalChunkText;
      }
      return finalText;
    } finally {
      toggleInFlightRef.current = false;
    }
  }, [transcribeBlob]);

  const toggle = useCallback(async () => {
    if (statusRef.current === "idle") {
      await start();
    } else {
      await stop();
    }
  }, [start, stop]);

  const clear = useCallback(() => {
    setTranscription("");
    setChunks([]);
    setError(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (statusRef.current !== "idle") {
        stop();
      }
    };
  }, [stop]);

  return {
    state: {
      status,
      transcription,
      chunks,
      currentRMS,
      error,
    },
    isActive: status !== "idle",
    toggle,
    start,
    stop,
    clear,
  };
}
