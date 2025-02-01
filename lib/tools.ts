// Add interface for tools
interface Tool {
  type: "function";
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
  };
}

const toolDefinitions = {
  getCurrentTime: {
    description: "Gets the current time in the user's timezone",
    parameters: {},
  },
  stopSession: {
    description: "Stops the current voice session",
    parameters: {},
  },
  launchWebsite: {
    description: "Launches a website in the user's browser",
    parameters: {
      url: {
        type: "string",
        description: "The URL to launch",
      },
    },
  },
  pasteText: {
    description: "Pastes the provided text at the current cursor position",
    parameters: {
      text: {
        type: "string",
        description: "The text to paste at the current cursor position",
      },
    },
  },
  openSpotify: {
    description: "Opens the Spotify desktop application",
    parameters: {},
  },
  controlMusic: {
    description: "Controls music playback in Spotify (play/pause)",
    parameters: {
      action: {
        type: "string",
        enum: ["play", "pause"],
        description: "The action to perform: 'play' or 'pause'",
      },
    },
  },
  adjustVolume: {
    description:
      "Adjusts Spotify's volume level (does not affect system volume)",
    parameters: {
      percentage: {
        type: "number",
        description: "The volume level to set for Spotify (0-100)",
        enum: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        examples: [50, 75, 100],
      },
    },
  },
  adjustSystemVolume: {
    description: "Adjusts the system-wide volume level",
    parameters: {
      percentage: {
        type: "number",
        description: "The volume level to set (0-100)",
        enum: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        examples: [50, 75, 100],
      },
    },
  },
  scrapeWebsite: {
    description:
      "Scrapes a URL and returns content in markdown and HTML formats",
    parameters: {
      url: {
        type: "string",
        description: "The URL to scrape",
      },
    },
  },
} as const;

const tools: Tool[] = Object.entries(toolDefinitions).map(([name, config]) => ({
  type: "function",
  name,
  description: config.description,
  parameters: {
    type: "object",
    properties: config.parameters || {},
  },
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
