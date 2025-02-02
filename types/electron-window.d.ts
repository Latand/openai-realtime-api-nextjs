export {};

declare global {
  interface Window {
    electron?: {
      clipboard: {
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
    };
  }
}
