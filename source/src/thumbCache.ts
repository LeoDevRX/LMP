/** Shelf thumbnails saved between sessions (IndexedDB), so the shelf opens instantly after the first start. */
const DB = 'lmp-thumbs';
const STORE = 'thumbs';
const VERSION = 'v100';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function loadThumbs(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const t = db.transaction(STORE).objectStore(STORE).openCursor();
      t.onsuccess = () => {
        const c = t.result;
        if (!c) { res(); return; }
        const k = String(c.key);
        if (k.startsWith(VERSION + '|')) out.set(k.slice(VERSION.length + 1), c.value as string);
        c.continue();
      };
      t.onerror = () => res();
    });
    db.close();
  } catch { /* private mode: no cache */ }
  return out;
}

let pending: [string, string][] = [];
let timer = 0;
/** Queue a thumbnail to be saved (written in batches). */
export function saveThumb(key: string, url: string) {
  pending.push([key, url]);
  clearTimeout(timer);
  timer = window.setTimeout(flush, 800);
}
export async function flush() {
  clearTimeout(timer);
  const batch = pending;
  pending = [];
  if (!batch.length) return;
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    for (const [k, v] of batch) st.put(v, VERSION + '|' + k);
    await new Promise<void>((res) => { tx.oncomplete = () => res(); tx.onerror = () => res(); });
    db.close();
  } catch { /* ignore */ }
}

window.addEventListener('pagehide', () => { flush(); });
