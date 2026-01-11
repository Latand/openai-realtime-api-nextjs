"use client";

import { useState, useRef, useEffect, useCallback, type RefObject } from "react";
import { v4 as uuidv4 } from "uuid";
import { Conversation } from "@/lib/conversations";
import { useTranslations } from "@/components/translations-context";
import { playSound } from "@/lib/tools";
import { addCostLog, calculateRealtimeCost } from "@/lib/cost-tracker";

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

type ToolHandler = (...args: unknown[]) => unknown;

/**
 * The return type for the hook, matching Approach A
 * (RefObject<HTMLDivElement | null> for the audioIndicatorRef).
 */
type StopSessionOptions = {
  preserveStatus?: boolean;
};

interface UseWebRTCAudioSessionReturn {
  status: string;
  isSessionActive: boolean;
  audioIndicatorRef: RefObject<HTMLDivElement | null>;
  startSession: () => Promise<void>;
  stopSession: (options?: StopSessionOptions) => void;
  handleStartStopClick: () => void;
  registerFunction: (name: string, fn: ToolHandler) => void;
  msgs: any[];
  currentVolume: number;
  userAnalyser: AnalyserNode | null;
  assistantAnalyser: AnalyserNode | null;
  conversation: Conversation[];
  sendTextMessage: (text: string) => void;
  sendFunctionOutput: (callId: string, output: any) => boolean;
  clearConversation: () => void;
  isMuted: boolean;
  toggleMute: () => void;
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
 * 1. If parameters.properties has exactly one key and that key's value is an object
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
  mcpDefinitions?: Tool[],
  previousConversations?: string,
  selectedMicrophoneId?: string,
  customSystemPrompt?: string
): UseWebRTCAudioSessionReturn {
  const { t, locale } = useTranslations();
  // Connection/session states
  const [status, setStatus] = useState("Waiting for MCP definitions...");
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

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

    console.log("Setting combined tools:", JSON.stringify(combinedTools));
    setAllTools(combinedTools);
  }, [toolDefinitions, mcpDefinitions]);

  // Audio references for local mic
  const audioIndicatorRef = useRef<HTMLDivElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);

  // WebRTC references
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const inboundAudioContextRef = useRef<AudioContext | null>(null);
  const dummyVideoTrackRef = useRef<MediaStreamTrack | null>(null);

  // Flag to prevent parallel session starts.
  const isStartingRef = useRef<boolean>(false);
  const isStoppingRef = useRef<boolean>(false);
  const isSessionActiveRef = useRef<boolean>(false);

  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  // Keep track of all raw events/messages
  const [msgs, setMsgs] = useState<any[]>([]);

  // Main conversation state
  const [conversation, setConversation] = useState<Conversation[]>([]);

  // For function calls (AI "tools")
  const functionRegistry = useRef<Record<string, ToolHandler>>({});

  // Volume analysis (assistant inbound audio)
  const [currentVolume, setCurrentVolume] = useState(0);
  const [userAnalyser, setUserAnalyser] = useState<AnalyserNode | null>(null);
  const [assistantAnalyser, setAssistantAnalyser] = useState<AnalyserNode | null>(null);
  const userAnalyserRef = useRef<AnalyserNode | null>(null);
  const assistantAnalyserRef = useRef<AnalyserNode | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  /**
   * We track only the ephemeral user message **ID** here.
   * While user is speaking, we update that conversation item by ID.
   */
  const ephemeralUserMessageIdRef = useRef<string | null>(null);

  /**
   * Register a function (tool) so the AI can call it.
   */
  function registerFunction(name: string, fn: ToolHandler) {
    functionRegistry.current[name.toLowerCase()] = fn;
  }

  /**
   * Send a session update to the server, reusing the data channel once open.
   * Updates are deduplicated by payload.
   */
  const lastSessionUpdateRef = useRef<string | null>(null);
  const sendSessionUpdate = useCallback(() => {
    const dataChannel = dataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== "open") return;

    // Use custom system prompt if provided, otherwise use default from translations
    let instructions = customSystemPrompt || t("languagePrompt");
    if (previousConversations) {
      console.log("[Memory] Injecting previous conversations into instructions, length:", previousConversations.length);
      instructions += previousConversations;
    }

    const sessionUpdate = {
      type: "session.update",
      session: {
        modalities: ["text", "audio"],
        tools: allTools,
        input_audio_transcription: {
          model: "whisper-1",
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.9, // Higher = less sensitive (0.0-1.0), default is ~0.5
          prefix_padding_ms: 500,
          silence_duration_ms: 1500,
        },
        instructions,
      },
    };
    const payload = JSON.stringify(sessionUpdate);
    if (lastSessionUpdateRef.current === payload) return;
    dataChannel.send(payload);
    console.log("Session update sent:", sessionUpdate);
    console.log("Setting locale: " + t("language") + " : " + locale);
    lastSessionUpdateRef.current = payload;
  }, [allTools, locale, t, previousConversations, customSystemPrompt]);

  useEffect(() => {
    if (!isSessionActiveRef.current) return;
    sendSessionUpdate();
  }, [sendSessionUpdate]);

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
  async function restartSession(reason: string) {
    if (isStartingRef.current || isStoppingRef.current) return;
    if (!isSessionActiveRef.current) return;
    console.warn(`Restarting session: ${reason}`);
    setStatus(`Reconnecting: ${reason}`);
    stopSession({ preserveStatus: true });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await startSession();
  }

  async function handleDataChannelMessage(event: MessageEvent) {
    try {
      const msg = JSON.parse(event.data);
      if (
        dataChannelRef.current?.readyState === "closed" &&
        isSessionActiveRef.current &&
        !isStoppingRef.current
      ) {
        console.log(
          "Data channel closed unexpectedly, attempting to reconnect..."
        );
        await restartSession("data channel closed");
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
            for (let i = updated.length - 1; i >= 0; i -= 1) {
              if (updated[i].role === "assistant") {
                updated[i].isFinal = true;
                break;
              }
            }
            return updated;
          });
          break;
        }
        case "response.done": {
          const usage = msg.response?.usage;
          if (usage) {
            const cost = calculateRealtimeCost(usage);
            addCostLog({
              model: "gpt-realtime",
              type: "unknown", 
              tokens: usage.total_tokens,
              cost,
              metadata: usage
            }).catch(e => console.error("Failed to log cost:", e));
          }
          break;
        }
        case "response.function_call_arguments.done": {
          console.log("response.function_call_arguments.done", msg);
          const fn = functionRegistry.current[msg.name.toLowerCase()];
          let parsedArgs: Record<string, any> = {};
          const toolCallId = uuidv4();

          // Skip logging for noisy polling tools
          const silentTools = ["getclaudeoutput", "getClaudeOutput"];
          const shouldLog = !silentTools.includes(msg.name.toLowerCase()) && !silentTools.includes(msg.name);

          // Add tool call to conversation (pending state)
          const toolCallEntry: Conversation = {
            id: toolCallId,
            role: "tool",
            text: `Calling ${msg.name}...`,
            timestamp: new Date().toISOString(),
            isFinal: false,
            status: "processing",
            toolName: msg.name,
            toolArgs: {},
          };

          if (msg.arguments) {
            try {
              parsedArgs = JSON.parse(msg.arguments);
              toolCallEntry.toolArgs = parsedArgs;
            } catch (error) {
              // Update tool call with parse error
              toolCallEntry.text = `${msg.name} failed`;
              toolCallEntry.isFinal = true;
              toolCallEntry.status = "final";
              toolCallEntry.toolError = `Failed to parse arguments: ${error}`;
              if (shouldLog) {
                setConversation((prev) => [...prev, toolCallEntry]);
              }

              const errorResponse = {
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: msg.call_id,
                  output: JSON.stringify({
                    error: `Failed to parse tool arguments: ${error}`,
                  }),
                },
              };
              dataChannelRef.current?.send(JSON.stringify(errorResponse));
              dataChannelRef.current?.send(
                JSON.stringify({ type: "response.create" })
              );
              break;
            }
          }

          // Add pending tool call to conversation (only if not silent)
          if (shouldLog) {
            setConversation((prev) => [...prev, toolCallEntry]);
          }

          // Helper to update tool call result
          const updateToolCall = (result?: unknown, error?: string) => {
            if (!shouldLog) return;
            setConversation((prev) =>
              prev.map((item) =>
                item.id === toolCallId
                  ? {
                      ...item,
                      text: error ? `${msg.name} failed` : `${msg.name} completed`,
                      isFinal: true,
                      status: "final" as const,
                      toolResult: result,
                      toolError: error,
                    }
                  : item
              )
            );
          };

          if (fn) {
            // Play sound for tool execution (skip for silent polling tools)
            if (shouldLog) {
              playSound("/sounds/claude-request.mp3");
            }
            try {
              const result = await fn(parsedArgs);
              updateToolCall(result);
              const response = {
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: msg.call_id,
                  output: JSON.stringify(result),
                },
              };
              dataChannelRef.current?.send(JSON.stringify(response));
            } catch (error) {
              updateToolCall(undefined, `Tool execution failed: ${error}`);
              const errorResponse = {
                type: "conversation.item.create",
                item: {
                  type: "function_call_output",
                  call_id: msg.call_id,
                  output: JSON.stringify({
                    error: `Tool execution failed: ${error}`,
                  }),
                },
              };
              dataChannelRef.current?.send(JSON.stringify(errorResponse));
            }
          } else {
            updateToolCall(undefined, `Function '${msg.name}' not found`);
            const errorResponse = {
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: msg.call_id,
                output: JSON.stringify({
                  error: `Function '${msg.name}' not found in registry`,
                }),
              },
            };
            dataChannelRef.current?.send(JSON.stringify(errorResponse));
          }
          // Always create a new response after function call
          const responseCreate = { type: "response.create" };
          dataChannelRef.current?.send(JSON.stringify(responseCreate));
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
  async function getEphemeralToken(selectedVoice: string) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (process.env.NEXT_PUBLIC_SESSION_SECRET) {
        headers["x-session-secret"] = process.env.NEXT_PUBLIC_SESSION_SECRET;
      }
      const response = await fetch("/api/session", {
        method: "POST",
        headers,
        body: JSON.stringify({ voice: selectedVoice }),
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
    analyzer.fftSize = 2048;
    source.connect(analyzer);
    
    setUserAnalyser(analyzer);
    userAnalyserRef.current = analyzer;

    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const updateIndicator = () => {
      if (!audioContext) return;
      analyzer.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / bufferLength;
      if (audioIndicatorRef.current) {
        audioIndicatorRef.current.classList.toggle("active", average > 30);
      }
      animationFrameRef.current = requestAnimationFrame(updateIndicator);
    };
    updateIndicator();
    audioContextRef.current = audioContext;
  }

  /**
   * Calculate RMS volume from inbound assistant audio.
   */
  function getVolume(): number {
    if (!assistantAnalyserRef.current) return 0;
    const dataArray = new Uint8Array(assistantAnalyserRef.current.frequencyBinCount);
    assistantAnalyserRef.current.getByteTimeDomainData(dataArray);
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
    if (isSessionActiveRef.current || isStartingRef.current) {
      console.warn("Session already active or starting.");
      return;
    }
    isStartingRef.current = true;
    try {
      if (isSessionActiveRef.current) {
        stopSession();
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      setStatus("Starting session...");
      setStatus("Requesting microphone access...");
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
      setupAudioVisualization(stream);
      setStatus("Fetching ephemeral token...");
      const ephemeralToken = await getEphemeralToken(voice);
      setStatus("Establishing connection...");
      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      // Create a dummy video track
      const dummyVideo = document.createElement("canvas");
      dummyVideo.width = 640;
      dummyVideo.height = 480;
      const ctx = dummyVideo.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, dummyVideo.width, dummyVideo.height);
      }
      const dummyStream = dummyVideo.captureStream(1); // 1 fps
      const videoTrack = dummyStream.getVideoTracks()[0];
      dummyVideoTrackRef.current = videoTrack;

      const audioTrack = stream
        .getTracks()
        .find((track) => track.kind === "audio");
      if (!audioTrack) {
        throw new Error("No audio track available from microphone");
      }

      pc.addTransceiver(audioTrack, { direction: "sendrecv" });
      pc.addTransceiver(videoTrack, { direction: "sendrecv" });

      // Create hidden audio element for inbound TTS
      const audioEl = document.createElement("audio");
      audioEl.autoplay = true;
      audioElementRef.current = audioEl;
      pc.ontrack = (event) => {
        if (event.track.kind !== "audio") return;
        audioEl.srcObject = event.streams[0];
        if (inboundAudioContextRef.current) {
          inboundAudioContextRef.current.close().catch(() => undefined);
        }
        const inboundAudioCtx = new (window.AudioContext ||
          window.webkitAudioContext)();
        inboundAudioContextRef.current = inboundAudioCtx;
        const src = inboundAudioCtx.createMediaStreamSource(event.streams[0]);
        const inboundAnalyzer = inboundAudioCtx.createAnalyser();
        inboundAnalyzer.fftSize = 1024;
        src.connect(inboundAnalyzer);
        
        setAssistantAnalyser(inboundAnalyzer);
        assistantAnalyserRef.current = inboundAnalyzer;

        if (volumeIntervalRef.current) {
          clearInterval(volumeIntervalRef.current);
        }
        volumeIntervalRef.current = window.setInterval(() => {
          setCurrentVolume(getVolume());
        }, 100);
      };
      // Create data channel for transcripts and session updates.
      const dataChannel = pc.createDataChannel("response");
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        sendSessionUpdate();
      };
      dataChannel.onmessage = handleDataChannelMessage;
      dataChannel.onclose = () => {
        if (!isStoppingRef.current) {
          void restartSession("data channel closed");
        }
      };
      dataChannel.onerror = () => {
        if (!isStoppingRef.current) {
          void restartSession("data channel error");
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          void restartSession("connection failed");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const baseUrl = "https://api.openai.com/v1/realtime";
      const model = "gpt-realtime";
      const response = await fetch(`${baseUrl}?model=${model}&voice=${voice}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralToken}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Realtime API error ${response.status}: ${errorText || "Unknown"}`
        );
      }
      const answerSdp = await response.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
      isSessionActiveRef.current = true;
      setIsSessionActive(true);
      setStatus("Session established successfully!");
    } catch (err) {
      console.error("startSession error:", err);
      setStatus(`Error: ${err}`);
      stopSession({ preserveStatus: true });
    } finally {
      isStartingRef.current = false;
    }
  }

  /**
   * Stop the session & cleanup.
   */
  function stopSession(options: StopSessionOptions = {}) {
    isStoppingRef.current = true;
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
    if (inboundAudioContextRef.current) {
      inboundAudioContextRef.current.close().catch(() => undefined);
      inboundAudioContextRef.current = null;
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach((track) => track.stop());
      audioStreamRef.current = null;
    }
    if (dummyVideoTrackRef.current) {
      dummyVideoTrackRef.current.stop();
      dummyVideoTrackRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }
    if (audioIndicatorRef.current) {
      audioIndicatorRef.current.classList.remove("active");
    }
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setUserAnalyser(null);
    userAnalyserRef.current = null;
    setAssistantAnalyser(null);
    assistantAnalyserRef.current = null;
    ephemeralUserMessageIdRef.current = null;
    lastSessionUpdateRef.current = null;
    setCurrentVolume(0);
    isSessionActiveRef.current = false;
    setIsSessionActive(false);
    if (!options.preserveStatus) {
      setStatus("Session stopped");
    }
    setMsgs([]);
    // Keep conversation history - don't clear on session end
    // Delay resetting isStoppingRef to allow async close events to complete
    setTimeout(() => {
      isStoppingRef.current = false;
    }, 500);
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
   * Send a function call output (for async function responses like Claude CLI)
   */
  function sendFunctionOutput(callId: string, output: any) {
    if (
      !dataChannelRef.current ||
      dataChannelRef.current.readyState !== "open"
    ) {
      console.error("Data channel not ready for function output");
      return false;
    }
    const response = {
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    };
    dataChannelRef.current.send(JSON.stringify(response));
    dataChannelRef.current.send(JSON.stringify({ type: "response.create" }));
    return true;
  }

  /**
   * Clear the conversation history.
   */
  function clearConversation() {
    setConversation([]);
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

  /**
   * Toggle microphone mute state
   */
  function toggleMute() {
    if (!audioStreamRef.current) return;

    const audioTrack = audioStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      const newMutedState = !isMuted;
      audioTrack.enabled = !newMutedState;
      setIsMuted(newMutedState);
      console.log(`[Mute] Microphone ${newMutedState ? "muted" : "unmuted"}`);
    }
  }

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
    userAnalyser,
    assistantAnalyser,
    conversation,
    sendTextMessage,
    sendFunctionOutput,
    clearConversation,
    isMuted,
    toggleMute,
  };
}
