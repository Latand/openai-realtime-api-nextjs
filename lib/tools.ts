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
    description: "Stops the current voice session",
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
  // spotifyPlayback: {
  //   description: "Manages the current playback state in Spotify",
  //   parameters: {
  //     action: {
  //       type: "string",
  //       enum: ["get", "start", "pause", "skip"],
  //       description: "Action to perform: 'get', 'start', 'pause' or 'skip'",
  //     },
  //     track_id: {
  //       type: "string",
  //       description:
  //         "Specifies track to play for 'start' action. If omitted, resumes current playback, e.g. '4iV5W9uYEdYUVa79Axb7Rh' ",
  //       optional: true,
  //     },
  //     playlist_id: {
  //       type: "string",
  //       description:
  //         "Specifies playlist to play for 'start' action. If omitted, resumes current playback, e.g. '2Dd4TsqDpOWoqX7eGoe2j3'. Use THIS for playlists ",
  //       optional: true,
  //     },
  //     artist_id: {
  //       type: "string",
  //       description:
  //         "Specifies artist to play for 'start' action. If omitted, resumes current playback, e.g. '2Dd4TsqDpOWoqX7eGoe2j3'. Use THIS for artists ",
  //       optional: true,
  //     },
  //     num_skips: {
  //       type: "number",
  //       description: "Number of tracks to skip for `skip` action",
  //       optional: true,
  //       default: 1,
  //     },
  //   },
  // },
  // spotifySearch: {
  //   description: "Search for tracks, albums, artists, or playlists on Spotify",
  //   parameters: {
  //     query: {
  //       type: "string",
  //       description: "Query term to search for",
  //     },
  //     qtype: {
  //       type: "string",
  //       description:
  //         "Type of items to search for (track, album, artist, playlist, or comma-separated combination)",
  //       enum: ["track", "album", "artist", "playlist"],
  //       default: "track",
  //       optional: true,
  //     },
  //     limit: {
  //       type: "number",
  //       description: "Maximum number of items to return",
  //       optional: true,
  //     },
  //   },
  // },
  // spotifyQueue: {
  //   description: "Manage the playback queue - get the queue or add tracks",
  //   parameters: {
  //     action: {
  //       type: "string",
  //       enum: ["add", "get"],
  //       description: "Action to perform: 'add' or 'get'",
  //     },
  //     track_id: {
  //       type: "string",
  //       description: "Track ID to add to queue (required for add action)",
  //       optional: true,
  //     },
  //   },
  // },
  // spotifyGetInfo: {
  //   description:
  //     "Get detailed information about a Spotify item (track, album, artist, or playlist)",
  //   parameters: {
  //     item_id: {
  //       type: "string",
  //       description: "ID of the item to get information about",
  //     },
  //     qtype: {
  //       type: "string",
  //       enum: ["track", "album", "artist", "playlist"],
  //       description:
  //         "Type of item: 'track', 'album', 'artist', or 'playlist'. If 'playlist' or 'album', returns its tracks. If 'artist', returns albums and top tracks.",
  //       default: "track",
  //       optional: true,
  //     },
  //   },
  // },
  // spotifyUserPlaylists: {
  //   description: "Get the user's playlists",
  //   parameters: {},
  // },
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
