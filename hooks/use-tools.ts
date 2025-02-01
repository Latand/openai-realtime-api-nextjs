"use client";

import { toast } from "sonner";
import confetti from "canvas-confetti";
import { animate as framerAnimate } from "framer-motion";
import { useTranslations } from "@/components/translations-context";
import FirecrawlApp, { ScrapeResponse } from "@mendable/firecrawl-js";

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

  const backgroundFunction = () => {
    try {
      const html = document.documentElement;
      const currentTheme = html.classList.contains("dark") ? "dark" : "light";
      const newTheme = currentTheme === "dark" ? "light" : "dark";

      html.classList.remove(currentTheme);
      html.classList.add(newTheme);

      toast(`Switched to ${newTheme} mode! 🌓`, {
        description: t("tools.switchTheme") + newTheme + ".",
      });

      return {
        success: true,
        theme: newTheme,
        message: t("tools.switchTheme") + newTheme + ".",
      };
    } catch (error) {
      return {
        success: false,
        message: t("tools.themeFailed") + ": " + error,
      };
    }
  };

  const partyFunction = () => {
    try {
      const duration = 5 * 1000;
      const colors = [
        "#a786ff",
        "#fd8bbc",
        "#eca184",
        "#f8deb1",
        "#3b82f6",
        "#14b8a6",
        "#f97316",
        "#10b981",
        "#facc15",
      ];

      const confettiConfig = {
        particleCount: 30,
        spread: 100,
        startVelocity: 90,
        colors,
        gravity: 0.5,
      };

      const shootConfetti = (
        angle: number,
        origin: { x: number; y: number }
      ) => {
        confetti({
          ...confettiConfig,
          angle,
          origin,
        });
      };

      const animate = () => {
        const now = Date.now();
        const end = now + duration;

        const elements = document.querySelectorAll(
          "div, p, button, h1, h2, h3"
        );
        elements.forEach((element) => {
          framerAnimate(
            element,
            {
              scale: [1, 1.1, 1],
              rotate: [0, 5, -5, 0],
            },
            {
              duration: 0.5,
              repeat: 10,
              ease: "easeInOut",
            }
          );
        });

        const frame = () => {
          if (Date.now() > end) return;
          shootConfetti(60, { x: 0, y: 0.5 });
          shootConfetti(120, { x: 1, y: 0.5 });
          requestAnimationFrame(frame);
        };

        const mainElement = document.querySelector("main");
        if (mainElement) {
          mainElement.classList.remove(
            "bg-gradient-to-b",
            "from-gray-50",
            "to-white"
          );
          const originalBg = mainElement.style.backgroundColor;

          const changeColor = () => {
            const now = Date.now();
            const end = now + duration;

            const colorCycle = () => {
              if (Date.now() > end) {
                framerAnimate(
                  mainElement,
                  { backgroundColor: originalBg },
                  { duration: 0.5 }
                );
                return;
              }
              const newColor =
                colors[Math.floor(Math.random() * colors.length)];
              framerAnimate(
                mainElement,
                { backgroundColor: newColor },
                { duration: 0.2 }
              );
              setTimeout(colorCycle, 200);
            };

            colorCycle();
          };

          changeColor();
        }

        frame();
      };

      animate();
      toast.success(t("tools.partyMode.toast") + " 🎉", {
        description: t("tools.partyMode.description"),
      });
      return { success: true, message: t("tools.partyMode.success") + " 🎉" };
    } catch (error) {
      return {
        success: false,
        message: t("tools.partyMode.failed") + ": " + error,
      };
    }
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

  const openSpotify = async () => {
    try {
      if (window.electron?.system) {
        await window.electron.system.openSpotify();
        return {
          success: true,
          message: "Opened Spotify",
        };
      }
      return {
        success: false,
        message: "System control not available in web mode",
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to open Spotify: ${error}`,
      };
    }
  };

  const controlMusic = async ({ action }: { action: "play" | "pause" }) => {
    try {
      if (window.electron?.system) {
        await window.electron.system.controlMusic(action);
        return {
          success: true,
          message: `Music ${action}ed successfully`,
        };
      }
      return {
        success: false,
        message: "System control not available in web mode",
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to ${action} music: ${error}`,
      };
    }
  };

  const adjustVolume = async ({ percentage }: { percentage: number }) => {
    try {
      if (window.electron?.system) {
        await window.electron.system.adjustVolume(percentage);
        return {
          success: true,
          message: `Volume adjusted by ${percentage}%`,
        };
      }
      return {
        success: false,
        message: "System control not available in web mode",
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to adjust volume: ${error}`,
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

  return {
    timeFunction,
    launchWebsite,
    pasteText,
    openSpotify,
    controlMusic,
    adjustVolume,
    scrapeWebsite,
    stopSession,
    adjustSystemVolume,
  };
};
