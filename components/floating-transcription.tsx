"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { AudioVisualizer } from "@/components/audio-visualizer";

interface FloatingTranscriptionProps {
  isActive: boolean;
  isConnecting: boolean;
  transcription: string;
  interimTranscription: string;
  error: string | null;
  currentVolume?: number; // Added optional volume prop
  onStop: () => void;
  onClear: () => void;
  onCopy: () => void;
  onImprove?: (text: string) => Promise<string | void>;
}

export function FloatingTranscription({
  isActive,
  isConnecting,
  transcription,
  interimTranscription,
  error,
  currentVolume = 0,
  onStop,
  onClear,
  onCopy,
  onImprove,
}: FloatingTranscriptionProps) {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isImproving, setIsImproving] = useState(false);
  const [improvedText, setImprovedText] = useState<string | null>(null);
  
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when text updates
  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [transcription, interimTranscription, improvedText]);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setIsDragging(true);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      dragOffset.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }
  }, []);

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Copy and close
  const handleCopyAndClose = useCallback(() => {
    const textToCopy = improvedText || transcription;
    if (textToCopy) {
      if (window.electron?.clipboard) {
        window.electron.clipboard.write(textToCopy);
      } else {
        navigator.clipboard.writeText(textToCopy);
      }
      toast.success("Copied to clipboard");
    }
    onStop();
  }, [onStop, improvedText, transcription]);

  const handleImprove = async () => {
    if (!onImprove || !transcription) return;
    
    setIsImproving(true);
    try {
      // If we get a string back, update local state
      const result = await onImprove(transcription);
      if (typeof result === 'string') {
        setImprovedText(result);
        toast.success("Text improved");
      }
    } catch (err) {
      console.error("Improvement failed:", err);
      toast.error("Failed to improve text");
    } finally {
      setIsImproving(false);
    }
  };

  // Only render if active OR if we have content (persistence mode)
  // This allows the window to stay open after recording stops so user can read/copy/improve
  if (!isActive && !isConnecting && !transcription && !improvedText && !error) return null;

  const displayText = improvedText || (transcription + (interimTranscription ? ` ${interimTranscription}` : ""));

  return (
    <div
      ref={containerRef}
      className={`fixed z-50 transition-all duration-200 ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
      style={{ left: position.x, top: position.y }}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`
          bg-gradient-to-br from-slate-900/95 to-slate-800/95
          backdrop-blur-xl border border-slate-700/50
          rounded-2xl shadow-2xl shadow-purple-500/10
          overflow-hidden transition-all duration-300
          ${isMinimized ? "w-14 h-14" : "w-96"}
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600/20 to-pink-600/20 border-b border-slate-700/50 relative overflow-hidden">
          
          {/* Visualizer Background (only when active) */}
          {isActive && (
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <AudioVisualizer 
                currentVolume={currentVolume} 
                isSessionActive={true} 
                color="#a855f7" // Purple
              />
            </div>
          )}

          <div className="flex items-center gap-3 relative z-10">
            {/* Recording indicator */}
            <div className="relative">
              {/* Only show "red" and ping when ACTIVELY recording */}
              <div 
                className={`w-3 h-3 rounded-full transition-colors duration-300
                  ${isConnecting ? "bg-yellow-500" : isActive ? "bg-red-500" : "bg-slate-500"}
                `} 
              />
              {/* Ping animation ONLY when active */}
              {isActive && !isConnecting && (
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping opacity-75" />
              )}
            </div>
            {!isMinimized && (
              <span className="text-sm font-medium text-slate-200">
                {isConnecting 
                  ? "Connecting..." 
                  : isActive 
                    ? "Live Transcription" 
                    : improvedText 
                      ? "Improved Text" 
                      : "Transcription Paused"}
              </span>
            )}
          </div>

          {!isMinimized && (
            <div className="flex items-center gap-1 relative z-10">
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                title="Minimize"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              {isActive && (
                <button
                  onClick={onStop}
                  className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                  title="Stop"
                >
                  <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {/* Close button when not active (instead of Stop) */}
              {!isActive && (
                <button
                  onClick={onStop} // onStop usually handles closing logic or clearing active state
                  className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                  title="Close"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {isMinimized ? (
          <button
            onClick={() => setIsMinimized(false)}
            className="w-full h-full p-2 flex items-center justify-center hover:bg-slate-700/30"
            title="Expand"
          >
            <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        ) : (
          <>
            {/* Transcription text area */}
            <div
              ref={textRef}
              className="p-4 h-48 overflow-y-auto text-slate-100 text-sm leading-relaxed relative"
            >
              {/* Background Equalizer Effect (optional secondary) */}
              
              {error ? (
                <p className="text-red-400">{error}</p>
              ) : displayText ? (
                <p className={improvedText ? "text-emerald-300" : ""}>
                  {displayText}
                  {!improvedText && interimTranscription && (
                    <span className="text-slate-400 italic">...</span>
                  )}
                </p>
              ) : (
                <p className="text-slate-500 italic">
                  {isConnecting ? "Establishing connection..." : isActive ? "Start speaking..." : "No transcription."}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-800/50 border-t border-slate-700/50">
              {onImprove && !improvedText && (
                <button
                  onClick={handleImprove}
                  disabled={!transcription || isImproving}
                  className={`
                    p-2 rounded-lg transition-all
                    ${isImproving 
                      ? "bg-purple-500/20 text-purple-400 cursor-wait animate-pulse" 
                      : "bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 hover:text-purple-300 border border-purple-500/30"}
                  `}
                  title="Instant Improve (Magic Wand)"
                >
                  <Wand2 className={`w-4 h-4 ${isImproving ? "animate-spin" : ""}`} />
                </button>
              )}
              
              <button
                onClick={() => {
                   setImprovedText(null);
                   onClear();
                }}
                disabled={!transcription && !improvedText}
                className="flex-1 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Clear
              </button>
              <button
                onClick={onCopy}
                disabled={!transcription && !improvedText}
                className="flex-1 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Copy
              </button>
              <button
                onClick={handleCopyAndClose}
                disabled={!transcription && !improvedText}
                className="flex-1 px-3 py-2 text-xs font-medium text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-all shadow-lg shadow-purple-500/25"
              >
                Copy & Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
