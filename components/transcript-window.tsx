"use client";

import { useEffect, useRef } from "react";
import { Conversation } from "@/lib/conversations";

interface TranscriptWindowProps {
  conversation: Conversation[];
  isOpen: boolean;
  onClose: () => void;
  onClear?: () => void;
  onCompact?: (additionalPrompt: string) => void;
}

export function TranscriptWindow({
  conversation,
  isOpen,
  onClose,
  onClear,
  onCompact,
}: TranscriptWindowProps) {
  const windowRef = useRef<Window | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onClearRef = useRef(onClear);
  const onCompactRef = useRef(onCompact);

  // Keep refs updated
  useEffect(() => {
    onClearRef.current = onClear;
  }, [onClear]);

  useEffect(() => {
    onCompactRef.current = onCompact;
  }, [onCompact]);

  useEffect(() => {
    if (isOpen && !windowRef.current) {
      // Open new window
      const newWindow = window.open(
        "",
        "TranscriptWindow",
        "width=500,height=700,menubar=no,toolbar=no,location=no,status=no"
      );

      if (newWindow) {
        windowRef.current = newWindow;

        // Set up the window content
        newWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Conversation Transcript</title>
              <style>
                * {
                  box-sizing: border-box;
                  margin: 0;
                  padding: 0;
                }
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  background: #1a1a2e;
                  color: #eee;
                  padding: 16px;
                  height: 100vh;
                  overflow: hidden;
                  display: flex;
                  flex-direction: column;
                }
                .header {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-bottom: 16px;
                  padding-bottom: 12px;
                  border-bottom: 1px solid #333;
                }
                .header h1 {
                  font-size: 18px;
                  font-weight: 600;
                }
                .header-buttons {
                  display: flex;
                  gap: 8px;
                }
                .btn {
                  background: #333;
                  color: #eee;
                  border: none;
                  padding: 6px 12px;
                  border-radius: 6px;
                  cursor: pointer;
                  font-size: 12px;
                  transition: background 0.2s;
                }
                .btn:hover {
                  background: #444;
                }
                .btn:disabled {
                  opacity: 0.5;
                  cursor: not-allowed;
                }
                .btn-compact {
                  background: #2563eb;
                }
                .btn-compact:hover {
                  background: #1d4ed8;
                }
                .messages {
                  flex: 1;
                  overflow-y: auto;
                  display: flex;
                  flex-direction: column;
                  gap: 12px;
                  margin-bottom: 16px;
                }
                .message {
                  padding: 12px 16px;
                  border-radius: 12px;
                  max-width: 85%;
                  word-wrap: break-word;
                }
                .message.user {
                  background: #3b82f6;
                  color: white;
                  align-self: flex-end;
                  border-bottom-right-radius: 4px;
                }
                .message.assistant {
                  background: #374151;
                  color: #eee;
                  align-self: flex-start;
                  border-bottom-left-radius: 4px;
                }
                .message.speaking {
                  opacity: 0.7;
                  font-style: italic;
                }
                .message.processing {
                  opacity: 0.5;
                }
                .message.tool {
                  background: #1e3a5f;
                  color: #93c5fd;
                  align-self: center;
                  max-width: 95%;
                  border-radius: 8px;
                  border-left: 3px solid #3b82f6;
                  font-family: 'Monaco', 'Menlo', monospace;
                  font-size: 12px;
                }
                .message.tool.error {
                  background: #3f1e1e;
                  color: #fca5a5;
                  border-left-color: #ef4444;
                }
                .message.transcription {
                  background: #4c1d95;
                  color: #e9d5ff;
                  align-self: flex-end;
                  border-bottom-right-radius: 4px;
                  border-left: 3px solid #a855f7;
                }
                .message .role {
                  font-size: 10px;
                  text-transform: uppercase;
                  opacity: 0.7;
                  margin-bottom: 4px;
                }
                .message .text {
                  font-size: 14px;
                  line-height: 1.5;
                }
                .message .time {
                  font-size: 10px;
                  opacity: 0.5;
                  margin-top: 6px;
                }
                .tool-name {
                  font-weight: 600;
                  color: #60a5fa;
                  margin-bottom: 6px;
                }
                .tool-args {
                  background: rgba(0,0,0,0.2);
                  padding: 8px;
                  border-radius: 4px;
                  margin: 6px 0;
                  white-space: pre-wrap;
                  word-break: break-all;
                  font-size: 11px;
                }
                .tool-result {
                  background: rgba(34, 197, 94, 0.1);
                  border: 1px solid rgba(34, 197, 94, 0.3);
                  padding: 8px;
                  border-radius: 4px;
                  margin-top: 6px;
                  white-space: pre-wrap;
                  word-break: break-all;
                  font-size: 11px;
                }
                .tool-error {
                  background: rgba(239, 68, 68, 0.1);
                  border: 1px solid rgba(239, 68, 68, 0.3);
                  padding: 8px;
                  border-radius: 4px;
                  margin-top: 6px;
                  color: #fca5a5;
                }
                .message-header {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                }
                .copy-btn {
                  background: transparent;
                  border: none;
                  color: #888;
                  cursor: pointer;
                  padding: 2px 6px;
                  border-radius: 4px;
                  font-size: 12px;
                  opacity: 0.5;
                  transition: opacity 0.2s, background 0.2s;
                }
                .copy-btn:hover {
                  opacity: 1;
                  background: rgba(255,255,255,0.1);
                }
                .copy-btn.copied {
                  color: #22c55e;
                  opacity: 1;
                }
                .empty {
                  text-align: center;
                  color: #666;
                  padding: 40px;
                }
                .status-indicator {
                  display: inline-block;
                  width: 8px;
                  height: 8px;
                  border-radius: 50%;
                  margin-left: 6px;
                }
                .status-indicator.speaking {
                  background: #22c55e;
                  animation: pulse 1s infinite;
                }
                .status-indicator.processing {
                  background: #f59e0b;
                  animation: pulse 0.5s infinite;
                }
                @keyframes pulse {
                  0%, 100% { opacity: 1; }
                  50% { opacity: 0.5; }
                }
                .compact-section {
                  border-top: 1px solid #333;
                  padding-top: 12px;
                }
                .compact-section label {
                  display: block;
                  font-size: 12px;
                  color: #aaa;
                  margin-bottom: 8px;
                }
                .compact-input {
                  width: 100%;
                  background: #2a2a3e;
                  border: 1px solid #444;
                  border-radius: 6px;
                  padding: 10px;
                  color: #eee;
                  font-size: 13px;
                  resize: none;
                  margin-bottom: 10px;
                }
                .compact-input:focus {
                  outline: none;
                  border-color: #2563eb;
                }
                .compact-input::placeholder {
                  color: #666;
                }
                .compact-footer {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                }
                .compact-status {
                  font-size: 12px;
                  color: #22c55e;
                }
                .compact-status.error {
                  color: #ef4444;
                }
              </style>
            </head>
            <body>
              <div class="header">
                <h1>Conversation Transcript</h1>
                <div class="header-buttons">
                  <button class="btn" id="clearBtn">Clear</button>
                </div>
              </div>
              <div class="messages" id="messages"></div>
              <div class="compact-section">
                <label>Save to Memory (optional notes for context):</label>
                <textarea
                  class="compact-input"
                  id="compactInput"
                  rows="2"
                  placeholder="Add any notes about this conversation (e.g., 'User prefers dark mode', 'Follow up on project X')..."
                ></textarea>
                <div class="compact-footer">
                  <span class="compact-status" id="compactStatus"></span>
                  <button class="btn btn-compact" id="compactBtn">Save to Memory</button>
                </div>
              </div>
            </body>
          </html>
        `);
        newWindow.document.close();

        // Handle window close
        newWindow.onbeforeunload = () => {
          windowRef.current = null;
          onClose();
        };

        // Clear button handler
        const clearBtn = newWindow.document.getElementById("clearBtn");
        if (clearBtn) {
          clearBtn.onclick = () => {
            if (onClearRef.current) {
              onClearRef.current();
            }
          };
        }

        // Compact button handler
        const compactBtn = newWindow.document.getElementById("compactBtn");
        const compactInput = newWindow.document.getElementById(
          "compactInput"
        ) as HTMLTextAreaElement;
        const compactStatus = newWindow.document.getElementById("compactStatus");

        if (compactBtn && compactInput && compactStatus) {
          compactBtn.onclick = async () => {
            if (onCompactRef.current) {
              const additionalPrompt = compactInput.value.trim();
              compactBtn.setAttribute("disabled", "true");
              compactStatus.textContent = "Saving...";
              compactStatus.className = "compact-status";

              try {
                await onCompactRef.current(additionalPrompt);
                compactStatus.textContent = "Saved to memory!";
                compactInput.value = "";
              } catch {
                compactStatus.textContent = "Failed to save";
                compactStatus.className = "compact-status error";
              } finally {
                compactBtn.removeAttribute("disabled");
                setTimeout(() => {
                  compactStatus.textContent = "";
                }, 3000);
              }
            }
          };
        }
      }
    } else if (!isOpen && windowRef.current) {
      windowRef.current.close();
      windowRef.current = null;
    }
  }, [isOpen, onClose]);

  // Update transcript content when conversation changes
  useEffect(() => {
    if (!windowRef.current) return;

    const messagesContainer =
      windowRef.current.document.getElementById("messages");
    if (!messagesContainer) return;

    if (conversation.length === 0) {
      messagesContainer.innerHTML =
        '<div class="empty">No messages yet. Start a session to see the transcript.</div>';
      return;
    }

    messagesContainer.innerHTML = conversation
      .map((msg) => {
        const statusClass = msg.status || "";
        const statusIndicator =
          msg.status === "speaking" || msg.status === "processing"
            ? `<span class="status-indicator ${msg.status}"></span>`
            : "";

        const time = new Date(msg.timestamp).toLocaleTimeString();

        // Handle tool calls specially
        if (msg.role === "tool") {
          const errorClass = msg.toolError ? "error" : "";
          const argsStr = msg.toolArgs && Object.keys(msg.toolArgs).length > 0
            ? `<div class="tool-args">${escapeHtml(JSON.stringify(msg.toolArgs, null, 2))}</div>`
            : "";
          const resultStr = msg.toolResult !== undefined
            ? `<div class="tool-result">✓ ${escapeHtml(JSON.stringify(msg.toolResult, null, 2))}</div>`
            : "";
          const errorStr = msg.toolError
            ? `<div class="tool-error">✗ ${escapeHtml(msg.toolError)}</div>`
            : "";

          // Build full text for copying
          const fullToolText = [
            msg.toolName,
            msg.toolArgs && Object.keys(msg.toolArgs).length > 0 ? JSON.stringify(msg.toolArgs, null, 2) : "",
            msg.toolResult !== undefined ? JSON.stringify(msg.toolResult, null, 2) : "",
            msg.toolError || ""
          ].filter(Boolean).join("\n");

          return `
            <div class="message tool ${statusClass} ${errorClass}">
              <div class="message-header">
                <div class="tool-name">⚡ ${escapeHtml(msg.toolName || "Unknown Tool")}${statusIndicator}</div>
                <button class="copy-btn" data-copy="${escapeHtml(fullToolText)}" title="Copy">📋</button>
              </div>
              ${argsStr}
              ${resultStr}
              ${errorStr}
              <div class="time">${time}</div>
            </div>
          `;
        }

        // Show special label for transcription entries
        const roleLabel = msg.role === "transcription" ? "📝 transcription" : msg.role;

        return `
          <div class="message ${msg.role} ${statusClass}">
            <div class="message-header">
              <div class="role">${roleLabel}${statusIndicator}</div>
              <button class="copy-btn" data-copy="${escapeHtml(msg.text || "")}" title="Copy">📋</button>
            </div>
            <div class="text">${escapeHtml(msg.text || "...")}</div>
            <div class="time">${time}</div>
          </div>
        `;
      })
      .join("");

    // Auto-scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Add copy button handlers
    const copyButtons = messagesContainer.querySelectorAll(".copy-btn");
    copyButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const button = e.currentTarget as HTMLButtonElement;
        const textToCopy = button.getAttribute("data-copy") || "";

        // Use fallback method for popup windows
        const textArea = windowRef.current!.document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        windowRef.current!.document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          windowRef.current!.document.execCommand("copy");
          button.textContent = "✓";
          button.classList.add("copied");
          setTimeout(() => {
            button.textContent = "📋";
            button.classList.remove("copied");
          }, 1500);
        } catch (err) {
          console.error("Failed to copy:", err);
        } finally {
          windowRef.current!.document.body.removeChild(textArea);
        }
      });
    });
  }, [conversation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (windowRef.current) {
        windowRef.current.close();
        windowRef.current = null;
      }
    };
  }, []);

  return null; // This component renders in a separate window
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
