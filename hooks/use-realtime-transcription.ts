"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { playSound } from "@/lib/tools";

interface UseRealtimeTranscriptionReturn {
  isActive: boolean;
  isConnecting: boolean;
  transcription: string;
  interimTranscription: string;
  error: string | null;
  currentVolume: number;
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

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const isStoppingRef = useRef(false);
  const transcriptionRef = useRef<string>("");
  const interimRef = useRef<string>("");
  
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
      isRecording: isActive,
      isProcessing: false, // Realtime is always "recording" until stopped, no post-processing phase like Whisper
      recordingDuration: 0 // We don't track duration for Realtime same way as Whisper
    });
  }, [isActive]);

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
      body: JSON.stringify({ voice: "alloy" }), // Voice doesn't matter for transcription
    });
    if (!response.ok) {
      throw new Error(`Failed to get ephemeral token: ${response.status}`);
    }
    const data = await response.json();
    return data.client_secret.value;
  }, []);

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

        case "conversation.item.input_audio_transcription.completed":
          // Final transcription for this segment
          const transcript = msg.transcript || "";
          console.log("[RealtimeTranscription] Transcription completed:", transcript);
          if (transcript.trim()) {
            setTranscription((prev) => {
              const separator = prev ? " " : "";
              return prev + separator + transcript.trim();
            });
          }
          setInterimTranscription("");
          break;

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

    // We need server_vad for transcription to work (it commits audio buffers)
    // The AI will respond but we simply ignore its audio output
    const sessionUpdate = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        // Enable transcription
        input_audio_transcription: {
          model: "whisper-1",
        },
        // Use VAD so audio gets committed and transcribed
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500, // Short silence to get quick transcriptions
        },
        // Minimal instructions - AI will respond but we mute its audio
        instructions: "You are a transcription assistant. Simply acknowledge with a very brief 'OK' or stay silent.",
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
          setCurrentVolume(Math.sqrt(sum / dataArray.length));
        }
      }, 100);

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
      pc.addTransceiver(audioTrack, { direction: "sendrecv" });

      // Create dummy video track (required by API)
      const dummyCanvas = document.createElement("canvas");
      dummyCanvas.width = 640;
      dummyCanvas.height = 480;
      const ctx = dummyCanvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, dummyCanvas.width, dummyCanvas.height);
      }
      const dummyStream = dummyCanvas.captureStream(1);
      const videoTrack = dummyStream.getVideoTracks()[0];
      pc.addTransceiver(videoTrack, { direction: "sendrecv" });

      // Create data channel
      const dataChannel = pc.createDataChannel("response");
      dataChannelRef.current = dataChannel;

      dataChannel.onopen = () => {
        console.log("[RealtimeTranscription] Data channel open");
        sendSessionConfig();
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

      // Connect to Realtime API
      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-realtime";
      const response = await fetch(`${baseUrl}?model=${model}&voice=alloy`, {
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
  }, [isActive, isConnecting, selectedMicrophoneId, getEphemeralToken, sendSessionConfig, handleDataChannelMessage]);

  /**
   * Stop transcription and cleanup
   */
  const stop = useCallback(() => {
    isStoppingRef.current = true;

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

    if (!error) {
      playSound("/sounds/session-end.mp3");
    }

    console.log("[RealtimeTranscription] Stopped");
  }, [error]);

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

    // Wait for any pending transcription to complete (interim becomes empty)
    // Max wait 5 seconds
    const startWait = Date.now();
    while (interimRef.current && Date.now() - startWait < 5000) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Get the final text before closing
    const finalText = transcriptionRef.current;

    // Now close everything
    stop();

    return finalText;
  }, [stop]);

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
    start,
    stop,
    stopAndGetText,
    clear,
  };
}
