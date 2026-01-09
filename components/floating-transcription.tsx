"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface FloatingTranscriptionProps {
  isActive: boolean;
  isConnecting: boolean;
  transcription: string;
  interimTranscription: string;
  error: string | null;
  onStop: () => void;
  onClear: () => void;
  onCopy: () => void;
}

export function FloatingTranscription({
  isActive,
  isConnecting,
  transcription,
  interimTranscription,
  error,
  onStop,
  onClear,
  onCopy,
}: FloatingTranscriptionProps) {
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when text updates
  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [transcription, interimTranscription]);

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
    onCopy();
    onStop();
  }, [onCopy, onStop]);

  if (!isActive && !isConnecting) return null;

  const displayText = transcription + (interimTranscription ? ` ${interimTranscription}` : "");

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
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600/20 to-pink-600/20 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            {/* Recording indicator */}
            <div className="relative">
              <div className={`w-3 h-3 rounded-full ${isConnecting ? "bg-yellow-500" : "bg-red-500"}`} />
              {isActive && (
                <div className="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping opacity-75" />
              )}
            </div>
            {!isMinimized && (
              <span className="text-sm font-medium text-slate-200">
                {isConnecting ? "Connecting..." : "Live Transcription"}
              </span>
            )}
          </div>

          {!isMinimized && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                title="Minimize"
              >
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <button
                onClick={onStop}
                className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
                title="Stop"
              >
                <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
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
              className="p-4 h-48 overflow-y-auto text-slate-100 text-sm leading-relaxed"
            >
              {error ? (
                <p className="text-red-400">{error}</p>
              ) : displayText ? (
                <p>
                  {transcription}
                  {interimTranscription && (
                    <span className="text-slate-400 italic">{interimTranscription}</span>
                  )}
                </p>
              ) : (
                <p className="text-slate-500 italic">
                  {isConnecting ? "Establishing connection..." : "Start speaking..."}
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 px-4 py-3 bg-slate-800/50 border-t border-slate-700/50">
              <button
                onClick={onClear}
                disabled={!transcription}
                className="flex-1 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Clear
              </button>
              <button
                onClick={onCopy}
                disabled={!transcription}
                className="flex-1 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                Copy
              </button>
              <button
                onClick={handleCopyAndClose}
                disabled={!transcription}
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
