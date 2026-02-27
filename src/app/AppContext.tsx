import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppSettings, Card, CardVersion, Statement, Tx, Loan } from '../domain/models';
import * as store from '../storage/secureStore';
import { exportTxsToCsv, exportTemplateCsv } from '../storage/csvTransform';
import { useLockState } from './useLockState';
import { useCardActions } from './useCardActions';
import { useTxActions } from './useTxActions';
import { useLoanActions } from './useLoanActions';

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

  exportTxsCsv: () => void;
  exportTxsTemplate: () => void;
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
  const lockState = useLockState();
  const { keyRef, requireKey, isInitialized, setInitialized, isUnlocked, setUnlocked, error, setError, lockKey, loadUnlockedBase } = lockState;

  const cardActions = useCardActions(requireKey);
  const { cards, setCards, cardVersions, setCardVersions, applyBalanceDelta } = cardActions;

  const getCards = useCallback(() => cards, [cards]);
  const txActions = useTxActions(requireKey, keyRef, getCards, applyBalanceDelta);
  const { tx, setTx } = txActions;

  const loanActions = useLoanActions(requireKey);
  const { loans, setLoans } = loanActions;

  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [statements, setStatements] = useState<Statement[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoryIdByPath, setCategoryIdByPath] = useState<Record<string, string>>({});
  const [pathByCategoryId, setPathByCategoryId] = useState<Record<string, string>>({});

  const loadUnlocked = useCallback(async (passphrase: string) => {
    const s = await loadUnlockedBase(passphrase);
    setSettings(s.settings);
    setCards(s.cards);
    setCardVersions(s.cardVersions);
    setTx(s.tx);
    setStatements(s.statements);
    setLoans((s as any).loans ?? []);
    setCategories(s.categories);
    setCategoryIdByPath((s as any).categoryIdByPath ?? {});
    setPathByCategoryId((s as any).pathByCategoryId ?? {});
  }, [loadUnlockedBase, setCards, setCardVersions, setTx, setLoans]);

  const lock = useCallback(() => {
    lockKey();
    setSettings(null);
    setCards([]);
    setCardVersions([]);
    setTx([]);
    setStatements([]);
    setLoans([]);
    setCategories([]);
    setCategoryIdByPath({});
    setPathByCategoryId({});
  }, [lockKey, setCards, setCardVersions, setTx, setLoans]);

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
  }, [loadUnlocked, setError, setInitialized]);

  const unlockWallet = useCallback(async (passphrase: string) => {
    setError(null);
    try {
      await loadUnlocked(passphrase);
    } catch (e: any) {
      setError(e?.message ?? 'UNLOCK_FAILED');
      throw e;
    }
  }, [loadUnlocked, setError]);

  // Auto-lock with activity tracking (needs settings.autoLockMinutes)
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
  }, [isUnlocked, settings, lock]);

  const upsertStatement = useCallback(async (s: Statement) => {
    const k = requireKey();
    await store.saveStatement(k, s);
    setStatements(prev => {
      const idx = prev.findIndex(x => x.id === s.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = s; return cp; }
      return [...prev, s];
    });
  }, [requireKey]);

  const deleteStatement = useCallback(async (id: string) => {
    const k = requireKey();
    await store.deleteStatement(k, id);
    setStatements(prev => prev.filter(x => x.id !== id));
  }, [requireKey]);

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
  }, [requireKey, categoryIdByPath]);

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
  }, [requireKey, categoryIdByPath]);

  const updateSettings = useCallback(async (s: AppSettings) => {
    const k = requireKey();
    await store.saveSettings(k, s);
    setSettings(s);
  }, [requireKey]);

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
  }, [lock, setInitialized]);

  const exportTxsCsv = useCallback(() => {
    const csv = exportTxsToCsv(tx, cards, categories);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    download('transactions_' + new Date().toISOString().slice(0, 10) + '.csv', blob);
  }, [tx, cards, categories]);

  const exportTxsTemplate = useCallback(() => {
    const csv = exportTemplateCsv(cards, categories);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    download('transactions_template.csv', blob);
  }, [cards, categories]);

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
    upsertCard: cardActions.upsertCard,
    deleteCard: cardActions.deleteCard,
    upsertCardVersion: cardActions.upsertCardVersion,
    deleteCardVersion: cardActions.deleteCardVersion,
    upsertTx: txActions.upsertTx,
    deleteTx: txActions.deleteTx,
    upsertStatement,
    deleteStatement,
    upsertLoan: loanActions.upsertLoan,
    deleteLoan: loanActions.deleteLoan,
    upsertCategory,
    deleteCategory,
    updateSettings,
    exportBackup,
    importBackup,
    exportTxsCsv,
    exportTxsTemplate,
  }), [isUnlocked, isInitialized, error, initWallet, unlockWallet, lock, settings, cards, cardVersions, tx, statements, loans, categories,
      cardActions.upsertCard, cardActions.deleteCard, cardActions.upsertCardVersion, cardActions.deleteCardVersion,
      txActions.upsertTx, txActions.deleteTx, upsertStatement, deleteStatement,
      loanActions.upsertLoan, loanActions.deleteLoan, upsertCategory, deleteCategory,
      updateSettings, categoryIdByPath, pathByCategoryId, exportBackup, importBackup, exportTxsCsv, exportTxsTemplate]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('AppContext not found');
  return ctx;
}
