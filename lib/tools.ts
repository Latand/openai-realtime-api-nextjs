// Add interface for tools
import type { Tool } from "@/hooks/use-webrtc";

const toolDefinitions = {
  getCurrentTime: {
    description: "Gets the current time in the user's timezone",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
  stopSession: {
    description: "Stops the current voice session. IMPORTANT: Before calling this, you MUST first call saveConversationSummary to preserve a summary of what was discussed for future sessions.",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
  launchWebsite: {
    description: "Launches a website in the user's browser",
    parameters: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to launch",
        },
      },
    },
  },
  pasteText: {
    description: "Pastes the provided text at the current cursor position",
    parameters: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "The text to paste at the current cursor position",
        },
      },
    },
  },
  adjustSystemVolume: {
    description: "Adjusts the system-wide volume level",
    parameters: {
      type: "object" as const,
      properties: {
        percentage: {
          type: "number",
          description: "The volume level to set (0-100)",
          enum: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
          examples: [50, 75, 100],
        },
      },
    },
  },
  scrapeWebsite: {
    description:
      "Scrapes a URL and returns content in markdown and HTML formats",
    parameters: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL to scrape",
        },
      },
    },
  },
  readClipboard: {
    description: "Reads the current content from the system clipboard",
    parameters: {
      type: "object" as const,
      properties: {},
    },
  },
  copyToClipboard: {
    description: "Copies text to the system clipboard without pasting it",
    parameters: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "The text to copy to clipboard",
        },
      },
    },
  },
  askClaude: {
    description:
      "Asks Claude AI a question and returns the response. Use this for complex queries, coding help, research, or any question you cannot answer directly. Returns a requestId and PID that can be used with getClaudeOutput to check progress.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "The question or prompt to send to Claude",
        },
      },
    },
  },
  getClaudeOutput: {
    description:
      "Check the status and output of a pending Claude request. Use this to see if Claude has finished processing and to read the current output.",
    parameters: {
      type: "object" as const,
      properties: {
        requestId: {
          type: "string",
          description: "The request ID returned by askClaude",
        },
      },
    },
  },
  saveConversationSummary: {
    description:
      "Saves a summary of the current conversation for future context. Call this before ending a session to preserve memory of what was discussed. The summary should be concise (2-3 sentences) covering key topics, decisions, and any pending tasks.",
    parameters: {
      type: "object" as const,
      properties: {
        summary: {
          type: "string",
          description: "A concise summary of the conversation (max 500 characters)",
        },
      },
    },
  },
} as const;

const tools: Tool[] = Object.entries(toolDefinitions).map(([name, config]) => ({
  type: "function",
  name,
  description: config.description,
  parameters: config.parameters,
}));

export type { Tool };
export { tools };

let audioContext: AudioContext | null = null;

export function playSound(soundFile: string): void {
  const initAudioContext = () => {
    if (!audioContext) {
      audioContext = new AudioContext();
    }
    return audioContext.state === "running";
  };

  const tryPlaySound = async (retries = 3, delay = 100) => {
    try {
      // Ensure audio context is initialized
      if (!initAudioContext()) {
        await audioContext?.resume();
      }

      const audio = new Audio(soundFile);
      await audio.play();
    } catch (err) {
      console.error("Error playing sound:", err);
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        await tryPlaySound(retries - 1, delay * 1.5);
      }
    }
  };

  tryPlaySound();
}
