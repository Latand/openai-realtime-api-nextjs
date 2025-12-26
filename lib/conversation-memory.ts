import { Conversation } from "./conversations";
import { en } from "./translations/en";

const MAX_COMPACTS = 5;

export interface ConversationCompact {
  summary: string;
  topics: string[];
  timestamp: string;
  messageCount: number;
}

// In-memory caches
let compactsCache: ConversationCompact[] | null = null;
let persistentNotesCache: string[] | null = null;
let systemPromptCache: string | null = null;

/**
 * Check if Electron memory API is available
 */
function hasElectronMemory(): boolean {
  return typeof window !== "undefined" && !!window.electron?.memory;
}

/**
 * Save compacts to file via Electron IPC
 */
async function saveCompactsToFile(compacts: ConversationCompact[]): Promise<void> {
  if (!hasElectronMemory()) return;

  try {
    await window.electron!.memory.saveCompacts(compacts);
    compactsCache = compacts;
    console.log("[Memory] Saved compacts to file, total:", compacts.length);
  } catch (error) {
    console.error("[Memory] Failed to save compacts:", error);
  }
}

/**
 * Load compacts from file via Electron IPC
 */
export async function loadCompactsFromFile(): Promise<ConversationCompact[]> {
  if (!hasElectronMemory()) return [];

  try {
    const result = await window.electron!.memory.loadCompacts();
    if (result.success && result.compacts) {
      compactsCache = result.compacts as ConversationCompact[];
      console.log("[Memory] Loaded compacts from file:", compactsCache.length);
      return compactsCache;
    }
    return [];
  } catch (error) {
    console.error("[Memory] Failed to load compacts:", error);
    return [];
  }
}

/**
 * Get compacts from cache (sync) - use loadCompactsFromFile() first
 */
export function getCompacts(): ConversationCompact[] {
  return compactsCache || [];
}

/**
 * Save a conversation compact
 */
export async function saveCompact(compact: ConversationCompact): Promise<void> {
  const compacts = compactsCache ? [...compactsCache] : [];
  compacts.push(compact);

  // Keep only last MAX_COMPACTS
  while (compacts.length > MAX_COMPACTS) {
    compacts.shift();
  }

  await saveCompactsToFile(compacts);
}

/**
 * Clear all conversation compacts
 */
export async function clearCompacts(): Promise<void> {
  await saveCompactsToFile([]);
}

/**
 * Delete a specific compact by index
 */
export async function deleteCompact(index: number): Promise<void> {
  const compacts = compactsCache ? [...compactsCache] : [];
  if (index >= 0 && index < compacts.length) {
    compacts.splice(index, 1);
    await saveCompactsToFile(compacts);
  }
}

// ========== Persistent Notes ==========

/**
 * Save persistent notes to file via Electron IPC
 */
async function savePersistentNotesToFile(notes: string[]): Promise<void> {
  if (!hasElectronMemory()) return;

  try {
    await window.electron!.memory.savePersistentNotes(notes);
    persistentNotesCache = notes;
    console.log("[Memory] Saved persistent notes, total:", notes.length);
  } catch (error) {
    console.error("[Memory] Failed to save persistent notes:", error);
  }
}

/**
 * Load persistent notes from file via Electron IPC
 */
export async function loadPersistentNotes(): Promise<string[]> {
  if (!hasElectronMemory()) return [];

  try {
    const result = await window.electron!.memory.loadPersistentNotes();
    if (result.success && result.notes) {
      persistentNotesCache = result.notes;
      console.log("[Memory] Loaded persistent notes:", persistentNotesCache.length);
      return persistentNotesCache;
    }
    return [];
  } catch (error) {
    console.error("[Memory] Failed to load persistent notes:", error);
    return [];
  }
}

/**
 * Get persistent notes from cache
 */
export function getPersistentNotes(): string[] {
  return persistentNotesCache || [];
}

/**
 * Add a new persistent note
 */
export async function addPersistentNote(note: string): Promise<void> {
  const notes = persistentNotesCache ? [...persistentNotesCache] : [];
  notes.push(note);
  await savePersistentNotesToFile(notes);
}

/**
 * Delete a persistent note by index
 */
