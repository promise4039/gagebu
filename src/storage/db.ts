export type EncryptedRecord = { id: string; ivB64: string; ctB64: string };

export type MetaRecord = {
  id: 'meta';
  saltB64: string;
  check: { ivB64: string; ctB64: string };
  createdAt: string;
};

const DB_NAME = 'secure_budget_db';
const DB_VERSION = 2;

const STORES = ['meta', 'cards', 'card_versions', 'tx', 'statements', 'categories', 'settings', 'loans'] as const;
export type StoreName = typeof STORES[number];

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function withStore<T>(storeName: StoreName, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const req = fn(store);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
  });
}

export async function getMeta(): Promise<MetaRecord | null> {
  const rec = await withStore<MetaRecord | undefined>('meta', 'readonly', s => s.get('meta'));
  return rec ?? null;
}

export async function setMeta(meta: MetaRecord): Promise<void> {
  await withStore('meta', 'readwrite', s => s.put(meta as any));
}

export async function listEncrypted(store: Exclude<StoreName, 'meta'>): Promise<EncryptedRecord[]> {
  const rows = await withStore<EncryptedRecord[]>(store, 'readonly', s => s.getAll());
  return rows ?? [];
}

export async function putEncrypted(store: Exclude<StoreName, 'meta'>, rec: EncryptedRecord): Promise<void> {
  await withStore(store, 'readwrite', s => s.put(rec as any));
}

export async function deleteEncrypted(store: Exclude<StoreName, 'meta'>, id: string): Promise<void> {
  await withStore(store, 'readwrite', s => s.delete(id));
}

export async function clearStore(store: StoreName): Promise<void> {
  await withStore(store, 'readwrite', s => s.clear());
}

export async function exportRaw(): Promise<{ meta: MetaRecord | null; stores: Record<string, EncryptedRecord[]> }> {
  const meta = await getMeta();
  const stores: Record<string, EncryptedRecord[]> = {};
  for (const s of ['cards','card_versions','tx','statements','categories','settings','loans'] as const) {
    stores[s] = await listEncrypted(s);
  }
  return { meta, stores };
}

export async function importRaw(payload: { meta: MetaRecord; stores: Record<string, EncryptedRecord[]> }): Promise<void> {
  for (const s of STORES) await clearStore(s);
  await setMeta(payload.meta);
  for (const [storeName, rows] of Object.entries(payload.stores)) {
    if (!['cards','card_versions','tx','statements','categories','settings','loans'].includes(storeName)) continue;
    for (const r of rows) await putEncrypted(storeName as any, r);
  }
}
