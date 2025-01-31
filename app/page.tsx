"use client";

import React, { useEffect, useState } from "react";
import useWebRTCAudioSession from "@/hooks/use-webrtc";
import { tools } from "@/lib/tools";
import { BroadcastButton } from "@/components/broadcast-button";
import { StatusDisplay } from "@/components/status";
import { motion } from "framer-motion";
import { useToolsFunctions } from "@/hooks/use-tools";
import { TranslationsProvider } from "@/components/translations-context";

const AppContent: React.FC = () => {
  const [voice] = useState("coral");

  const {
    status,
    isSessionActive,
    registerFunction,
    handleStartStopClick,
    msgs,
  } = useWebRTCAudioSession(voice, tools);

  const toolsFunctions = useToolsFunctions();

  useEffect(() => {
    Object.entries(toolsFunctions).forEach(([name, func]) => {
      const functionNames: Record<string, string> = {
        timeFunction: "getCurrentTime",
        backgroundFunction: "changeBackgroundColor",
        partyFunction: "partyMode",
        launchWebsite: "launchWebsite",
        copyToClipboard: "copyToClipboard",
        scrapeWebsite: "scrapeWebsite",
        pressEnter: "pressEnter",
        openSpotify: "openSpotify",
        controlMusic: "controlMusic",
        adjustVolume: "adjustVolume",
      };

      registerFunction(functionNames[name], func);
    });
  }, [registerFunction, toolsFunctions]);

  return (
    <main className="h-full flex items-center justify-center">
      <motion.div
        className="flex flex-col items-center gap-6 p-8 text-white"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <BroadcastButton
          isSessionActive={isSessionActive}
          onClick={handleStartStopClick}
        />
        {status && <StatusDisplay status={status} />}
      </motion.div>
    </main>
  );
};

const App: React.FC = () => {
  return (
    <TranslationsProvider>
      <AppContent />
    </TranslationsProvider>
  );
};

export default App;
