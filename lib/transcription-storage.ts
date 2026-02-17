/**
 * IndexedDB storage for failed transcription audio blobs
 * Allows retrying transcriptions that failed due to network issues
 */

const DB_NAME = "transcription-storage";
const DB_VERSION = 2;
const STORE_NAME = "pending-transcriptions";
const RECENT_STORE_NAME = "recent-recordings";

const DEFAULT_RECENT_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_RECENT_MAX_ITEMS = 10;

export interface PendingTranscription {
  id: string;
  audioBlob: Blob;
  timestamp: string;
  attempts: number;
  lastError?: string;
}

export interface RecentRecording {
  id: string;
  kind: "whisper";
  audioBlob: Blob;
  timestamp: string;
  durationSeconds?: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("[TranscriptionStorage] Failed to open database:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains(RECENT_STORE_NAME)) {
        const store = db.createObjectStore(RECENT_STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("kind", "kind", { unique: false });
      }
    };
  });

  return dbPromise;
}

export async function savePendingTranscription(
  audioBlob: Blob,
  error?: string
): Promise<string> {
  const db = await openDB();
  const id = `transcription-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const pending: PendingTranscription = {
    id,
    audioBlob,
    timestamp: new Date().toISOString(),
    attempts: 1,
    lastError: error,
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(pending);

    request.onsuccess = () => {
      console.log("[TranscriptionStorage] Saved pending transcription:", id);
      resolve(id);
    };

    request.onerror = () => {
      console.error("[TranscriptionStorage] Failed to save:", request.error);
      reject(request.error);
    };
  });
}

export async function getPendingTranscription(
  id: string
): Promise<PendingTranscription | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getAllPendingTranscriptions(): Promise<PendingTranscription[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function updatePendingTranscription(
  id: string,
  updates: Partial<Pick<PendingTranscription, "attempts" | "lastError">>
): Promise<void> {
  const db = await openDB();
  const existing = await getPendingTranscription(id);

  if (!existing) {
    throw new Error(`Pending transcription not found: ${id}`);
  }

  const updated = { ...existing, ...updates };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(updated);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function removePendingTranscription(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log("[TranscriptionStorage] Removed pending transcription:", id);
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function clearAllPendingTranscriptions(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      console.log("[TranscriptionStorage] Cleared all pending transcriptions");
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function getPendingCount(): Promise<number> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.count();

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function saveRecentRecording(
  audioBlob: Blob,
  options?: { kind?: "whisper"; durationSeconds?: number; ttlMs?: number; maxItems?: number }
): Promise<string> {
  const db = await openDB();
  const id = `recent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const recording: RecentRecording = {
    id,
    kind: options?.kind ?? "whisper",
    audioBlob,
    timestamp: new Date().toISOString(),
    durationSeconds: options?.durationSeconds,
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RECENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RECENT_STORE_NAME);
    const request = store.add(recording);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // Best-effort cleanup. Do not fail the caller if cleanup fails.
  purgeRecentRecordings({
    ttlMs: options?.ttlMs ?? DEFAULT_RECENT_TTL_MS,
    maxItems: options?.maxItems ?? DEFAULT_RECENT_MAX_ITEMS,
  }).catch((err) => console.warn("[TranscriptionStorage] Failed to purge recent recordings:", err));

  return id;
}

export async function getAllRecentRecordings(): Promise<RecentRecording[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECENT_STORE_NAME, "readonly");
    const store = transaction.objectStore(RECENT_STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getLatestRecentRecording(
  kind: "whisper" = "whisper"
): Promise<RecentRecording | null> {
  // Best-effort cleanup before returning latest.
  await purgeRecentRecordings({ ttlMs: DEFAULT_RECENT_TTL_MS, maxItems: DEFAULT_RECENT_MAX_ITEMS }).catch(() => {});

  const all = await getAllRecentRecordings();
  const filtered = all.filter((r) => r.kind === kind);
  if (filtered.length === 0) return null;

  filtered.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
  return filtered[0] ?? null;
}

export async function removeRecentRecording(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RECENT_STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function purgeRecentRecordings(options?: { ttlMs?: number; maxItems?: number }): Promise<void> {
  const ttlMs = options?.ttlMs ?? DEFAULT_RECENT_TTL_MS;
  const maxItems = options?.maxItems ?? DEFAULT_RECENT_MAX_ITEMS;
  const cutoff = Date.now() - ttlMs;

  const all = await getAllRecentRecordings();
  if (all.length === 0) return;

  const sorted = [...all].sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

  const toDelete = new Set<string>();
  for (const r of sorted) {
    const ts = Date.parse(r.timestamp);
    if (!Number.isFinite(ts) || ts < cutoff) {
      toDelete.add(r.id);
    }
  }

  // Enforce maxItems among the remaining (newest first).
  const remaining = sorted.filter((r) => !toDelete.has(r.id));
  if (remaining.length > maxItems) {
    for (const r of remaining.slice(maxItems)) {
      toDelete.add(r.id);
    }
  }

  if (toDelete.size === 0) return;

  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(RECENT_STORE_NAME, "readwrite");
    const store = transaction.objectStore(RECENT_STORE_NAME);

    for (const id of toDelete) {
      store.delete(id);
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
