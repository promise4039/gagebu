/**
 * csvTransform.ts
 * CSV ↔ Tx 변환 유틸리티.
 *
 * 스키마 (헤더행):
 *   date,card,category,amount,installments,feeMode,feeRate,memo,tags
 *
 * amount: 지출=양수, 수입=음수
 * tags: 공백 구분 (예: "점심 회사")
 * # 으로 시작하는 행은 주석으로 처리 (스킵)
 */
import { Card, Tx } from '../domain/models';

// ── RFC 4180 미니 파서 ───────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) { fields.push(''); break; }
    if (line[i] === '"') {
      let val = '';
      i++; // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
        else if (line[i] === '"') { i++; break; }
        else { val += line[i++]; }
      }
      fields.push(val);
      if (line[i] === ',') i++;
    } else {
      const comma = line.indexOf(',', i);
      if (comma === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, comma));
      i = comma + 1;
    }
  }
  return fields;
}

function csvField(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return '"' + v.replace(/"/g, '""') + '"';
  }
  return v;
}

// ── 내보내기 ────────────────────────────────────────────────────────────────

export function exportTxsToCsv(
  txs: Tx[],
  cards: Card[],
  categories: string[],
): string {
  const activeCards = cards.filter(c => c.isActive !== false);
  const cardNamesStr = activeCards.map(c => c.name).join(', ') || '(카드 없음)';

  // 카테고리 목록을 줄 바꿔서 주석에 포함 (너무 길면 여러 행)
  const catChunks: string[] = [];
  let chunk = '';
  for (const cat of categories) {
    const add = (chunk ? ', ' : '') + cat;
    if (chunk.length + add.length > 100) {
      catChunks.push(chunk);
      chunk = cat;
    } else {
      chunk += add;
    }
  }
  if (chunk) catChunks.push(chunk);

  const lines: string[] = [
    `# 가계부 거래 데이터 | 내보내기: ${new Date().toISOString().slice(0, 10)}`,
    `# ----------------------------------------------------------------`,
    `# [결제수단] card 열에 아래 이름 중 하나를 정확히 입력하세요`,
    `# ${cardNamesStr}`,
    `# ----------------------------------------------------------------`,
    `# [카테고리] category 열에 아래 경로 중 하나를 정확히 입력하세요`,
    ...catChunks.map(c => `# ${c}`),
    `# ----------------------------------------------------------------`,
    `# [입력 안내]`,
    `# date       : YYYY-MM-DD 형식`,
    `# amount     : 지출=양수(예: 8200)  수입=음수(예: -3000000)`,
    `# installments: 할부 개월수 (일시불=1, 생략시 1)`,
    `# feeMode    : free 또는 manual (생략시 free)`,
    `# feeRate    : feeMode=manual일 때 수수료율(%) 숫자 (생략시 0)`,
    `# memo       : 자유 입력 (쉼표 포함 시 "따옴표"로 감싸기)`,
    `# tags       : 공백 구분 (예: 점심 회사)  # 기호 불필요`,
    `# ----------------------------------------------------------------`,
    `date,card,category,amount,installments,feeMode,feeRate,memo,tags`,
  ];

  const sorted = [...txs].sort((a, b) => b.date.localeCompare(a.date));
  for (const t of sorted) {
    const cardName = cards.find(c => c.id === t.cardId)?.name ?? '';
    const tags = (t.tags ?? []).join(' ');
    lines.push([
      csvField(t.date),
      csvField(cardName),
      csvField(t.category),
      String(t.amount),
      String(t.installments ?? 1),
      t.feeMode ?? 'free',
      String(t.feeRate ?? 0),
      csvField(t.memo ?? ''),
      csvField(tags),
    ].join(','));
  }

  return lines.join('\n');
}

/** 빈 템플릿(헤더+예시 행만) 내보내기 */
export function exportTemplateCsv(cards: Card[], categories: string[]): string {
  const full = exportTxsToCsv([], cards, categories);
  const today = new Date().toISOString().slice(0, 10);
  const exampleCard = cards.find(c => c.isActive !== false)?.name ?? '카드이름';
  const exampleCat = categories.find(c => c.startsWith('식비')) ?? categories[0] ?? '식비/외식';

  return (
    full +
    '\n' +
    `# 아래는 예시 행입니다. 삭제하고 실제 데이터를 입력하세요.\n` +
    `${today},${exampleCard},${exampleCat},8200,1,free,,점심,\n` +
    `${today},${exampleCard},수입/급여,-3000000,1,free,,월급,`
  );
}

