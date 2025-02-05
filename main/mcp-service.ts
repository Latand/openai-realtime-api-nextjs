import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ipcMain } from "electron";

class MCPService {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async initialize() {
    try {
      this.transport = new StdioClientTransport({
        command: "uv",
        args: [
          "--directory",
          "/home/latand/Projects/spotify-mcp",
          "run",
          "spotify-mcp",
        ],
      });

      this.client = new Client(
        {
          name: "spotify-mcp-client",
          version: "1.0.0",
        },
        {
          capabilities: {
            prompts: {},
            resources: {},
            tools: {},
          },
        }
      );

      await this.client.connect(this.transport);
      const tools = await this.client.listTools();
      console.log("MCP Client connected successfully");
      console.log("Available tools:", JSON.stringify(tools, null, 2));
      return true;
    } catch (error) {
      console.error("Failed to initialize MCP client:", error);
      return false;
    }
  }

  async getTools() {
    if (!this.client) {
      throw new Error("MCP Client not initialized");
    }
    return this.client.listTools();
  }

  async callSpotifyTool(toolName: string, params: Record<string, any> = {}) {
    if (!this.client) {
      throw new Error("MCP Client not initialized");
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: params,
      });
      console.log(
        "MCP Client called tool successfully: %s, %s",
        toolName,
        JSON.stringify(params, null, 2)
      );
      console.log("Result:", JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      console.error(`Failed to call Spotify tool ${toolName}:`, error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      try {
        await this.transport?.close();
        this.client = null;
        this.transport = null;
      } catch (error) {
        console.error("Error disconnecting MCP client:", error);
      }
    }
  }

  setupIPC() {
    ipcMain.handle("mcp:spotify", async (_, { action, params }) => {
      try {
        const result = await this.callSpotifyTool(action, params);
        return { success: true, result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
    ipcMain.handle("mcp:getTools", async () => {
      return await this.getTools();
    });
  }
}

export const mcpService = new MCPService();
