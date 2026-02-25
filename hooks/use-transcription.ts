"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { playSound } from "@/lib/tools";
import { addCostLog, PRICING } from "@/lib/cost-tracker";
import { TRANSCRIPTION_STYLE_HINT } from "@/lib/text-improvement-prompts";
import {
  savePendingTranscription,
  getPendingTranscription,
  getAllPendingTranscriptions,
  removePendingTranscription,
  updatePendingTranscription,
  getPendingCount,
  type PendingTranscription,
  saveRecentRecording,
  getLatestRecentRecording,
} from "@/lib/transcription-storage";

export interface TranscriptionResult {
  text: string;
  timestamp: string;
  pendingId?: string; // If this was a retry
}

interface UseTranscriptionReturn {
  isRecording: boolean;
  isProcessing: boolean;
  error: string | null;
  pendingCount: number;
  recordingDuration: number; // Duration in seconds
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<TranscriptionResult | null>;
  cancelRecording: () => Promise<void>;
  toggleRecording: () => Promise<TranscriptionResult | null>;
  retryLast: () => Promise<TranscriptionResult | null>;
  retryPending: (id: string) => Promise<TranscriptionResult | null>;
  retryAllPending: () => Promise<TranscriptionResult[]>;
  getPendingTranscriptions: () => Promise<PendingTranscription[]>;
  clearPendingTranscription: (id: string) => Promise<void>;
  analyser: AnalyserNode | null;
}

// Common Whisper hallucinations to filter out
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

