"use client";

import { useEffect, useState } from "react";

interface SessionTimerProps {
  isActive: boolean;
}

export function SessionTimer({ isActive }: SessionTimerProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isActive) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else {
      setSeconds(0);
    }

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive && seconds === 0) return null;

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="font-mono text-sm text-slate-400 tabular-nums tracking-wider bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800/50">
      {formatTime(seconds)}
    </div>
  );
}

