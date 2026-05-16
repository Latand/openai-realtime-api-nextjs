"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { playSound } from "@/lib/tools";
import { addCostLog, PRICING } from "@/lib/cost-tracker";
import {
  OPENAI_REALTIME_TRANSCRIPTION_MODEL,
} from "@/lib/openai-models";

const REALTIME_WHISPER_COMMIT_INTERVAL_MS = 1200;
const REALTIME_WHISPER_MIN_COMMIT_GAP_MS = 800;

function isIgnorableCommitError(apiError?: { code?: string; message?: string }) {
  const code = (apiError?.code || "").toLowerCase();
  const message = (apiError?.message || "").toLowerCase();
  const mentionsInputBuffer =
    code.includes("input_audio_buffer") || message.includes("audio buffer");
  return (
    mentionsInputBuffer &&
    (message.includes("empty") ||
      message.includes("too small") ||
      message.includes("no audio") ||
      message.includes("minimum"))
  );
}

interface UseRealtimeTranscriptionReturn {
  isActive: boolean;
  isConnecting: boolean;
  transcription: string;
  interimTranscription: string;
  error: string | null;
  currentVolume: number;
  recordingDuration: number;
  start: () => Promise<void>;
  stop: () => void;
  stopAndGetText: () => Promise<string>;
  clear: () => void;
}

/**
 * Real-time transcription using OpenAI Realtime API.
 * Uses transcription-only mode (no AI responses).
 */
