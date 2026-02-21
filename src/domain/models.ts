export type PayMethodType = 'credit' | 'debit' | 'cash' | 'account' | 'transfer_spend' | 'transfer_nonspend';
export type WeekendAdjust = 'none' | 'next_business' | 'prev_business';

export type Card = {
  id: string;
  name: string;
  type: PayMethodType;
  isActive: boolean;
  // 계좌/현금/체크 등 잔액 추적용(신용카드는 보통 false)
  trackBalance: boolean;
  balance: number | null; // KRW
  // 계좌 목적/용도 메모
  purpose: string;
};

export type CycleRule = {
  monthOffset: number; // relative to payment month
  day: number | 'EOM';
};

export type CardVersion = {
  id: string;
  cardId: string;
  validFrom: string; // YYYY-MM-DD
  paymentDay: number | 'EOM';
  clamp: boolean; // if day doesn't exist -> end of month
  weekendAdjust: WeekendAdjust;
  cycleStart: CycleRule;
  cycleEnd: CycleRule;
  createdAt: string; // ISO
};

export type TxFeeMode = 'free' | 'manual';

export type Tx = {
  id: string;
  date: string; // YYYY-MM-DD
  cardId: string;
  category: string;
  amount: number; // KRW, negative allowed for refunds
  installments: number; // 1=single
  feeMode: TxFeeMode;
  feeRate: number; // percent when manual
  memo: string;
};

export type Statement = {
  id: string;
  cardId: string;
  paymentDate: string; // YYYY-MM-DD
  actual: number;
  memo: string;
  updatedAt: string; // ISO
};
export type LoanMethod = 'equal_principal' | 'annuity';

export type Loan = {
  id: string;
  name: string; // 예: 저금리대출(대환)
  principal: number; // 대출원금
  annualRate: number; // 연 이율(%)
  termMonths: number; // 전체 회차(개월)
  startDate: string; // YYYY-MM-DD
  paymentDay: number | 'EOM'; // 매달 상환일
  weekendAdjust: WeekendAdjust;
  method: LoanMethod;
  memo: string;
};


export type Budgets = {
  monthCap: number;
  weekCap: number;
  dayCap: number;
};

export type BudgetKind =
  | 'fuel'
  | 'grocery'
  | 'food'
  | 'online'
  | 'transfer'
  | 'life'
  | 'buffer'
  | 'custom';

export type BudgetItem = {
  id: string;
  kind: BudgetKind;
  name: string;
  monthCap: number;
  // null이면 monthCap*12로 계산
  yearCap: number | null;
};

export type AppSettings = {
  budgets: Budgets;
  autoLockMinutes: number;
  // 예산 캡(항목) 목록
  budgetItems: BudgetItem[];
  // (레거시) 예전 버전에서 사용하던 레코드형 버킷 예산
  budgetBuckets?: Record<string, number>;
  // 카테고리 -> 예산 항목(id) 매핑(미분류 처리용)
  categoryBudgetMap: Record<string, string>;
};

export type BackupFileV1 = {
  version: 1;
  meta: {
    saltB64: string;
    check: { ivB64: string; ctB64: string };
  };
  stores: Record<string, Array<{ id: string; ivB64: string; ctB64: string }>>;
};
