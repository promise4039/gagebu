import { useCallback, useEffect, useRef, useState } from 'react';
import * as store from '../storage/secureStore';

export type LockStateReturn = {
  keyRef: React.RefObject<CryptoKey | null>;
  requireKey: () => CryptoKey;
  isInitialized: boolean;
  setInitialized: React.Dispatch<React.SetStateAction<boolean>>;
  isUnlocked: boolean;
  setUnlocked: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  lockKey: () => void;
  loadUnlockedBase: (passphrase: string) => Promise<store.UnlockedState>;
};

export function useLockState(): LockStateReturn {
  const keyRef = useRef<CryptoKey | null>(null);
  const [isInitialized, setInitialized] = useState(false);
  const [isUnlocked, setUnlocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const has = await store.hasWallet();
      setInitialized(has);
    })().catch(() => setInitialized(false));
  }, []);

  const requireKey = (): CryptoKey => {
    const k = keyRef.current;
    if (!k) throw new Error('LOCKED');
    return k;
  };

  const lockKey = useCallback(() => {
    keyRef.current = null;
    setUnlocked(false);
    setError(null);
  }, []);

  const loadUnlockedBase = useCallback(async (passphrase: string): Promise<store.UnlockedState> => {
    const s = await store.unlock(passphrase);
    keyRef.current = s.key;
    setUnlocked(true);
    setError(null);
    return s;
  }, []);

  return {
    keyRef,
    requireKey,
    isInitialized,
    setInitialized,
    isUnlocked,
    setUnlocked,
    error,
    setError,
    lockKey,
    loadUnlockedBase,
  };
}
