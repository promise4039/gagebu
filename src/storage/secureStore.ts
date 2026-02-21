import { AppSettings, BackupFileV1, Budgets, Card, CardVersion, Statement, Tx, Loan, BudgetItem } from '../domain/models';
import { DEFAULT_CATEGORIES } from '../domain/categories';
import { decryptJson, deriveKey, encryptJson, randomBytes, b64OfBytes, bytesFromB64 } from './crypto';
import { EncryptedRecord, MetaRecord, deleteEncrypted, exportRaw, getMeta, importRaw, listEncrypted, putEncrypted, setMeta } from './db';

type StoreKey = 'cards' | 'card_versions' | 'tx' | 'statements' | 'categories' | 'settings' | 'loans';

export type UnlockedState = {
  key: CryptoKey;
  saltB64: string;
  budgets: Budgets;
  settings: AppSettings;
  cards: Card[];
  cardVersions: CardVersion[];
  tx: Tx[];
  statements: Statement[];
  loans: Loan[];
  categories: string[];
};

const DEFAULT_BUDGET_BUCKETS: Record<string, number> = {
  '주유': 220000,
  '마트': 170000,
  '외식+편의점': 50000,
  '온라인쇼핑': 30000,
  '이체(소비성)': 70000,
  '생활기타': 50000,
  '예비비': 37268,
};

const DEFAULT_BUDGET_ITEMS: BudgetItem[] = [
  { id: 'b_fuel', kind: 'fuel', name: '주유', monthCap: 220000, yearCap: null },
  { id: 'b_grocery', kind: 'grocery', name: '마트', monthCap: 170000, yearCap: null },
  { id: 'b_food', kind: 'food', name: '외식+편의점', monthCap: 50000, yearCap: null },
  { id: 'b_online', kind: 'online', name: '온라인쇼핑', monthCap: 30000, yearCap: null },
  { id: 'b_transfer', kind: 'transfer', name: '이체(소비성)', monthCap: 70000, yearCap: null },
  { id: 'b_life', kind: 'life', name: '생활기타', monthCap: 50000, yearCap: null },
  { id: 'b_buffer', kind: 'buffer', name: '예비비', monthCap: 37268, yearCap: null },
];


const DEFAULT_SETTINGS: AppSettings = {
  budgets: { monthCap: 627268, weekCap: 144754, dayCap: 20678 },
  autoLockMinutes: 10,
  budgetItems: DEFAULT_BUDGET_ITEMS,
  budgetBuckets: DEFAULT_BUDGET_BUCKETS,
  categoryBudgetMap: {},
};

async function decryptAll<T>(key: CryptoKey, store: StoreKey): Promise<T[]> {
  const rows = await listEncrypted(store as any);
  const out: T[] = [];
  for (const r of rows) out.push(await decryptJson<T>(key, { ivB64: r.ivB64, ctB64: r.ctB64 }));
  return out;
}

async function upsert<T extends { id: string }>(key: CryptoKey, store: StoreKey, obj: T): Promise<void> {
  const enc = await encryptJson(key, obj);
  const rec: EncryptedRecord = { id: obj.id, ivB64: enc.ivB64, ctB64: enc.ctB64 };
  await putEncrypted(store as any, rec);
}

export async function hasWallet(): Promise<boolean> {
  const meta = await getMeta();
  return !!meta;
}

export async function initNewWallet(passphrase: string): Promise<void> {
  const salt = randomBytes(16);
  const key = await deriveKey(passphrase, salt);
  const check = await encryptJson(key, { ok: true });
  const meta: MetaRecord = {
    id: 'meta',
    saltB64: b64OfBytes(salt),
    check,
    createdAt: new Date().toISOString(),
  };
  await setMeta(meta);

  for (const c of DEFAULT_CATEGORIES) {
    await upsert(key, 'categories', { id: 'cat_' + c, name: c } as any);
  }

  const cardId = 'card_' + crypto.randomUUID();
  const versionId = 'ver_' + crypto.randomUUID();
  const card: Card = { id: cardId, name: '삼성카드(예시)', type: 'credit', isActive: true, trackBalance: false, balance: null, purpose: '' };
  const ver: CardVersion = {
    id: versionId,
    cardId,
    validFrom: new Date().toISOString().slice(0,10),
    paymentDay: 13,
    clamp: true,
    weekendAdjust: 'none',
    cycleStart: { monthOffset: -2, day: 30 },
    cycleEnd: { monthOffset: -1, day: 29 },
    createdAt: new Date().toISOString(),
  };
  await upsert(key, 'cards', card);
  await upsert(key, 'card_versions', ver);

  // example account (balance tracking)
  const acctId = 'card_' + crypto.randomUUID();
  const acct: Card = { id: acctId, name: '농협계좌(예시)', type: 'account', isActive: true, trackBalance: true, balance: 0, purpose: '생활비/고정지출' };
  await upsert(key, 'cards', acct);

  const cashId = 'card_' + crypto.randomUUID();
  const cash: Card = { id: cashId, name: '현금', type: 'cash', isActive: true, trackBalance: true, balance: 0, purpose: '' };
  await upsert(key, 'cards', cash);


  await upsert(key, 'settings', { id: 'settings', ...DEFAULT_SETTINGS } as any);
}

