"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { Conversation } from "@/lib/conversations";
import { useTranslations } from "@/components/translations-context";

declare global {
  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}

export interface Tool {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, any>;
  };
}

/**
 * The return type for the hook, matching Approach A
 * (RefObject<HTMLDivElement | null> for the audioIndicatorRef).
 */
interface UseWebRTCAudioSessionReturn {
  status: string;
  isSessionActive: boolean;
  audioIndicatorRef: React.RefObject<HTMLDivElement | null>;
  startSession: () => Promise<void>;
  stopSession: () => void;
  handleStartStopClick: () => void;
  registerFunction: (name: string, fn: Function) => void;
  msgs: any[];
  currentVolume: number;
  conversation: Conversation[];
  sendTextMessage: (text: string) => void;
}
/**
 * Normalizes the parameters schema:
 * 1. If the parameters object is nested (i.e. it has exactly one key in "properties"
 *    whose value is an object with its own "properties"), then that extra level is removed.
 * 2. For each property, if an "anyOf" clause is present, simplify it by filtering out "null" types
 *    and merging additional keys.
 */
function simplifySchema(schema: any): any {
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    const nonNullSchemas = schema.anyOf.filter((s: any) => s.type !== "null");
    if (nonNullSchemas.length > 0) {
      const { anyOf, ...rest } = schema;
      return { ...rest, ...nonNullSchemas[0] };
    }
  }
  return schema;
}

/**
 * Normalizes the parameters schema:
 * 1. If parameters.properties has exactly one key and that key’s value is an object
 *    with its own "properties", then flatten that level.
 * 2. For each property, if an "anyOf" clause is present, simplify it by removing null types.
 */
function normalizeParameters(params: any): {
  type: "object";
  properties: Record<string, any>;
} {
  if (!params || params.type !== "object" || !params.properties) {
    return { type: "object", properties: {} };
  }

  let properties = params.properties;
  const keys = Object.keys(properties);

  // Flatten an extra level if there's exactly one key whose value is an object with its own properties.
  if (
    keys.length === 1 &&
    properties[keys[0]] &&
    properties[keys[0]].type === "object" &&
    properties[keys[0]].properties
  ) {
    properties = properties[keys[0]].properties;
  }

  const simplified: Record<string, any> = {};
  for (const key in properties) {
    if (properties.hasOwnProperty(key)) {
      const prop = properties[key];
      simplified[key] =
        prop.anyOf && Array.isArray(prop.anyOf) ? simplifySchema(prop) : prop;
    }
  }
  return { type: "object", properties: simplified };
}

/**
 * Hook to manage a real-time session with OpenAI's Realtime endpoints.
 */
