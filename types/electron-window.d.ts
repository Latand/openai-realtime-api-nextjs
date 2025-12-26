export {};

declare global {
  interface Window {
    electron?: {
      onClaudeResponse: (
        callback: (data: { requestId: string; response: string }) => void
      ) => () => void;
      onClaudeError: (
        callback: (data: { requestId: string; error: string }) => void
      ) => () => void;
      clipboard: {
        write: (
          text: string
        ) => Promise<{ success: boolean; error?: string }>;
        writeAndPaste: (
          text: string
        ) => Promise<{ success: boolean; error?: string }>;
        writeAndEnter: (
          text: string
        ) => Promise<{ success: boolean; error?: string }>;
        readText: () => Promise<{
          success: boolean;
          text?: string;
          error?: string;
        }>;
      };
      system: {
        adjustSystemVolume: (
          percentage: number
        ) => Promise<{ success: boolean; error?: string }>;
        askClaude: (
          query: string
        ) => Promise<{ success: boolean; response?: string; error?: string; pending?: boolean; requestId?: string; pid?: number; message?: string }>;
        getClaudeOutput: (
          requestId: string
        ) => Promise<{
          success: boolean;
          status?: 'pending' | 'done' | 'error';
          pid?: number;
          elapsedSeconds?: number;
          stdoutLength?: number;
          stderrLength?: number;
          stdoutTail?: string;
          response?: string;
          error?: string;
        }>;
      };
      window: {
        toggleDevTools: () => Promise<void>;
      };
      mcp: {
        spotify: (
          action: string,
          params?: Record<string, any>
        ) => Promise<{ success: boolean; result?: any; error?: string }>;
        getTools: () => Promise<{
          success: boolean;
          tools?: any;
          error?: string;
        }>;
      };
      memory: {
        saveCompacts: (
          compacts: unknown[]
        ) => Promise<{ success: boolean; error?: string }>;
        loadCompacts: () => Promise<{
          success: boolean;
          compacts?: unknown[];
          error?: string;
        }>;
        savePersistentNotes: (
          notes: string[]
        ) => Promise<{ success: boolean; error?: string }>;
        loadPersistentNotes: () => Promise<{
          success: boolean;
          notes?: string[];
          error?: string;
        }>;
        saveSystemPrompt: (
          prompt: string
        ) => Promise<{ success: boolean; error?: string }>;
        loadSystemPrompt: () => Promise<{
          success: boolean;
          prompt?: string | null;
          error?: string;
        }>;
      };
    };
  }
}
