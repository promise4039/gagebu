import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, Card, CardVersion, Statement, Tx, Loan } from '../domain/models';
import * as store from '../storage/secureStore';

type AppCtx = {
  isUnlocked: boolean;
  isInitialized: boolean;
  error: string | null;

  initWallet: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;

  settings: AppSettings | null;
  cards: Card[];
  cardVersions: CardVersion[];
  tx: Tx[];
  statements: Statement[];
  loans: Loan[];
  categories: string[];
  categoryIdByPath: Record<string, string>;
  pathByCategoryId: Record<string, string>;

  upsertCard: (c: Card) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;

  upsertCardVersion: (v: CardVersion) => Promise<void>;
  deleteCardVersion: (id: string) => Promise<void>;

  upsertTx: (t: Tx) => Promise<void>;
  deleteTx: (id: string) => Promise<void>;

  upsertStatement: (s: Statement) => Promise<void>;
  deleteStatement: (id: string) => Promise<void>;

  upsertLoan: (l: Loan) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;

  upsertCategory: (name: string) => Promise<void>;
  deleteCategory: (name: string) => Promise<void>;

  updateSettings: (s: AppSettings) => Promise<void>;

  exportBackup: () => Promise<void>;
  importBackup: (file: File) => Promise<void>;
};

const Ctx = createContext<AppCtx | null>(null);

function download(filename: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setInitialized] = useState(false);
  const [isUnlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardVersions, setCardVersions] = useState<CardVersion[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryIdByPath, setCategoryIdByPath] = useState<Record<string, string>>({});
  const [pathByCategoryId, setPathByCategoryId] = useState<Record<string, string>>({});

  const keyRef = useRef<CryptoKey | null>(null);

  const lastActivityRef = useRef<number>(Date.now());
  useEffect(() => {
    const bump = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener('mousemove', bump);
    window.addEventListener('keydown', bump);
    window.addEventListener('click', bump);
    window.addEventListener('touchstart', bump, { passive: true });
    window.addEventListener('scroll', bump, { passive: true });
    return () => {
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('click', bump);
      window.removeEventListener('touchstart', bump as any);
      window.removeEventListener('scroll', bump as any);
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (!isUnlocked || !settings) return;
      const idleMs = Date.now() - lastActivityRef.current;
      const limitMs = Math.max(1, settings.autoLockMinutes) * 60_000;
      if (idleMs > limitMs) lock();
    }, 10_000);
    return () => clearInterval(t);
  }, [isUnlocked, settings]);

  useEffect(() => {
    (async () => {
      const has = await store.hasWallet();
      setInitialized(has);
    })().catch(() => setInitialized(false));
  }, []);

  const loadUnlocked = useCallback(async (passphrase: string) => {
    const s = await store.unlock(passphrase);
    keyRef.current = s.key;
    setSettings(s.settings);
    setCards(s.cards);
    setCardVersions(s.cardVersions);
    setTx(s.tx);
    setStatements(s.statements);
    setLoans((s as any).loans ?? []);
    setCategories(s.categories);
    setCategoryIdByPath((s as any).categoryIdByPath ?? {});
    setPathByCategoryId((s as any).pathByCategoryId ?? {});
    setUnlocked(true);
    setError(null);
  }, []);

  const initWallet = useCallback(async (passphrase: string) => {
    setError(null);
    try {
      await store.initNewWallet(passphrase);
      setInitialized(true);
      await loadUnlocked(passphrase);
    } catch (e: any) {
      setError(e?.message ?? 'INIT_FAILED');
      throw e;
    }
  }, [loadUnlocked]);

  const unlockWallet = useCallback(async (passphrase: string) => {
    setError(null);
    try {
      await loadUnlocked(passphrase);
    } catch (e: any) {
      setError(e?.message ?? 'UNLOCK_FAILED');
      throw e;
    }
  }, [loadUnlocked]);

  const lock = useCallback(() => {
    keyRef.current = null;
    setUnlocked(false);
    setError(null);
    setSettings(null);
    setCards([]);
    setCardVersions([]);
    setTx([]);
    setStatements([]);
    setLoans([]);
    setCategories([]);
    setCategoryIdByPath({});
    setPathByCategoryId({});
  }, []);

function applyBalanceDelta(cardId: string, delta: number) {
  setCards(prev => {
    const idx = prev.findIndex(c => c.id === cardId);
    if (idx < 0) return prev;
    const c = prev[idx];
    if (!c.trackBalance) return prev;
    const bal = (c.balance ?? 0) + delta;
    const next = { ...c, balance: bal };
    const cp = [...prev];
    cp[idx] = next;
    // persist asynchronously (best effort)
    const k = keyRef.current;
    if (k) {
      store.saveCard(k, next).catch(() => {});
    }
    return cp;
  });
}