export async function deletePersistentNote(index: number): Promise<void> {
  const notes = persistentNotesCache ? [...persistentNotesCache] : [];
  if (index >= 0 && index < notes.length) {
    notes.splice(index, 1);
    await savePersistentNotesToFile(notes);
  }
}

/**
 * Update a persistent note by index
 */
export async function updatePersistentNote(index: number, note: string): Promise<void> {
  const notes = persistentNotesCache ? [...persistentNotesCache] : [];
  if (index >= 0 && index < notes.length) {
    notes[index] = note;
    await savePersistentNotesToFile(notes);
  }
}

/**
 * Clear all persistent notes
 */
export async function clearPersistentNotes(): Promise<void> {
  await savePersistentNotesToFile([]);
}

// ========== System Prompt ==========

/**
 * Get default system prompt from translations
 */
export function getDefaultSystemPrompt(): string {
  return en.languagePrompt;
}

/**
 * Save system prompt to file via Electron IPC
 */
export async function saveSystemPrompt(prompt: string): Promise<void> {
  if (!hasElectronMemory()) return;

  try {
    await window.electron!.memory.saveSystemPrompt(prompt);
    systemPromptCache = prompt;
    console.log("[Memory] Saved system prompt, length:", prompt.length);
  } catch (error) {
    console.error("[Memory] Failed to save system prompt:", error);
  }
}

/**
 * Load system prompt from file via Electron IPC
 * Returns null if not customized (use default)
 */
export async function loadSystemPrompt(): Promise<string | null> {
  if (!hasElectronMemory()) return null;

  try {
    const result = await window.electron!.memory.loadSystemPrompt();
    if (result.success && result.prompt) {
      systemPromptCache = result.prompt;
      console.log("[Memory] Loaded system prompt, length:", systemPromptCache.length);
      return systemPromptCache;
    }
    return null;
  } catch (error) {
    console.error("[Memory] Failed to load system prompt:", error);
    return null;
  }
}

/**
 * Get system prompt (cached or default)
 */
export function getSystemPrompt(): string {
  return systemPromptCache || getDefaultSystemPrompt();
}

/**
 * Reset system prompt to default (delete custom file)
 */
export async function resetSystemPrompt(): Promise<void> {
  if (!hasElectronMemory()) return;

  // Save empty string to indicate using default
  try {
    await window.electron!.memory.saveSystemPrompt("");
    systemPromptCache = null;
    console.log("[Memory] Reset system prompt to default");
  } catch (error) {
    console.error("[Memory] Failed to reset system prompt:", error);
  }
}

/**
 * Format compacts for injection into LLM prompt
 */
export function formatCompactsForPrompt(compacts: ConversationCompact[]): string {
  if (compacts.length === 0) return "";

  const formattedCompacts = compacts.map((c) => {
    const date = new Date(c.timestamp).toLocaleDateString();
    return `[${date}] ${c.summary}`;
  }).join("\n---\n");

  return `\n\n### Previous Conversations Memory:\n${formattedCompacts}`;
}

/**
 * Format persistent notes for injection into LLM prompt
 */
export function formatPersistentNotesForPrompt(notes: string[]): string {
  if (notes.length === 0) return "";

  const formattedNotes = notes.map((note, i) => `${i + 1}. ${note}`).join("\n");

  return `\n\n### Long-term Memory (Important facts about the user):\n${formattedNotes}`;
}

/**
 * Send conversation to compact API and save result
 */
export async function compactAndSaveConversation(
  conversation: Conversation[],
  additionalNotes?: string
): Promise<ConversationCompact | null> {
  // Filter out empty or processing messages
  const validMessages = conversation.filter(
    (msg) => msg.text && msg.text.trim() && msg.isFinal
  );

  if (validMessages.length < 2) {
    console.log("Conversation too short to compact");
    return null;
  }

  try {
    const response = await fetch("/api/compact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: validMessages.map((m) => ({
          role: m.role,
          text: m.text,
        })),
        additionalNotes: additionalNotes || undefined,
      }),
    });

    if (!response.ok) {
      console.error("Compact API failed:", response.status);
      return null;
    }

    const compact = (await response.json()) as ConversationCompact;
    saveCompact(compact);
    console.log("Conversation compacted and saved:", compact.summary.slice(0, 100));
    return compact;
  } catch (error) {
    console.error("Failed to compact conversation:", error);
    return null;
  }
}