export async function unlock(passphrase: string): Promise<UnlockedState> {
  const meta = await getMeta();
  if (!meta) throw new Error('WALLET_NOT_INITIALIZED');
  const salt = bytesFromB64(meta.saltB64);
  const key = await deriveKey(passphrase, salt);

  const check = await decryptJson<{ ok: boolean }>(key, meta.check);
  if (!check?.ok) throw new Error('INVALID_PASSPHRASE');

  const cards = await decryptAll<Card>(key, 'cards');
  // migrate older card records
  const migratedCards = cards.map((c: any) => ({
    ...c,
    trackBalance: typeof c.trackBalance === 'boolean' ? c.trackBalance : (c.type === 'credit' ? false : true),
    balance: (c.balance === undefined ? (c.type === 'credit' ? null : 0) : c.balance),
    purpose: (c.purpose ?? ''),
  })) as Card[];
  const cardVersions = await decryptAll<CardVersion>(key, 'card_versions');
  const tx = await decryptAll<Tx>(key, 'tx');
  const statements = await decryptAll<Statement>(key, 'statements');
  const loans = await decryptAll<any>(key, 'loans');

  const cats = await decryptAll<{ id: string; name: string }>(key, 'categories');
  const catSet = new Set(cats.map(c => c.name));
  for (const c of DEFAULT_CATEGORIES) {
    if (!catSet.has(c)) {
      await upsert(key, 'categories', { id: 'cat_' + c, name: c } as any);
      catSet.add(c);
    }
  }
  const categories = Array.from(catSet.values()).sort();

  const settingsArr = await decryptAll<any>(key, 'settings');
  const settings = (settingsArr.find((x: any) => x.id === 'settings') ?? DEFAULT_SETTINGS) as AppSettings;
  if (!(settings as any).budgetBuckets) {
    (settings as any).budgetBuckets = DEFAULT_BUDGET_BUCKETS;
  }
  // If buckets exist but empty (older versions), seed defaults
  if (Object.keys((settings as any).budgetBuckets || {}).length === 0) {
    (settings as any).budgetBuckets = DEFAULT_BUDGET_BUCKETS;
  }
  // Persist any seeding so Budget tab isn't empty
  
// budgetItems migration
if (!(settings as any).budgetItems || !Array.isArray((settings as any).budgetItems) || (settings as any).budgetItems.length === 0) {
  const bb: Record<string, number> = (settings as any).budgetBuckets ?? DEFAULT_BUDGET_BUCKETS;
  (settings as any).budgetItems = [
    { id: 'b_fuel', kind: 'fuel', name: '주유', monthCap: bb['주유'] ?? 220000, yearCap: null },
    { id: 'b_grocery', kind: 'grocery', name: '마트', monthCap: bb['마트'] ?? 170000, yearCap: null },
    { id: 'b_food', kind: 'food', name: '외식+편의점', monthCap: bb['외식+편의점'] ?? 50000, yearCap: null },
    { id: 'b_online', kind: 'online', name: '온라인쇼핑', monthCap: bb['온라인쇼핑'] ?? 30000, yearCap: null },
    { id: 'b_transfer', kind: 'transfer', name: '이체(소비성)', monthCap: bb['이체(소비성)'] ?? 70000, yearCap: null },
    { id: 'b_life', kind: 'life', name: '생활기타', monthCap: bb['생활기타'] ?? 50000, yearCap: null },
    { id: 'b_buffer', kind: 'buffer', name: '예비비', monthCap: bb['예비비'] ?? 37268, yearCap: null },
  ];
}

  
// categoryBudgetMap migration
if (!(settings as any).categoryBudgetMap || typeof (settings as any).categoryBudgetMap !== 'object') {
  (settings as any).categoryBudgetMap = {};
}

  await upsert(key, 'settings', { id: 'settings', ...settings } as any);

  return {
    key,
    saltB64: meta.saltB64,
    budgets: settings.budgets,
    settings,
    cards: migratedCards,
    cardVersions,
    tx,
    statements,
    loans,
    categories,
  };
}

