"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import {
  Activity,
  Check,
  CircleX,
  Copy,
  Loader2,
  RotateCcw,
  Square,
  Trash2,
  Wand2,
  X,
} from "lucide-react";

export default function TranscriptionPage() {
  // Keep Linux compositors from rendering transparent-window artifacts.
  useEffect(() => {
    document.body.style.background = "#020617";
    document.documentElement.style.background = "#020617";
    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [newTextStart, setNewTextStart] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for text updates from main window
  useEffect(() => {
    const unsubscribe = window.electron?.transcription?.onTextUpdate?.(
      (data: { text: string; interim: string }) => {
        setText((prevText) => {
          // If new text is longer, mark where new content starts
          if (data.text.length > prevText.length && data.text.startsWith(prevText)) {
            setNewTextStart(prevText.length);

            // Clear previous timeout
            if (fadeTimeoutRef.current) {
              clearTimeout(fadeTimeoutRef.current);
            }

            // Fade out highlight after 3 seconds
            fadeTimeoutRef.current = setTimeout(() => {
              setNewTextStart(null);
            }, 3000);
          }
          return data.text;
        });
        setInterim(data.interim);
      }
    );

    return () => {
      unsubscribe?.();
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
    };
  }, []);

  // Listen for state updates (listening/recording/processing)
  useEffect(() => {
    const unsubscribe = window.electron?.transcription?.onStateUpdate(
      (data: { isListening?: boolean; isRecording: boolean; isProcessing: boolean; recordingDuration: number }) => {
        console.log("[Transcription] Received state update:", data);
        setIsListening(data.isListening ?? false);
        setIsRecording(data.isRecording);
        setIsProcessing(data.isProcessing);
        setRecordingDuration(data.recordingDuration || 0);

        if (data.isProcessing) {
          setProgress(0);
        } else if (!data.isProcessing && data.recordingDuration > 0) {
          setProgress(100);
        }
      }
    );
    return () => unsubscribe?.();
  }, []);

  // Animate progress bar when processing
  useEffect(() => {
    if (isProcessing && recordingDuration > 0) {
      // Estimate: processing takes about 1/12.5 of the recording time
      const estimatedDuration = (recordingDuration / 12.5) * 1000; // in ms
      const updateInterval = 50; // update every 50ms
      const totalSteps = estimatedDuration / updateInterval;
      let currentStep = 0;

      // Clear any existing interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }

      progressIntervalRef.current = setInterval(() => {
        currentStep++;
        // Use easeOutQuad for a natural feel - starts fast, slows down near end
        const linearProgress = currentStep / totalSteps;
        // Cap at 95% to show it's still working until actual completion
        const easedProgress = Math.min(95, linearProgress * 100 * (2 - linearProgress));
        setProgress(easedProgress);

        if (currentStep >= totalSteps) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
        }
      }, updateInterval);

      return () => {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
      };
    } else if (!isProcessing) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }
  }, [isProcessing, recordingDuration]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [text, interim]);

  // Manual window dragging
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    e.preventDefault();
    console.log("[Drag] Starting drag at", e.screenX, e.screenY);
    setIsDragging(true);
    dragStartRef.current = { x: e.screenX, y: e.screenY };
    window.electron?.transcription?.startDrag?.();
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const deltaX = e.screenX - dragStartRef.current.x;
      const deltaY = e.screenY - dragStartRef.current.y;
      if (deltaX !== 0 || deltaY !== 0) {
        console.log("[Drag] Moving", deltaX, deltaY);
        dragStartRef.current = { x: e.screenX, y: e.screenY };
        window.electron?.transcription?.moveWindow?.(deltaX, deltaY);
      }
    };

    const handleMouseUp = () => {
      console.log("[Drag] End drag");
      setIsDragging(false);
      dragStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Copy to clipboard
  const handleCopy = useCallback(async () => {
    if (!text) return;
    try {
      if (window.electron?.clipboard) {
        await window.electron.clipboard.write(text);
      } else {
        await navigator.clipboard.writeText(text);
      }
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    }
  }, [text]);

  // Clear text - also notify main window to clear hook data
  const handleClear = useCallback(async () => {
    setText("");
    setInterim("");
    // Notify main window to clear transcription data in the hook
    await window.electron?.transcription?.clear?.();
  }, []);

  // Close window
  const handleClose = useCallback(async () => {
    // If HQ mode is currently recording and user closes the window, cancel the recording
    // (stop without transcribing). Safe no-op when not recording HQ mode.
    if (isRecording && !isProcessing && window.electron?.transcription?.cancelWhisper) {
      try {
        await window.electron.transcription.cancelWhisper();
      } catch {
        // ignore
      }
    }
    await window.electron?.transcription?.closeWindow?.();
  }, [isRecording, isProcessing]);

  // Stop recording
  const handleStop = useCallback(async () => {
    await window.electron?.transcription?.stop?.();
  }, []);

  const isHqUi = /hq|whisper/i.test(interim);

  const handleCancel = useCallback(async () => {
    try {
      if (!window.electron?.transcription?.cancelWhisper) {
        toast.error("Cancel is only available in the desktop app");
        return;
      }
      await window.electron.transcription.cancelWhisper();
      toast.info("Cancelled");
    } catch (err) {
      console.error("Cancel failed:", err);
      toast.error("Cancel failed");
    }
  }, []);

  const canRetry = !isListening && !isRecording && !isProcessing;

  const handleRetry = useCallback(async () => {
    try {
      if (!window.electron?.transcription?.retryLast) {
        toast.error("Retry is only available in the desktop app");
        return;
      }

      const res = await window.electron.transcription.retryLast();
      if (res && !res.success) {
        toast.error(res.error || "Retry failed");
      } else {
        toast.info("Retrying last audio...");
      }
    } catch (err) {
      console.error("Retry failed:", err);
      toast.error("Retry failed");
    }
  }, []);

  // Copy and close
  const handleCopyAndClose = useCallback(async () => {
    await handleCopy();
    await handleClose();
  }, [handleCopy, handleClose]);

  // Magic Wand Improve
  const handleImprove = async () => {
    if (!text) return;
    setIsImproving(true);
    
    try {
      // Default to 'your-style' (personal Telegram style) and 'auto' language
      const currentStyle = 'your-style';
      const currentLanguage = 'auto';
      
      const response = await fetch('/api/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: text,
          style: currentStyle,
          language: currentLanguage,
          additionalInstructions: ""
        })
      });

      if (!response.ok) {
        throw new Error('Failed to improve text');
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulatedText += decoder.decode(value, { stream: true });
        setText(accumulatedText); // Stream result directly to text
      }
      
      toast.success("Text improved");
    } catch (err) {
      console.error("Improvement failed:", err);
      toast.error("Failed to improve text");
    } finally {
      setIsImproving(false);
    }
  };

  const displayText = text || "";
  const hasText = displayText.length > 0;

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const statusLabel = isProcessing
    ? "Processing"
    : isRecording
    ? `Recording ${formatDuration(recordingDuration)}`
    : isListening
    ? `Live ${recordingDuration > 0 ? formatDuration(recordingDuration) : ""}`.trim()
    : hasText
    ? "Ready"
    : "Idle";
  const modeLabel = isProcessing || isRecording || isHqUi ? "HQ Transcribe" : "Live Realtime";
  const hintLabel = isProcessing
    ? "Converting captured audio"
    : isRecording
    ? "Press stop to transcribe"
    : isListening
    ? "Streaming transcript deltas"
    : hasText
    ? "Review, improve, copy"
    : "Waiting for speech";
  const statusClass = isProcessing
    ? "bg-amber-400 text-slate-950"
    : isRecording
    ? "bg-rose-500 text-white"
    : isListening
    ? "bg-emerald-400 text-slate-950"
    : hasText
    ? "bg-sky-400 text-slate-950"
    : "bg-slate-600 text-slate-200";

  return (
    <main
      className="fixed inset-0 select-none overflow-hidden m-0 p-2"
      style={{ background: "#020617" } as React.CSSProperties}
    >
      <div className="h-full w-full flex flex-col overflow-hidden rounded-xl border border-slate-500/45 bg-slate-950/94 shadow-[0_18px_42px_rgba(2,6,23,0.55)] backdrop-blur-xl">
        {/* Header - draggable */}
        <div
          className="flex cursor-move items-center justify-between border-b border-slate-700/70 bg-slate-900/85 px-3.5 py-2.5"
          onMouseDown={handleDragStart}
        >
          <div className="min-w-0 flex items-center gap-3">
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900">
              <Activity className="h-4 w-4 text-slate-300" />
              {(isRecording || isProcessing || isListening) && (
                <div
                  className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ${statusClass}`}
                />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-semibold text-slate-100">{modeLabel}</span>
                <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${statusClass}`}>
                  {statusLabel}
                </span>
              </div>
              <div className="truncate text-[11px] text-slate-400">{hintLabel}</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Show Stop button only if listening/recording/processing */}
            {(isListening || isRecording || isProcessing) && (
              <button
                onClick={handleStop}
                className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-1.5 text-rose-300 transition-colors hover:bg-rose-500/20"
                title="Stop Recording"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            )}
            {/* HQ-only cancel: stop without transcribing */}
            {isHqUi && isRecording && !isProcessing && !isListening && (
              <button
                onClick={handleCancel}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                title="Cancel (do not transcribe)"
              >
                <CircleX className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={handleClose}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-100"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Text area */}
        <div
          ref={textRef}
          className="flex-1 overflow-y-auto px-4 py-3.5"
        >
          {isProcessing ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex items-center gap-3 text-slate-200">
                <Loader2 className="h-5 w-5 animate-spin text-amber-300" />
                <p className="text-base font-medium">Processing with GPT-4o Transcribe</p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-xs">
                <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                  <span>Processing</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-amber-300 transition-all duration-100 ease-out"
                    style={{
                      width: `${progress}%`,
                    }}
                  />
                </div>
                {recordingDuration > 0 && (
                  <p className="mt-1.5 text-center text-xs text-slate-500">
                    ~{Math.max(1, Math.ceil((recordingDuration / 12.5) * (1 - progress / 100)))}s remaining
                  </p>
                )}
              </div>
            </div>
          ) : displayText ? (
            <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-100">
              {newTextStart !== null && newTextStart < displayText.length ? (
                <>
                  {displayText.slice(0, newTextStart)}
                  <span className="rounded bg-emerald-400/12 px-0.5 text-emerald-200 transition-all duration-500">
                    {displayText.slice(newTextStart)}
                  </span>
                </>
              ) : (
                displayText
              )}
              {interim && (
                <span className="text-sky-300/80"> {interim}</span>
              )}
            </p>
          ) : (
            <div className="flex h-full items-center justify-center text-center">
              <p className="max-w-[28ch] text-base text-slate-500">
                {interim || "Start speaking..."}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-slate-700/70 bg-slate-900/88 px-3 py-2.5">
          {/* Magic Wand Improve Button */}
          {hasText && (
            <button
              onClick={handleImprove}
              disabled={isImproving}
              className={`p-2 rounded-lg transition-all border ${
                isImproving 
                  ? "cursor-wait animate-pulse border-amber-400/30 bg-amber-400/12 text-amber-300"
                  : "border-amber-400/25 bg-amber-400/10 text-amber-300 hover:bg-amber-400/18 hover:text-amber-200"
              }`}
              title="Instant Improve (Magic Wand)"
            >
              <Wand2 className={`w-4 h-4 ${isImproving ? "animate-spin" : ""}`} />
            </button>
          )}

          <button
            onClick={handleRetry}
            disabled={!canRetry}
            className="rounded-lg bg-slate-800/80 p-2 text-slate-400 transition-all hover:bg-slate-700 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="Retry last HQ audio"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={handleClear}
            disabled={!hasText}
            className="rounded-lg bg-slate-800/80 p-2 text-slate-400 transition-all hover:bg-slate-700 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
            title="Clear"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleCopy}
            disabled={!hasText}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-800/80 px-3 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-slate-700 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </button>
          
          <button
            onClick={handleCopyAndClose}
            disabled={!hasText}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 transition-all hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-3.5 w-3.5" />
            Copy & Close
          </button>
        </div>
      </div>
    </main>
  );
}
