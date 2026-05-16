/**
 * Cost tracking storage - uses Electron file storage in packaged apps,
 * falls back to IndexedDB in browser/development
 */

const DB_NAME = "ai-cost-tracker";
const DB_VERSION = 1;
const STORE_NAME = "cost-logs";

export type CostType = "audio_in" | "audio_out" | "text_in" | "text_out" | "transcription" | "unknown";

export interface CostLog {
  id?: number; // Auto-incremented
  timestamp: string;
  model: string;
  type: CostType;
  tokens?: number; // For LLMs
  seconds?: number; // For audio/transcription
  cost: number;
  metadata?: Record<string, unknown>;
}

// Check if running in Electron with cost tracker API available
function isElectronCostTracker(): boolean {
  return typeof window !== 'undefined' &&
         'electron' in window &&
         typeof window.electron?.costTracker?.addLog === 'function';
}

// Pricing based on OpenAI docs checked May 2026.
export const PRICING = {
  // OpenAI Realtime API
  'gpt-realtime-2': {
    audio_input_per_1m: 32.0,
    audio_cached_input_per_1m: 0.40,
    audio_output_per_1m: 64.0,
    text_input_per_1m: 4.0,
    text_cached_input_per_1m: 0.40,
    text_output_per_1m: 24.0,
    image_input_per_1m: 5.0,
    image_cached_input_per_1m: 0.50,
  },
  'gpt-realtime-1.5': {
    audio_input_per_1m: 32.0,
    audio_cached_input_per_1m: 0.40,
    audio_output_per_1m: 64.0,
    text_input_per_1m: 4.0,
    text_cached_input_per_1m: 0.40,
    text_output_per_1m: 16.0,
    image_input_per_1m: 5.0,
    image_cached_input_per_1m: 0.50,
  },
  'gpt-realtime': {
    audio_input_per_1m: 32.0,
    audio_cached_input_per_1m: 0.40,
    audio_output_per_1m: 64.0,
    text_input_per_1m: 4.0,
    text_cached_input_per_1m: 0.40,
    text_output_per_1m: 16.0,
    image_input_per_1m: 5.0,
    image_cached_input_per_1m: 0.50,
  },
  // OpenAI Chat
  'gpt-5.1-chat-latest': {
    input_per_1m: 1.75, // Based on GPT-5.2 pricing
    output_per_1m: 14.00,
    cached_input_per_1m: 0.175,
  },
  // Anthropic
  'claude-sonnet-4-20250514': {
    input_per_1m: 3.00, // Estimated based on Sonnet series
    output_per_1m: 15.00,
  },
  // Transcription
  'gpt-realtime-whisper': {
    per_minute: 0.017,
  },
  'gpt-4o-transcribe': {
    per_minute: 0.006,
  },
  'whisper-1': {
    per_minute: 0.006,
  },
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  if (typeof window === 'undefined') {
    return Promise.reject(new Error("IndexedDB is not available server-side"));
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("[CostTracker] Failed to open database:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("model", "model", { unique: false });
      }
    };
  });

  return dbPromise;
}

