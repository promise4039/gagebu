import { useCallback, useState } from 'react';
import { Card, CardVersion } from '../domain/models';
import * as store from '../storage/secureStore';

export type CardActionsReturn = {
  cards: Card[];
  setCards: React.Dispatch<React.SetStateAction<Card[]>>;
  cardVersions: CardVersion[];
  setCardVersions: React.Dispatch<React.SetStateAction<CardVersion[]>>;
  applyBalanceDelta: (cardId: string, delta: number, keyRef: React.RefObject<CryptoKey | null>) => void;
  upsertCard: (c: Card) => Promise<void>;
  deleteCard: (id: string) => Promise<void>;
  upsertCardVersion: (v: CardVersion) => Promise<void>;
  deleteCardVersion: (id: string) => Promise<void>;
};

export function useCardActions(requireKey: () => CryptoKey): CardActionsReturn {
  const [cards, setCards] = useState<Card[]>([]);
  const [cardVersions, setCardVersions] = useState<CardVersion[]>([]);

  function applyBalanceDelta(cardId: string, delta: number, keyRef: React.RefObject<CryptoKey | null>) {
    setCards(prev => {
      const idx = prev.findIndex(c => c.id === cardId);
      if (idx < 0) return prev;
      const c = prev[idx];
      if (!c.trackBalance) return prev;
      const bal = (c.balance ?? 0) + delta;
      const next = { ...c, balance: bal };
      const cp = [...prev];
      cp[idx] = next;
      const k = keyRef.current;
      if (k) {
        store.saveCard(k, next).catch(() => {});
      }
      return cp;
    });
  }

  const upsertCard = useCallback(async (c: Card) => {
    const k = requireKey();
    await store.saveCard(k, c);
    setCards(prev => {
      const idx = prev.findIndex(x => x.id === c.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = c; return cp; }
      return [...prev, c];
    });
  }, [requireKey]);

  const deleteCard = useCallback(async (id: string) => {
    const k = requireKey();
    await store.deleteCard(k, id);
    setCards(prev => prev.filter(x => x.id !== id));
  }, [requireKey]);

  const upsertCardVersion = useCallback(async (v: CardVersion) => {
    const k = requireKey();
    await store.saveCardVersion(k, v);
    setCardVersions(prev => {
      const idx = prev.findIndex(x => x.id === v.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = v; return cp; }
      return [...prev, v];
    });
  }, [requireKey]);

  const deleteCardVersion = useCallback(async (id: string) => {
    const k = requireKey();
    await store.deleteCardVersion(k, id);
    setCardVersions(prev => prev.filter(x => x.id !== id));
  }, [requireKey]);

  return {
    cards,
    setCards,
    cardVersions,
    setCardVersions,
    applyBalanceDelta,
    upsertCard,
    deleteCard,
    upsertCardVersion,
    deleteCardVersion,
  };
}