export default function useRealtimeTranscription(
  selectedMicrophoneId?: string
): UseRealtimeTranscriptionReturn {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [interimTranscription, setInterimTranscription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const isStoppingRef = useRef(false);
  const transcriptionRef = useRef<string>("");
  const interimRef = useRef<string>("");
  const transcriptDeltasRef = useRef<Record<string, string>>({});
  const startedAtRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  const lastLoggedDurationRef = useRef(0);
  const commitIntervalRef = useRef<number | null>(null);
  const lastCommitAtRef = useRef(0);
  
  // Volume analysis
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    transcriptionRef.current = transcription;
  }, [transcription]);

  useEffect(() => {
    interimRef.current = interimTranscription;
  }, [interimTranscription]);

  // Sync state with overlay window
  useEffect(() => {
    window.electron?.transcription?.updateState?.({
      isListening: isConnecting || isActive,
      isRecording: false,
      isProcessing: false,
      recordingDuration,
    });
  }, [isActive, isConnecting, recordingDuration]);

  /**
   * Fetch ephemeral token from the session endpoint
   */
  const getEphemeralToken = useCallback(async () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (process.env.NEXT_PUBLIC_SESSION_SECRET) {
      headers["x-session-secret"] = process.env.NEXT_PUBLIC_SESSION_SECRET;
    }
    const response = await fetch("/api/session", {
      method: "POST",
      headers,
      body: JSON.stringify({ mode: "transcription" }),
    });
    if (!response.ok) {
      const details = await response.json().catch(() => null);
      throw new Error(details?.details || details?.error || `Failed to get ephemeral token: ${response.status}`);
    }
    const data = await response.json();
    return data.value || data.client_secret?.value;
  }, []);

  const commitAudioBuffer = useCallback((reason: string, force = false) => {
    const dataChannel = dataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== "open") return false;

    const now = Date.now();
    if (!force && now - lastCommitAtRef.current < REALTIME_WHISPER_MIN_COMMIT_GAP_MS) {
      return false;
    }

    dataChannel.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    lastCommitAtRef.current = now;
    console.log("[RealtimeTranscription] Audio commit sent:", reason);
    return true;
  }, []);

  const stopCommitLoop = useCallback(() => {
    if (commitIntervalRef.current) {
      clearInterval(commitIntervalRef.current);
      commitIntervalRef.current = null;
    }
  }, []);

  const startCommitLoop = useCallback(() => {
    stopCommitLoop();
    commitIntervalRef.current = window.setInterval(() => {
      commitAudioBuffer("periodic");
    }, REALTIME_WHISPER_COMMIT_INTERVAL_MS);
  }, [commitAudioBuffer, stopCommitLoop]);

  /**
   * Handle messages from the data channel
   */
  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);

      // Log all events for debugging
      if (msg.type !== "response.audio.delta" && msg.type !== "response.audio_transcript.delta") {
        console.log("[RealtimeTranscription] Event:", msg.type, msg);
      }

      switch (msg.type) {
        case "session.created":
        case "session.updated":
        case "transcription_session.created":
        case "transcription_session.updated":
          console.log("[RealtimeTranscription] Session ready");
          break;

        case "input_audio_buffer.speech_started":
          console.log("[RealtimeTranscription] Speech started");
          setInterimTranscription("Listening...");
          break;

        case "input_audio_buffer.speech_stopped":
          console.log("[RealtimeTranscription] Speech stopped");
          setInterimTranscription("Processing...");
          break;

        case "input_audio_buffer.committed":
          console.log("[RealtimeTranscription] Audio committed:", msg.item_id);
          break;

        case "conversation.item.input_audio_transcription.delta": {
          const itemId = msg.item_id || "current";
          const next = `${transcriptDeltasRef.current[itemId] || ""}${msg.delta || ""}`;
          transcriptDeltasRef.current[itemId] = next;
          setInterimTranscription(next || "Transcribing...");
          break;
        }

        case "conversation.item.input_audio_transcription.completed": {
          // Final transcription for this segment
          const itemId = msg.item_id || "current";
          const transcript = (msg.transcript || transcriptDeltasRef.current[itemId] || "").trim();
          console.log("[RealtimeTranscription] Transcription completed:", transcript);
          if (transcript) {
            setTranscription((prev) => {
              const separator = prev ? " " : "";
              return prev + separator + transcript;
            });
          }
          delete transcriptDeltasRef.current[itemId];
          setInterimTranscription("");
          break;
        }

        case "response.created":
        case "response.output_item.added":
        case "response.content_part.added":
        case "response.audio_transcript.delta":
        case "response.audio.delta":
        case "response.audio_transcript.done":
        case "response.audio.done":
        case "response.output_item.done":
        case "response.content_part.done":
        case "response.done":
          // Ignore AI response events - we only care about transcription
          break;

        case "error":
          if (isIgnorableCommitError(msg.error)) {
            console.warn("[RealtimeTranscription] Ignoring empty commit:", msg.error?.message);
            break;
          }
          console.error("[RealtimeTranscription] Error:", msg.error);
          setError(msg.error?.message || "Unknown error");
          break;

        default:
          // Log unknown events
          console.log("[RealtimeTranscription] Unknown event:", msg.type);
          break;
      }
    } catch (err) {
      console.error("[RealtimeTranscription] Parse error:", err);
    }
  }, []);

  /**
   * Send session configuration for transcription-only mode
   */
  const sendSessionConfig = useCallback(() => {
    const dataChannel = dataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== "open") return;

    // The client secret is minted with the transcription config. Keep this as
    // a narrow fallback for sessions that accept runtime updates.
    const sessionUpdate = {
      type: "session.update",
      session: {
        type: "transcription",
        audio: {
          input: {
            noise_reduction: { type: "near_field" },
            transcription: {
              model: OPENAI_REALTIME_TRANSCRIPTION_MODEL,
            },
            turn_detection: null,
          },
        },
      },
    };

    dataChannel.send(JSON.stringify(sessionUpdate));
    console.log("[RealtimeTranscription] Session config sent:", sessionUpdate);
  }, []);

  /**
   * Start real-time transcription
   */
  const start = useCallback(async () => {
    if (isActive || isConnecting) {
      console.warn("[RealtimeTranscription] Already active or connecting");
      return;
    }

    setIsConnecting(true);
    setError(null);
    setRecordingDuration(0);
    lastLoggedDurationRef.current = 0;
    transcriptDeltasRef.current = {};
    isStoppingRef.current = false;

    try {
      // Get microphone access
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
      audioStreamRef.current = stream;

      // Setup audio analysis for volume
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioContextRef.current = audioCtx;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume().catch((err) => {
          console.warn("[RealtimeTranscription] Failed to resume AudioContext:", err);
        });
      }
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      if (volumeIntervalRef.current) clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = window.setInterval(() => {
        if (analyserRef.current) {
          const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteTimeDomainData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const float = (dataArray[i] - 128) / 128;
            sum += float * float;
          }
          const volume = Math.sqrt(sum / dataArray.length);
          setCurrentVolume(volume);
        }
      }, 100);
      startedAtRef.current = Date.now();
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = window.setInterval(() => {
        if (!startedAtRef.current) return;
        setRecordingDuration((Date.now() - startedAtRef.current) / 1000);
      }, 250);

      // Get ephemeral token
      const ephemeralToken = await getEphemeralToken();

      // Create peer connection
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Add audio track
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error("No audio track available");
      }
      pc.addTrack(audioTrack, stream);

      // Create data channel
      const dataChannel = pc.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;

      dataChannel.onopen = () => {
        console.log("[RealtimeTranscription] Data channel open");
        sendSessionConfig();
        startCommitLoop();
        setIsConnecting(false);
        setIsActive(true);
        playSound("/sounds/session-start.mp3");
      };

      dataChannel.onmessage = handleDataChannelMessage;

      dataChannel.onclose = () => {
        console.log("[RealtimeTranscription] Data channel closed");
        if (!isStoppingRef.current) {
          setIsActive(false);
          setIsConnecting(false);
        }
      };

      dataChannel.onerror = (err) => {
        console.error("[RealtimeTranscription] Data channel error:", err);
        setError("Connection error");
      };

      // Create and set offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Connect to the GA Realtime WebRTC endpoint.
      const response = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralToken}`,
          "Content-Type": "application/sdp",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Realtime API error: ${response.status} - ${errorText}`);
      }

      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      console.log("[RealtimeTranscription] Connected");
    } catch (err) {
      console.error("[RealtimeTranscription] Start error:", err);
      setError(err instanceof Error ? err.message : "Failed to start");
      setIsConnecting(false);
      stop();
    }
  }, [
    isActive,
    isConnecting,
    selectedMicrophoneId,
    getEphemeralToken,
    sendSessionConfig,
    startCommitLoop,
    handleDataChannelMessage,
  ]);

  /**
   * Stop transcription and cleanup
   */
  const stop = useCallback(() => {
    isStoppingRef.current = true;
    stopCommitLoop();

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(console.error);
      audioContextRef.current = null;
    }
    
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    setCurrentVolume(0);

    setIsActive(false);
    setIsConnecting(false);
    setInterimTranscription("");
    transcriptDeltasRef.current = {};

    if (!error) {
      playSound("/sounds/session-end.mp3");
    }

    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    if (startedAtRef.current) {
      const duration = (Date.now() - startedAtRef.current) / 1000;
      setRecordingDuration(duration);
      const billableDelta = Math.max(0, duration - lastLoggedDurationRef.current);
      lastLoggedDurationRef.current = duration;
      const minutes = billableDelta / 60;
      if (minutes > 0) {
        const cost = minutes * PRICING[OPENAI_REALTIME_TRANSCRIPTION_MODEL].per_minute;
        addCostLog({
          model: OPENAI_REALTIME_TRANSCRIPTION_MODEL,
          type: "transcription",
          seconds: billableDelta,
          cost,
          metadata: { duration: billableDelta, realtime: true },
        }).catch((err) => console.error("Failed to log realtime transcription cost:", err));
      }
      startedAtRef.current = null;
    }

    console.log("[RealtimeTranscription] Stopped");
  }, [error, stopCommitLoop]);

  /**
   * Stop gracefully, wait for pending transcription, and return final text
   */
  const stopAndGetText = useCallback(async (): Promise<string> => {
    // First, mute the audio track to stop sending new audio
    if (audioStreamRef.current) {
      audioStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
    if (dataChannelRef.current?.readyState === "open") {
      commitAudioBuffer("stop", true);
    }

    // Wait for any pending transcription to complete (interim becomes empty)
    // Max wait 5 seconds
    const startWait = Date.now();
    while (interimRef.current && Date.now() - startWait < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Get the final text before closing
    const pendingText = interimRef.current && !["Listening...", "Processing..."].includes(interimRef.current)
      ? interimRef.current.trim()
      : "";
    const finalText = pendingText && !transcriptionRef.current.endsWith(pendingText)
      ? `${transcriptionRef.current}${transcriptionRef.current ? " " : ""}${pendingText}`
      : transcriptionRef.current;

    // Now close everything
    stop();

    return finalText;
  }, [commitAudioBuffer, stop]);

  /**
   * Clear transcription text
   */
  const clear = useCallback(() => {
    setTranscription("");
    setInterimTranscription("");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    isActive,
    isConnecting,
    transcription,
    interimTranscription,
    error,
    currentVolume,
    recordingDuration,
    start,
    stop,
    stopAndGetText,
    clear,
  };
}
