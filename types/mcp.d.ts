declare module "@modelcontextprotocol/sdk/client/index.js" {
  export interface ClientConfig {
    name: string;
    version: string;
  }

  export interface ClientCapabilities {
    capabilities: {
      prompts: Record<string, unknown>;
      resources: Record<string, unknown>;
      tools: Record<string, unknown>;
    };
  }

  export interface ToolCall {
    name: string;
    arguments: Record<string, any>;
  }

  export class Client {
    constructor(config: ClientConfig, capabilities: ClientCapabilities);
    connect(transport: any): Promise<void>;
    disconnect(): Promise<void>;
    callTool(tool: ToolCall): Promise<any>;
    listPrompts(): Promise<any>;
    getPrompt(name: string, args: Record<string, any>): Promise<any>;
    listResources(): Promise<any>;
    readResource(uri: string): Promise<any>;
  }
}

declare module "@modelcontextprotocol/sdk/client/stdio.js" {
  export interface StdioConfig {
    command: string;
    args: string[];
  }

  export class StdioClientTransport {
    constructor(config: StdioConfig);
    connect(): Promise<void>;
    close(): Promise<void>;
  }
}
