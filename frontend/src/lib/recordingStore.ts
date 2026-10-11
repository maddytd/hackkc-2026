// Keeps the player's most recent recording in the browser. Recording another day's round
// replaces it. Nothing here leaves the device.
const DB_NAME = 'larple';
const STORE = 'recording';
const KEY = 'today';

interface Entry {
  day: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecording(day: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ day, blob } satisfies Entry, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* storage unavailable (private mode, etc.) — playback just won't persist */
  }
}

// Returns the saved recording if it belongs to `day`, or null. A recording from another day
// is left alone: with the day switcher on, players look at several days' results.
export async function loadRecording(day: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const entry = await new Promise<Entry | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(KEY);
      r.onsuccess = () => resolve(r.result as Entry | undefined);
      r.onerror = () => reject(r.error);
    });
    db.close();
    if (entry && entry.day === day && entry.blob instanceof Blob) return entry.blob;
    return null;
  } catch {
    return null;
  }
}

export async function clearRecording(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* ignore */
  }
}
