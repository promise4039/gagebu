import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { Tx } from '../domain/models';
import { addMonthsUTC, parseYMD } from '../domain/date';
import { BulkEntryModal } from './BulkEntryModal';

const fmt = new Intl.NumberFormat('ko-KR');
type FeeMode = 'free' | 'manual';

function toNum(s: string): number {
  return Number(String(s).replaceAll(',', '').trim());
}

export function TransactionsManagerModal({
  open,
  onClose,
  defaultYm,
}: {
  open: boolean;
  onClose: () => void;
  defaultYm: { y: number; m: number };
}) {
  const app = useApp();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [ym, setYm] = useState(defaultYm);
  const [showAll, setShowAll] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setYm(defaultYm);
    setShowAll(false);
  }, [open, defaultYm.y, defaultYm.m]);

  const rows = useMemo(() => {
    const arr = [...app.tx].filter(t => {
      if (t.category.startsWith('이체/비지출')) return false;
      const card = app.cards.find(c => c.id === t.cardId);
      if (card?.type === 'transfer_nonspend') return false;
      if (showAll) return true;
      const dt = parseYMD(t.date);
      if (!dt) return false;
      return dt.getUTCFullYear() === ym.y && (dt.getUTCMonth() + 1) === ym.m;
    });
    arr.sort((a, b) => b.date.localeCompare(a.date));
    return arr;
  }, [app.tx, app.cards, ym.y, ym.m, showAll]);

  const [editing, setEditing] = useState<Record<string, any>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!open) return;
    setEditing({});
    setChecked(new Set());
  }, [open, ym.y, ym.m, showAll]);

  const checkedAll = rows.length > 0 && checked.size === rows.length;

  function toggle(id: string) {
    setChecked(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
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
      },
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) {
      alert('날짜 형식이 이상해(YYYY-MM-DD).');
      return;
    }
    const a = toNum(d.amount);
    if (!Number.isFinite(a) || a === 0) {
      alert('금액을 숫자로 넣어줘.');
      return;
    }
    const inst = Math.max(1, Math.floor(Number(d.installments)));
    const rate = d.feeMode === 'manual' ? Number(String(d.feeRate).replace(',', '.')) : 0;
    if (d.feeMode === 'manual' && (!Number.isFinite(rate) || rate < 0)) {
      alert('수수료율을 확인해줘.');
      return;
    }

    await app.upsertTx({
      ...t,
      date: d.date,
      cardId: d.cardId,
      category: d.category,
      amount: a,
      installments: inst,
      feeMode: d.feeMode,
      feeRate: d.feeMode === 'manual' ? rate : 0,
      memo: String(d.memo ?? '').trim(),
    });
    cancelEdit(t.id);
  }

  async function deleteChecked() {
    if (checked.size == 0) return;
    if (!confirm(`선택한 ${checked.size}건을 삭제할까?`)) return;
    for (const id of Array.from(checked.values())) {
      await app.deleteTx(id);
      cancelEdit(id);
    }
    setChecked(new Set());
  }

  async function deleteOne(t: Tx) {
    if (!confirm('삭제할까?')) return;
    await app.deleteTx(t.id);
    cancelEdit(t.id);
    setChecked(prev => {
      const n = new Set(prev);
      n.delete(t.id);
      return n;
    });
  }

  return (
    <>
      <div className={'modal' + (open ? ' active' : '')} onClick={e => (e.target as HTMLElement).classList.contains('modal') && onClose()}>
        <div className="panel xl">
          <div className="panel-head">
            <div>
              <h3>거래 전체 내역</h3>
              <p>한 행씩 편집 · 체크박스로 다중삭제 · 캘린더 다건입력</p>
            </div>
            <div className="row">
              <button className="btn primary" onClick={() => setBulkOpen(true)}>거래 내역 추가</button>
              <button className="btn danger" onClick={deleteChecked} disabled={checked.size === 0}>선택 삭제</button>
              <button className="btn" onClick={onClose}>닫기</button>
            </div>
          </div>

          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row">
                <button className="btn" onClick={() => setYm(p => addMonthsUTC(p, -1))}>◀</button>
                <div className="mono" style={{ fontSize: 16, padding: '0 8px' }}>{ym.y}-{String(ym.m).padStart(2,'0')}</div>
                <button className="btn" onClick={() => setYm(p => addMonthsUTC(p, 1))}>▶</button>
                <label className="row" style={{ marginLeft: 10, gap: 8 }}>
                  <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                  <span className="muted small">전체</span>
                </label>
              </div>
              <div className="muted small">표시 {rows.length}건</div>
            </div>

            <div className="divider" />

            {rows.length === 0 ? (
              <p className="muted">거래가 없어.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>
                        <input
                          type="checkbox"
                          checked={checkedAll}
                          onChange={() => {
                            if (checkedAll) setChecked(new Set());
                            else setChecked(new Set(rows.map(t => t.id)));
                          }}
                        />
                      </th>
                      <th style={{ width: 120 }}>날짜</th>
                      <th style={{ width: 180 }}>결제수단</th>
                      <th style={{ width: 200 }}>카테고리</th>
                      <th>메모</th>
                      <th className="right" style={{ width: 140 }}>금액</th>
                      <th style={{ width: 220 }}></th>
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
                          <td className="mono">
                            {isEditing ? (
                              <input value={d.date} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], date: e.target.value } }))} />
                            ) : t.date}
                          </td>
                          <td>
                            {isEditing ? (
                              <select value={d.cardId} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], cardId: e.target.value } }))}>
                                {app.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            ) : (card?.name ?? '(삭제됨)')}
                          </td>
                          <td>
                            {isEditing ? (
                              <select value={d.category} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], category: e.target.value } }))}>
                                {app.categories.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            ) : t.category}
                          </td>
                          <td className="muted">
                            {isEditing ? (
                              <input value={d.memo} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], memo: e.target.value } }))} />
                            ) : t.memo}
                          </td>
                          <td className="right mono">
                            {isEditing ? (
                              <input value={d.amount} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], amount: e.target.value } }))} inputMode="numeric" />
                            ) : fmt.format(t.amount) + '원'}
                          </td>
                          <td className="right">
                            {isEditing ? (
                              <>
                                <button className="btn primary" onClick={() => saveEdit(t)}>저장</button>
                                <button className="btn" onClick={() => cancelEdit(t.id)}>취소</button>
                                <button className="btn danger" onClick={() => deleteOne(t)}>삭제</button>
                              </>
                            ) : (
                              <>
                                <button className="btn" onClick={() => startEdit(t)}>편집</button>
                                <button className="btn danger" onClick={() => deleteOne(t)}>삭제</button>
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

            <div className="divider" />
            <div className="notice">
              팁: “전체”를 켜면 모든 달 거래가 나오고, 끄면 선택한 월만 보여줘.
            </div>
          </div>
        </div>
      </div>

      <BulkEntryModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </>
  );
}
