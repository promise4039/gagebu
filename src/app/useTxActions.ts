import { useCallback, useState } from 'react';
import { Card, Tx } from '../domain/models';
import * as store from '../storage/secureStore';

type ApplyBalanceDelta = (cardId: string, delta: number, keyRef: React.RefObject<CryptoKey | null>) => void;

export type TxActionsReturn = {
  tx: Tx[];
  setTx: React.Dispatch<React.SetStateAction<Tx[]>>;
  upsertTx: (t: Tx) => Promise<void>;
  deleteTx: (id: string) => Promise<void>;
};

function txBalanceDelta(t: Tx): number {
  // amount semantics: +지출, -수입
  // balance should decrease on spend, increase on income -> delta = -amount
  return -t.amount;
}

export function useTxActions(
  requireKey: () => CryptoKey,
  keyRef: React.RefObject<CryptoKey | null>,
  getCards: () => Card[],
  applyBalanceDelta: ApplyBalanceDelta,
): TxActionsReturn {
  const [tx, setTx] = useState<Tx[]>([]);

  const upsertTx = useCallback(async (t: Tx) => {
    const k = requireKey();
    const cards = getCards();
    const old = tx.find(x => x.id === t.id) ?? null;

    await store.saveTx(k, t);

    setTx(prev => {
      const idx = prev.findIndex(x => x.id === t.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = t; return cp; }
      return [...prev, t];
    });

    if (old) {
      const oldCard = cards.find(c => c.id === old.cardId);
      if (oldCard?.trackBalance) applyBalanceDelta(old.cardId, -txBalanceDelta(old), keyRef);
    }
    const newCard = cards.find(c => c.id === t.cardId);
    if (newCard?.trackBalance) applyBalanceDelta(t.cardId, txBalanceDelta(t), keyRef);
  }, [tx, requireKey, getCards, applyBalanceDelta, keyRef]);

  const deleteTx = useCallback(async (id: string) => {
    const k = requireKey();
    const cards = getCards();
    const old = tx.find(x => x.id === id) ?? null;

    await store.deleteTx(k, id);
    setTx(prev => prev.filter(x => x.id !== id));

    if (old) {
      const c = cards.find(x => x.id === old.cardId);
      if (c?.trackBalance) applyBalanceDelta(old.cardId, -txBalanceDelta(old), keyRef);
    }
  }, [tx, requireKey, getCards, applyBalanceDelta, keyRef]);

  return { tx, setTx, upsertTx, deleteTx };
}
