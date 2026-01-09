/**
 * IndexedDB storage for failed transcription audio blobs
 * Allows retrying transcriptions that failed due to network issues
 */

const DB_NAME = "transcription-storage";
const DB_VERSION = 1;
const STORE_NAME = "pending-transcriptions";

export interface PendingTranscription {
  id: string;
  audioBlob: Blob;
  timestamp: string;
  attempts: number;
  lastError?: string;
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