export async function addCostLog(log: Omit<CostLog, "id" | "timestamp"> & { timestamp?: string }): Promise<number> {
  const entry: CostLog = {
    ...log,
    timestamp: log.timestamp || new Date().toISOString(),
  };

  // Use Electron file storage if available (works reliably in packaged apps)
  if (isElectronCostTracker()) {
    try {
      const result = await window.electron!.costTracker.addLog(log);
      if (result.success) {
        // Dispatch custom event for UI updates
        if (typeof window !== 'undefined') {
          const event = new CustomEvent('ai-cost-logged', { detail: { cost: entry.cost, model: entry.model } });
          window.dispatchEvent(event);
        }
        return result.id || -1;
      }
      console.error("[CostTracker] Electron storage failed:", result.error);
      return -1;
    } catch (error) {
      console.error("[CostTracker] Electron storage error:", error);
      return -1;
    }
  }

  // Fallback to IndexedDB for browser/development
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(entry);

      request.onsuccess = () => {
        // Dispatch custom event
        if (typeof window !== 'undefined') {
            const event = new CustomEvent('ai-cost-logged', { detail: { cost: entry.cost, model: entry.model } });
            window.dispatchEvent(event);
        }
        resolve(request.result as number);
      };

      request.onerror = () => {
        console.error("[CostTracker] Failed to save log:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("[CostTracker] Error adding log:", error);
    return -1;
  }
}

export async function getCostStats(
  period: 'day' | 'week' | 'month' | 'all' = 'all'
): Promise<{ totalCost: number; byModel: Record<string, number>; logs: CostLog[] }> {
  // Use Electron file storage if available
  if (isElectronCostTracker()) {
    try {
      const result = await window.electron!.costTracker.getLogs(period);
      if (result.success) {
        return {
          totalCost: result.totalCost,
          byModel: result.byModel,
          logs: result.logs as CostLog[]
        };
      }
      console.error("[CostTracker] Electron getLogs failed:", result.error);
      return { totalCost: 0, byModel: {}, logs: [] };
    } catch (error) {
      console.error("[CostTracker] Electron getLogs error:", error);
      return { totalCost: 0, byModel: {}, logs: [] };
    }
  }

  // Fallback to IndexedDB
  const db = await openDB();

  let range: IDBKeyRange | null = null;
  if (period !== 'all') {
    const now = new Date();
    const startDate = new Date();

    if (period === 'day') startDate.setDate(now.getDate() - 1);
    if (period === 'week') startDate.setDate(now.getDate() - 7);
    if (period === 'month') startDate.setMonth(now.getMonth() - 1);

    range = IDBKeyRange.lowerBound(startDate.toISOString());
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("timestamp");
    const request = range ? index.getAll(range) : index.getAll();

    request.onsuccess = () => {
      const logs = (request.result as CostLog[]).map(withRecalculatedRealtimeCost);
      const stats = logs.reduce((acc, log) => {
        acc.totalCost += log.cost;
        acc.byModel[log.model] = (acc.byModel[log.model] || 0) + log.cost;
        return acc;
      }, { totalCost: 0, byModel: {} as Record<string, number>, logs });

      resolve(stats);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function clearCostLogs(): Promise<void> {
  // Use Electron file storage if available
  if (isElectronCostTracker()) {
    try {
      const result = await window.electron!.costTracker.clearLogs();
      if (result.success) {
        // Dispatch custom event for reset
        if (typeof window !== 'undefined') {
          const event = new CustomEvent('ai-cost-cleared');
          window.dispatchEvent(event);
        }
        return;
      }
      console.error("[CostTracker] Electron clearLogs failed:", result.error);
    } catch (error) {
      console.error("[CostTracker] Electron clearLogs error:", error);
    }
    return;
  }

  // Fallback to IndexedDB
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        // Dispatch custom event for reset
        if (typeof window !== 'undefined') {
            const event = new CustomEvent('ai-cost-cleared');
            window.dispatchEvent(event);
        }
        resolve();
      };

      request.onerror = () => {
        console.error("[CostTracker] Failed to clear logs:", request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("[CostTracker] Error clearing logs:", error);
  }
}

type RealtimeModel = 'gpt-realtime-2' | 'gpt-realtime-1.5' | 'gpt-realtime';

interface RealtimeUsageDetails {
  text_tokens?: number;
  audio_tokens?: number;
  image_tokens?: number;
  cached_tokens?: number;
  cached_tokens_details?: {
    text_tokens?: number;
    audio_tokens?: number;
    image_tokens?: number;
  };
}

interface RealtimeUsage {
  input_token_details?: RealtimeUsageDetails;
  output_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
  };
}

export function calculateRealtimeCost(
    usage: RealtimeUsage,
    model: RealtimeModel = 'gpt-realtime-2'
): number {
    const prices = PRICING[model];
    
    let cost = 0;

    const inputDetails = usage.input_token_details;
    if (inputDetails) {
        const cachedDetails = inputDetails.cached_tokens_details;
        const cachedTextTokens = Math.min(
            inputDetails.text_tokens || 0,
            cachedDetails?.text_tokens || 0
        );
        const cachedAudioTokens = Math.min(
            inputDetails.audio_tokens || 0,
            cachedDetails?.audio_tokens || 0
        );
        const cachedImageTokens = Math.min(
            inputDetails.image_tokens || 0,
            cachedDetails?.image_tokens || 0
        );

        const unallocatedCachedTokens = Math.max(
            0,
            (inputDetails.cached_tokens || 0) -
                cachedTextTokens -
                cachedAudioTokens -
                cachedImageTokens
        );

        // If the API only returns aggregate cached_tokens, conservatively assign
        // the remaining cached portion to the cheapest eligible modality first.
        let remainingCachedTokens = unallocatedCachedTokens;
        const fallbackCachedTextTokens = Math.min(
            Math.max(0, (inputDetails.text_tokens || 0) - cachedTextTokens),
            remainingCachedTokens
        );
        remainingCachedTokens -= fallbackCachedTextTokens;
        const fallbackCachedImageTokens = Math.min(
            Math.max(0, (inputDetails.image_tokens || 0) - cachedImageTokens),
            remainingCachedTokens
        );
        remainingCachedTokens -= fallbackCachedImageTokens;
        const fallbackCachedAudioTokens = Math.min(
            Math.max(0, (inputDetails.audio_tokens || 0) - cachedAudioTokens),
            remainingCachedTokens
        );

        const totalCachedTextTokens = cachedTextTokens + fallbackCachedTextTokens;
        const totalCachedAudioTokens = cachedAudioTokens + fallbackCachedAudioTokens;
        const totalCachedImageTokens = cachedImageTokens + fallbackCachedImageTokens;

        const nonCachedTextTokens = Math.max(0, (inputDetails.text_tokens || 0) - totalCachedTextTokens);
        const nonCachedAudioTokens = Math.max(0, (inputDetails.audio_tokens || 0) - totalCachedAudioTokens);
        const nonCachedImageTokens = Math.max(0, (inputDetails.image_tokens || 0) - totalCachedImageTokens);

        cost += (nonCachedTextTokens / 1_000_000) * prices.text_input_per_1m;
        cost += (totalCachedTextTokens / 1_000_000) * prices.text_cached_input_per_1m;
        cost += (nonCachedAudioTokens / 1_000_000) * prices.audio_input_per_1m;
        cost += (totalCachedAudioTokens / 1_000_000) * prices.audio_cached_input_per_1m;
        cost += (nonCachedImageTokens / 1_000_000) * prices.image_input_per_1m;
        cost += (totalCachedImageTokens / 1_000_000) * prices.image_cached_input_per_1m;
    }
    
    // Output Text
    if (usage.output_token_details?.text_tokens) {
        cost += (usage.output_token_details.text_tokens / 1_000_000) * prices.text_output_per_1m;
    }
    
    // Output Audio
    if (usage.output_token_details?.audio_tokens) {
        cost += (usage.output_token_details.audio_tokens / 1_000_000) * prices.audio_output_per_1m;
    }
    
    return cost;
}

function isRealtimeModel(model: string): model is RealtimeModel {
    return model === 'gpt-realtime-2' ||
        model === 'gpt-realtime-1.5' ||
        model === 'gpt-realtime';
}

function withRecalculatedRealtimeCost(log: CostLog): CostLog {
    if (!isRealtimeModel(log.model) || !log.metadata) return log;
    const cost = calculateRealtimeCost(log.metadata as RealtimeUsage, log.model);
    if (Math.abs(cost - log.cost) < 1e-12) return log;
    return {
        ...log,
        cost,
        metadata: {
            ...log.metadata,
            local_cost_recalculated: true,
        },
    };
}

export function calculateChatCost(model: 'gpt-5.1-chat-latest' | 'claude-sonnet-4-20250514', usage: { prompt_tokens: number, completion_tokens: number, prompt_tokens_details?: { cached_tokens?: number } }): number {
    let cost = 0;
    
    if (model === 'gpt-5.1-chat-latest') {
        const prices = PRICING[model];
        const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;
        const nonCachedInput = Math.max(0, usage.prompt_tokens - cachedTokens);
        
        cost += (nonCachedInput / 1_000_000) * prices.input_per_1m;
        cost += (cachedTokens / 1_000_000) * prices.cached_input_per_1m;
        cost += (usage.completion_tokens / 1_000_000) * prices.output_per_1m;
    } else if (model === 'claude-sonnet-4-20250514') {
        const prices = PRICING[model];
        cost += (usage.prompt_tokens / 1_000_000) * prices.input_per_1m;
        cost += (usage.completion_tokens / 1_000_000) * prices.output_per_1m;
    }
    
    return cost;
}
