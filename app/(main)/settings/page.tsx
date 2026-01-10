"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Eye, EyeOff, Terminal, Key, Power, Mic, MessageSquare, Activity } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MicrophoneSelector } from "@/components/microphone-select";
import { VoiceSelector } from "@/components/voice-select";
import { getDefaultSystemPrompt } from "@/lib/conversation-memory";
import { TranslationsProvider } from "@/components/translations-context";

export default function SettingsPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [picovoiceKey, setPicovoiceKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [isHiddenOnLaunch, setIsHiddenOnLaunch] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // These states are managed by global state in the main page usually, 
  // but for a dedicated settings page, we might need to access them via context 
  // or simple local storage/electron store if they persist.
  // For now, let's focus on the electron-backed settings.

  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        
        // Load API Key
        if (window.electron?.settings?.getApiKey) {
          const result = await window.electron.settings.getApiKey();
          setApiKey(result.apiKey || "");
          setAnthropicKey(result.anthropicKey || "");
          setPicovoiceKey(result.picovoiceKey || "");
        }

        // Load System Prompt
        if (window.electron?.memory?.loadSystemPrompt) {
          const { prompt } = await window.electron.memory.loadSystemPrompt();
          setSystemPrompt(prompt || getDefaultSystemPrompt());
        }

        // Load Auto Launch
        if (window.electron?.settings?.getAutoLaunch) {
          const { isEnabled } = await window.electron.settings.getAutoLaunch();
          setAutoLaunch(isEnabled ?? false);
        }

      } catch (error) {
        console.error("Failed to load settings:", error);
        toast.error("Failed to load settings");
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleSave = async () => {
    try {
      // Save API Key
      if (window.electron?.settings?.saveApiKey) {
        await window.electron.settings.saveApiKey(apiKey, anthropicKey, picovoiceKey);
      }

      // Save System Prompt
      if (window.electron?.memory?.saveSystemPrompt) {
        await window.electron.memory.saveSystemPrompt(systemPrompt);
      }

      toast.success("Settings saved successfully");
      
      // Optional: Navigate back
      // router.back();
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings");
    }
  };

  const handleAutoLaunchChange = async (checked: boolean) => {
    setAutoLaunch(checked);
    try {
      if (window.electron?.settings?.setAutoLaunch) {
        await window.electron.settings.setAutoLaunch(checked, isHiddenOnLaunch);
        toast.success(checked ? "Auto-launch enabled" : "Auto-launch disabled");
      }
    } catch (error) {
      console.error("Failed to update auto-launch:", error);
      toast.error("Failed to update auto-launch settings");
      setAutoLaunch(!checked); // Revert UI on error
    }
  };

  return (
    <TranslationsProvider>
    <div className="h-screen w-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-8 p-6 pb-20">
        {/* Header */}
        <div className="flex items-center gap-4 pb-6 border-b border-slate-800">
          <button 
            onClick={() => router.back()}
            className="p-2 hover:bg-slate-800 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6 text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Settings
            </h1>
            <p className="text-sm text-slate-500">Configure application behavior and intelligence</p>
          </div>
        </div>

          {/* API Configuration */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-blue-400 mb-2">
            <Key className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-slate-200">API Configuration</h2>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="api-key" className="text-slate-300">OpenAI API Key</Label>
              <div className="relative">
                <input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all pr-12 font-mono text-sm"
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Your API key is stored locally in specific application data directory.
              </p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800/50">
              <Label htmlFor="anthropic-key" className="text-slate-300">Anthropic API Key</Label>
              <div className="relative">
                <input
                  id="anthropic-key"
                  type={showApiKey ? "text" : "password"}
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all pr-12 font-mono text-sm"
                />
              </div>
              <p className="text-xs text-slate-500">
                Required for Text Improvement features (Claude).
              </p>
            </div>
          </div>
        </section>

        {/* Wake Word Configuration */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-indigo-400 mb-2">
            <Mic className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-slate-200">Wake Word Configuration</h2>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="picovoice-key" className="text-slate-300">Picovoice Access Key</Label>
              <div className="relative">
                <input
                  id="picovoice-key"
                  type={showApiKey ? "text" : "password"}
                  value={picovoiceKey}
                  onChange={(e) => setPicovoiceKey(e.target.value)}
                  placeholder="AccessKey from console.picovoice.ai"
                  className={`w-full bg-slate-950 border ${
                    picovoiceKey && !picovoiceKey.match(/^[a-zA-Z0-9+/=]+$/) 
                      ? "border-yellow-500/50 focus:ring-yellow-500/50" 
                      : "border-slate-800 focus:ring-indigo-500/50"
                  } rounded-lg px-4 py-2.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:border-transparent transition-all pr-12 font-mono text-sm`}
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {picovoiceKey && !picovoiceKey.match(/^[a-zA-Z0-9+/=]+$/) && (
                 <p className="text-xs text-yellow-500 mt-1">
                   Warning: Key format looks invalid (should be Base64).
                 </p>
              )}
              <p className="text-xs text-slate-500 flex justify-between mt-1">
                <span>Required for "Hi Celestial" wake word detection.</span>
                <a 
                  href="https://console.picovoice.ai/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 underline"
                >
                  Get free key
                </a>
              </p>
            </div>
          </div>
        </section>

        {/* System Instructions */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-purple-400 mb-2">
            <Terminal className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-slate-200">System Instructions</h2>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="system-prompt" className="text-slate-300">System Prompt</Label>
              <textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="You are a helpful assistant..."
                className="w-full h-48 bg-slate-950 border border-slate-800 rounded-lg px-4 py-3 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all font-mono text-sm resize-y leading-relaxed"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => setSystemPrompt(getDefaultSystemPrompt())}
                  className="text-xs text-slate-500 hover:text-purple-400 transition-colors"
                >
                  Reset to default
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Voice & Audio Settings */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-orange-400 mb-2">
            <Activity className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-slate-200">Voice & Audio</h2>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-6">
            <div className="space-y-4">
              <VoiceSelector
                value={typeof window !== 'undefined' ? localStorage.getItem("voice") || "coral" : "coral"}
                onValueChange={(val) => {
                  if (typeof window !== 'undefined') localStorage.setItem("voice", val);
                  // We can't easily update the main page state from here without context/global state
                  toast.info("Voice setting saved (requires refresh)");
                }}
              />
              
              <div className="pt-2 flex items-center justify-between">
                 <div className="space-y-0.5">
                  <Label className="text-slate-200 text-base">Microphone</Label>
                  <p className="text-sm text-slate-500">Select default input device</p>
                 </div>
                 {/* MicrophoneSelector requires state that is hard to mock here without refactoring. 
                     For now, users can select mic in the main view. We'll leave a note. */}
                 <div className="text-sm text-slate-500 italic">Select in main view</div>
              </div>
            </div>
          </div>
        </section>

        {/* Application Settings */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 text-emerald-400 mb-2">
            <Power className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-slate-200">Application</h2>
          </div>
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-5 space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="auto-launch" className="text-slate-200 text-base">Run at Startup</Label>
                <p className="text-sm text-slate-500">Launch application automatically when you sign in</p>
              </div>
              <Switch
                id="auto-launch"
                checked={autoLaunch}
                onCheckedChange={handleAutoLaunchChange}
              />
            </div>
          </div>
        </section>

        {/* Save Button */}
        <div className="pt-4 flex justify-end pb-10">
          <button
            onClick={handleSave}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-8 py-3 rounded-xl font-medium transition-all shadow-lg shadow-blue-900/20 active:scale-95"
          >
            <Save className="w-5 h-5" />
            Save Changes
          </button>
        </div>
      </div>
    </div>
    </TranslationsProvider>
  );
}

