import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { paymentEvents, suggestedAdjustmentDateForPayment } from '../domain/billingEngine';
import { Statement, Tx } from '../domain/models';

const fmt = new Intl.NumberFormat('ko-KR');

type AdjustReason = 'annual_fee' | 'interest_carry' | 'points' | 'fx_fee' | 'other';

function reasonToCategory(r: AdjustReason): string {
  if (r === 'annual_fee') return '수수료/연회비';
  if (r === 'interest_carry') return '이월/이자';
  if (r === 'points') return '포인트/차감';
  if (r === 'fx_fee') return '해외/수수료';
  return '조정/기타';
}

export function ReconcilePanel({ defaultPast = 1, defaultFuture = 2 }: { defaultPast?: number; defaultFuture?: number }) {
  const app = useApp();
  const [pastMonths, setPastMonths] = useState(defaultPast);
  const [futureMonths, setFutureMonths] = useState(defaultFuture);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const [stmtModal, setStmtModal] = useState<{ cardId: string; paymentDate: string } | null>(null);
  const [adjustModal, setAdjustModal] = useState<{ cardId: string; paymentDate: string; diff: number } | null>(null);

  const events = useMemo(
    () => paymentEvents(app.cards, app.cardVersions, app.tx, app.statements, pastMonths, futureMonths),
    [app.cards, app.cardVersions, app.tx, app.statements, pastMonths, futureMonths]
  );

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>카드 청구 대조</h2>

      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="muted small">과거</span>
          <select value={pastMonths} onChange={e => setPastMonths(Number(e.target.value))}>
            {[1,2,3,4,6,12].map(n => <option key={n} value={n}>{n}개월</option>)}
          </select>
        </label>

        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <span className="muted small">미래</span>
          <select value={futureMonths} onChange={e => setFutureMonths(Number(e.target.value))}>
            {[1,2,3,4,6].map(n => <option key={n} value={n}>{n}개월</option>)}
          </select>
        </label>
      </div>

      <div className="divider" />

      {events.length === 0 ? (
        <div className="muted">대조할 카드가 없거나 데이터가 없어.</div>
      ) : (
        <div className="grid">
          {events.map(e => {
            const key = `${e.cardId}_${e.paymentDate}`;
            const isOpen = expandedKeys.has(key);
            const actualTxt = e.actual === null ? '미입력' : fmt.format(e.actual) + '원';

            let diffPill: React.ReactNode = <span className="muted">—</span>;
            if (e.diff !== null) {
              const abs = Math.abs(e.diff);
              const cls = abs === 0 ? 'good' : (abs <= 3000 ? 'warn' : 'bad');
              const sign = e.diff >= 0 ? '+' : '−';
              diffPill = <span className={cls}>{sign}{fmt.format(abs)}원</span>;
            }

            const adjustDisabled = (e.diff === null || e.diff === 0);

            return (
              <div key={key} className="card">
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 800 }}>
                    {e.cardName} · {e.paymentDate} 결제
                  </div>
                  {diffPill}
                </div>

                <div className="muted small" style={{ marginTop: 6 }}>
                  예상 {fmt.format(e.expected)}원 · 실제 {actualTxt}
                </div>

                <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    className="btn"
                    onClick={() => setExpandedKeys(prev => {
                      const n = new Set(prev);
                      if (n.has(key)) n.delete(key); else n.add(key);
                      return n;
                    })}
                  >
                    {isOpen ? '접기' : '상세'}
                  </button>

                  <button className="btn primary" onClick={() => setStmtModal({ cardId: e.cardId, paymentDate: e.paymentDate })}>
                    실제 입력
                  </button>

                  <button className="btn ghost" disabled={adjustDisabled} onClick={() => setAdjustModal({ cardId: e.cardId, paymentDate: e.paymentDate, diff: e.diff ?? 0 })}>
                    차액 조정
                  </button>
                </div>

                {isOpen ? (
                  <div className="notice" style={{ marginTop: 10 }}>
                    <div className="muted small">청구기간</div>
                    <div className="mono">{e.cycleStart} ~ {e.cycleEnd}</div>
                    <div className="divider" />
                    <div className="muted small">예상 구성</div>
                    <div>원금 {fmt.format(e.expectedPrincipal)}원</div>
                    <div>수수료 {fmt.format(e.expectedFee)}원</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <StatementModal open={!!stmtModal} onClose={() => setStmtModal(null)} cardId={stmtModal?.cardId ?? ''} paymentDate={stmtModal?.paymentDate ?? ''} />
      <AdjustModal open={!!adjustModal} onClose={() => setAdjustModal(null)} cardId={adjustModal?.cardId ?? ''} paymentDate={adjustModal?.paymentDate ?? ''} diff={adjustModal?.diff ?? 0} />
    </div>
  );

  function StatementModal(props: { open: boolean; onClose: () => void; cardId: string; paymentDate: string }) {
    const { open, onClose, cardId, paymentDate } = props;
    const card = app.cards.find(c => c.id === cardId);
    const existing = app.statements.find(s => s.cardId === cardId && s.paymentDate === paymentDate) || null;
    const [actual, setActual] = useState(existing ? String(existing.actual) : '');
    const [memo, setMemo] = useState(existing ? existing.memo : '');

    React.useEffect(() => {
      if (!open) return;
      const ex = app.statements.find(s => s.cardId === cardId && s.paymentDate === paymentDate) || null;
      setActual(ex ? String(ex.actual) : '');
      setMemo(ex ? ex.memo : '');
    }, [open, cardId, paymentDate, app.statements]);

    async function save() {
      const a = Number(actual.replaceAll(',', '').trim());
      if (!Number.isFinite(a)) { alert('실제 청구액을 숫자로 넣어줘.'); return; }
      const st: Statement = {
        id: existing?.id ?? ('stmt_' + crypto.randomUUID()),
        cardId,
        paymentDate,
        actual: a,
        memo: memo.trim(),
        updatedAt: new Date().toISOString(),
      };
      await app.upsertStatement(st);
      onClose();
    }

    async function del() {
      if (!existing) return;
      if (!confirm('이 실제 청구액 기록을 삭제할까?')) return;
      await app.deleteStatement(existing.id);
      onClose();
    }

    if (!open) return null;
    return (
      <div className="modal active" onClick={e => (e.target as HTMLElement).classList.contains('modal') && onClose()}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3 style={{ margin: 0 }}>실제 청구액 입력</h3>
              <p className="muted" style={{ margin: 0 }}>{card?.name ?? '(카드)'} · {paymentDate}</p>
            </div>
            <div className="row"><button className="btn" onClick={onClose}>닫기</button></div>
          </div>

          <div className="form">
            <label>실제 청구액(원)
              <input value={actual} onChange={e => setActual(e.target.value)} inputMode="numeric" />
            </label>
            <label>메모(선택)
              <input value={memo} onChange={e => setMemo(e.target.value)} />
            </label>
          </div>

          <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
            <button className="btn danger" onClick={del} disabled={!existing}>삭제</button>
            <button className="btn primary" onClick={save}>저장</button>
          </div>
        </div>
      </div>
    );
  }

  function AdjustModal(props: { open: boolean; onClose: () => void; cardId: string; paymentDate: string; diff: number }) {
    const { open, onClose, cardId, paymentDate, diff } = props;
    const card = app.cards.find(c => c.id === cardId);
    const stmt = app.statements.find(s => s.cardId === cardId && s.paymentDate === paymentDate) || null;

    const [reason, setReason] = useState<AdjustReason>('annual_fee');
    const [category, setCategory] = useState(reasonToCategory('annual_fee'));
    const [memo, setMemo] = useState('');

    React.useEffect(() => {
      if (!open) return;
      setReason('annual_fee');
      setCategory(reasonToCategory('annual_fee'));
      setMemo(stmt?.memo ? `[명세 메모] ${stmt.memo}` : '');
    }, [open, stmt?.memo]);

    const suggestedDate = useMemo(
      () => suggestedAdjustmentDateForPayment(app.cardVersions, cardId, paymentDate),
      [app.cardVersions, cardId, paymentDate]
    );

    async function addAdjust() {
      if (!stmt) { alert('먼저 실제 청구액을 입력해야 해.'); return; }
      if (!suggestedDate) { alert('조정 날짜 계산 실패. 카드 규칙을 확인해줘.'); return; }

      if (!confirm(`차액 ${diff >= 0 ? '+' : ''}${fmt.format(diff)}원을 “${category}”로 조정거래 추가할까?\n날짜: ${suggestedDate}`)) return;

      const tx: Tx = {
        id: 'tx_' + crypto.randomUUID(),
        date: suggestedDate,
        cardId,
        category,
        amount: diff,
        installments: 1,
        feeMode: 'free',
        feeRate: 0,
        memo: memo.trim(),
        tags: [], // ✅ 필수
      };

      await app.upsertTx(tx);
      onClose();
    }

    if (!open) return null;
    return (
      <div className="modal active" onClick={e => (e.target as HTMLElement).classList.contains('modal') && onClose()}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <h3 style={{ margin: 0 }}>차액 조정(사유 선택)</h3>
              <p className="muted" style={{ margin: 0 }}>{card?.name ?? '(카드)'} · {paymentDate}</p>
            </div>
            <div className="row"><button className="btn" onClick={onClose}>닫기</button></div>
          </div>

          <div className="form">
            <label>차액(Actual-Expected)
              <input value={(diff >= 0 ? '+' : '') + fmt.format(diff) + '원'} disabled />
            </label>
            <label>조정 거래 날짜(권장)
              <input value={suggestedDate ?? ''} disabled />
            </label>

            <label>사유
              <select value={reason} onChange={e => {
                const r = e.target.value as AdjustReason;
                setReason(r);
                setCategory(reasonToCategory(r));
              }}>
                <option value="annual_fee">연회비/카드수수료</option>
                <option value="interest_carry">이월/리볼빙/이자</option>
                <option value="points">포인트 차감/할인</option>
                <option value="fx_fee">해외 결제 수수료</option>
                <option value="other">기타</option>
              </select>
            </label>

            <label>카테고리(자동 선택)
              <select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="수수료/연회비">수수료/연회비</option>
                <option value="이월/이자">이월/이자</option>
                <option value="포인트/차감">포인트/차감</option>
                <option value="해외/수수료">해외/수수료</option>
                <option value="조정/기타">조정/기타</option>
              </select>
            </label>

            <label>메모(선택)
              <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="예: 연회비 1회 부과, 포인트 차감 등" />
            </label>

            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" onClick={addAdjust}>조정거래 추가</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}