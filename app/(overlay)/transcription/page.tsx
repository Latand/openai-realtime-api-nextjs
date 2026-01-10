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
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [newTextStart, setNewTextStart] = useState<number | null>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const fadeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
      (data: { isListening?: boolean; isRecording: boolean; isProcessing: boolean }) => {
        console.log("[Transcription] Received state update:", data);
        setIsListening(data.isListening ?? false);
        setIsRecording(data.isRecording);
        setIsProcessing(data.isProcessing);
      }
    );
    return () => unsubscribe?.();
  }, []);

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
                  - If processing: Orange + Blink
                  - If recording: Red + Blink
                  - If listening: Green + Blink
                  - If idle: Grey + No Blink
              */}
              <div
                className={`w-2.5 h-2.5 rounded-full transition-colors duration-300
                  ${isProcessing ? 'bg-orange-500' : isRecording ? 'bg-red-500' : isListening ? 'bg-emerald-500' : 'bg-slate-500'}
                `}
              />
              {(isRecording || isProcessing || isListening) && (
                <div
                  className={`absolute w-2.5 h-2.5 rounded-full animate-ping opacity-75
                    ${isProcessing ? 'bg-orange-500' : isRecording ? 'bg-red-500' : 'bg-emerald-500'}
                  `}
                />
              )}
            </div>
            <span className="text-sm font-medium text-slate-300">
              {isProcessing ? 'Processing' : isRecording ? 'Recording' : isListening ? 'Listening...' : 'Paused'}
            </span>
          </div>

          <div
            className="flex items-center gap-1"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {/* Show Stop button only if listening/recording/processing */}
            {(isListening || isRecording || isProcessing) && (
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
          {displayText ? (
            <p className="text-slate-100 text-base leading-relaxed whitespace-pre-wrap">
              {newTextStart !== null && newTextStart < displayText.length ? (
                <>
                  {displayText.slice(0, newTextStart)}
                  <span className="text-emerald-400 bg-emerald-500/10 rounded px-0.5 transition-all duration-500">
                    {displayText.slice(newTextStart)}
                  </span>
                </>
              ) : (
                displayText
              )}
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
