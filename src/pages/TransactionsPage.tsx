import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { Tx } from '../domain/models';
import { BulkEntryModal } from '../components/BulkEntryModal';
import { useIsMobile } from '../app/useMedia';

const fmt = new Intl.NumberFormat('ko-KR');
type FeeMode = 'free' | 'manual';

function iconForCategoryPath(path: string): string {
  const g = (path || '').split('/')[0];
  const map: Record<string, string> = {
    '수입': '💰', '식비': '🍽️', '마트': '🛒', '교통': '🚗', '주거': '🏠', '통신': '📱',
    '의료': '🏥', '보험': '🏦', '세금': '🧾', '교육': '📚', '여가': '🎮', '경조': '🎁',
    '미용': '💇', '여행': '✈️', '이체': '🔁', '쇼핑': '🛍️',
  };
  return map[g] ?? '📌';
}

export function TransactionsPage() {
  const app = useApp();
  const isMobile = useIsMobile(520);
  const [bulkOpen, setBulkOpen] = useState(false);

  const rows = useMemo(() => {
    return [...app.tx].sort((a, b) => b.date.localeCompare(a.date));
  }, [app.tx]);

  const [editing, setEditing] = useState<Record<string, any>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const checkedAll = rows.length > 0 && checked.size === rows.length;

  function toggle(id: string) {
    setChecked(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function startEdit(t: Tx) {
    setEditing(prev => ({
      ...prev,
      [t.id]: {
        date: t.date,
        cardId: t.cardId,
        category: t.category,
        amount: String(t.amount),
        installments: t.installments,
        feeMode: t.feeMode as FeeMode,
        feeRate: String(t.feeRate),
        memo: t.memo,
      }
    }));
  }
  function cancelEdit(id: string) {
    setEditing(prev => {
      const cp = { ...prev };
      delete cp[id];
      return cp;
    });
  }
  async function saveEdit(t: Tx) {
    const d = editing[t.id];
    if (!d) return;
    const a = Number(String(d.amount).replaceAll(',','').trim());
    if (!Number.isFinite(a) || a === 0) { alert('금액을 숫자로 넣어줘.'); return; }
    const inst = Math.max(1, Math.floor(Number(d.installments)));
    const rate = d.feeMode === 'manual' ? Number(String(d.feeRate).replace(',','.')) : 0;
    if (d.feeMode === 'manual' && (!Number.isFinite(rate) || rate < 0)) { alert('수수료율을 확인해줘.'); return; }

    await app.upsertTx({
      ...t,
      date: d.date || t.date,
      cardId: d.cardId,
      category: d.category,
      categoryId: app.categoryIdByPath[d.category] ?? undefined,
      amount: a,
      installments: inst,
      feeMode: d.feeMode,
      feeRate: d.feeMode === 'manual' ? rate : 0,
      memo: String(d.memo ?? '').trim(),
    });
    cancelEdit(t.id);
  }

  async function deleteChecked() {
    if (checked.size === 0) return;
    if (!confirm(`선택한 ${checked.size}건을 삭제할까?`)) return;
    for (const id of Array.from(checked.values())) {
      await app.deleteTx(id);
      cancelEdit(id);
    }
    setChecked(new Set());
  }

  return (
    <div className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>거래 전체 ({rows.length}건)</h2>
          <div className="row">
            <button className="btn primary" onClick={() => setBulkOpen(true)}>거래 추가</button>
            {checked.size > 0 && (
              <button className="btn danger" onClick={deleteChecked}>선택 삭제 ({checked.size})</button>
            )}
          </div>
        </div>

        <div className="divider" />

        {rows.length === 0 ? (
          <p className="muted">거래가 없어.</p>
        ) : isMobile ? (
          /* ── 모바일: 카드 리스트 ── */
          <div className="txcard-list">
            {rows.map(t => {
              const card = app.cards.find(c => c.id === t.cardId);
              const isEditing = !!editing[t.id];
              const d = editing[t.id];
              const isChecked = checked.has(t.id);
              return (
                <div key={t.id} className="txcard" style={{ opacity: isChecked ? 0.7 : 1 }}>
                  {/* 요약 줄 */}
                  <div className="txrow" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(t.id)}
                        style={{ marginTop: 3, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          <span className="catIcon" aria-hidden>{iconForCategoryPath(t.category)}</span>
                          {t.category}
                        </div>
                        <div className="muted small" style={{ marginTop: 3 }}>
                          {card?.name ?? '(삭제됨)'} · {t.date.slice(5)}
                          {t.memo ? ` · ${t.memo}` : ''}
                          {(t.installments ?? 1) > 1 ? ` · ${t.installments}개월` : ''}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div
                        className="mono"
                        style={{
                          fontSize: 17, fontWeight: 700,
                          color: t.amount < 0 ? 'var(--good)' : 'var(--text)',
                        }}
                      >
                        {t.amount < 0 ? '+' : ''}{fmt.format(Math.abs(t.amount))}원
                      </div>
                      {!isEditing && (
                        <button
                          className="btn"
                          style={{ marginTop: 6, fontSize: 12, padding: '6px 10px' }}
                          onClick={() => startEdit(t)}
                        >
                          편집
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 편집 폼 (펼침) */}
                  {isEditing && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="form" style={{ gridTemplateColumns: '1fr 1fr' }}>
                        <label>날짜
                          <input type="date" value={d.date} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], date: e.target.value } }))} />
                        </label>
                        <label>결제수단
                          <select value={d.cardId} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], cardId: e.target.value } }))}>
                            {app.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </label>
                        <label>카테고리
                          <select value={d.category} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], category: e.target.value } }))}>
                            {app.categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </label>
                        <label>금액
                          <input value={d.amount} inputMode="numeric" onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], amount: e.target.value } }))} />
                        </label>
                        <label>메모
                          <input value={d.memo ?? ''} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], memo: e.target.value } }))} />
                        </label>
                        <label>할부
                          <select value={d.installments} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], installments: Number(e.target.value) } }))}>
                            {[1,2,3,6,10,12,24].map(n => <option key={n} value={n}>{n === 1 ? '일시불' : `${n}개월`}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn primary" onClick={() => saveEdit(t)}>저장</button>
                        <button className="btn" onClick={() => cancelEdit(t.id)}>취소</button>
                        <button className="btn danger" onClick={async () => {
                          if (!confirm('삭제할까?')) return;
                          await app.deleteTx(t.id);
                          cancelEdit(t.id);
                        }}>삭제</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* ── 데스크탑: 테이블 ── */
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{width: 44}}>
                    <input type="checkbox" checked={checkedAll} onChange={() => {
                      if (checkedAll) setChecked(new Set());
                      else setChecked(new Set(rows.map(t => t.id)));
                    }} />
                  </th>
                  <th style={{width: 110}}>날짜</th>
                  <th style={{width: 180}}>결제수단</th>
                  <th style={{width: 200}}>카테고리</th>
                  <th>메모</th>
                  <th className="right" style={{width: 140}}>금액</th>
                  <th style={{width: 220}}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(t => {
                  const card = app.cards.find(c => c.id === t.cardId);
                  const isEditing = !!editing[t.id];
                  const d = editing[t.id];
                  return (
                    <tr key={t.id}>
                      <td><input type="checkbox" checked={checked.has(t.id)} onChange={() => toggle(t.id)} /></td>
                      <td className="mono">{t.date}</td>
                      <td>
                        {isEditing ? (
                          <select value={d.cardId} onChange={e => setEditing(p => ({...p, [t.id]: {...p[t.id], cardId: e.target.value }}))}>
                            {app.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        ) : (card?.name ?? '(삭제됨)')}
                      </td>
                      <td>
                        {isEditing ? (
                          <select value={d.category} onChange={e => setEditing(p => ({...p, [t.id]: {...p[t.id], category: e.target.value }}))}>
                            {app.categories.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : t.category}
                      </td>
                      <td className="muted">
                        {isEditing ? (
                          <input value={d.memo} onChange={e => setEditing(p => ({...p, [t.id]: {...p[t.id], memo: e.target.value }}))} />
                        ) : t.memo}
                      </td>
                      <td className="right mono">
                        {isEditing ? (
                          <input value={d.amount} onChange={e => setEditing(p => ({...p, [t.id]: {...p[t.id], amount: e.target.value }}))} inputMode="numeric" />
                        ) : (t.amount < 0 ? '-' : '') + fmt.format(Math.abs(t.amount)) + '원'}
                      </td>
                      <td className="right">
                        {isEditing ? (
                          <>
                            <button className="btn primary" onClick={() => saveEdit(t)}>저장</button>
                            <button className="btn" onClick={() => cancelEdit(t.id)}>취소</button>
                            <button className="btn danger" onClick={async () => { if (!confirm('삭제할까?')) return; await app.deleteTx(t.id); cancelEdit(t.id); }}>삭제</button>
                          </>
                        ) : (
                          <>
                            <button className="btn" onClick={() => startEdit(t)}>편집</button>
                            <button className="btn danger" onClick={async () => { if (!confirm('삭제할까?')) return; await app.deleteTx(t.id); }}>삭제</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BulkEntryModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </div>
  );
}