function txBalanceDelta(t: Tx): number {
  // amount semantics: +지출, -수입
  // balance should decrease on spend, increase on income -> delta = -amount
  return -t.amount;
}

  const requireKey = (): CryptoKey => {
    const k = keyRef.current;
    if (!k) throw new Error('LOCKED');
    return k;
  };

  const upsertCard = useCallback(async (c: Card) => {
    const k = requireKey();
    await store.saveCard(k, c);
    setCards(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = c; return cp; }
      return [...prev, c];
    });
  }, []);

  const deleteCard = useCallback(async (id: string) => {
    const k = requireKey();
    await store.deleteCard(k, id);
    setCards(prev => prev.filter(x => x.id !== id));
  }, []);

  const upsertCardVersion = useCallback(async (v: CardVersion) => {
    const k = requireKey();
    await store.saveCardVersion(k, v);
    setCardVersions(prev => {
      const idx = prev.findIndex(x => x.id === v.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = v; return cp; }
      return [...prev, v];
    });
  }, []);

  const deleteCardVersion = useCallback(async (id: string) => {
    const k = requireKey();
    await store.deleteCardVersion(k, id);
    setCardVersions(prev => prev.filter(x => x.id !== id));
  }, []);

  const upsertTx = useCallback(async (t: Tx) => {
const k = requireKey();
const old = tx.find(x => x.id === t.id) ?? null;

await store.saveTx(k, t);

setTx(prev => {
  const idx = prev.findIndex(x => x.id === t.id);
  if (idx >= 0) { const cp = [...prev]; cp[idx] = t; return cp; }
  return [...prev, t];
});

// balance tracking
if (old) {
  const oldCard = cards.find(c => c.id === old.cardId);
  if (oldCard?.trackBalance) applyBalanceDelta(old.cardId, -txBalanceDelta(old)); // reverse old
}
const newCard = cards.find(c => c.id === t.cardId);
if (newCard?.trackBalance) applyBalanceDelta(t.cardId, txBalanceDelta(t));
  }, [tx, cards]);

  const deleteTx = useCallback(async (id: string) => {
const k = requireKey();
const old = tx.find(x => x.id === id) ?? null;

await store.deleteTx(k, id);
setTx(prev => prev.filter(x => x.id !== id));

if (old) {
  const c = cards.find(x => x.id === old.cardId);
  if (c?.trackBalance) applyBalanceDelta(old.cardId, -txBalanceDelta(old)); // reverse add
}
  }, [tx, cards]);

  const upsertStatement = useCallback(async (s: Statement) => {
    const k = requireKey();
    await store.saveStatement(k, s);
    setStatements(prev => {
      const idx = prev.findIndex(x => x.id === s.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = s; return cp; }
      return [...prev, s];
    });
  }, []);

  const deleteStatement = useCallback(async (id: string) => {
    const k = requireKey();
    await store.deleteStatement(k, id);
    setStatements(prev => prev.filter(x => x.id !== id));
  }, []);

  const upsertLoan = useCallback(async (l: Loan) => {
    const k = requireKey();
    await store.saveLoan(k, l);
    setLoans(prev => {
      const idx = prev.findIndex(x => x.id === l.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = l; return cp; }
      return [...prev, l];
    });
  }, []);

  const deleteLoan = useCallback(async (id: string) => {
    const k = requireKey();
    await store.deleteLoan(k, id);
    setLoans(prev => prev.filter(x => x.id !== id));
  }, []);


const upsertCategory = useCallback(async (name: string) => {
  const k = requireKey();
  const path = name.trim();
  if (!path) return;
  if (categoryIdByPath[path]) return;

  const created = await store.saveCategory(k, path);

  setCategories(prev => {
    const set = new Set(prev);
    set.add(created.fullPath);
    return Array.from(set.values()).sort();
  });
  setCategoryIdByPath(prev => ({ ...prev, [created.fullPath]: created.id }));
  setPathByCategoryId(prev => ({ ...prev, [created.id]: created.fullPath }));
}, [categoryIdByPath]);

const deleteCategory = useCallback(async (name: string) => {
  const k = requireKey();
  const path = name.trim();
  if (!path) return;
  const id = categoryIdByPath[path];
  if (!id) return;

  await store.deleteCategoryById(k, id);

  setCategories(prev => prev.filter(x => x !== path));
  setCategoryIdByPath(prev => {
    const next = { ...prev };
    delete next[path];
    return next;
  });
  setPathByCategoryId(prev => {
    const next = { ...prev };
    delete next[id];
    return next;
  });
}, [categoryIdByPath]);
  const updateSettings = useCallback(async (s: AppSettings) => {
    const k = requireKey();
    await store.saveSettings(k, s);
    setSettings(s);
  }, []);

  const exportBackup = useCallback(async () => {
    const backup = await store.exportEncryptedBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    download('backup_encrypted_' + new Date().toISOString().slice(0,10) + '.json', blob);
  }, []);

  const importBackup = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    await store.importEncryptedBackup(parsed);
    setInitialized(true);
    lock();
  }, [lock]);

  const value = useMemo<AppCtx>(() => ({
    isUnlocked,
    isInitialized,
    error,
    initWallet,
    unlock: unlockWallet,
    lock,
    settings,
    cards,
    cardVersions,
    tx,
    statements,
    loans,
    categories,
    categoryIdByPath,
    pathByCategoryId,
    upsertCard,
    deleteCard,
    upsertCardVersion,
    deleteCardVersion,
    upsertTx,
    deleteTx,
    upsertStatement,
    deleteStatement,
    upsertLoan,
    deleteLoan,
    upsertCategory,
    deleteCategory,
    updateSettings,
    exportBackup,
    importBackup,
  }), [isUnlocked, isInitialized, error, initWallet, unlockWallet, lock, settings, cards, cardVersions, tx, statements, loans, categories,
      upsertCard, deleteCard, upsertCardVersion, deleteCardVersion, upsertTx, deleteTx, upsertStatement, deleteStatement, upsertLoan, deleteLoan, upsertCategory, deleteCategory, updateSettings, categoryIdByPath, pathByCategoryId, exportBackup, importBackup]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('AppContext not found');
  return ctx;
}
