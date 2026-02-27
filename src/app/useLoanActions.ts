import { useCallback, useState } from 'react';
import { Loan } from '../domain/models';
import * as store from '../storage/secureStore';

export type LoanActionsReturn = {
  loans: Loan[];
  setLoans: React.Dispatch<React.SetStateAction<Loan[]>>;
  upsertLoan: (l: Loan) => Promise<void>;
  deleteLoan: (id: string) => Promise<void>;
};

export function useLoanActions(requireKey: () => CryptoKey): LoanActionsReturn {
  const [loans, setLoans] = useState<Loan[]>([]);

  const upsertLoan = useCallback(async (l: Loan) => {
    const k = requireKey();
    await store.saveLoan(k, l);
    setLoans(prev => {
      const idx = prev.findIndex(x => x.id === l.id);
      if (idx >= 0) { const cp = [...prev]; cp[idx] = l; return cp; }
      return [...prev, l];
    });
  }, [requireKey]);

  const deleteLoan = useCallback(async (id: string) => {
    const k = requireKey();
    await store.deleteLoan(k, id);
    setLoans(prev => prev.filter(x => x.id !== id));
  }, [requireKey]);

  return { loans, setLoans, upsertLoan, deleteLoan };
}