export async function saveCard(key: CryptoKey, card: Card): Promise<void> { await upsert(key, 'cards', card); }
export async function deleteCard(key: CryptoKey, id: string): Promise<void> { await deleteEncrypted('cards' as any, id); }

export async function saveCardVersion(key: CryptoKey, ver: CardVersion): Promise<void> { await upsert(key, 'card_versions', ver); }
export async function deleteCardVersion(key: CryptoKey, id: string): Promise<void> { await deleteEncrypted('card_versions' as any, id); }

export async function saveTx(key: CryptoKey, tx: Tx): Promise<void> { await upsert(key, 'tx', tx); }
export async function deleteTx(key: CryptoKey, id: string): Promise<void> { await deleteEncrypted('tx' as any, id); }

export async function saveStatement(key: CryptoKey, st: Statement): Promise<void> { await upsert(key, 'statements', st); }
export async function deleteStatement(key: CryptoKey, id: string): Promise<void> { await deleteEncrypted('statements' as any, id); }

export async function saveSettings(key: CryptoKey, settings: AppSettings): Promise<void> {
  
// budgetItems migration
if (!(settings as any).budgetItems || !Array.isArray((settings as any).budgetItems) || (settings as any).budgetItems.length === 0) {
  const bb: Record<string, number> = (settings as any).budgetBuckets ?? DEFAULT_BUDGET_BUCKETS;
  (settings as any).budgetItems = [
    { id: 'b_fuel', kind: 'fuel', name: '주유', monthCap: bb['주유'] ?? 220000, yearCap: null },
    { id: 'b_grocery', kind: 'grocery', name: '마트', monthCap: bb['마트'] ?? 170000, yearCap: null },
    { id: 'b_food', kind: 'food', name: '외식+편의점', monthCap: bb['외식+편의점'] ?? 50000, yearCap: null },
    { id: 'b_online', kind: 'online', name: '온라인쇼핑', monthCap: bb['온라인쇼핑'] ?? 30000, yearCap: null },
    { id: 'b_transfer', kind: 'transfer', name: '이체(소비성)', monthCap: bb['이체(소비성)'] ?? 70000, yearCap: null },
    { id: 'b_life', kind: 'life', name: '생활기타', monthCap: bb['생활기타'] ?? 50000, yearCap: null },
    { id: 'b_buffer', kind: 'buffer', name: '예비비', monthCap: bb['예비비'] ?? 37268, yearCap: null },
  ];
}

  
// categoryBudgetMap migration
if (!(settings as any).categoryBudgetMap || typeof (settings as any).categoryBudgetMap !== 'object') {
  (settings as any).categoryBudgetMap = {};
}

  await upsert(key, 'settings', { id: 'settings', ...settings } as any);
}

export async function exportEncryptedBackup(): Promise<BackupFileV1> {
  const raw = await exportRaw();
  if (!raw.meta) throw new Error('NO_META');
  return {
    version: 1,
    meta: { saltB64: raw.meta.saltB64, check: raw.meta.check },
    stores: raw.stores,
  };
}

export async function importEncryptedBackup(file: BackupFileV1): Promise<void> {
  if (file.version !== 1) throw new Error('UNSUPPORTED_BACKUP_VERSION');
  const meta: MetaRecord = {
    id: 'meta',
    saltB64: file.meta.saltB64,
    check: file.meta.check,
    createdAt: new Date().toISOString(),
  };
  await importRaw({ meta, stores: file.stores });
}


export async function saveLoan(key: CryptoKey, loan: Loan): Promise<void> { await upsert(key, 'loans', loan); }
export async function deleteLoan(key: CryptoKey, id: string): Promise<void> { await deleteEncrypted('loans', id); }


export async function saveCategory(key: CryptoKey, name: string): Promise<void> {
  const n = name.trim();
  if (!n) return;
  await upsert(key, 'categories', { id: 'cat_' + n, name: n } as any);
}

export async function deleteCategoryByName(key: CryptoKey, name: string): Promise<void> {
  const n = name.trim();
  if (!n) return;
  await deleteEncrypted('categories', 'cat_' + n);
}
