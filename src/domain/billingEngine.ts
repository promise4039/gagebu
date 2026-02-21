import { Card, CardVersion, Tx, Statement } from './models';
import { addMonthsUTC, adjustWeekendUTC, clampDayToMonthUTC, makeUTCDate, monthEndDayUTC, parseYMD, ymd } from './date';

export type Allocation = {
  cardId: string;
  paymentDate: string; // YYYY-MM-DD
  principalPart: number;
  feePart: number;
  txId: string;
};

export type InstallmentStats = {
  installmentTotalPrincipal: number;      // 총 할부원금(분배 합)
  installmentPaidToDate: number;          // 해당 결제일(포함)까지 납부 예정 원금
  installmentRemainingAfter: number;      // 해당 결제일(포함) 이후 남은 원금
  installmentThisPayment: number;         // 이번 결제분 할부원금
  installmentRemainingBefore: number;     // 이번 결제 직전 남은 할부원금(=this+after)
};

export type PaymentEvent = {
  cardId: string;
  cardName: string;
  paymentDate: string;
  cycleStart: string;
  cycleEnd: string;
  expected: number;
  expectedPrincipal: number;
  expectedFee: number;
  actual: number | null;
  diff: number | null;
  installment: InstallmentStats;
};

function pickVersions(versions: CardVersion[], approxDate: Date): CardVersion | null {
  const sorted = versions
    .map(v => ({ v, dt: parseYMD(v.validFrom) }))
    .filter(x => x.dt)
    .sort((a, b) => (a.dt!.getTime() - b.dt!.getTime()));
  let picked: CardVersion | null = null;
  for (const x of sorted) {
    if (x.dt! <= approxDate) picked = x.v;
    else break;
  }
  return picked || (sorted.length ? sorted[0].v : null);
}

export function paymentDateForMonth(version: CardVersion, ym: { y: number; m: number }): Date {
  const d = clampDayToMonthUTC(ym.y, ym.m, version.paymentDay, version.clamp);
  const dt = makeUTCDate(ym.y, ym.m, Math.min(d, monthEndDayUTC(ym.y, ym.m)));
  return adjustWeekendUTC(dt, version.weekendAdjust);
}

export function cycleRangeForPayment(version: CardVersion, paymentDate: Date): { start: Date; end: Date } {
  const M = { y: paymentDate.getUTCFullYear(), m: paymentDate.getUTCMonth() + 1 };
  const sm = addMonthsUTC(M, Number(version.cycleStart.monthOffset));
  const em = addMonthsUTC(M, Number(version.cycleEnd.monthOffset));
  const sd = clampDayToMonthUTC(sm.y, sm.m, version.cycleStart.day, version.clamp);
  const ed = clampDayToMonthUTC(em.y, em.m, version.cycleEnd.day, version.clamp);
  const start = makeUTCDate(sm.y, sm.m, Math.min(sd, monthEndDayUTC(sm.y, sm.m)));
  const end = makeUTCDate(em.y, em.m, Math.min(ed, monthEndDayUTC(em.y, em.m)));
  return { start, end };
}

function splitWon(amount: number, n: number): number[] {
  const N = Math.max(1, Math.floor(n));
  const base = Math.trunc(amount / N);
  const rem = amount - base * N;
  const parts: number[] = [];
  for (let i = 0; i < N; i++) parts.push(base + (i === 0 ? rem : 0));
  return parts;
}

function feeTotal(amount: number, feeMode: 'free' | 'manual', feeRate: number): number {
  if (feeMode !== 'manual') return 0;
  const r = Number(feeRate) || 0;
  return Math.round(amount * (r / 100));
}

function versionsByCard(cardVersions: CardVersion[], cardId: string): CardVersion[] {
  return cardVersions.filter(v => v.cardId === cardId);
}

function paymentInfoForYm(cardVersions: CardVersion[], cardId: string, ym: { y: number; m: number }): { paymentDate: Date; version: CardVersion } | null {
  const versions = versionsByCard(cardVersions, cardId);
  if (!versions.length) return null;
  const approx = makeUTCDate(ym.y, ym.m, Math.min(15, monthEndDayUTC(ym.y, ym.m)));
  const ver = pickVersions(versions, approx);
  if (!ver) return null;
  return { paymentDate: paymentDateForMonth(ver, ym), version: ver };
}