export default function useTranscription(
  selectedMicrophoneId?: string
): UseTranscriptionReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const stopInFlightRef = useRef(false);
  const durationIntervalRef = useRef<number | null>(null);
  const isSystemAudioDuckedRef = useRef(false);

  // Sync state with overlay window
  useEffect(() => {
    window.electron?.transcription?.updateState?.({
      isRecording,
      isProcessing,
      recordingDuration
    });
  }, [isRecording, isProcessing, recordingDuration]);

  // Load pending count on mount
  useEffect(() => {
    getPendingCount().then(setPendingCount).catch(console.error);
  }, []);

  const clearDurationInterval = useCallback(() => {
    if (durationIntervalRef.current !== null) {
      window.clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  // Live duration updates while recording (so overlay shows elapsed time).
  useEffect(() => {
    if (!isRecording) {
      clearDurationInterval();
      return;
    }

    clearDurationInterval();
    durationIntervalRef.current = window.setInterval(() => {
      const duration = (Date.now() - recordingStartTimeRef.current) / 1000;
      setRecordingDuration(duration);
    }, 250);

    return () => clearDurationInterval();
  }, [isRecording, clearDurationInterval]);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch (err) {
      console.error("[Transcription] Failed to get pending count:", err);
    }
  }, []);

  const duckSystemAudioForRecording = useCallback(async () => {
    if (isSystemAudioDuckedRef.current) return;

    try {
      const result = await window.electron?.transcription?.duckSystemAudio?.(20, 320);
      if (result?.success) {
        isSystemAudioDuckedRef.current = true;
      } else if (result?.error) {
        console.warn("[Transcription] Failed to duck system audio:", result.error);
      }
    } catch (err) {
      console.warn("[Transcription] Failed to duck system audio:", err);
    }
  }, []);

  const restoreSystemAudioAfterRecording = useCallback(async () => {
    if (!isSystemAudioDuckedRef.current) return;

    try {
      const result = await window.electron?.transcription?.restoreSystemAudio?.(420);
      if (result?.success) {
        isSystemAudioDuckedRef.current = false;
      } else if (result?.error) {
        console.warn("[Transcription] Failed to restore system audio:", result.error);
      }
    } catch (err) {
      console.warn("[Transcription] Failed to restore system audio:", err);
    }
  }, []);

  useEffect(() => {
    return () => {
      void restoreSystemAudioAfterRecording();
    };
  }, [restoreSystemAudioAfterRecording]);

  // Helper to transcribe a blob
  const transcribeBlob = useCallback(
    async (
      audioBlob: Blob,
      pendingId?: string
    ): Promise<{ result: TranscriptionResult | null; error?: string; retryable?: boolean }> => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

      // Add prompt for better transcription
      if (TRANSCRIPTION_STYLE_HINT) {
        formData.append("prompt", TRANSCRIPTION_STYLE_HINT);
      }

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          result: null,
          error: errorData.error || "Transcription failed",
          retryable: errorData.retryable ?? true,
        };
      }

      const data = await response.json();
      let text = data.text?.trim() || "";

      // Filter out hallucinations
      if (text && HALLUCINATION_PATTERNS.some(p => p.test(text))) {
        console.warn("[Transcription] Filtered hallucination:", text);
        text = "";
      }

      return {
        result: {
          text,
          timestamp: new Date().toISOString(),
          pendingId,
        },
      };
    },
    []
  );

  const startRecording = useCallback(async () => {
    await duckSystemAudioForRecording();

    try {
      setError(null);

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      if (selectedMicrophoneId) {
        audioConstraints.deviceId = { exact: selectedMicrophoneId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      streamRef.current = stream;
      
      // Setup Analyser for visualization
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = 2048;
      source.connect(analyserNode);
      
      audioContextRef.current = audioContext;
      setAnalyser(analyserNode);

      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // Collect data every 100ms

      recordingStartTimeRef.current = Date.now();
      setRecordingDuration(0);
      setIsRecording(true);
      playSound("/sounds/session-start.mp3");
    } catch (err) {
      console.error("Error starting recording:", err);
      setError(`Failed to start recording: ${err}`);
      await restoreSystemAudioAfterRecording();
    }
  }, [
    duckSystemAudioForRecording,
    restoreSystemAudioAfterRecording,
    selectedMicrophoneId,
  ]);

  const stopAndCollectAudio = useCallback(async (): Promise<{ audioBlob: Blob; duration: number } | null> => {
    const mediaRecorder = mediaRecorderRef.current;
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      return null;
    }
    if (stopInFlightRef.current) {
      return null;
    }
    stopInFlightRef.current = true;

    // Stop live duration timer immediately (we'll compute final duration on stop).
    clearDurationInterval();

    return new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        // Calculate recording duration
        const duration = (Date.now() - recordingStartTimeRef.current) / 1000;
        setRecordingDuration(duration);

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Clean up AudioContext
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(console.error);
          audioContextRef.current = null;
        }
        setAnalyser(null);

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm;codecs=opus",
        });

        mediaRecorderRef.current = null;
        stopInFlightRef.current = false;
        resolve({ audioBlob, duration });
      };

      mediaRecorder.stop();
    });
  }, [clearDurationInterval]);

  const stopRecording = useCallback(async (): Promise<TranscriptionResult | null> => {
    setError(null);

    // Transition UI immediately: stop recording, start processing.
    setIsRecording(false);
    setIsProcessing(true);

    // Play sound to indicate recording stopped, now processing
    playSound("/sounds/transcription-processing.mp3");

    try {
      const collected = await stopAndCollectAudio();
      if (!collected) {
        setIsProcessing(false);
        return null;
      }

      const { audioBlob, duration } = collected;

      // Always keep the last Whisper recording around for "Retry last" (even on success).
      saveRecentRecording(audioBlob, { kind: "whisper", durationSeconds: duration }).catch((err) => {
        console.warn("[Transcription] Failed to save recent recording:", err);
      });

      try {
        const { result, error: transcriptionError, retryable } = await transcribeBlob(audioBlob);

        if (result) {
          // Log cost
          const minutes = duration / 60;
          const cost = minutes * PRICING['whisper-1'].per_minute;
          addCostLog({
              model: 'whisper-1',
              type: 'transcription',
              seconds: duration,
              cost,
              metadata: { duration }
          }).catch(e => console.error("Failed to log cost:", e));

          playSound("/sounds/transcription-finished.mp3");
          setIsProcessing(false);
          return result;
        }

        // Transcription failed
        if (retryable) {
          // Save for retry
          const savedId = await savePendingTranscription(audioBlob, transcriptionError);
          console.log("[Transcription] Saved for retry:", savedId);
          await refreshPendingCount();
          playSound("/sounds/session-end.mp3");
          setError(`Transcription failed, saved for retry: ${transcriptionError}`);
        } else {
          setError(`Transcription failed: ${transcriptionError}`);
        }
        setIsProcessing(false);
        return null;
      } catch (err) {
        console.error("Error transcribing:", err);
        // Save for retry on unexpected errors
        try {
          const savedId = await savePendingTranscription(audioBlob, String(err));
          console.log("[Transcription] Saved for retry after error:", savedId);
          await refreshPendingCount();
        } catch (saveErr) {
          console.error("[Transcription] Failed to save for retry:", saveErr);
        }
        setError(`Transcription failed: ${err}`);
        setIsProcessing(false);
        return null;
      }
    } finally {
      await restoreSystemAudioAfterRecording();
    }
  }, [
    refreshPendingCount,
    restoreSystemAudioAfterRecording,
    stopAndCollectAudio,
    transcribeBlob,
  ]);

  const cancelRecording = useCallback(async (): Promise<void> => {
    setError(null);

    // Stop recording UI immediately and do NOT enter processing.
    setIsRecording(false);
    setIsProcessing(false);

    try {
      const collected = await stopAndCollectAudio();
      if (!collected) return;

      // Intentionally do not transcribe and do not save into "recent" cache.
      playSound("/sounds/session-end.mp3");
    } finally {
      await restoreSystemAudioAfterRecording();
    }
  }, [restoreSystemAudioAfterRecording, stopAndCollectAudio]);

  const toggleRecording = useCallback(async (): Promise<TranscriptionResult | null> => {
    if (isRecording) {
      return await stopRecording();
    } else {
      await startRecording();
      return null;
    }
  }, [isRecording, startRecording, stopRecording]);

  // Retry the most recent Whisper recording (even if the last attempt succeeded but quality was bad).
  const retryLast = useCallback(async (): Promise<TranscriptionResult | null> => {
    setIsProcessing(true);
    setError(null);

    try {
      const recent = await getLatestRecentRecording("whisper");
      if (!recent) {
        setError("No recent recording to retry");
        setIsProcessing(false);
        return null;
      }

      if (typeof recent.durationSeconds === "number") {
        setRecordingDuration(recent.durationSeconds);
      }

      playSound("/sounds/transcription-processing.mp3");

      const { result, error: transcriptionError } = await transcribeBlob(recent.audioBlob);

      if (result) {
        playSound("/sounds/transcription-finished.mp3");
        setIsProcessing(false);
        return result;
      }

      setError(`Retry failed: ${transcriptionError || "Unknown error"}`);
      setIsProcessing(false);
      return null;
    } catch (err) {
      console.error("[Transcription] Error during retryLast:", err);
      setError(`Retry failed: ${err}`);
      setIsProcessing(false);
      return null;
    }
  }, [transcribeBlob]);

  // Retry a specific pending transcription
  const retryPending = useCallback(
    async (id: string): Promise<TranscriptionResult | null> => {
      setIsProcessing(true);
      setError(null);

      try {
        const pending = await getPendingTranscription(id);
        if (!pending) {
          setError("Pending transcription not found");
          setIsProcessing(false);
          return null;
        }

        playSound("/sounds/transcription-processing.mp3");

        const { result, error: transcriptionError, retryable } = await transcribeBlob(
          pending.audioBlob,
          id
        );

        if (result) {
          // Success - remove from pending
          await removePendingTranscription(id);
          await refreshPendingCount();
          playSound("/sounds/transcription-finished.mp3");
          setIsProcessing(false);
          return result;
        } else {
          // Still failing
          await updatePendingTranscription(id, {
            attempts: pending.attempts + 1,
            lastError: transcriptionError,
          });

          if (!retryable) {
            // Non-retryable error, remove it
            await removePendingTranscription(id);
            await refreshPendingCount();
          }

          setError(`Retry failed: ${transcriptionError}`);
          setIsProcessing(false);
          return null;
        }
      } catch (err) {
        console.error("[Transcription] Error during retry:", err);
        setError(`Retry failed: ${err}`);
        setIsProcessing(false);
        return null;
      }
    },
    [transcribeBlob, refreshPendingCount]
  );

  // Retry all pending transcriptions
  const retryAllPending = useCallback(async (): Promise<TranscriptionResult[]> => {
    const results: TranscriptionResult[] = [];
    const pending = await getAllPendingTranscriptions();

    for (const item of pending) {
      const result = await retryPending(item.id);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }, [retryPending]);

  // Clear a specific pending transcription
  const clearPendingTranscription = useCallback(
    async (id: string): Promise<void> => {
      await removePendingTranscription(id);
      await refreshPendingCount();
    },
    [refreshPendingCount]
  );

  return {
    isRecording,
    isProcessing,
    error,
    pendingCount,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
    retryLast,
    retryPending,
    retryAllPending,
    getPendingTranscriptions: getAllPendingTranscriptions,
    clearPendingTranscription,
    analyser,
  };
}
