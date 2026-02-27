import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { useIsMobile } from '../app/useMedia';
import { Loan, Tx } from '../domain/models';
import { makeUTCDate, monthEndDayUTC, parseYMD, ymd } from '../domain/date';
import { buildAllocations, paymentEvents, Allocation, PaymentEvent } from '../domain/billingEngine';
import { ReconcilePanel } from '../components/ReconcilePanel';

const fmt = new Intl.NumberFormat('ko-KR');

function daysInMonth(y: number, m: number) { return monthEndDayUTC(y, m); }

function paymentDateForLoan(loan: Loan, y: number, m: number): string {
  const d = loan.paymentDay === 'EOM' ? daysInMonth(y, m) : Number(loan.paymentDay);
  const dd = Math.min(d, daysInMonth(y, m));
  return ymd(makeUTCDate(y, m, dd));
}

function addYm(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  let mm = m + delta;
  let yy = y;
  while (mm <= 0) { mm += 12; yy -= 1; }
  while (mm >= 13) { mm -= 12; yy += 1; }
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

function ymFromYmd(s: string) { return s.slice(0, 7); }

function buildSchedule(loan: Loan): Array<{
  n: number;
  date: string;
  principalPay: number;
  interestPay: number;
  totalPay: number;
  remaining: number;
}> {
  const start = parseYMD(loan.startDate);
  if (!start) return [];
  // start at startDate month
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  const n = loan.termMonths;
  const rateM = (loan.annualRate / 100) / 12;

  const rows: any[] = [];
  let remaining = loan.principal;

  // annuity monthly payment
  let annuityPay = 0;
  if (loan.method === 'annuity') {
    const r = rateM;
    const pow = Math.pow(1 + r, n);
    annuityPay = remaining * (r * pow) / (pow - 1);
  }

  for (let i = 1; i <= n; i++) {
    const date = paymentDateForLoan(loan, y, m);
    const interestPay = Math.round(remaining * rateM);
    let principalPay = 0;
    if (loan.method === 'equal_principal') {
      principalPay = Math.round(loan.principal / n);
      if (i === n) principalPay = remaining; // last pay clamps
    } else {
      const totalPay = Math.round(annuityPay);
      principalPay = Math.max(0, totalPay - interestPay);
      if (i === n) principalPay = remaining;
    }
    const totalPay = principalPay + interestPay;
    remaining = Math.max(0, remaining - principalPay);

    rows.push({ n: i, date, principalPay, interestPay, totalPay, remaining });

    // next month
    m += 1;
    if (m === 13) { m = 1; y += 1; }
  }
  return rows;
}

function sumMonth(schedule: ReturnType<typeof buildSchedule>, ym: string) {
  const rows = schedule.filter(r => r.date.startsWith(ym));
  const principal = rows.reduce((s, r) => s + r.principalPay, 0);
  const interest = rows.reduce((s, r) => s + r.interestPay, 0);
  return { principal, interest, total: principal + interest, rows };
}

function groupAllocationsForEvent(
  allocations: Allocation[],
  txById: Map<string, Tx>,
  evt: PaymentEvent
) {
  const list = allocations
    .filter(a => a.cardId === evt.cardId && a.paymentDate === evt.paymentDate)
    .reduce((m, a) => {
      const cur = m.get(a.txId) ?? { principal: 0, fee: 0 };
      cur.principal += a.principalPart;
      cur.fee += a.feePart;
      m.set(a.txId, cur);
      return m;
    }, new Map<string, { principal: number; fee: number }>());
  const items = Array.from(list.entries()).map(([txId, parts]) => {
    const tx = txById.get(txId);
    return { txId, tx, principal: parts.principal, fee: parts.fee, total: parts.principal + parts.fee };
  });
  // newest cause first (tx date desc)
  items.sort((a, b) => ((b.tx?.date ?? '').localeCompare(a.tx?.date ?? '')));
  return items;
}

function buildInstallmentIndexMap(allocations: Allocation[], cardId: string) {
  const m = new Map<string, string[]>();
  for (const a of allocations) {
    if (a.cardId !== cardId) continue;
    const arr = m.get(a.txId) ?? [];
    arr.push(a.paymentDate);
    m.set(a.txId, arr);
  }
  for (const [k, arr] of m.entries()) {
    arr.sort();
    m.set(k, Array.from(new Set(arr)));
  }
  return m;
}

export function LoansPage() {
  const app = useApp();
  const isMobile = useIsMobile();

  const loans = app.loans ?? [];
  const [loanOpen, setLoanOpen] = useState(true);
  const [cardOpen, setCardOpen] = useState(true);

  const [modal, setModal] = useState<{ id: string | null } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(loans[0]?.id ?? null);

  React.useEffect(() => {
    if (loans.length && !selectedId) setSelectedId(loans[0].id);
  }, [loans.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = selectedId ? loans.find(l => l.id === selectedId) ?? null : null;
  const schedule = useMemo(() => (selected ? buildSchedule(selected) : []), [selected]);

  const now = new Date();
  const nowYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const [loanYm, setLoanYm] = useState(nowYm);

  const monthPay = useMemo(() => sumMonth(schedule, loanYm), [schedule, loanYm]);

  // ---- Card statement (mobile: one-month view) ----
  const cards = app.cards ?? [];
  const creditCards = useMemo(() => cards.filter(c => c.type === 'credit' && c.isActive), [cards]);
  const [cardId, setCardId] = useState<string | null>(creditCards[0]?.id ?? null);

  React.useEffect(() => {
    if (creditCards.length && !cardId) setCardId(creditCards[0].id);
  }, [creditCards.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const eventsAll = useMemo(() => paymentEvents(
    cards,
    app.cardVersions ?? [],
    app.tx ?? [],
    app.statements ?? [],
    1,
    3
  ), [cards, app.cardVersions, app.tx, app.statements]);

  const eventsForCard = useMemo(() => {
    if (!cardId) return [];
    return eventsAll.filter(e => e.cardId === cardId).sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  }, [eventsAll, cardId]);

  const [evtIdx, setEvtIdx] = useState(0);
  React.useEffect(() => {
    // choose first upcoming if possible
    const today = ymd(makeUTCDate(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate()));
    const i = eventsForCard.findIndex(e => e.paymentDate >= today);
    setEvtIdx(Math.max(0, i >= 0 ? i : 0));
  }, [cardId, eventsForCard.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const evt = eventsForCard[evtIdx] ?? null;

  const allocations = useMemo(() => buildAllocations(cards, app.cardVersions ?? [], app.tx ?? []), [cards, app.cardVersions, app.tx]);
  const txById = useMemo(() => new Map<string, Tx>((app.tx ?? []).map(t => [t.id, t])), [app.tx]);
  const instIdxMap = useMemo(() => (cardId ? buildInstallmentIndexMap(allocations, cardId) : new Map()), [allocations, cardId]);

  const stmtItems = useMemo(() => {
    if (!evt) return [];
    return groupAllocationsForEvent(allocations, txById, evt);
  }, [allocations, txById, evt?.cardId, evt?.paymentDate]);

  const canEvtPrev = evtIdx > 0;
  const canEvtNext = evtIdx < Math.max(0, eventsForCard.length - 1);

  const [showStmtDetail, setShowStmtDetail] = useState(false);

  if (!isMobile) {
    // Desktop: keep classic two-col layout (stable)
    return (
      <div className="container">
        <div className="two-col">
          <ReconcilePanel defaultPast={1} defaultFuture={2} />
          <LoanPanelDesktop />
        </div>

        <LoanModal open={modal !== null} onClose={() => setModal(null)} existing={modal?.id ? (loans.find(l => l.id === modal.id) ?? null) : null} />
      </div>
    );
  }

  // Mobile: finance-style, one-column
  return (
    <div className="container">
      <div className="card" style={{ boxShadow: 'none' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0 }}>대출/카드 현황</h2>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost" onClick={() => setLoanOpen((v: boolean) => !v)}>{loanOpen ? '대출 접기' : '대출 펼치기'}</button>
            <button className="btn ghost" onClick={() => setCardOpen((v: boolean) => !v)}>{cardOpen ? '카드 접기' : '카드 펼치기'}</button>
          </div>
        </div>

        <div className="divider" />

        {/* Loans */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="pill" style={{ whiteSpace: 'nowrap' }}>대출</span>
            <select value={selectedId ?? ''} onChange={e => setSelectedId(e.target.value)} disabled={loans.length === 0}>
              {loans.length === 0 ? <option value="">(없음)</option> : null}
              {loans.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <button className="btn primary" onClick={() => setModal({ id: selectedId })} disabled={!selectedId && loans.length === 0}>편집</button>
        </div>

        {loanOpen ? (
          <>
            <div className="divider" />

            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="muted small">상환 월</div>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <button className="btn" onClick={() => setLoanYm(addYm(loanYm, -1))}>◀</button>
                <div className="mono" style={{ minWidth: 92, textAlign: 'center', fontWeight: 800 }}>{loanYm}</div>
                <button className="btn" onClick={() => setLoanYm(addYm(loanYm, 1))}>▶</button>
              </div>
            </div>

            {selected ? (
              <>
                <div className="divider" />
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="notice">
                    <div className="muted small">{loanYm} 상환(합계)</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 800 }}>{fmt.format(monthPay.total)}원</div>
                    <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                      <div className="muted small">원금</div>
                      <div className="mono">{fmt.format(monthPay.principal)}원</div>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="muted small">이자</div>
                      <div className="mono">{fmt.format(monthPay.interest)}원</div>
                    </div>
                  </div>
                  <div className="notice">
                    <div className="muted small">대출 요약</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 800 }}>{fmt.format(selected.principal)}원</div>
                    <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                      <div className="muted small">금리</div>
                      <div className="mono">{selected.annualRate}%</div>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="muted small">기간</div>
                      <div className="mono">{selected.termMonths}개월</div>
                    </div>
                  </div>
                </div>

                <div className="divider" />

                <button className="btn ghost" onClick={() => setShowStmtDetail(false)} style={{ display: 'none' }}>noop</button>

                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>회차</th>
                        <th>상환일</th>
                        <th className="right">합계</th>
                        <th className="right">잔액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthPay.rows.length === 0 ? (
                        <tr><td colSpan={4} className="muted">이 달 상환 없음</td></tr>
                      ) : (
                        monthPay.rows.map(r => (
                          <tr key={r.n}>
                            <td>
                              <span className="installment-badge mono">
                                <span style={{ fontWeight: 800 }}>{r.n}</span>
                                <span className="muted"> / {selected!.termMonths}</span>
                              </span>
                            </td>
                            <td className="mono">{r.date}</td>
                            <td className="right mono">{fmt.format(r.totalPay)}원</td>
                            <td className="right mono">{fmt.format(r.remaining)}원</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>대출을 먼저 등록해줘.</p>
            )}
          </>
        ) : null}

        {/* Card statement */}
        <div className="divider" />

        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="pill" style={{ whiteSpace: 'nowrap' }}>카드 명세서</span>
            <select value={cardId ?? ''} onChange={e => { setCardId(e.target.value); setShowStmtDetail(false); }}>
              {creditCards.length === 0 ? <option value="">(없음)</option> : null}
              {creditCards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn ghost" onClick={() => setCardOpen((v: boolean) => !v)}>{cardOpen ? '접기' : '펼치기'}</button>
        </div>

        {cardOpen ? (
          <>
            <div className="divider" />

            {evt ? (
              <>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="muted small">조회 월</div>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <button className="btn" onClick={() => setEvtIdx((i: number) => Math.max(0, i - 1))} disabled={evtIdx <= 0}>◀</button>
                    <div className="mono" style={{ minWidth: 92, textAlign: 'center', fontWeight: 800 }}>{ymFromYmd(evt.paymentDate)}</div>
                    <button className="btn" onClick={() => setEvtIdx((i: number) => Math.min(eventsForCard.length - 1, i + 1))} disabled={evtIdx >= Math.max(0, eventsForCard.length - 1)}>▶</button>
                  </div>
                </div>

                <div className="divider" />

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="notice">
                    <div className="muted small">총 청구액(예상)</div>
                    <div className="mono" style={{ fontSize: 18, fontWeight: 800 }}>{fmt.format(evt.expected)}원</div>
                    <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                      <div className="muted small">수수료</div>
                      <div className="mono">{fmt.format(evt.expectedFee)}원</div>
                    </div>
                  </div>
                  <div className="notice">
                    <div className="muted small">일시불 / 할부</div>
                    <div className="row" style={{ justifyContent: 'space-between', marginTop: 2 }}>
                      <div className="muted small">일시불</div>
                      <div className="mono">
                        {fmt.format(Math.max(0, evt.expectedPrincipal - evt.installment.installmentThisPayment))}원
                      </div>
                    </div>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div className="muted small">할부</div>
                      <div className="mono">{fmt.format(evt.installment.installmentThisPayment)}원</div>
                    </div>
                  </div>
                </div>

                <div className="divider" />

                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="muted small">상세 내역</div>
                  <button className="btn ghost" onClick={() => setShowStmtDetail((v: boolean) => !v)}>
                    {showStmtDetail ? '접기' : '보기'}
                  </button>
                </div>

                {showStmtDetail ? (
                  <>
                    <div className="divider" />
                    {stmtItems.length === 0 ? (
                      <p className="muted">이 달에 배정된 거래가 없어.</p>
                    ) : (
                      <div className="txcard-list">
                        {stmtItems.map(it => {
                          const tx = it.tx;
                          const isInst = (tx?.installments ?? 1) > 1;
                          let instLabel = '일시불';
                          if (tx) {
                            if (isInst) {
                              const arr = instIdxMap.get(tx.id) ?? [];
                              const idx = Math.max(0, arr.findIndex((d: string) => d === evt.paymentDate));
                              instLabel = `할부${tx.installments}개월(${idx + 1}회차)`;
                            }
                          }
                          return (
                            <div key={it.txId} className="txcard">
                              <div className="txrow" style={{ justifyContent: 'space-between' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                                    <span className="pill">{instLabel}</span>
                                    <span className="mono muted small">{tx?.date ?? ''}</span>
                                  </div>
                                  <div style={{ marginTop: 6, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {tx?.memo || tx?.category || it.txId}
                                  </div>
                                  <div className="muted small" style={{ marginTop: 2 }}>{tx?.category ?? ''}</div>
                                </div>
                                <div className="right" style={{ minWidth: 120 }}>
                                  <div className="mono" style={{ fontWeight: 800 }}>{fmt.format(it.total)}원</div>
                                  <div className="muted small mono">원금 {fmt.format(it.principal)}원</div>
                                  {it.fee ? <div className="muted small mono">수수료 {fmt.format(it.fee)}원</div> : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : null}
              </>
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>표시할 명세서가 없어. (신용카드/규칙/거래를 확인해줘)</p>
            )}
          </>
        ) : null}

      </div>

      <LoanModal
        open={modal !== null}
        onClose={() => setModal(null)}
        existing={modal?.id ? (loans.find(l => l.id === modal.id) ?? null) : null}
      />
    </div>
  );

  function LoanPanelDesktop() {
    const summary = useMemo(() => {
      const totalInterest = schedule.reduce((s, r) => s + r.interestPay, 0);
      const totalPay = schedule.reduce((s, r) => s + r.totalPay, 0);
      return { totalInterest, totalPay };
    }, [schedule]);

    return (
      <div className="card" style={{ boxShadow: 'none' }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>대출</h2>
          <button className="btn primary" onClick={() => setModal({ id: null })}>대출 추가</button>
        </div>

        <div className="divider" />

        {loans.length === 0 ? (
          <p className="muted">대출이 없어.</p>
        ) : (
          <>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row">
                <div className="muted small">선택</div>
                <select value={selectedId ?? ''} onChange={e => setSelectedId(e.target.value)}>
                  {loans.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="row">
                <button className="btn" onClick={() => setModal({ id: selectedId })} disabled={!selectedId}>편집</button>
                <button className="btn danger" onClick={async () => {
                  if (!selected) return;
                  if (!confirm('이 대출을 삭제할까?')) return;
                  await app.deleteLoan(selected.id);
                  setSelectedId(null);
                }} disabled={!selectedId}>삭제</button>
              </div>
            </div>

            {selected ? (
              <>
                <div className="divider" />

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="notice">
                    <div className="muted small">원금</div>
                    <div className="mono" style={{ fontSize: 20 }}>{fmt.format(selected.principal)}원</div>
                    <div className="muted small" style={{ marginTop: 8 }}>금리</div>
                    <div className="mono">{selected.annualRate}%</div>
                  </div>
                  <div className="notice">
                    <div className="muted small">기간</div>
                    <div className="mono" style={{ fontSize: 20 }}>{selected.termMonths}개월</div>
                    <div className="muted small" style={{ marginTop: 8 }}>방식</div>
                    <div>{selected.method === 'equal_principal' ? '원금균등' : '원리금균등'}</div>
                  </div>
                </div>

                <div className="divider" />

                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <div className="muted small">총 이자</div>
                    <div className="mono" style={{ fontSize: 18 }}>{fmt.format(summary.totalInterest)}원</div>
                  </div>
                  <div className="right">
                    <div className="muted small">총 상환액</div>
                    <div className="mono" style={{ fontSize: 18 }}>{fmt.format(summary.totalPay)}원</div>
                  </div>
                </div>

                <div className="divider" />

                <h2 style={{ marginTop: 0 }}>상환 스케줄(전체 {schedule.length}회차)</h2>
                {schedule.length === 0 ? (
                  <p className="muted">없음</p>
                ) : (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>회차</th>
                          <th>상환일</th>
                          <th className="right">원금</th>
                          <th className="right">이자</th>
                          <th className="right">합계</th>
                          <th className="right">잔액</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.map(r => (
                          <tr key={r.n}>
                            <td>
                              <span className="installment-badge mono">
                                <span style={{ fontWeight: 800 }}>{r.n}</span>
                                <span className="muted"> / {selected!.termMonths}</span>
                              </span>
                            </td>
                            <td className="mono">{r.date}</td>
                            <td className="right mono">{fmt.format(r.principalPay)}원</td>
                            <td className="right mono">{fmt.format(r.interestPay)}원</td>
                            <td className="right mono">{fmt.format(r.totalPay)}원</td>
                            <td className="right mono">{fmt.format(r.remaining)}원</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    );
  }

  function LoanModal({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: Loan | null }) {
    const [mode, setMode] = useState<'edit' | 'new'>(existing ? 'edit' : 'new');

    const [name, setName] = useState(existing?.name ?? '대출');
    const [principal, setPrincipal] = useState(String(existing?.principal ?? 9000000));
    const [annualRate, setAnnualRate] = useState(String(existing?.annualRate ?? 4.78));
    const [termMonths, setTermMonths] = useState(String(existing?.termMonths ?? 24));
    const [startDate, setStartDate] = useState(existing?.startDate ?? new Date().toISOString().slice(0,10));
    const [paymentDay, setPaymentDay] = useState<string>(existing?.paymentDay === 'EOM' ? 'EOM' : String(existing?.paymentDay ?? 25));
    const [method, setMethod] = useState<Loan['method']>(existing?.method ?? 'equal_principal');
    const [memo, setMemo] = useState(existing?.memo ?? '');

    React.useEffect(() => {
      if (!open) return;
      setMode(existing ? 'edit' : 'new');
      setName(existing?.name ?? '대출');
      setPrincipal(String(existing?.principal ?? 9000000));
      setAnnualRate(String(existing?.annualRate ?? 4.78));
      setTermMonths(String(existing?.termMonths ?? 24));
      setStartDate(existing?.startDate ?? new Date().toISOString().slice(0,10));
      setPaymentDay(existing?.paymentDay === 'EOM' ? 'EOM' : String(existing?.paymentDay ?? 25));
      setMethod(existing?.method ?? 'equal_principal');
      setMemo(existing?.memo ?? '');
    }, [open, existing]);

    function toNew() {
      setMode('new');
      setName('대출');
      setPrincipal('9000000');
      setAnnualRate('4.78');
      setTermMonths('24');
      setStartDate(new Date().toISOString().slice(0,10));
      setPaymentDay('25');
      setMethod('equal_principal');
      setMemo('');
    }

    async function save() {
      const p = Number(String(principal).replaceAll(',','').trim());
      const r = Number(String(annualRate).replace(',','.'));
      const n = Number(String(termMonths).replaceAll(',','').trim());
      if (!name.trim()) { alert('이름을 입력해줘.'); return; }
      if (!Number.isFinite(p) || p <= 0) { alert('원금을 올바르게 입력해줘.'); return; }
      if (!Number.isFinite(r) || r < 0) { alert('금리를 올바르게 입력해줘.'); return; }
      if (!Number.isFinite(n) || n <= 0) { alert('기간(개월)을 올바르게 입력해줘.'); return; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) { alert('시작일 형식이 이상해.'); return; }
      const payDay = paymentDay === 'EOM' ? 'EOM' : Number(paymentDay);
      if (payDay !== 'EOM' && (!Number.isFinite(payDay) || payDay < 1 || payDay > 31)) { alert('상환일을 확인해줘.'); return; }

      const l: Loan = {
        id: (mode === 'edit' && existing) ? existing.id : ('loan_' + crypto.randomUUID()),
        name: name.trim(),
        principal: p,
        annualRate: r,
        termMonths: Math.floor(n),
        startDate,
        paymentDay: payDay,
        weekendAdjust: existing?.weekendAdjust ?? 'prev_business',
        method,
        memo: memo.trim(),
      };

      await app.upsertLoan(l);
      setSelectedId(l.id);
      onClose();
    }

    async function del() {
      if (!existing || mode !== 'edit') return;
      if (!confirm('이 대출을 삭제할까?')) return;
      await app.deleteLoan(existing.id);
      setSelectedId(null);
      onClose();
    }

    if (!open) return null;
    return (
      <div className={'modal' + (open ? ' active' : '')} onClick={e => (e.target as HTMLElement).classList.contains('modal') && onClose()}>
        <div className="panel xl">
          <div className="panel-head">
            <div>
              <h3 style={{ margin: 0 }}>{mode === 'edit' ? '대출 편집' : '대출 신규'}</h3>
              <p style={{ margin: 0 }} className="muted">저장하면 대출/스케줄이 갱신돼.</p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn" onClick={toNew}>신규</button>
              <button className="btn" onClick={onClose}>닫기</button>
            </div>
          </div>

          <div className="form">
            <label>이름
              <input value={name} onChange={e => setName(e.target.value)} />
            </label>

            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label>원금(원)
                <input value={principal} onChange={e => setPrincipal(e.target.value)} inputMode="numeric" />
              </label>
              <label>연 이율(%)
                <input value={annualRate} onChange={e => setAnnualRate(e.target.value)} inputMode="decimal" />
              </label>
              <label>기간(개월)
                <input value={termMonths} onChange={e => setTermMonths(e.target.value)} inputMode="numeric" />
              </label>
              <label>시작일
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </label>
              <label>상환일
                <select value={paymentDay} onChange={e => setPaymentDay(e.target.value)}>
                  <option value="EOM">말일</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={String(d)}>{d}일</option>)}
                </select>
              </label>
              <label>방식
                <select value={method} onChange={e => setMethod(e.target.value as Loan['method'])}>
                  <option value="equal_principal">원금균등</option>
                  <option value="annuity">원리금균등</option>
                </select>
              </label>
            </div>

            <label>메모(선택)
              <textarea value={memo} onChange={e => setMemo(e.target.value)} />
            </label>
          </div>

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn danger" onClick={del} disabled={!existing || mode !== 'edit'}>삭제</button>
            <button className="btn primary" onClick={save}>저장</button>
          </div>
        </div>
      </div>
    );
  }
}