// ── 가져오기 ────────────────────────────────────────────────────────────────

export interface TxDraft {
  rowNum: number;
  date: string;
  cardName: string;
  category: string;
  amount: number;
  installments: number;
  feeMode: 'free' | 'manual';
  feeRate: number;
  memo: string;
  tags: string[];
}

export interface ParseResult {
  drafts: TxDraft[];
  parseErrors: { rowNum: number; message: string }[];
}

export function parseCsvToTxDrafts(csvText: string): ParseResult {
  const lines = csvText.split(/\r?\n/);
  const drafts: TxDraft[] = [];
  const parseErrors: { rowNum: number; message: string }[] = [];

  let headerFound = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith('#')) continue;

    // 헤더 행 감지
    if (!headerFound) {
      if (rawLine.toLowerCase().startsWith('date')) { headerFound = true; continue; }
      // 헤더 없이 데이터가 바로 시작하는 경우 대비
      headerFound = true;
    }

    const fields = parseCsvLine(rawLine);
    const [
      date = '',
      cardName = '',
      category = '',
      amountStr = '',
      installmentsStr = '',
      feeMode = 'free',
      feeRateStr = '',
      memo = '',
      tagsStr = '',
    ] = fields;

    const rowNum = i + 1;

    if (!date && !cardName && !category && !amountStr) continue; // 완전 빈 행 무시

    const amount = Number(amountStr.replaceAll(',', '').trim());
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      parseErrors.push({ rowNum, message: `날짜 형식 오류: "${date}" (YYYY-MM-DD 필요)` });
      continue;
    }
    if (!Number.isFinite(amount) || amount === 0) {
      parseErrors.push({ rowNum, message: `금액 오류: "${amountStr}" (0이 아닌 숫자 필요)` });
      continue;
    }
    if (!cardName.trim()) {
      parseErrors.push({ rowNum, message: `결제수단 비어있음 (card 열 필수)` });
      continue;
    }
    if (!category.trim()) {
      parseErrors.push({ rowNum, message: `카테고리 비어있음 (category 열 필수)` });
      continue;
    }

    const installments = Math.max(1, Math.floor(Number(installmentsStr) || 1));
    const fm = (feeMode.trim().toLowerCase() === 'manual' ? 'manual' : 'free') as 'free' | 'manual';
    const feeRate = fm === 'manual' ? (Number(feeRateStr) || 0) : 0;
    const tags = tagsStr.trim() ? tagsStr.trim().split(/\s+/) : [];

    drafts.push({
      rowNum,
      date: date.trim(),
      cardName: cardName.trim(),
      category: category.trim(),
      amount,
      installments,
      feeMode: fm,
      feeRate,
      memo: memo.trim(),
      tags,
    });
  }

  return { drafts, parseErrors };
}

export interface ValidationResult {
  valid: (TxDraft & { cardId: string; categoryId?: string })[];
  errors: { rowNum: number; message: string }[];
}

export function validateDrafts(
  drafts: TxDraft[],
  cards: Card[],
  categories: string[],
  categoryIdByPath: Record<string, string>,
): ValidationResult {
  const valid: ValidationResult['valid'] = [];
  const errors: ValidationResult['errors'] = [];
  const catSet = new Set(categories.map(c => c.toLowerCase()));

  for (const d of drafts) {
    const card = cards.find(c => c.name === d.cardName);
    if (!card) {
      errors.push({
        rowNum: d.rowNum,
        message: `카드 "${d.cardName}"를 찾을 수 없어요. 유효한 카드: ${cards.map(c => c.name).join(', ')}`,
      });
      continue;
    }

    if (!catSet.has(d.category.toLowerCase())) {
      errors.push({
        rowNum: d.rowNum,
        message: `카테고리 "${d.category}"를 찾을 수 없어요. CSV 파일 상단 주석에서 유효한 카테고리를 확인하세요.`,
      });
      continue;
    }

    const categoryId = categoryIdByPath[d.category];
    valid.push({ ...d, cardId: card.id, categoryId });
  }

  return { valid, errors };
}
