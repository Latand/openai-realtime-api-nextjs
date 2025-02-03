"use client";

import { toast } from "sonner";
import { useTranslations } from "@/components/translations-context";
import FirecrawlApp, { ScrapeResponse } from "@mendable/firecrawl-js";
import { mcpClient } from "@/lib/mcp-client";
import { useState, useEffect } from "react";
import type { Tool } from "@/hooks/use-webrtc";

export const useToolsFunctions = () => {
  const { t } = useTranslations();

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
    window.open(url, "_blank");
    toast(t("tools.launchWebsite") + " 🌐", {
      description:
        t("tools.launchWebsiteSuccess") +
        url +
        ", tell the user it's been launched.",
    });
    return {
      success: true,
      message: `Launched the site${url}, tell the user it's been launched.`,
    };
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
    const apiKey = process.env.NEXT_PUBLIC_FIRECRAWL_API_KEY;
    try {
      const app = new FirecrawlApp({ apiKey: apiKey });
      const scrapeResult = (await app.scrapeUrl(url, {
        formats: ["markdown", "html"],
      })) as ScrapeResponse;

      if (!scrapeResult.success) {
        console.log(scrapeResult.error);
        return {
          success: false,
          message: `Failed to scrape: ${scrapeResult.error}`,
        };
      }

      toast.success(t("tools.scrapeWebsite.toast") + " 📋", {
        description: t("tools.scrapeWebsite.success"),
      });

      return {
        success: true,
        message:
          "Here is the scraped website content: " +
          JSON.stringify(scrapeResult.markdown) +
          "Summarize and explain it to the user now in a response.",
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
      if (window.electron?.system) {
        const result = await window.electron.system.adjustSystemVolume(
          percentage
        );
        if (result.success) {
          toast.success(t("tools.volume.toast") + " 🔊", {
            description: t("tools.volume.success") + ` ${percentage}%`,
          });
          return {
            success: true,
            message: `System volume adjusted to ${percentage}%`,
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

  const spotifyPlayback = async ({
    action,
    track_id,
    playlist_id,
    artist_id,
    num_skips,
  }: {
    action: "get" | "start" | "pause" | "skip";
    track_id?: string;
    playlist_id?: string;
    artist_id?: string;
    num_skips?: number;
  }) => {
    try {
      const result = await mcpClient.callSpotifyTool("SpotifyPlayback", {
        action,
        track_id,
        playlist_id,
        artist_id,
        num_skips: num_skips || 1,
      });

      const actionMessages = {
        get: "Got playback information",
        start: track_id
          ? "Started playing track"
          : playlist_id
          ? "Started playing playlist"
          : artist_id
          ? "Started playing artist"
          : "Resumed playback",
        pause: "Paused playback",
        skip: `Skipped ${num_skips || 1} track(s)`,
      };

      const successMessage = actionMessages[action];
      toast.success("Spotify Playback 🎵", { description: successMessage });

      return {
        success: true,
        result,
        message: successMessage,
      };
    } catch (error) {
      console.error("Failed to control Spotify playback:", error);
      toast.error("Spotify Playback Error ❌", {
        description: `Failed to control playback: ${error}`,
      });
      return {
        success: false,
        message: `Failed to control playback: ${error}`,
      };
    }
  };

  return {
    timeFunction,
    launchWebsite,
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

export const useMCPFunctions = () => {
  const [wrappedFunctions, setWrappedFunctions] = useState<
    Record<string, Function>
  >({});
  const [toolDefinitions, setToolDefinitions] = useState<Tool[]>([]);

  useEffect(() => {
    const loadTools = async () => {
      try {
        const response = (await mcpClient.getTools()) as MCPToolsResponse;
        const toolsArray = response.tools || [];
        const newWrappedFunctions: Record<string, Function> = {};
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
