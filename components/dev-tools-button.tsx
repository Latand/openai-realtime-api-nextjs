"use client";

import { Button } from "@/components/ui/button";
import { useCallback } from "react";

export function DevToolsButton() {
  const handleClick = useCallback(() => {
    try {
      if (window.electron?.window?.toggleDevTools) {
        window.electron.window.toggleDevTools();
      } else {
        console.warn("Developer tools API not available");
      }
    } catch (error) {
      console.error("Failed to toggle developer tools:", error);
    }
  }, []);

  return (
    <Button
      variant="ghost"
      size="icon"
      className="fixed bottom-4 right-4 opacity-50 hover:opacity-100"
      onClick={handleClick}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m18 16 4-4-4-4" />
        <path d="m6 8-4 4 4 4" />
        <path d="m14.5 4-5 16" />
      </svg>
    </Button>
  );
}
