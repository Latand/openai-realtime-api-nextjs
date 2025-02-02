"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mcpService = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
const electron_1 = require("electron");
class MCPService {
    constructor() {
        this.client = null;
        this.transport = null;
    }
    async initialize() {
        try {
            this.transport = new stdio_js_1.StdioClientTransport({
                command: "uv",
                args: [
                    "--directory",
                    "/home/latand/Projects/spotify-mcp",
                    "run",
                    "spotify-mcp",
                ],
            });
            this.client = new index_js_1.Client({
                name: "spotify-mcp-client",
                version: "1.0.0",
            }, {
                capabilities: {
                    prompts: {},
                    resources: {},
                    tools: {},
                },
            });
            await this.client.connect(this.transport);
            const tools = await this.client.listTools();
            console.log("MCP Client connected successfully");
            console.log("Available tools:", JSON.stringify(tools, null, 2));
            return true;
        }
        catch (error) {
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
    async callSpotifyTool(toolName, params = {}) {
        if (!this.client) {
            throw new Error("MCP Client not initialized");
        }
        try {
            const result = await this.client.callTool({
                name: toolName,
                arguments: params,
            });
            console.log("MCP Client called tool successfully: %s, %s", toolName, JSON.stringify(params, null, 2));
            console.log("Result:", JSON.stringify(result, null, 2));
            return result;
        }
        catch (error) {
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
            }
            catch (error) {
                console.error("Error disconnecting MCP client:", error);
            }
        }
    }
    setupIPC() {
        electron_1.ipcMain.handle("mcp:spotify", async (_, { action, params }) => {
            try {
                const result = await this.callSpotifyTool(action, params);
                return { success: true, result };
            }
            catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        });
        electron_1.ipcMain.handle("mcp:getTools", async () => {
            return await this.getTools();
        });
    }
}
exports.mcpService = new MCPService();
//# sourceMappingURL=mcp-service.js.map