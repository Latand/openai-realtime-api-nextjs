/**
 * IndexedDB storage for AI cost tracking
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
  metadata?: Record<string, any>;
}

// Pricing based on Jan 2026 data
export const PRICING = {
  // OpenAI Realtime API
  'gpt-realtime': {
    audio_input_per_1m: 100.0,
    audio_output_per_1m: 200.0,
    text_input_per_1m: 5.0,
    text_output_per_1m: 20.0,
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
  try {
    const db = await openDB();
    const entry: CostLog = {
      ...log,
      timestamp: log.timestamp || new Date().toISOString(),
    };

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
  const db = await openDB();
  
  let range: IDBKeyRange | null = null;
  if (period !== 'all') {
    const now = new Date();
    let startDate = new Date();
    
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
      const logs = request.result as CostLog[];
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

export function calculateRealtimeCost(usage: any): number {
    const model = 'gpt-realtime';
    const prices = PRICING[model];
    
    let cost = 0;
    
    // Input Text
    if (usage.input_token_details?.text_tokens) {
        cost += (usage.input_token_details.text_tokens / 1_000_000) * prices.text_input_per_1m;
    }
    
    // Input Audio
    if (usage.input_token_details?.audio_tokens) {
        cost += (usage.input_token_details.audio_tokens / 1_000_000) * prices.audio_input_per_1m;
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