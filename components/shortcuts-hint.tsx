"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Keyboard } from "lucide-react";

export function ShortcutsHint() {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <button 
          className="group p-2.5 bg-slate-800/60 hover:bg-slate-700/80 border border-slate-600/40 hover:border-slate-500/60 text-slate-400 hover:text-white rounded-lg transition-all duration-200"
          title="Keyboard Shortcuts"
        >
          <Keyboard className="w-5 h-5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 bg-slate-900 border-slate-800 p-4">
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-slate-200">Keyboard Shortcuts</h4>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Live Transcription</span>
              <span className="font-mono text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">Ctrl+Shift+T</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Whisper Mode</span>
              <span className="font-mono text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">Ctrl+Shift+R</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Text Improvement</span>
              <span className="font-mono text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">Ctrl+Shift+G</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Toggle Mute</span>
              <span className="font-mono text-slate-300 bg-slate-800 px-1.5 py-0.5 rounded">Ctrl+Shift+M</span>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
