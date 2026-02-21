import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { Tx } from '../domain/models';
import { BulkEntryModal } from '../components/BulkEntryModal';

const fmt = new Intl.NumberFormat('ko-KR');
type FeeMode = 'free' | 'manual';

export function TransactionsPage() {
  const app = useApp();
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
          <h2 style={{ margin: 0 }}>거래</h2>
          <div className="row">
            <button className="btn primary" onClick={() => setBulkOpen(true)}>거래 내역 추가</button>
            <button className="btn danger" onClick={deleteChecked} disabled={checked.size === 0}>선택 삭제</button>
          </div>
        </div>

        <div className="divider" />

        {rows.length === 0 ? (
          <p className="muted">거래가 없어.</p>
        ) : (
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

        <div className="divider" />

        <div className="notice">
          단건 추가는 제거했고, “거래 내역 추가”에서 캘린더로 여러 건을 한 번에 입력하는 흐름이 기본이야.
        </div>
      </div>

      <BulkEntryModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
    </div>
  );
}
