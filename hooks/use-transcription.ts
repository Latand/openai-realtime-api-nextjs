"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { playSound } from "@/lib/tools";
import {
  savePendingTranscription,
  getPendingTranscription,
  getAllPendingTranscriptions,
  removePendingTranscription,
  updatePendingTranscription,
  getPendingCount,
  type PendingTranscription,
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
  toggleRecording: () => Promise<TranscriptionResult | null>;
  retryPending: (id: string) => Promise<TranscriptionResult | null>;
  retryAllPending: () => Promise<TranscriptionResult[]>;
  getPendingTranscriptions: () => Promise<PendingTranscription[]>;
  clearPendingTranscription: (id: string) => Promise<void>;
}

export default function useTranscription(
  selectedMicrophoneId?: string
): UseTranscriptionReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartTimeRef = useRef<number>(0);

  // Load pending count on mount
  useEffect(() => {
    getPendingCount().then(setPendingCount).catch(console.error);
  }, []);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch (err) {
      console.error("[Transcription] Failed to get pending count:", err);
    }
  }, []);

  // Helper to transcribe a blob
  const transcribeBlob = useCallback(
    async (
      audioBlob: Blob,
      pendingId?: string
    ): Promise<{ result: TranscriptionResult | null; error?: string; retryable?: boolean }> => {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.webm");

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
      return {
        result: {
          text: data.text || "",
          timestamp: new Date().toISOString(),
          pendingId,
        },
      };
    },
    []
  );

  const startRecording = useCallback(async () => {
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
    }
  }, [selectedMicrophoneId]);

  const stopRecording = useCallback(async (): Promise<TranscriptionResult | null> => {
    if (!mediaRecorderRef.current || !isRecording) {
      return null;
    }

    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current!;

      mediaRecorder.onstop = async () => {
        // Calculate recording duration
        const duration = (Date.now() - recordingStartTimeRef.current) / 1000;
        setRecordingDuration(duration);

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Play sound to indicate recording stopped, now processing
        playSound("/sounds/transcription-processing.mp3");

        setIsRecording(false);
        setIsProcessing(true);

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm;codecs=opus",
        });

        try {
          const { result, error: transcriptionError, retryable } = await transcribeBlob(audioBlob);

          if (result) {
            playSound("/sounds/transcription-finished.mp3");
            setIsProcessing(false);
            resolve(result);
          } else {
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
            resolve(null);
          }
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
          resolve(null);
        }
      };

      mediaRecorder.stop();
    });
  }, [isRecording, transcribeBlob, refreshPendingCount]);

  const toggleRecording = useCallback(async (): Promise<TranscriptionResult | null> => {
    if (isRecording) {
      return await stopRecording();
    } else {
      await startRecording();
      return null;
    }
  }, [isRecording, startRecording, stopRecording]);

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
    toggleRecording,
    retryPending,
    retryAllPending,
    getPendingTranscriptions: getAllPendingTranscriptions,
    clearPendingTranscription,
  };
}
