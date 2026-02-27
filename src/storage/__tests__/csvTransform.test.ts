import { describe, it, expect } from 'vitest';
import { exportTxsToCsv, exportTemplateCsv, parseCsvToTxDrafts, validateDrafts } from '../csvTransform';
import { Card, Tx } from '../../domain/models';

const mockCards: Card[] = [
  { id: 'card_1', name: '삼성카드', type: 'credit', isActive: true, trackBalance: false, balance: null, purpose: '' },
  { id: 'card_2', name: '농협계좌', type: 'account', isActive: true, trackBalance: true, balance: 100000, purpose: '' },
];

const mockCategories = ['식비/외식', '식비/카페', '마트/마트', '수입/급여'];

const mockCategoryIdByPath: Record<string, string> = {
  '식비/외식': 'c_001',
  '식비/카페': 'c_002',
  '마트/마트': 'c_003',
  '수입/급여': 'c_004',
};

const mockTxs: Tx[] = [
  {
    id: 'tx_1', date: '2024-01-15', cardId: 'card_1', category: '식비/외식',
    categoryId: 'c_001', amount: 8200, installments: 1, feeMode: 'free', feeRate: 0,
    memo: '점심', tags: ['점심'],
  },
  {
    id: 'tx_2', date: '2024-01-20', cardId: 'card_2', category: '수입/급여',
    categoryId: 'c_004', amount: -3000000, installments: 1, feeMode: 'free', feeRate: 0,
    memo: '월급', tags: [],
  },
];

describe('exportTxsToCsv', () => {
  it('거래 데이터를 CSV 문자열로 변환', () => {
    const csv = exportTxsToCsv(mockTxs, mockCards, mockCategories);
    expect(csv).toContain('date,card,category,amount,installments,feeMode,feeRate,memo,tags');
    expect(csv).toContain('2024-01-15,삼성카드,식비/외식,8200');
    expect(csv).toContain('2024-01-20,농협계좌,수입/급여,-3000000');
  });

  it('# 주석 헤더에 카드명과 카테고리가 포함됨', () => {
    const csv = exportTxsToCsv(mockTxs, mockCards, mockCategories);
    expect(csv).toContain('삼성카드');
    expect(csv).toContain('농협계좌');
    expect(csv).toContain('식비/외식');
  });

  it('메모에 쉼표가 있으면 따옴표로 감쌈', () => {
    const txWithComma: Tx[] = [{
      ...mockTxs[0], memo: '점심, 커피', id: 'tx_3',
    }];
    const csv = exportTxsToCsv(txWithComma, mockCards, mockCategories);
    expect(csv).toContain('"점심, 커피"');
  });
});

describe('exportTemplateCsv', () => {
  it('빈 거래 + 예시 행 포함', () => {
    const csv = exportTemplateCsv(mockCards, mockCategories);
    expect(csv).toContain('date,card,category,amount,installments,feeMode,feeRate,memo,tags');
    expect(csv).toContain('# 아래는 예시 행입니다');
  });
});

describe('parseCsvToTxDrafts', () => {
  it('유효한 CSV 파싱', () => {
    const csv = `date,card,category,amount,installments,feeMode,feeRate,memo,tags
2024-01-15,삼성카드,식비/외식,8200,1,free,,점심,점심 회사
2024-01-20,농협계좌,수입/급여,-3000000,1,free,,월급,`;
    const { drafts, parseErrors } = parseCsvToTxDrafts(csv);
    expect(parseErrors).toHaveLength(0);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].amount).toBe(8200);
    expect(drafts[0].tags).toEqual(['점심', '회사']);
    expect(drafts[1].amount).toBe(-3000000);
  });

  it('# 주석 행은 스킵', () => {
    const csv = `# 이것은 주석
# 또 다른 주석
date,card,category,amount,installments,feeMode,feeRate,memo,tags
2024-01-15,삼성카드,식비/외식,8200,1,free,,점심,`;
    const { drafts } = parseCsvToTxDrafts(csv);
    expect(drafts).toHaveLength(1);
  });

  it('날짜 형식 오류 → parseErrors', () => {
    const csv = `date,card,category,amount,installments,feeMode,feeRate,memo,tags
20240115,삼성카드,식비/외식,8200,1,free,,점심,`;
    const { drafts, parseErrors } = parseCsvToTxDrafts(csv);
    expect(drafts).toHaveLength(0);
    expect(parseErrors[0].message).toContain('날짜 형식 오류');
  });

  it('금액 0 → parseErrors', () => {
    const csv = `date,card,category,amount,installments,feeMode,feeRate,memo,tags
2024-01-15,삼성카드,식비/외식,0,1,free,,점심,`;
    const { drafts, parseErrors } = parseCsvToTxDrafts(csv);
    expect(drafts).toHaveLength(0);
    expect(parseErrors[0].message).toContain('금액 오류');
  });

  it('따옴표로 감싼 쉼표 포함 필드 파싱', () => {
    const csv = `date,card,category,amount,installments,feeMode,feeRate,memo,tags
2024-01-15,삼성카드,식비/외식,8200,1,free,,"점심, 커피",`;
    const { drafts, parseErrors } = parseCsvToTxDrafts(csv);
    expect(parseErrors).toHaveLength(0);
    expect(drafts[0].memo).toBe('점심, 커피');
  });
});

describe('validateDrafts', () => {
  it('유효한 드래프트 → valid에 포함', () => {
    const { drafts } = parseCsvToTxDrafts(
      `date,card,category,amount,installments,feeMode,feeRate,memo,tags\n2024-01-15,삼성카드,식비/외식,8200,1,free,,점심,`
    );
    const { valid, errors } = validateDrafts(drafts, mockCards, mockCategories, mockCategoryIdByPath);
    expect(errors).toHaveLength(0);
    expect(valid).toHaveLength(1);
    expect(valid[0].cardId).toBe('card_1');
    expect(valid[0].categoryId).toBe('c_001');
  });

  it('존재하지 않는 카드 → errors', () => {
    const { drafts } = parseCsvToTxDrafts(
      `date,card,category,amount,installments,feeMode,feeRate,memo,tags\n2024-01-15,없는카드,식비/외식,8200,1,free,,점심,`
    );
    const { valid, errors } = validateDrafts(drafts, mockCards, mockCategories, mockCategoryIdByPath);
    expect(valid).toHaveLength(0);
    expect(errors[0].message).toContain('카드');
  });

  it('존재하지 않는 카테고리 → errors', () => {
    const { drafts } = parseCsvToTxDrafts(
      `date,card,category,amount,installments,feeMode,feeRate,memo,tags\n2024-01-15,삼성카드,없는카테고리,8200,1,free,,점심,`
    );
    const { valid, errors } = validateDrafts(drafts, mockCards, mockCategories, mockCategoryIdByPath);
    expect(valid).toHaveLength(0);
    expect(errors[0].message).toContain('카테고리');
  });

  it('내보내기 → 파싱 → 검증 라운드트립', () => {
    const csv = exportTxsToCsv(mockTxs, mockCards, mockCategories);
    const { drafts, parseErrors } = parseCsvToTxDrafts(csv);
    const { valid, errors } = validateDrafts(drafts, mockCards, mockCategories, mockCategoryIdByPath);

    expect(parseErrors).toHaveLength(0);
    expect(errors).toHaveLength(0);
    expect(valid).toHaveLength(mockTxs.length);
    expect(valid[0].amount).toBe(-3000000); // 날짜 내림차순이므로 1/20이 먼저
    expect(valid[1].amount).toBe(8200);
  });
});
