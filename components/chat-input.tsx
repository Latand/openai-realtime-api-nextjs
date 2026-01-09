"use client";

import { useState, useRef } from "react";
import { Send, Mic } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSendMessage, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full relative group">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 rounded-xl blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative flex items-center bg-slate-900/80 border border-slate-700/50 rounded-xl overflow-hidden focus-within:border-slate-600 focus-within:ring-1 focus-within:ring-slate-600/50 transition-all">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={disabled}
          className="flex-1 bg-transparent border-none px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-0 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || disabled}
          className="p-2 mr-1 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {input.trim() ? <Send className="w-4 h-4" /> : <Mic className="w-4 h-4 opacity-50" />}
        </button>
      </div>
    </form>
  );
}