function findBillingPaymentForTx(cardVersions: CardVersion[], cardId: string, txDate: Date):
  { ym: { y: number; m: number }; paymentDate: Date; version: CardVersion; range: { start: Date; end: Date } } | null {
  const versions = versionsByCard(cardVersions, cardId);
  if (!versions.length) return null;
  const baseYm = { y: txDate.getUTCFullYear(), m: txDate.getUTCMonth() + 1 };

  // forward search (most likely)
  for (let i = 0; i < 8; i++) {
    const ym = addMonthsUTC(baseYm, i);
    const approx = makeUTCDate(ym.y, ym.m, Math.min(15, monthEndDayUTC(ym.y, ym.m)));
    const ver = pickVersions(versions, approx);
    if (!ver) continue;
    const pay = paymentDateForMonth(ver, ym);
    const range = cycleRangeForPayment(ver, pay);
    const t = txDate.getTime();
    if (t >= range.start.getTime() && t <= range.end.getTime()) return { ym, paymentDate: pay, version: ver, range };
  }
  // backward fallback
  for (let i = 1; i <= 6; i++) {
    const ym = addMonthsUTC(baseYm, -i);
    const approx = makeUTCDate(ym.y, ym.m, Math.min(15, monthEndDayUTC(ym.y, ym.m)));
    const ver = pickVersions(versions, approx);
    if (!ver) continue;
    const pay = paymentDateForMonth(ver, ym);
    const range = cycleRangeForPayment(ver, pay);
    const t = txDate.getTime();
    if (t >= range.start.getTime() && t <= range.end.getTime()) return { ym, paymentDate: pay, version: ver, range };
  }
  return null;
}

export function buildAllocations(cards: Card[], cardVersions: CardVersion[], txs: Tx[]): Allocation[] {
  const allocations: Allocation[] = [];
  const cardMap = new Map(cards.map(c => [c.id, c]));
  for (const t of txs) {
    const card = cardMap.get(t.cardId);
    if (!card || card.type !== 'credit') continue;
    const dt = parseYMD(t.date);
    if (!dt) continue;
    const baseBill = findBillingPaymentForTx(cardVersions, t.cardId, dt);
    if (!baseBill) continue;

    const n = Math.max(1, Number(t.installments) || 1);
    const amount = Number(t.amount) || 0;
    const fTotal = feeTotal(amount, t.feeMode, t.feeRate);
    const principalParts = splitWon(amount, n);
    const feeParts = splitWon(fTotal, n);

    for (let i = 0; i < n; i++) {
      const billYm = addMonthsUTC(baseBill.ym, i);
      const payInfo = paymentInfoForYm(cardVersions, t.cardId, billYm);
      if (!payInfo) continue;
      allocations.push({
        cardId: t.cardId,
        paymentDate: ymd(payInfo.paymentDate),
        principalPart: principalParts[i],
        feePart: feeParts[i],
        txId: t.id,
      });
    }
  }
  return allocations;
}

export function nextPaymentDates(cardVersions: CardVersion[], cardId: string, horizon: number, fromDate: Date): Array<{ paymentDate: Date; version: CardVersion }> {
  const versions = versionsByCard(cardVersions, cardId);
  if (!versions.length) return [];
  const from = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate()));
  const ym0 = { y: from.getUTCFullYear(), m: from.getUTCMonth() + 1 };
  const out: Array<{ paymentDate: Date; version: CardVersion }> = [];
  for (let i = 0; out.length < horizon && i < 48; i++) {
    const ym = addMonthsUTC(ym0, i);
    const approx = makeUTCDate(ym.y, ym.m, Math.min(15, monthEndDayUTC(ym.y, ym.m)));
    const ver = pickVersions(versions, approx);
    if (!ver) continue;
    const pay = paymentDateForMonth(ver, ym);
    if (pay >= from) out.push({ paymentDate: pay, version: ver });
  }
  return out.slice(0, horizon);
}

export function forecastByCard(cards: Card[], cardVersions: CardVersion[], txs: Tx[], horizon: number, now: Date): Array<{
  cardId: string;
  cardName: string;
  paymentDate: string;
  cycleStart: string;
  cycleEnd: string;
  expected: number;
  expectedPrincipal: number;
  expectedFee: number;
}> {
  const allocations = buildAllocations(cards, cardVersions, txs);
  const credit = cards.filter(c => c.type === 'credit' && c.isActive);

  const out: Array<{
    cardId: string; cardName: string; paymentDate: string; cycleStart: string; cycleEnd: string;
    expected: number; expectedPrincipal: number; expectedFee: number;
  }> = [];

  for (const c of credit) {
    const ups = nextPaymentDates(cardVersions, c.id, horizon, now);
    for (const u of ups) {
      const pStr = ymd(u.paymentDate);
      const rel = allocations.filter(a => a.cardId === c.id && a.paymentDate === pStr);
      const principal = rel.reduce((s, a) => s + a.principalPart, 0);
      const fee = rel.reduce((s, a) => s + a.feePart, 0);
      const range = cycleRangeForPayment(u.version, u.paymentDate);
      out.push({
        cardId: c.id,
        cardName: c.name,
        paymentDate: pStr,
        cycleStart: ymd(range.start),
        cycleEnd: ymd(range.end),
        expected: principal + fee,
        expectedPrincipal: principal,
        expectedFee: fee,
      });
    }
  }

  out.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.cardName.localeCompare(b.cardName));
  return out;
}

