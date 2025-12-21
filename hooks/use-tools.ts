"use client";

import { toast } from "sonner";
import { useTranslations } from "@/components/translations-context";
import { mcpClient } from "@/lib/mcp-client";
import { useState, useEffect } from "react";
import type { Tool } from "@/hooks/use-webrtc";

export const useToolsFunctions = () => {
  const { t } = useTranslations();

  const normalizeUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      return null;
    }
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    try {
      const parsed = new URL(withScheme);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  };

  const stopSession = async () => {
    try {
      console.log("Stop session function called");
      toast.success(t("tools.stopSession.toast") + " 🎤", {
        description: t("tools.stopSession.success"),
      });

      return {
        success: true,
        message: "Voice session will be stopped",
      };
    } catch (error) {
      console.error("Error in stopSession:", error);
      return {
        success: false,
        message: `Failed to stop session: ${error}`,
      };
    }
  };

  const timeFunction = () => {
    const now = new Date();
    return {
      success: true,
      time: now.toLocaleTimeString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      message:
        t("tools.time") +
        now.toLocaleTimeString() +
        " in " +
        Intl.DateTimeFormat().resolvedOptions().timeZone +
        " timezone.",
    };
  };

  const launchWebsite = ({ url }: { url: string }) => {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl) {
      toast.error(t("tools.launchWebsite") + " ❌", {
        description: "Invalid or unsupported URL.",
      });
      return {
        success: false,
        message: "Invalid or unsupported URL.",
      };
    }
    const newWindow = window.open(
      normalizedUrl,
      "_blank",
      "noopener,noreferrer"
    );
    if (newWindow) {
      newWindow.opener = null;
    }
    toast(t("tools.launchWebsite") + " 🌐", {
      description:
        t("tools.launchWebsiteSuccess") +
        normalizedUrl +
        ", tell the user it's been launched.",
    });
    return {
      success: true,
      message: `Launched the site ${normalizedUrl}, tell the user it's been launched.`,
    };
  };

  const readClipboard = async () => {
    try {
      let text = "";
      if (window.electron?.clipboard) {
        const result = await window.electron.clipboard.readText();
        if (!result.success) {
          throw new Error(result.error || "Failed to read clipboard");
        }
        text = result.text || "";
      } else {
        text = await navigator.clipboard.readText();
      }

      toast.success(t("tools.clipboard.read.toast") + " 📋", {
        description: t("tools.clipboard.read.success"),
      });

      return {
        success: true,
        text,
        message: `Successfully read from clipboard: ${text}`,
      };
    } catch (error) {
      console.error("Failed to read clipboard:", error);
      return {
        success: false,
        message: `Failed to read clipboard: ${error}`,
      };
    }
  };

  const pasteText = async ({ text }: { text: string }) => {
    try {
      if (window.electron?.clipboard) {
        await window.electron.clipboard.writeAndPaste(text);
      } else {
        await navigator.clipboard.writeText(text);
      }

      toast(t("tools.clipboard.toast") + " 📋", {
        description: t("tools.clipboard.description"),
      });
      return {
        success: true,
        text,
        message: t("tools.clipboard.success"),
      };
    } catch (error) {
      console.error("Failed to paste text:", error);
      return {
        success: false,
        message: `Failed to paste text: ${error}`,
      };
    }
  };

  const scrapeWebsite = async ({ url }: { url: string }) => {
    try {
      const normalizedUrl = normalizeUrl(url);
      if (!normalizedUrl) {
        return {
          success: false,
          message: "Invalid or unsupported URL.",
        };
      }
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (process.env.NEXT_PUBLIC_SESSION_SECRET) {
        headers["x-session-secret"] = process.env.NEXT_PUBLIC_SESSION_SECRET;
      }
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: normalizedUrl }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          message: `Failed to scrape: ${errorText || response.status}`,
        };
      }
      const scrapeResult = await response.json();

      toast.success(t("tools.scrapeWebsite.toast") + " 📋", {
        description: t("tools.scrapeWebsite.success"),
      });

      return {
        success: true,
        message:
          "Here is the scraped website content: " +
          JSON.stringify(scrapeResult.markdown) +
          " Summarize and explain it to the user now in a response.",
      };
    } catch (error) {
      return {
        success: false,
        message: `Error scraping website: ${error}`,
      };
    }
  };

  const adjustSystemVolume = async ({ percentage }: { percentage: number }) => {
    try {
      const parsed = Number(percentage);
      if (!Number.isFinite(parsed)) {
        return {
          success: false,
          message: "Invalid volume percentage",
        };
      }
      const clamped = Math.min(Math.max(parsed, 0), 100);
      if (window.electron?.system) {
        const result = await window.electron.system.adjustSystemVolume(
          clamped
        );
        if (result.success) {
          toast.success(t("tools.volume.toast") + " 🔊", {
            description: t("tools.volume.success") + ` ${clamped}%`,
          });
          return {
            success: true,
            message: `System volume adjusted to ${clamped}%`,
          };
        } else {
          throw new Error(result.error || "Failed to adjust system volume");
        }
      }
      return {
        success: false,
        message: "System control not available in web mode",
      };
    } catch (error) {
      console.error("Failed to adjust system volume:", error);
      toast.error(t("tools.volume.error") + " ❌", {
        description: String(error),
      });
      return {
        success: false,
        message: `Failed to adjust system volume: ${error}`,
      };
    }
  };

  return {
    timeFunction,
    launchWebsite,
    readClipboard,
    pasteText,
    scrapeWebsite,
    stopSession,
    adjustSystemVolume,
  };
};

