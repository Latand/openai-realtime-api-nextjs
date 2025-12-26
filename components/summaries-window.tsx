"use client";

import { useEffect, useRef, useCallback } from "react";
import { ConversationCompact } from "@/lib/conversation-memory";

interface SummariesWindowProps {
  compacts: ConversationCompact[];
  persistentNotes: string[];
  systemPrompt: string;
  defaultSystemPrompt: string;
  isOpen: boolean;
  onClose: () => void;
  onDeleteCompact: (index: number) => void;
  onClearAllCompacts: () => void;
  onAddNote: (note: string) => void;
  onDeleteNote: (index: number) => void;
  onUpdateNote: (index: number, note: string) => void;
  onClearAllNotes: () => void;
  onPromoteCompact: (index: number) => void; // Delete from compacts + add to notes
  onSaveSystemPrompt: (prompt: string) => void;
  onResetSystemPrompt: () => void;
  onRefresh: () => void;
}

export function SummariesWindow({
  compacts,
  persistentNotes,
  systemPrompt,
  defaultSystemPrompt,
  isOpen,
  onClose,
  onDeleteCompact,
  onClearAllCompacts,
  onAddNote,
  onDeleteNote,
  onUpdateNote,
  onClearAllNotes,
  onPromoteCompact,
  onSaveSystemPrompt,
  onResetSystemPrompt,
  onRefresh,
}: SummariesWindowProps) {
  const windowRef = useRef<Window | null>(null);

  // Keep refs updated
  const onDeleteCompactRef = useRef(onDeleteCompact);
  const onClearAllCompactsRef = useRef(onClearAllCompacts);
  const onAddNoteRef = useRef(onAddNote);
  const onDeleteNoteRef = useRef(onDeleteNote);
  const onUpdateNoteRef = useRef(onUpdateNote);
  const onClearAllNotesRef = useRef(onClearAllNotes);
  const onPromoteCompactRef = useRef(onPromoteCompact);
  const onSaveSystemPromptRef = useRef(onSaveSystemPrompt);
  const onResetSystemPromptRef = useRef(onResetSystemPrompt);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => { onDeleteCompactRef.current = onDeleteCompact; }, [onDeleteCompact]);
  useEffect(() => { onClearAllCompactsRef.current = onClearAllCompacts; }, [onClearAllCompacts]);
  useEffect(() => { onAddNoteRef.current = onAddNote; }, [onAddNote]);
  useEffect(() => { onDeleteNoteRef.current = onDeleteNote; }, [onDeleteNote]);
  useEffect(() => { onUpdateNoteRef.current = onUpdateNote; }, [onUpdateNote]);
  useEffect(() => { onClearAllNotesRef.current = onClearAllNotes; }, [onClearAllNotes]);
  useEffect(() => { onPromoteCompactRef.current = onPromoteCompact; }, [onPromoteCompact]);
  useEffect(() => { onSaveSystemPromptRef.current = onSaveSystemPrompt; }, [onSaveSystemPrompt]);
  useEffect(() => { onResetSystemPromptRef.current = onResetSystemPrompt; }, [onResetSystemPrompt]);
  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  // Toast notification helper
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (!windowRef.current) return;
    const toast = windowRef.current.document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => {
      toast.className = "toast";
    }, 2500);
  }, []);

  const updateCompactsTab = useCallback(() => {
    if (!windowRef.current) return;

    const container = windowRef.current.document.getElementById("compacts-content");
    if (!container) return;

    if (compacts.length === 0) {
      container.innerHTML =
        '<div class="empty">No saved memories yet. Use "Save to Memory" in the transcript window.</div>';
      return;
    }

    container.innerHTML = compacts
      .map((compact, index) => {
        const date = new Date(compact.timestamp).toLocaleDateString();
        const time = new Date(compact.timestamp).toLocaleTimeString();
        const topics = compact.topics.length > 0
          ? compact.topics.map(t => `<span class="topic">${escapeHtml(t)}</span>`).join("")
          : "";

        return `
          <div class="card" data-index="${index}">
            <div class="card-header">
              <div class="card-meta">
                <span class="date">${date} ${time}</span>
                <span class="msg-count">${compact.messageCount} messages</span>
              </div>
              <div class="card-actions">
                <button class="promote-btn" data-index="${index}" title="Add to Persistent Notes">+ Notes</button>
                <button class="delete-btn delete-compact-btn" data-index="${index}" title="Delete">×</button>
              </div>
            </div>
            <div class="card-text">${escapeHtml(compact.summary)}</div>
            ${topics ? `<div class="topics">${topics}</div>` : ""}
          </div>
        `;
      })
      .join("");

    // Add delete handlers
    const deleteButtons = container.querySelectorAll(".delete-compact-btn");
    deleteButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLButtonElement;
        const index = parseInt(button.getAttribute("data-index") || "0", 10);
        if (confirm("Delete this memory?")) {
          onDeleteCompactRef.current(index);
        }
      });
    });

    // Add promote handlers
    const promoteButtons = container.querySelectorAll(".promote-btn");
    promoteButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLButtonElement;
        const index = parseInt(button.getAttribute("data-index") || "0", 10);
        onPromoteCompactRef.current(index);
        showToast("Moved to Persistent Notes");
      });
    });

    // Update count
    const countEl = windowRef.current.document.getElementById("compacts-count");
    if (countEl) {
      countEl.textContent = `${compacts.length} of 5 slots`;
    }
  }, [compacts, showToast]);

  const updateNotesTab = useCallback(() => {
    if (!windowRef.current) return;

    const container = windowRef.current.document.getElementById("notes-list");
    if (!container) return;

    if (persistentNotes.length === 0) {
      container.innerHTML =
        '<div class="empty">No persistent notes yet. Add facts about yourself that the assistant should always remember.</div>';
      return;
    }

    container.innerHTML = persistentNotes
      .map((note, index) => {
        return `
          <div class="note-item" data-index="${index}">
            <div class="note-text clickable" data-index="${index}" title="Click to edit">${escapeHtml(note)}</div>
            <div class="note-actions">
              <button class="delete-btn delete-note-btn" data-index="${index}" title="Delete">×</button>
            </div>
          </div>
        `;
      })
      .join("");

    // Add delete handlers
    const deleteButtons = container.querySelectorAll(".delete-note-btn");
    deleteButtons.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const button = e.currentTarget as HTMLButtonElement;
        const index = parseInt(button.getAttribute("data-index") || "0", 10);
        if (confirm("Delete this note?")) {
          onDeleteNoteRef.current(index);
        }
      });
    });

    // Add click-to-edit handlers on the note text
    const noteTexts = container.querySelectorAll(".note-text.clickable");
    noteTexts.forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const element = e.currentTarget as HTMLDivElement;
        const index = parseInt(element.getAttribute("data-index") || "0", 10);
        const currentNote = persistentNotes[index];
        const newNote = prompt("Edit note:", currentNote);
        if (newNote !== null && newNote.trim() !== "") {
          onUpdateNoteRef.current(index, newNote.trim());
        }
      });
    });

    // Update count
    const countEl = windowRef.current.document.getElementById("notes-count");
    if (countEl) {
      countEl.textContent = `${persistentNotes.length} notes`;
    }
  }, [persistentNotes]);

  const updatePromptTab = useCallback(() => {
    if (!windowRef.current) return;

    const textarea = windowRef.current.document.getElementById("prompt-textarea") as HTMLTextAreaElement;
    if (!textarea) return;

    textarea.value = systemPrompt;

    // Update status
    const isCustom = systemPrompt !== defaultSystemPrompt;
    const statusEl = windowRef.current.document.getElementById("prompt-status");
    if (statusEl) {
      statusEl.textContent = isCustom ? "Custom prompt" : "Using default prompt";
      statusEl.className = isCustom ? "prompt-status custom" : "prompt-status default";
    }
  }, [systemPrompt, defaultSystemPrompt]);

  useEffect(() => {
    if (isOpen && !windowRef.current) {
      const newWindow = window.open(
        "",
        "SummariesWindow",
        "width=600,height=700,menubar=no,toolbar=no,location=no,status=no"
      );

      if (newWindow) {
        windowRef.current = newWindow;

        newWindow.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Memory Manager</title>
              <style>
                * { box-sizing: border-box; margin: 0; padding: 0; }
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
                  margin-bottom: 12px;
                }
                .header h1 { font-size: 18px; font-weight: 600; }
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
                .btn:hover { background: #444; }
                .btn-danger { background: #7f1d1d; }
                .btn-danger:hover { background: #991b1b; }
                .btn-primary { background: #2563eb; }
                .btn-primary:hover { background: #1d4ed8; }

                /* Tabs */
                .tabs {
                  display: flex;
                  gap: 4px;
                  margin-bottom: 12px;
                  border-bottom: 1px solid #333;
                  padding-bottom: 8px;
                }
                .tab {
                  background: transparent;
                  color: #888;
                  border: none;
                  padding: 8px 16px;
                  cursor: pointer;
                  font-size: 13px;
                  border-radius: 6px 6px 0 0;
                  transition: all 0.2s;
                }
                .tab:hover { color: #eee; background: #2a2a3e; }
                .tab.active {
                  color: #eee;
                  background: #3b82f6;
                }

                .tab-content {
                  display: none;
                  flex: 1;
                  overflow: hidden;
                  flex-direction: column;
                }
                .tab-content.active { display: flex; }

                /* Cards/Items */
                .content-scroll {
                  flex: 1;
                  overflow-y: auto;
                  display: flex;
                  flex-direction: column;
                  gap: 10px;
                }
                .card {
                  background: #2a2a3e;
                  border-radius: 10px;
                  padding: 12px;
                  border: 1px solid #3a3a50;
                }
                .card:hover { border-color: #4a4a60; }
                .card-header {
                  display: flex;
                  justify-content: space-between;
                  align-items: flex-start;
                  margin-bottom: 8px;
                }
                .card-meta { display: flex; flex-direction: column; gap: 2px; }
                .date { font-size: 12px; color: #888; }
                .msg-count { font-size: 11px; color: #666; }
                .card-text { font-size: 14px; line-height: 1.5; color: #ddd; }
                .topics { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
                .topic {
                  background: #3b82f6;
                  color: white;
                  padding: 2px 8px;
                  border-radius: 12px;
                  font-size: 11px;
                }
                .card-actions {
                  display: flex;
                  gap: 6px;
                  align-items: center;
                }
                .promote-btn {
                  background: #1e3a5f;
                  border: none;
                  color: #93c5fd;
                  padding: 4px 8px;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 11px;
                  transition: all 0.2s;
                }
                .promote-btn:hover { background: #2563eb; color: white; }
                .promote-btn.promoted { background: #166534; color: #86efac; }
                .delete-btn {
                  background: transparent;
                  border: none;
                  color: #666;
                  font-size: 18px;
                  cursor: pointer;
                  padding: 2px 8px;
                  border-radius: 4px;
                  line-height: 1;
                  transition: all 0.2s;
                }
                .delete-btn:hover { background: #7f1d1d; color: #fca5a5; }

                /* Notes */
                .note-item {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  padding: 10px 12px;
                  background: #2a2a3e;
                  border-radius: 8px;
                  border: 1px solid #3a3a50;
                }
                .note-text { flex: 1; font-size: 14px; }
                .note-text.clickable {
                  cursor: pointer;
                  padding: 4px 8px;
                  margin: -4px -8px;
                  border-radius: 4px;
                  transition: background 0.2s;
                }
                .note-text.clickable:hover { background: rgba(255,255,255,0.05); }
                .note-actions { display: flex; gap: 6px; }
                .edit-note-btn {
                  background: #333;
                  border: none;
                  color: #888;
                  padding: 4px 8px;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 11px;
                }
                .edit-note-btn:hover { background: #444; color: #eee; }

                /* Add note form */
                .add-note-form {
                  display: flex;
                  gap: 8px;
                  margin-bottom: 12px;
                }
                .add-note-input {
                  flex: 1;
                  background: #2a2a3e;
                  border: 1px solid #444;
                  border-radius: 6px;
                  padding: 10px;
                  color: #eee;
                  font-size: 13px;
                }
                .add-note-input:focus { outline: none; border-color: #3b82f6; }
                .add-note-input::placeholder { color: #666; }

                /* Prompt editor */
                .prompt-textarea {
                  flex: 1;
                  background: #2a2a3e;
                  border: 1px solid #444;
                  border-radius: 8px;
                  padding: 12px;
                  color: #eee;
                  font-size: 13px;
                  font-family: 'Monaco', 'Menlo', monospace;
                  resize: none;
                  line-height: 1.5;
                }
                .prompt-textarea:focus { outline: none; border-color: #3b82f6; }
                .prompt-footer {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  margin-top: 12px;
                  padding-top: 12px;
                  border-top: 1px solid #333;
                }
                .prompt-status { font-size: 12px; }
                .prompt-status.custom { color: #22c55e; }
                .prompt-status.default { color: #888; }
                .prompt-actions { display: flex; gap: 8px; }

                /* Footer */
                .footer {
                  margin-top: 12px;
                  padding-top: 12px;
                  border-top: 1px solid #333;
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                }
                .count { font-size: 12px; color: #888; }

                .empty {
                  text-align: center;
                  color: #666;
                  padding: 40px 20px;
                  line-height: 1.6;
                }

                /* Toast */
                .toast {
                  position: fixed;
                  bottom: 20px;
                  left: 50%;
                  transform: translateX(-50%) translateY(100px);
                  background: #22c55e;
                  color: white;
                  padding: 12px 24px;
                  border-radius: 8px;
                  font-size: 14px;
                  font-weight: 500;
                  opacity: 0;
                  transition: all 0.3s ease;
                  z-index: 1000;
                  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                .toast.show {
                  opacity: 1;
                  transform: translateX(-50%) translateY(0);
                }
                .toast.error {
                  background: #ef4444;
                }
              </style>
            </head>
            <body>
              <div id="toast" class="toast"></div>
              <div class="header">
                <h1>Memory Manager</h1>
                <button class="btn" id="refreshBtn">Refresh</button>
              </div>

              <div class="tabs">
                <button class="tab active" data-tab="compacts">Recent Memories</button>
                <button class="tab" data-tab="notes">Persistent Notes</button>
                <button class="tab" data-tab="prompt">System Prompt</button>
              </div>

              <!-- Compacts Tab -->
              <div class="tab-content active" id="tab-compacts">
                <div class="content-scroll" id="compacts-content"></div>
                <div class="footer">
                  <span class="count" id="compacts-count"></span>
                  <button class="btn btn-danger" id="clearCompactsBtn">Clear All</button>
                </div>
              </div>

              <!-- Notes Tab -->
              <div class="tab-content" id="tab-notes">
                <div class="add-note-form">
                  <input type="text" class="add-note-input" id="newNoteInput"
                    placeholder="Add a fact about yourself (e.g., 'My name is John', 'I prefer dark mode')..." />
                  <button class="btn btn-primary" id="addNoteBtn">Add</button>
                </div>
                <div class="content-scroll" id="notes-list"></div>
                <div class="footer">
                  <span class="count" id="notes-count"></span>
                  <button class="btn btn-danger" id="clearNotesBtn">Clear All</button>
                </div>
              </div>

              <!-- Prompt Tab -->
              <div class="tab-content" id="tab-prompt">
                <textarea class="prompt-textarea" id="prompt-textarea"
                  placeholder="Enter your custom system prompt..."></textarea>
                <div class="prompt-footer">
                  <span class="prompt-status" id="prompt-status"></span>
                  <div class="prompt-actions">
                    <button class="btn" id="resetPromptBtn">Reset to Default</button>
                    <button class="btn btn-primary" id="savePromptBtn">Save Prompt</button>
                  </div>
                </div>
              </div>
            </body>
          </html>
        `);
        newWindow.document.close();

        newWindow.onbeforeunload = () => {
          windowRef.current = null;
          onClose();
        };

        // Tab switching
        const tabs = newWindow.document.querySelectorAll(".tab");
        tabs.forEach((tab) => {
          tab.addEventListener("click", () => {
            const tabName = (tab as HTMLElement).getAttribute("data-tab");

            // Update tab buttons
            tabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");

            // Update tab content
            newWindow.document.querySelectorAll(".tab-content").forEach((content) => {
              content.classList.remove("active");
            });
            newWindow.document.getElementById(`tab-${tabName}`)?.classList.add("active");
          });
        });

        // Refresh button
        const refreshBtn = newWindow.document.getElementById("refreshBtn");
        if (refreshBtn) {
          refreshBtn.onclick = () => onRefreshRef.current();
        }

        // Clear compacts button
        const clearCompactsBtn = newWindow.document.getElementById("clearCompactsBtn");
        if (clearCompactsBtn) {
          clearCompactsBtn.onclick = () => {
            if (confirm("Clear all recent memories? This cannot be undone.")) {
              onClearAllCompactsRef.current();
            }
          };
        }

        // Add note
        const addNoteBtn = newWindow.document.getElementById("addNoteBtn");
        const newNoteInput = newWindow.document.getElementById("newNoteInput") as HTMLInputElement;
        if (addNoteBtn && newNoteInput) {
          const addNote = () => {
            const note = newNoteInput.value.trim();
            if (note) {
              onAddNoteRef.current(note);
              newNoteInput.value = "";
            }
          };
          addNoteBtn.onclick = addNote;
          newNoteInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") addNote();
          });
        }

        // Clear notes button
        const clearNotesBtn = newWindow.document.getElementById("clearNotesBtn");
        if (clearNotesBtn) {
          clearNotesBtn.onclick = () => {
            if (confirm("Clear all persistent notes? This cannot be undone.")) {
              onClearAllNotesRef.current();
            }
          };
        }

        // Save prompt button
        const savePromptBtn = newWindow.document.getElementById("savePromptBtn");
        const promptTextarea = newWindow.document.getElementById("prompt-textarea") as HTMLTextAreaElement;
        if (savePromptBtn && promptTextarea) {
          savePromptBtn.onclick = () => {
            onSaveSystemPromptRef.current(promptTextarea.value);
            const statusEl = newWindow.document.getElementById("prompt-status");
            if (statusEl) {
              statusEl.textContent = "Saved!";
              statusEl.className = "prompt-status custom";
              setTimeout(() => updatePromptTab(), 1500);
            }
          };
        }

        // Reset prompt button
        const resetPromptBtn = newWindow.document.getElementById("resetPromptBtn");
        if (resetPromptBtn) {
          resetPromptBtn.onclick = () => {
            if (confirm("Reset to default system prompt?")) {
              onResetSystemPromptRef.current();
            }
          };
        }

        // Initial content update
        setTimeout(() => {
          updateCompactsTab();
          updateNotesTab();
          updatePromptTab();
        }, 0);
      }
    } else if (!isOpen && windowRef.current) {
      windowRef.current.close();
      windowRef.current = null;
    }
  }, [isOpen, onClose, updateCompactsTab, updateNotesTab, updatePromptTab]);

  // Update content when data changes
  useEffect(() => {
    if (!windowRef.current) return;
    updateCompactsTab();
  }, [compacts, updateCompactsTab]);

  useEffect(() => {
    if (!windowRef.current) return;
    updateNotesTab();
  }, [persistentNotes, updateNotesTab]);

  useEffect(() => {
    if (!windowRef.current) return;
    updatePromptTab();
  }, [systemPrompt, updatePromptTab]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (windowRef.current) {
        windowRef.current.close();
        windowRef.current = null;
      }
    };
  }, []);

  return null;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
