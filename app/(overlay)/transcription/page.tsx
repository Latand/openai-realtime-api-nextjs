"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Wand2, X, Square, Trash2, Copy } from "lucide-react";

export default function TranscriptionPage() {
  // Override body background for transparent window
  useEffect(() => {
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false); // Added recording state
  const [isImproving, setIsImproving] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const textRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for text updates from main window
  useEffect(() => {
    const unsubscribe = window.electron?.transcription?.onTextUpdate?.(
      (data: { text: string; interim: string }) => {
        setText(data.text);
        setInterim(data.interim);
      }
    );

    return () => {
      unsubscribe?.();
    };
  }, []);

  // Listen for state updates (recording/processing)
  useEffect(() => {
    const unsubscribe = window.electron?.transcription?.onStateUpdate(
      (data: { isRecording: boolean; isProcessing: boolean; recordingDuration: number }) => {
        console.log("[Transcription] Received state update:", data);
        setIsRecording(data.isRecording);
        setIsProcessing(data.isProcessing);
        setRecordingDuration(data.recordingDuration);

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
          // Don't clear interval, keep it at 95% until actual completion
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

  // Handle window dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setIsDragging(true);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
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
    } catch (err) {
      toast.error("Failed to copy");
    }
  }, [text]);

  // Clear text
  const handleClear = useCallback(() => {
    setText("");
    setInterim("");
  }, []);

  // Close window
  const handleClose = useCallback(async () => {
    await window.electron?.transcription?.closeWindow?.();
  }, []);

  // Stop recording
  const handleStop = useCallback(async () => {
    await window.electron?.transcription?.stop?.();
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

  return (
    <main
      className="fixed inset-0 select-none overflow-hidden m-0 p-2"
      style={{ WebkitAppRegion: "drag", background: "transparent" } as React.CSSProperties}
      onMouseDown={handleMouseDown}
    >
      <div className="h-full w-full flex flex-col bg-gradient-to-br from-slate-900/95 to-slate-800/95 rounded-2xl border border-slate-600/50 shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden backdrop-blur-xl">
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-2.5 bg-slate-800/50 border-b border-slate-700/50"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div className="flex items-center gap-2.5">
            <div className="relative flex items-center justify-center">
              {/* Dot logic: 
                  - If processing: Orange
                  - If recording: Red + Blink
                  - If idle: Grey + No Blink 
              */}
              <div 
                className={`w-2.5 h-2.5 rounded-full transition-colors duration-300
                  ${isProcessing ? 'bg-orange-500' : isRecording ? 'bg-red-500' : 'bg-slate-500'}
                `} 
              />
              {(isRecording || isProcessing) && (
                <div 
                  className={`absolute w-2.5 h-2.5 rounded-full animate-ping opacity-75
                    ${isProcessing ? 'bg-orange-500' : 'bg-red-500'}
                  `} 
                />
              )}
            </div>
            <span className="text-sm font-medium text-slate-300">
              {isProcessing ? 'Processing' : isRecording ? 'Live Transcription' : 'Transcription Paused'}
            </span>
          </div>

          <div
            className="flex items-center gap-1"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {/* Show Stop button only if recording/processing */}
            {(isRecording || isProcessing) && (
                <button
                onClick={handleStop}
                className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors group"
                title="Stop Recording"
                >
                <Square className="w-3.5 h-3.5 text-red-400 fill-current" />
                </button>
            )}
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-slate-700/80 rounded-lg transition-colors group"
              title="Close"
            >
              <X className="w-4 h-4 text-slate-500 group-hover:text-slate-300" />
            </button>
          </div>
        </div>

        {/* Text area */}
        <div
          ref={textRef}
          className="flex-1 p-4 overflow-y-auto"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {isProcessing ? (
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-orange-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-slate-300 text-base">Processing with Whisper...</p>
              </div>

              {/* Progress bar */}
              <div className="w-full max-w-xs">
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>Processing</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all duration-100 ease-out"
                    style={{
                      width: `${progress}%`,
                      boxShadow: progress > 0 ? '0 0 10px rgba(251, 146, 60, 0.5)' : 'none'
                    }}
                  />
                </div>
                {recordingDuration > 0 && (
                  <p className="text-xs text-slate-500 mt-1.5 text-center">
                    ~{Math.max(1, Math.ceil((recordingDuration / 12.5) * (1 - progress / 100)))}s remaining
                  </p>
                )}
              </div>
            </div>
          ) : displayText ? (
            <p className="text-slate-100 text-base leading-relaxed whitespace-pre-wrap">
              {displayText}
              {interim && (
                <span className="text-purple-400/80 italic"> {interim}</span>
              )}
            </p>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-slate-500 text-base italic">
                {interim || "Start speaking..."}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 bg-slate-800/60 border-t border-slate-700/50"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          {/* Magic Wand Improve Button */}
          {hasText && (
            <button
              onClick={handleImprove}
              disabled={isImproving}
              className={`p-2 rounded-lg transition-all border ${
                isImproving 
                  ? "bg-purple-500/20 text-purple-400 cursor-wait animate-pulse border-purple-500/30" 
                  : "bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 hover:text-purple-300 border-purple-500/30"
              }`}
              title="Instant Improve (Magic Wand)"
            >
              <Wand2 className={`w-4 h-4 ${isImproving ? "animate-spin" : ""}`} />
            </button>
          )}

          <button
            onClick={handleClear}
            disabled={!hasText}
            className="p-2 text-slate-400 bg-slate-700/40 hover:bg-slate-700/70 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all"
            title="Clear"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleCopy}
            disabled={!hasText}
            className="flex-1 px-3 py-2 text-sm font-medium text-slate-300 bg-slate-700/40 hover:bg-slate-700/70 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all flex items-center justify-center gap-2"
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </button>
          
          <button
            onClick={handleCopyAndClose}
            disabled={!hasText}
            className="flex-1 px-3 py-2 text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-all shadow-lg shadow-purple-500/20"
          >
            Copy & Close
          </button>
        </div>
      </div>
    </main>
  );
}
