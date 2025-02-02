// Client-side MCP service that uses IPC bridge
class MCPClientService {
  async callSpotifyTool(action: string, params: Record<string, any> = {}) {
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
        return [];
      }
      const result = await window.electron.mcp.getTools();
      return result || [];
    } catch (error) {
      console.error("Failed to get MCP tools:", error);
      return [];
    }
  }
}

// Create a singleton instance
export const mcpClient = new MCPClientService();
