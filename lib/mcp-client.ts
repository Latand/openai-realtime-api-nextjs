// Client-side MCP service that uses IPC bridge
class MCPClientService {
  async callSpotifyTool(
    action: string,
    params: Record<string, unknown> = {}
  ) {
    if (!window.electron?.mcp) {
      throw new Error("MCP functionality not available");
    }

    const result = await window.electron.mcp.spotify(action, params);
    if (!result.success) {
      throw new Error(result.error);
    }
    return result.result;
  }

  async getTools() {
    try {
      if (!window.electron?.mcp) {
        console.warn("MCP functionality not available yet");
        return { success: false, error: "MCP not available" };
      }
      const result = await window.electron.mcp.getTools();
      if (Array.isArray(result)) {
        return { success: true, tools: result };
      }
      if (result && typeof result === "object" && "success" in result) {
        return result as { success: boolean; tools?: unknown; error?: string };
      }
      return { success: false, error: "Unexpected MCP tools response" };
    } catch (error) {
      console.error("Failed to get MCP tools:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

// Create a singleton instance
export const mcpClient = new MCPClientService();
