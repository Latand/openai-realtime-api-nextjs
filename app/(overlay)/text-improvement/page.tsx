"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { Instrument_Serif, Geist_Mono } from "next/font/google";
import { X, Copy, Check, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { IMPROVEMENT_STYLES, ImprovementStyle, LANGUAGE_OPTIONS, LanguageOption } from "@/lib/text-improvement-prompts";
import { playSound } from "@/lib/tools";
import { addCostLog, calculateChatCost } from "@/lib/cost-tracker";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

// CSS Variables and Styles
const styles = `
:root {
  --bg-deep: #0a0f14;
  --bg-surface: #111820;
  --bg-elevated: #1a222d;
  --bg-hover: #232d3b;
  --text-primary: #e8eaed;
  --text-secondary: #8b939e;
  --text-muted: #4a5568;
  --accent-primary: #f59e0b;
  --accent-glow: rgba(245, 158, 11, 0.15);
  --accent-success: #10b981;
  --accent-error: #ef4444;
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-accent: rgba(245, 158, 11, 0.3);
  --shadow-deep: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
  --noise-opacity: 0.02;
}

.font-display { font-family: var(--font-display); }
.font-mono { font-family: var(--font-mono); }

.card {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, var(--bg-surface) 0%, var(--bg-deep) 100%);
  border: 1px solid var(--border-subtle);
  border-radius: 20px; /* Window is transparent, but card has radius */
  box-shadow: var(--shadow-deep);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.card::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: var(--noise-opacity);
  pointer-events: none;
  z-index: 0;
}

.card-content {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-primary);
}

.status-dot.processing {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.section-label {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  margin-top: 16px;
}

.section-label span {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--border-subtle) 0%, transparent 100%);
}

.text-box {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 14px 16px;
  min-height: 80px;
  max-height: 120px;
  overflow-y: auto;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  resize: none; /* Disable native resize handle */
}

.text-box:focus {
  outline: none;
  border-color: var(--border-accent);
  box-shadow: 0 0 0 1px var(--accent-glow);
}

.text-box--improved {
  border: 1px solid var(--border-accent);
  box-shadow: inset 0 0 20px var(--accent-glow);
}

.skeleton {
  background: linear-gradient(90deg, var(--bg-elevated) 0%, var(--bg-hover) 50%, var(--bg-elevated) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 6px;
  height: 14px;
  margin-bottom: 10px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.improved-text {
  /* animation: textReveal 0.4s ease-out; Remove reveal animation for streaming */
  white-space: pre-wrap;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 3px; }
`;

export default function TextImprovementPage() {
  const [originalText, setOriginalText] = useState("");
  const [improvedText, setImprovedText] = useState("");
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [style, setStyle] = useState<ImprovementStyle>('your-style');
  const [language, setLanguage] = useState<LanguageOption>('auto');
  const [instructions, setInstructions] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const instructionsInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const originalTextDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const settingsRef = useRef<{ style: ImprovementStyle; language: LanguageOption }>({ style: 'your-style', language: 'auto' });

  // Load saved settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      if (window.electron?.textImprovement) {
        const { settings } = await window.electron.textImprovement.loadSettings();
        if (settings?.lastStyle && IMPROVEMENT_STYLES.some(s => s.id === settings.lastStyle)) {
          setStyle(settings.lastStyle);
          settingsRef.current.style = settings.lastStyle;
        }
        if (settings?.lastLanguage && ['auto', 'uk', 'ru', 'en'].includes(settings.lastLanguage)) {
          setLanguage(settings.lastLanguage);
          settingsRef.current.language = settings.lastLanguage;
        }
      }
    };
    loadSettings();
  }, []);

  // Listen for initial text from main process (via IPC)
  useEffect(() => {
    const unsubscribe = window.electron?.textImprovement?.onInitialText?.((data) => {
      console.log("[TextImprovement] Received initial text via IPC, length:", data.text?.length);
      if (data.text && data.text.trim().length > 0) {
        const text = data.text.trim();
        setOriginalText(text);
        setInitialized(true);
        // Use refs to get current settings since state may not be updated yet
        improveText(text, settingsRef.current.style, settingsRef.current.language, "");
      }
    });
    return () => unsubscribe?.();
  }, []);

  // Fall back to clipboard if no initial text received via IPC
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!initialized && !originalText) {
        console.log("[TextImprovement] No IPC text received, falling back to clipboard");
        if (window.electron?.clipboard) {
          const { text } = await window.electron.clipboard.readText();
          if (text && text.trim().length > 0) {
            setOriginalText(text.trim());
            setInitialized(true);
            improveText(text.trim(), settingsRef.current.style, settingsRef.current.language, "");
          }
        }
      }
    }, 200); // Small delay to allow IPC message to arrive first

    return () => clearTimeout(timer);
  }, [initialized, originalText]);

  // Resize window based on content
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      const height = document.body.scrollHeight;
      if (height > 0 && window.electron?.textImprovement) {
        const newHeight = Math.min(Math.max(height, 350), 700);
        window.electron.textImprovement.resize(520, newHeight);
      }
    });
    resizeObserver.observe(document.body);
    return () => resizeObserver.disconnect();
  }, []);

  // Save settings whenever they change
  useEffect(() => {
    window.electron?.textImprovement?.saveSettings({ 
      lastStyle: style,
      lastLanguage: language
    });
  }, [style, language]);

  const improveText = async (text: string, currentStyle: ImprovementStyle, currentLanguage: LanguageOption, currentInstructions: string) => {
    if (!text) return;

    setStatus('loading');
    setErrorMessage("");
    setImprovedText("");

    // Play processing sound
    playSound("/sounds/transcription-processing.mp3");

    try {
      const response = await fetch('/api/improve-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText: text,
          style: currentStyle,
          language: currentLanguage,
          additionalInstructions: currentInstructions
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to improve text');
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedText += chunk;
        setImprovedText(accumulatedText);
      }

      // Calculate and log estimated cost
      const inputLength = (text.length || 0) + (currentInstructions?.length || 0) + 800; // +800 for system prompt approx
      const outputLength = accumulatedText.length;
      
      const inputTokens = Math.ceil(inputLength / 4);
      const outputTokens = Math.ceil(outputLength / 4);
      
      const cost = calculateChatCost('claude-sonnet-4-20250514', {
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens
      });
                   
      addCostLog({
          model: 'claude-sonnet-4-20250514',
          type: 'text_out',
          tokens: inputTokens + outputTokens,
          cost,
          metadata: { estimated: true, inputLen: inputLength, outputLen: outputLength }
      }).catch(e => console.error("Failed to log cost:", e));

      toast.success(`Text improved ($${cost.toFixed(4)})`, {
          description: `${inputTokens + outputTokens} tokens used`,
          duration: 4000
      });

      setStatus('success');

      // Auto-copy to clipboard after generation completes
      if (accumulatedText && window.electron?.clipboard) {
        await window.electron.clipboard.write(accumulatedText);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      }

      // Play finished sound
      playSound("/sounds/transcription-finished.mp3");
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Unknown error");
      setStatus('error');
    }
  };

  const handleOriginalTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setOriginalText(val);

    if (originalTextDebounceRef.current) clearTimeout(originalTextDebounceRef.current);
    originalTextDebounceRef.current = setTimeout(() => {
      if (val.trim().length > 0) {
        improveText(val, style, language, instructions);
      }
    }, 1000);
  };

  const handleStyleChange = (newStyle: ImprovementStyle) => {
    setStyle(newStyle);
    if (originalText) {
      improveText(originalText, newStyle, language, instructions);
    }
  };

  const handleLanguageChange = (selectedLang: string) => {
    const newLang = (language === selectedLang ? 'auto' : selectedLang) as LanguageOption;
    setLanguage(newLang);
    if (originalText) {
      improveText(originalText, style, newLang, instructions);
    }
  };

  const handleInstructionsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInstructions(val);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    
    debounceTimerRef.current = setTimeout(() => {
      if (originalText) {
        improveText(originalText, style, language, val);
      }
    }, 1000);
  };

  const handleClose = () => {
    window.electron?.textImprovement?.closeWindow();
  };

  const handleCopy = async () => {
    if (!improvedText) return;
    try {
      if (window.electron?.clipboard) {
        await window.electron.clipboard.write(improvedText);
      } else {
        await navigator.clipboard.writeText(improvedText);
      }
      setIsCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      toast.error("Failed to copy");
    }
  };

  const handleCopyAndClose = async () => {
    await handleCopy();
    setTimeout(handleClose, 300);
  };

  // Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        handleCopyAndClose();
      }
      // Note: Cmd+C is handled natively by textarea/browser selection usually, 
      // but we override if no selection.
      if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        const selection = window.getSelection();
        if (!selection || selection.toString().length === 0) {
           // If focus is in textarea, let native copy handle it (it copies nothing if no selection?)
           // Actually native copy with no selection usually copies line or nothing.
           // We want to prioritize copying the Result if nothing selected.
           // But if user is editing Original Text, they might want to copy that.
           // Let's check active element.
           if (document.activeElement?.tagName === "TEXTAREA" || document.activeElement?.tagName === "INPUT") {
             return; // Let native behavior handle input fields
           }
           handleCopy();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [improvedText]);

  const getLanguageStatusText = () => {
    switch (language) {
      case 'uk': return "Translating to Ukrainian";
      case 'ru': return "Translating to Russian";
      case 'en': return "Translating to English";
      case 'auto': 
      default: return "Keeping original language";
    }
  };

  return (
    <div className={`p-1 h-full w-full ${instrumentSerif.variable} ${geistMono.variable}`}>
      <style>{styles}</style>
      
      <div className="card">
        {/* Header */}
        <div className="h-12 flex items-center justify-between px-5 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="flex items-center gap-3">
             <div className={`status-dot ${status === 'loading' ? 'processing' : ''}`} />
             <h1 className="title font-display text-lg text-[var(--text-primary)]">Text Improvement</h1>
          </div>
          <button 
             onClick={handleClose}
             className="close-btn p-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
             style={{ WebkitAppRegion: 'no-drag' } as any}
          >
            <X size={18} />
          </button>
        </div>

        <div className="card-content px-5 pb-5 overflow-y-auto">
          
          {/* Original Text */}
          <div className="section-label">
            <span>Original</span>
          </div>
          <textarea
            className="text-box w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-4 min-h-[80px] text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--border-accent)] focus:ring-1 focus:ring-[var(--accent-glow)] transition-all resize-none"
            value={originalText}
            onChange={handleOriginalTextChange}
            placeholder="Paste or type text here..."
            spellCheck={false}
          />

          {/* Style Selector */}
          <div className="section-label mt-4">
            <span>Style</span>
          </div>
          <div className="p-1 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] flex gap-1">
            {IMPROVEMENT_STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => handleStyleChange(s.id)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 ${
                  style === s.id 
                    ? 'bg-[var(--accent-primary)] text-[#0a0f14] shadow-sm' 
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Language Selector */}
          <div className="section-label mt-4 flex justify-between items-center">
            <span>Language</span>
            <span className={`text-[10px] font-mono tracking-wide ${language === 'auto' ? 'text-[var(--text-muted)]' : 'text-[var(--accent-primary)]'}`}>
              {getLanguageStatusText()}
            </span>
          </div>
          <div className="p-1 bg-[var(--bg-elevated)] rounded-xl border border-[var(--border-subtle)] flex gap-1">
            {LANGUAGE_OPTIONS.map((lang) => (
              <button
                key={lang.id}
                onClick={() => handleLanguageChange(lang.id)}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 ${
                  language === lang.id
                    ? 'bg-[var(--accent-primary)] text-[#0a0f14] shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>

          {/* Additional Instructions */}
          <div className="mt-4">
             <input
               ref={instructionsInputRef}
               type="text"
               value={instructions}
               onChange={handleInstructionsChange}
               placeholder="+ Add instructions (e.g., 'Make it punchier')..."
               className="w-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--border-accent)] focus:ring-1 focus:ring-[var(--accent-primary)] transition-all"
             />
          </div>

          {/* Improved Text */}
          <div className="section-label">
            <span>Improved</span>
            {status === 'loading' && <span className="ml-auto text-[var(--accent-primary)] text-[10px] font-mono animate-pulse">GENERATING...</span>}
          </div>

          {status === 'error' ? (
             <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex flex-col gap-2">
                <div className="flex items-center gap-2">
                   <AlertCircle size={16} />
                   <span>{errorMessage}</span>
                </div>
                <button 
                   onClick={() => improveText(originalText, style, language, instructions)}
                   className="self-start px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded text-xs mt-1 transition-colors flex items-center gap-1"
                >
                   <RefreshCw size={12} /> Retry
                </button>
             </div>
          ) : (
            <div className={`text-box ${improvedText ? 'text-box--improved' : ''} min-h-[100px]`}>
               {status === 'loading' && !improvedText ? (
                 <div className="py-1">
                    <div className="skeleton w-full"></div>
                    <div className="skeleton w-[85%]"></div>
                    <div className="skeleton w-[65%]"></div>
                 </div>
               ) : improvedText ? (
                 <div className="improved-text">{improvedText}</div>
               ) : (
                 <div className="text-[var(--text-muted)] text-sm py-4 text-center">
                    Select a style to generate improved text
                 </div>
               )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-5 flex gap-3">
            <button
               onClick={handleCopy}
               disabled={!improvedText || status === 'loading'}
               className="flex-1 py-3 px-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
               {isCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
               {isCopied ? "Copied" : "Copy"}
            </button>
            <button
               onClick={handleCopyAndClose}
               disabled={!improvedText || status === 'loading'}
               className="flex-1 py-3 px-4 rounded-xl bg-[var(--accent-primary)] text-[#0a0f14] font-medium text-sm hover:bg-[#fbbf24] shadow-lg shadow-[rgba(245,158,11,0.2)] hover:shadow-[rgba(245,158,11,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none transition-all flex items-center justify-center gap-2"
            >
               <Copy size={16} />
               Copy & Close
            </button>
          </div>
          
          {/* Hints */}
          <div className="mt-4 flex justify-center gap-3 text-[10px] font-mono text-[var(--text-muted)]">
             <span className="bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">Esc Close</span>
             <span className="bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">⌘↵ Copy & Close</span>
          </div>

        </div>
      </div>
    </div>
  );
}