interface MCPTool {
  name: string;
  description: string;
  inputSchema?: {
    properties?: Record<string, any>;
  };
}

interface MCPToolsResponse {
  success: boolean;
  tools?: MCPTool[];
  error?: string;
}

type ToolHandler = (...args: unknown[]) => unknown;

export const useMCPFunctions = () => {
  const [wrappedFunctions, setWrappedFunctions] = useState<
    Record<string, ToolHandler>
  >({});
  const [toolDefinitions, setToolDefinitions] = useState<Tool[]>([]);

  useEffect(() => {
    const loadTools = async () => {
      try {
        const response = (await mcpClient.getTools()) as MCPToolsResponse;
        if (!response.success) {
          if (response.error) {
            console.warn("MCP tools unavailable:", response.error);
          }
          return;
        }
        const toolsArray = response.tools || [];
        const newWrappedFunctions: Record<string, ToolHandler> = {};
        const newToolDefinitions: Tool[] = [];

        toolsArray.forEach((tool: MCPTool) => {
          const toolName: string = tool.name;

          // Create the tool definition matching the Tool interface
          const toolDefinition: Tool = {
            type: "function",
            name: toolName,
            description: tool.description,
            parameters: {
              type: "object",
              properties: tool.inputSchema?.properties || {},
            },
          };

          newToolDefinitions.push(toolDefinition);

          // Create a generic wrapped function for the tool
          newWrappedFunctions[toolName] = async (input: any) => {
            try {
              const result = await mcpClient.callSpotifyTool(toolName, input);
              toast.success(`${toolName} executed successfully`, {
                description: `Executed ${toolName} with input: ${JSON.stringify(
                  input
                )}`,
              });
              return {
                success: true,
                result,
                message: `${toolName} executed successfully`,
              };
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              toast.error(`${toolName} execution failed`, {
                description: errorMessage,
              });
              return { success: false, message: errorMessage };
            }
          };
        });

        setWrappedFunctions(newWrappedFunctions);
        setToolDefinitions(newToolDefinitions);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error("Failed to load MCP tools:", errorMessage);
      }
    };

    loadTools();
  }, []);

  return { wrappedFunctions, toolDefinitions };
};
