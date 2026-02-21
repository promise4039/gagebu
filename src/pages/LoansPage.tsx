import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { Loan } from '../domain/models';
import { makeUTCDate, monthEndDayUTC, parseYMD, ymd } from '../domain/date';
import { ReconcilePanel } from '../components/ReconcilePanel';

const fmt = new Intl.NumberFormat('ko-KR');

function daysInMonth(y: number, m: number) { return monthEndDayUTC(y, m); }

function paymentDateForLoan(loan: Loan, y: number, m: number): string {
  const d = loan.paymentDay === 'EOM' ? daysInMonth(y, m) : Number(loan.paymentDay);
  const dd = Math.min(d, daysInMonth(y, m));
  return ymd(makeUTCDate(y, m, dd));
}

function buildSchedule(loan: Loan): Array<{
  n: number;
  date: string;
  principalPay: number;
  interestPay: number;
  totalPay: number;
  remaining: number;
}> {
  const start = parseYMD(loan.startDate) ?? new Date();
  const rMonthly = (loan.annualRate / 100) / 12;
  const N = Math.max(1, Math.floor(loan.termMonths));
  let remaining = loan.principal;
  const out: any[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;

  let annuityPay = 0;
  if (loan.method === 'annuity') {
    const pow = Math.pow(1 + rMonthly, N);
    annuityPay = rMonthly === 0 ? (loan.principal / N) : (loan.principal * rMonthly * pow) / (pow - 1);
  }

  for (let i = 1; i <= N; i++) {
    const payDate = paymentDateForLoan(loan, y, m);
    const interest = Math.round(remaining * rMonthly);

    let principalPay = 0;
    let total = 0;

    if (loan.method === 'equal_principal') {
      principalPay = Math.round(loan.principal / N);
      if (i === N) principalPay = remaining;
      total = principalPay + interest;
    } else {
      total = Math.round(annuityPay);
      principalPay = Math.min(remaining, Math.max(0, total - interest));
      if (i === N) {
        principalPay = remaining;
        total = principalPay + interest;
      }
    }

    remaining = Math.max(0, remaining - principalPay);
    out.push({ n: i, date: payDate, principalPay, interestPay: interest, totalPay: total, remaining });

    const dt = new Date(Date.UTC(y, m - 1, 1));
    dt.setUTCMonth(dt.getUTCMonth() + 1);
    y = dt.getUTCFullYear();
    m = dt.getUTCMonth() + 1;
  }

  return out;
}

export function LoansPage() {
  const app = useApp();
  const loans = app.loans ?? [];
  const [modal, setModal] = useState<{ id: string | null } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(loans[0]?.id ?? null);

  React.useEffect(() => {
    if (loans.length && !selectedId) setSelectedId(loans[0].id);
  }, [loans.length]);

  const selected = selectedId ? loans.find(l => l.id === selectedId) ?? null : null;
  const schedule = useMemo(() => (selected ? buildSchedule(selected) : []), [selected]);
  const summary = useMemo(() => {
    const totalInterest = schedule.reduce((s, r) => s + r.interestPay, 0);
    const totalPay = schedule.reduce((s, r) => s + r.totalPay, 0);
    return { totalInterest, totalPay };
  }, [schedule]);

  return (
    <div className="container">
      <div className="two-col">
        <ReconcilePanel defaultPast={1} defaultFuture={2} />

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
                              <td className="mono">{r.n}</td>
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
      </div>

      <LoanModal open={modal !== null} onClose={() => setModal(null)} existing={modal?.id ? (loans.find(l => l.id === modal.id) ?? null) : null} />
    </div>
  );

  function LoanModal({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: Loan | null }) {
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
      setName(existing?.name ?? '대출');
      setPrincipal(String(existing?.principal ?? 9000000));
      setAnnualRate(String(existing?.annualRate ?? 4.78));
      setTermMonths(String(existing?.termMonths ?? 24));
      setStartDate(existing?.startDate ?? new Date().toISOString().slice(0,10));
      setPaymentDay(existing?.paymentDay === 'EOM' ? 'EOM' : String(existing?.paymentDay ?? 25));
      setMethod(existing?.method ?? 'equal_principal');
      setMemo(existing?.memo ?? '');
    }, [open, existing]);

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
        id: existing?.id ?? ('loan_' + crypto.randomUUID()),
        name: name.trim(),
        principal: p,
        annualRate: r,
        termMonths: Math.floor(n),
        startDate,
        paymentDay: payDay,
        weekendAdjust: 'prev_business',
        method,
        memo: memo.trim(),
      };
      await app.upsertLoan(l);
      setSelectedId(l.id);
      onClose();
    }

    return (
      <div className={'modal' + (open ? ' active' : '')} onClick={e => (e.target as HTMLElement).classList.contains('modal') && onClose()}>
        <div className="panel">
          <div className="panel-head">
            <div><h3>{existing ? '대출 편집' : '대출 추가'}</h3><p>저장하면 오른쪽에서 스케줄이 자동 계산돼.</p></div>
            <div className="row"><button className="btn" onClick={onClose}>닫기</button></div>
          </div>

          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="form">
              <label>이름 <input value={name} onChange={e => setName(e.target.value)} /></label>
              <label>원금(원) <input value={principal} onChange={e => setPrincipal(e.target.value)} inputMode="numeric" /></label>
              <label>연 금리(%) <input value={annualRate} onChange={e => setAnnualRate(e.target.value)} inputMode="decimal" /></label>
              <label>기간(개월) <input value={termMonths} onChange={e => setTermMonths(e.target.value)} inputMode="numeric" /></label>
              <label>시작일 <input value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
              <label>상환일(매달)
                <select value={paymentDay} onChange={e => setPaymentDay(e.target.value)}>
                  <option value="EOM">말일</option>
                  {Array.from({ length: 31 }).map((_, i) => <option key={i+1} value={String(i+1)}>{i+1}일</option>)}
                </select>
              </label>
              <label>상환방식
                <select value={method} onChange={e => setMethod(e.target.value as any)}>
                  <option value="equal_principal">원금균등</option>
                  <option value="annuity">원리금균등</option>
                </select>
              </label>
              <div />
            </div>
            <label style={{ marginTop: 10 }}>메모(선택)
              <textarea value={memo} onChange={e => setMemo(e.target.value)} />
            </label>
            <div className="divider" />
            <button className="btn primary" onClick={save}>저장</button>
          </div>
        </div>
      </div>
    );
  }
}