function computeInstallmentStatsForCardAtPayment(
  cardId: string,
  paymentDate: string,
  allocations: Allocation[],
  txById: Map<string, Tx>
): InstallmentStats {
  // “활성 할부”만 집계:
  // - 해당 결제일이 그 할부의 [첫 결제일, 마지막 결제일] 범위 안에 있을 때만 포함
  const instAll = allocations.filter(a => a.cardId === cardId && (txById.get(a.txId)?.installments ?? 1) > 1);

  // group by txId
  const byTx = new Map<string, Allocation[]>();
  for (const a of instAll) {
    const arr = byTx.get(a.txId) ?? [];
    arr.push(a);
    byTx.set(a.txId, arr);
  }

  let total = 0;
  let paidToDate = 0;
  let paidBefore = 0;
  let thisPayment = 0;

  for (const [txId, arr] of byTx.entries()) {
    const dates = arr.map(x => x.paymentDate).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];

    if (paymentDate < first || paymentDate > last) {
      // 이미 끝났거나 아직 시작 전 할부 → 이 결제일 기준 집계에서 제외
      continue;
    }

    const totalTx = arr.reduce((s, x) => s + x.principalPart, 0);
    const paidToDateTx = arr.filter(x => x.paymentDate <= paymentDate).reduce((s, x) => s + x.principalPart, 0);
    const paidBeforeTx = arr.filter(x => x.paymentDate < paymentDate).reduce((s, x) => s + x.principalPart, 0);
    const thisPaymentTx = arr.filter(x => x.paymentDate === paymentDate).reduce((s, x) => s + x.principalPart, 0);

    total += totalTx;
    paidToDate += paidToDateTx;
    paidBefore += paidBeforeTx;
    thisPayment += thisPaymentTx;
  }

  const remainingAfter = total - paidToDate;
  const remainingBefore = total - paidBefore;

  return {
    installmentTotalPrincipal: total,
    installmentPaidToDate: paidToDate,
    installmentRemainingAfter: remainingAfter,
    installmentThisPayment: thisPayment,
    installmentRemainingBefore: remainingBefore,
  };
}

export function paymentEvents
(
  cards: Card[],
  cardVersions: CardVersion[],
  txs: Tx[],
  statements: Statement[],
  pastMonths: number,
  futureMonths: number
): PaymentEvent[] {
  const allocations = buildAllocations(cards, cardVersions, txs);
  const txById = new Map(txs.map(t => [t.id, t]));

  const creditCards = cards.filter(c => c.type === 'credit' && c.isActive);
  const now = new Date();
  const baseYm = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 };
  const out: PaymentEvent[] = [];

  for (const c of creditCards) {
    // create payment events by month window
    const seen = new Set<string>();
    for (let i = -pastMonths; i <= futureMonths; i++) {
      const ym = addMonthsUTC(baseYm, i);
      const info = paymentInfoForYm(cardVersions, c.id, ym);
      if (!info) continue;
      const pStr = ymd(info.paymentDate);
      const key = c.id + '|' + pStr;
      if (seen.has(key)) continue;
      seen.add(key);

      const range = cycleRangeForPayment(info.version, info.paymentDate);
      const rel = allocations.filter(a => a.cardId === c.id && a.paymentDate === pStr);
      const principal = rel.reduce((s, a) => s + a.principalPart, 0);
      const fee = rel.reduce((s, a) => s + a.feePart, 0);
      const expected = principal + fee;

      const stmt = statements.find(s => s.cardId === c.id && s.paymentDate === pStr) || null;
      const actual = stmt ? stmt.actual : null;
      const diff = actual === null ? null : (actual - expected);

      const installment = computeInstallmentStatsForCardAtPayment(c.id, pStr, allocations, txById);

      out.push({
        cardId: c.id,
        cardName: c.name,
        paymentDate: pStr,
        cycleStart: ymd(range.start),
        cycleEnd: ymd(range.end),
        expected,
        expectedPrincipal: principal,
        expectedFee: fee,
        actual,
        diff,
        installment,
      });
    }
  }

  out.sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.cardName.localeCompare(b.cardName));
  return out;
}

export function suggestedAdjustmentDateForPayment(cardVersions: CardVersion[], cardId: string, paymentDateStr: string): string | null {
  const payDt = parseYMD(paymentDateStr);
  if (!payDt) return null;
  const ym = { y: payDt.getUTCFullYear(), m: payDt.getUTCMonth() + 1 };
  const info = paymentInfoForYm(cardVersions, cardId, ym);
  if (!info) return null;
  const range = cycleRangeForPayment(info.version, info.paymentDate);
  return ymd(range.end);
}
