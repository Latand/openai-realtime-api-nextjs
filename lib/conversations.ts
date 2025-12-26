interface Conversation {
    id: string; // Unique ID for react rendering and loggin purposes
    role: string; // "user", "assistant", or "tool"
    text: string; // User or assistant message
    timestamp: string; // ISO string for message time
    isFinal: boolean; // Whether the transcription is final
    status?: "speaking" | "processing" | "final"; // Status for real-time conversation states
    // Tool call specific fields
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    toolResult?: unknown;
    toolError?: string;
  }

  export type { Conversation };
  