export default function useWebRTCAudioSession(
  voice: string,
  toolDefinitions?: Tool[],
  mcpDefinitions?: Tool[]
): UseWebRTCAudioSessionReturn {
  const { t, locale } = useTranslations();
  // Connection/session states
  const [status, setStatus] = useState("Waiting for MCP definitions...");
  const [isSessionActive, setIsSessionActive] = useState(false);

  // Initialize tools array with provided tools or empty array, ensuring both arrays exist
  const [allTools, setAllTools] = useState<Tool[]>([]);

  useEffect(() => {
    const combinedTools: Tool[] = [];

    if (toolDefinitions?.length) {
      combinedTools.push(...toolDefinitions);
    }

    if (mcpDefinitions?.length) {
      const formattedMcpTools = mcpDefinitions.map((tool) => ({
        type: "function" as const,
        name: tool.name,
        description: tool.description,
        parameters: normalizeParameters(tool.parameters),
      }));
      combinedTools.push(...formattedMcpTools);
    }

    if (combinedTools.length > 0) {
      console.log("Setting combined tools:", JSON.stringify(combinedTools));
      setAllTools(combinedTools);
    }
  }, [toolDefinitions, mcpDefinitions]);

  // Audio references for local mic
  const audioIndicatorRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // WebRTC references
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  // Flag to prevent parallel session starts.
  const isStartingRef = useRef<boolean>(false);

  // Keep track of all raw events/messages
  const [msgs, setMsgs] = useState<any[]>([]);

  // Main conversation state
  const [conversation, setConversation] = useState<Conversation[]>([]);

  // For function calls (AI "tools")
  const functionRegistry = useRef<Record<string, Function>>({});

  // Volume analysis (assistant inbound audio)
  const [currentVolume, setCurrentVolume] = useState(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);

  /**
   * We track only the ephemeral user message **ID** here.
   * While user is speaking, we update that conversation item by ID.
   */
  const ephemeralUserMessageIdRef = useRef<string | null>(null);

  /**
   * Register a function (tool) so the AI can call it.
   */
  function registerFunction(name: string, fn: Function) {
    functionRegistry.current[name] = fn;
  }

  /**
   * Configure the data channel on open, sending a session update to the server.
   * Sends the update only once per session.
   */
  const sessionUpdateSentRef = useRef<boolean>(false);
  const configureDataChannel = (dataChannel: RTCDataChannel) => {
    console.log("allTools SENDING", JSON.stringify(allTools));
    if (!sessionUpdateSentRef.current) {
      const sessionUpdate = {
        type: "session.update",
        session: {
          modalities: ["text", "audio"],
          tools: allTools,
          input_audio_transcription: {
            model: "whisper-1",
          },
          instructions: t("languagePrompt"),
        },
      };
      dataChannel.send(JSON.stringify(sessionUpdate));
      console.log("Session update sent:", sessionUpdate);
      console.log("Setting locale: " + t("language") + " : " + locale);
      sessionUpdateSentRef.current = true;
    }
  };

  /**
   * Return an ephemeral user ID, creating a new ephemeral message in conversation if needed.
   */
  function getOrCreateEphemeralUserId(): string {
    let ephemeralId = ephemeralUserMessageIdRef.current;
    if (!ephemeralId) {
      ephemeralId = uuidv4();
      ephemeralUserMessageIdRef.current = ephemeralId;
      const newMessage: Conversation = {
        id: ephemeralId,
        role: "user",
        text: "",
        timestamp: new Date().toISOString(),
        isFinal: false,
        status: "speaking",
      };
      setConversation((prev) => [...prev, newMessage]);
    }
    return ephemeralId;
  }

  /**
   * Update the ephemeral user message (by ephemeralUserMessageIdRef) with partial changes.
   */
  function updateEphemeralUserMessage(partial: Partial<Conversation>) {
    const ephemeralId = ephemeralUserMessageIdRef.current;
    if (!ephemeralId) return;
    setConversation((prev) =>
      prev.map((msg) => (msg.id === ephemeralId ? { ...msg, ...partial } : msg))
    );
  }

  /**
   * Clear ephemeral user message ID so the next user speech starts fresh.
   */
  function clearEphemeralUserMessage() {
    ephemeralUserMessageIdRef.current = null;
  }

  /**
   * Main data channel message handler: interprets events from the server.
   */
  async function handleDataChannelMessage(event: MessageEvent) {
    try {
      const msg = JSON.parse(event.data);
      if (dataChannelRef.current?.readyState === "closed" && isSessionActive) {
        console.log(
          "Data channel closed unexpectedly, attempting to reconnect..."
        );
        await startSession();
        return;
      }
      switch (msg.type) {
        case "input_audio_buffer.speech_started": {
          getOrCreateEphemeralUserId();
          updateEphemeralUserMessage({ status: "speaking" });
          break;
        }
        case "input_audio_buffer.speech_stopped": {
          updateEphemeralUserMessage({ status: "speaking" });
          break;
        }
        case "input_audio_buffer.committed": {
          updateEphemeralUserMessage({
            text: "Processing speech...",
            status: "processing",
          });
          break;
        }
        case "conversation.item.input_audio_transcription": {
          const partialText =
            msg.transcript ?? msg.text ?? "User is speaking...";
          updateEphemeralUserMessage({
            text: partialText,
            status: "speaking",
            isFinal: false,
          });
          break;
        }
        case "conversation.item.input_audio_transcription.completed": {
          updateEphemeralUserMessage({
            text: msg.transcript || "",
            isFinal: true,
            status: "final",
          });
          clearEphemeralUserMessage();
          break;
        }
        case "response.audio_transcript.delta": {
          const newMessage: Conversation = {
            id: uuidv4(),
            role: "assistant",
            text: msg.delta,
            timestamp: new Date().toISOString(),
            isFinal: false,
          };
          setConversation((prev) => {
            const lastMsg = prev[prev.length - 1];
            if (lastMsg && lastMsg.role === "assistant" && !lastMsg.isFinal) {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...lastMsg,
                text: lastMsg.text + msg.delta,
              };
              return updated;
            } else {
              return [...prev, newMessage];
            }
          });
          break;
        }
        case "response.audio_transcript.done": {
          setConversation((prev) => {
            if (prev.length === 0) return prev;
            const updated = [...prev];
            updated[updated.length - 1].isFinal = true;
            return updated;
          });
          break;
        }
        case "response.function_call_arguments.done": {
          const fn = functionRegistry.current[msg.name];
          if (fn) {
            const args = JSON.parse(msg.arguments);
            const result = await fn(args);
            const response = {
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: msg.call_id,
                output: JSON.stringify(result),
              },
            };
            dataChannelRef.current?.send(JSON.stringify(response));
            const responseCreate = { type: "response.create" };
            dataChannelRef.current?.send(JSON.stringify(responseCreate));
          }
          break;
        }
        default: {
          break;
        }
      }
      setMsgs((prevMsgs) => [...prevMsgs, msg]);
      return msg;
    } catch (error) {
      console.error("Error handling data channel message:", error);
    }
  }

  /**
   * Fetch ephemeral token from your Next.js endpoint.
   */
  async function getEphemeralToken() {
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Failed to get ephemeral token: ${response.status}`);
      }
      const data = await response.json();
      return data.client_secret.value;
    } catch (err) {
      console.error("getEphemeralToken error:", err);
      throw err;
    }
  }

  /**
   * Sets up a local audio visualization for mic input.
   */
  function setupAudioVisualization(stream: MediaStream) {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 256;
    source.connect(analyzer);
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const updateIndicator = () => {
      if (!audioContext) return;
      analyzer.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      if (audioIndicatorRef.current) {
        audioIndicatorRef.current.classList.toggle("active", average > 30);
      }
      requestAnimationFrame(updateIndicator);
    };
    updateIndicator();
    audioContextRef.current = audioContext;
  }

  /**
   * Calculate RMS volume from inbound assistant audio.
   */
  function getVolume(): number {
    if (!analyserRef.current) return 0;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const float = (dataArray[i] - 128) / 128;
      sum += float * float;
    }
    return Math.sqrt(sum / dataArray.length);
  }

  /**
   * Start a new session.
   * Guarded to prevent parallel sessions using isStartingRef.
   */
  async function startSession() {
    if (isSessionActive || isStartingRef.current) {
      console.warn("Session already active or starting.");
      return;
    }
    isStartingRef.current = true;
    try {
      if (isSessionActive) {
        stopSession();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      setStatus("Starting session...");
      setStatus("Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      setupAudioVisualization(stream);
      setStatus("Fetching ephemeral token...");
      const ephemeralToken = await getEphemeralToken();
      setStatus("Establishing connection...");
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;
      // Create hidden audio element for inbound TTS
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      pc.ontrack = (event) => {
        audioEl.srcObject = event.streams[0];
        const audioCtx = new (window.AudioContext ||
          window.webkitAudioContext)();
        const src = audioCtx.createMediaStreamSource(event.streams[0]);
        const inboundAnalyzer = audioCtx.createAnalyser();
        inboundAnalyzer.fftSize = 256;
        src.connect(inboundAnalyzer);
        analyserRef.current = inboundAnalyzer;
        volumeIntervalRef.current = window.setInterval(() => {
          setCurrentVolume(getVolume());
        }, 100);
      };
      // Create data channel for transcripts and session updates.
      const dataChannel = pc.createDataChannel("response");
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        configureDataChannel(dataChannel);
      };
      dataChannel.onmessage = handleDataChannelMessage;
      // Add local audio track.
      pc.addTrack(stream.getTracks()[0]);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-4o-mini-realtime-preview-2024-12-17";
      const response = await fetch(`${baseUrl}?model=${model}&voice=${voice}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralToken}`,
          "Content-Type": "application/sdp",
        },
      });
      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      setIsSessionActive(true);
      setStatus("Session established successfully!");
    } catch (err) {
      console.error("startSession error:", err);
      setStatus(`Error: ${err}`);
      stopSession();
    } finally {
      isStartingRef.current = false;
    }
  }

  /**
   * Stop the session & cleanup.
   */
  function stopSession() {
    if (dataChannelRef.current) {
      dataChannelRef.current.close();
      dataChannelRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (audioIndicatorRef.current) {
      audioIndicatorRef.current.classList.remove("active");
    }
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    analyserRef.current = null;
    ephemeralUserMessageIdRef.current = null;
    sessionUpdateSentRef.current = false;
    setCurrentVolume(0);
    setIsSessionActive(false);
    setStatus("Session stopped");
    setMsgs([]);
    setConversation([]);
  }

  /**
   * Toggle start/stop from a single button.
   */
  function handleStartStopClick() {
    if (isSessionActive) {
      stopSession();
    } else {
      startSession();
    }
  }

  /**
   * Send a text message through the data channel.
   */
  function sendTextMessage(text: string) {
    if (
      !dataChannelRef.current ||
      dataChannelRef.current.readyState !== "open"
    ) {
      console.error("Data channel not ready");
      return;
    }
    const messageId = uuidv4();
    const newMessage: Conversation = {
      id: messageId,
      role: "user",
      text,
      timestamp: new Date().toISOString(),
      isFinal: true,
      status: "final",
    };
    setConversation((prev) => [...prev, newMessage]);
    const message = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    };
    const response = { type: "response.create" };
    dataChannelRef.current.send(JSON.stringify(message));
    dataChannelRef.current.send(JSON.stringify(response));
  }

  // Cleanup on unmount.
  useEffect(() => {
    return () => stopSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    isSessionActive,
    audioIndicatorRef,
    startSession,
    stopSession,
    handleStartStopClick,
    registerFunction,
    msgs,
    currentVolume,
    conversation,
    sendTextMessage,
  };
}
