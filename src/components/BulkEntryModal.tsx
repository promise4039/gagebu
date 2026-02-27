import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { Tx } from '../domain/models';
import { addMonthsUTC, makeUTCDate, ymd, parseYMD } from '../domain/date';
import { useIsMobile } from "../app/useMedia";

const fmt = new Intl.NumberFormat('ko-KR');
type FeeMode = 'free' | 'manual';

type DraftRow = {
  id: string;
  cardId: string;
  category: string;
  amount: string;
  installments: number;
  feeMode: FeeMode;
  feeRate: string;
  memo: string;
  tags: string;
};

function uid(prefix: string) {
  return prefix + '_' + crypto.randomUUID();
}
function isIncomeCategory(cat: string): boolean {
  const c = cat.trim().toLowerCase();
  return cat.startsWith('수입/') || c.startsWith('income/');
}

function toNumberOrNaN(s: string): number {
  return Number(String(s).replaceAll(',', '').trim());
}

export function BulkEntryModal({ open, onClose, initialDate }: { open: boolean; onClose: () => void; initialDate?: string }) {
  const isMobile = useIsMobile();

  const app = useApp();
  const today = new Date();
  const initDate = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : new Date().toISOString().slice(0,10);
  const initDt = parseYMD(initDate) ?? new Date();

  const [ym, setYm] = useState<{ y: number; m: number }>({ y: initDt.getUTCFullYear(), m: initDt.getUTCMonth() + 1 });
  const [selected, setSelected] = useState<string>(initDate);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [showCalendar, setShowCalendar] = useState(true);

  const [entryType, setEntryType] = useState<'expense' | 'income'>('expense');

  // inline edit + multiselect for existing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ cardId: string; category: string; amount: string; installments: number; feeMode: FeeMode; feeRate: string; memo: string; tags: string } | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!open) return;
    const dt = parseYMD(initDate) ?? new Date();
    setYm({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1 });
    setSelected(initDate);
    setEntryType('expense');
    setDrafts([makeDefaultRow()]);
    setEditingId(null);
    setEditDraft(null);
    setCheckedIds(new Set());
    setShowCalendar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  React.useEffect(() => {
    setEditingId(null);
    setEditDraft(null);
    setCheckedIds(new Set());
  }, [selected]);

  const txCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of app.tx) map.set(t.date, (map.get(t.date) ?? 0) + 1);
    return map;
  }, [app.tx]);

  const calendar = useMemo(() => {
    const first = makeUTCDate(ym.y, ym.m, 1);
    const firstW = first.getUTCDay();
    const cells: Array<{ date: Date; inMonth: boolean; ymd: string }> = [];
    const startOffset = -firstW;
    for (let i = 0; i < 42; i++) {
      const d = new Date(Date.UTC(ym.y, ym.m - 1, 1 + startOffset + i));
      const inMonth = (d.getUTCMonth() + 1) === ym.m;
      cells.push({ date: d, inMonth, ymd: ymd(d) });
    }
    return cells;
  }, [ym]);

  const categoryOptions = useMemo(() => {
  const all = app.categories ?? [];
  const income = all.filter(isIncomeCategory);
  const expense = all.filter(c => !isIncomeCategory(c) && c !== '이체/비지출');
  return { income, expense };
}, [app.categories]);

function defaultCategoryFor(type: 'expense' | 'income'): string {
  if (type === 'income') {
    return categoryOptions.income[0] ?? '수입/기타';
  }
  return categoryOptions.expense[0] ?? (app.categories[0] ?? '');
}

function makeDefaultRow(): DraftRow {
    return {
      id: uid('row'),
      cardId: app.cards[0]?.id ?? '',
      category: defaultCategoryFor(entryType),
      amount: '',
      installments: 1,
      feeMode: 'free',
      feeRate: '',
      memo: '',
      tags: '',
    };
  }

  function addRow() { setDrafts(prev => [...prev, makeDefaultRow()]); }
  function updateRow(id: string, patch: Partial<DraftRow>) { setDrafts(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r)); }
  function removeRow(id: string) { setDrafts(prev => prev.filter(r => r.id !== id)); }

  async function saveAll() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(selected)) { alert('선택 날짜가 이상해.'); return; }
    const toSave: Tx[] = [];
    for (const r of drafts) {
      let a = toNumberOrNaN(r.amount);
      if (!Number.isFinite(a) || a === 0) continue;
      // entryType: income -> store as negative, expense -> positive(환불/취소는 음수도 허용)
      if (entryType === 'income' && a > 0) a = -a;
      if (entryType === 'expense' && a > 0) a = a; // keep

      const inst = Math.max(1, Math.floor(Number(r.installments)));
      const rate = r.feeMode === 'manual' ? Number(String(r.feeRate).replace(',', '.')) : 0;
      if (r.feeMode === 'manual' && (!Number.isFinite(rate) || rate < 0)) { alert('수수료율(%)은 0 이상의 숫자여야 해.'); return; }
      if (!r.cardId) { alert('결제수단을 선택해줘.'); return; }
      if (!r.category) { alert('카테고리를 선택해줘.'); return; }

      toSave.push({
        id: 'tx_' + crypto.randomUUID(),
        date: selected,
        cardId: r.cardId,
        category: r.category,
        categoryId: app.categoryIdByPath[r.category] ?? undefined,
        amount: a,
        installments: inst,
        feeMode: r.feeMode,
        feeRate: r.feeMode === 'manual' ? rate : 0,
        memo: r.memo.trim(),
        tags: String(r.tags ?? '').split(',').map(x => x.replace('#','').trim()).filter(Boolean),
      });
    }
    if (toSave.length === 0) { alert('저장할 거래가 없어. 금액을 입력해줘.'); return; }
    for (const t of toSave) await app.upsertTx(t);
    onClose();
  }

  const existingForDay = useMemo(() => {
    return app.tx.filter(t => t.date === selected).sort((a,b)=>a.id.localeCompare(b.id));
  }, [app.tx, selected]);

  function startInlineEdit(t: Tx) {
    setEditingId(t.id);
    setEditDraft({
      cardId: t.cardId,
      category: t.category,
      amount: String(t.amount),
      installments: t.installments,
      feeMode: t.feeMode as FeeMode,
      feeRate: String(t.feeRate),
      memo: t.memo,
      tags: (t.tags ?? []).join(', '),
    });
  }

  async function saveInlineEdit(t: Tx) {
    if (!editDraft) return;
    const a = toNumberOrNaN(editDraft.amount);
    if (!Number.isFinite(a) || a === 0) { alert('금액을 숫자로 넣어줘(취소/환불은 음수).'); return; }
    const inst = Math.max(1, Math.floor(Number(editDraft.installments)));
    const rate = editDraft.feeMode === 'manual' ? Number(String(editDraft.feeRate).replace(',', '.')) : 0;
    if (editDraft.feeMode === 'manual' && (!Number.isFinite(rate) || rate < 0)) { alert('수수료율(%)을 0 이상의 숫자로 넣어줘.'); return; }
    const next: Tx = {
      ...t,
      cardId: editDraft.cardId,
      category: editDraft.category,
      categoryId: app.categoryIdByPath[editDraft.category] ?? undefined,
      amount: a,
      installments: inst,
      feeMode: editDraft.feeMode,
      feeRate: editDraft.feeMode === 'manual' ? rate : 0,
      memo: editDraft.memo.trim(),
      tags: String(editDraft.tags ?? '').split(',').map(x => x.replace('#','').trim()).filter(Boolean),
    };
    await app.upsertTx(next);
    setEditingId(null);
    setEditDraft(null);
  }

  function toggleCheck(id: string) {
    setCheckedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function deleteChecked() {
    if (checkedIds.size === 0) return;
    if (!confirm(`선택한 ${checkedIds.size}건을 삭제할까?`)) return;
    for (const id of Array.from(checkedIds.values())) {
      await app.deleteTx(id);
    }
    setCheckedIds(new Set());
  }

  async function deleteSingle(t: Tx) {
    if (!confirm(`삭제할까?\n${t.date} · ${t.category} · ${fmt.format(t.amount)}원`)) return;
    await app.deleteTx(t.id);
    setCheckedIds(prev => { const n = new Set(prev); n.delete(t.id); return n; });
    if (editingId === t.id) { setEditingId(null); setEditDraft(null); }
  }

  const checkedAll = existingForDay.length > 0 && checkedIds.size === existingForDay.length;

  return (
    <div className={'modal' + (open ? ' active' : '')} onClick={e => (e.target as HTMLElement).classList.contains('modal') && onClose()}>
      <div className="panel xl">
        <div className="panel-head">
          <div>
            <h3>거래 내역 추가</h3>
            <p>날짜를 고르고, 여러 거래를 한 번에 입력할 수 있어.</p>
          </div>
          <div className="row">
            <button className="btn" onClick={() => setShowCalendar(v => !v)}>{showCalendar ? '캘린더 숨기기' : '캘린더 보이기'}</button>
            <button className="btn" onClick={onClose}>닫기</button>
          </div>
        </div>

        <div className={showCalendar ? 'two-col' : ''}>
          {showCalendar ? (
            <div className="card" style={{ boxShadow: 'none' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="row">
                  <button className="btn" onClick={() => setYm(prev => addMonthsUTC(prev, -1))}>◀</button>
                  <div className="mono" style={{ fontSize: 16, padding: '0 6px' }}>{ym.y}-{String(ym.m).padStart(2,'0')}</div>
                  <button className="btn" onClick={() => setYm(prev => addMonthsUTC(prev, 1))}>▶</button>
                </div>
                <button className="btn" onClick={() => {
                  const t = new Date();
                  setYm({ y: t.getUTCFullYear(), m: t.getUTCMonth()+1 });
                  setSelected(new Date().toISOString().slice(0,10));
                }}>오늘</button>
              </div>

              <div className="divider" />

              <div className="cal-head">
                {['일','월','화','수','목','금','토'].map(d => <div key={d}>{d}</div>)}
              </div>
              <div className="calendar" style={{ gap: 6 }}>
                {calendar.map((c, idx) => {
                  const cnt = txCountByDate.get(c.ymd) ?? 0;
                  const cls = 'cal-cell' + (c.inMonth ? '' : ' muted') + (c.ymd === selected ? ' selected' : '');
                  return (
                    <div
                      key={idx}
                      className={cls}
                      onClick={() => setSelected(c.ymd)}
                      title={c.ymd}
                      style={{ padding: 8, minHeight: 40 }}
                    >
                      <div className="num mono">{c.date.getUTCDate()}</div>
                      {cnt > 0 ? <div className="badge">기록 {cnt}건</div> : <div className="badge">—</div>}
                    </div>
                  );
                })}
              </div>

              <div className="divider" />

              <div className="notice">
                선택한 날짜: <b className="mono">{selected}</b>
              </div>
            </div>
          ) : null}

          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ margin: 0 }}>새 거래 입력</h2>
                <div className="muted small">한 번에 여러 건 추가</div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className={"btn" + (entryType === 'expense' ? ' primary' : '')} onClick={() => {
                  setEntryType('expense');
                  // existing drafts with income category -> reset to expense default
                  setDrafts(prev => prev.map(r => (categoryOptions.expense.includes(r.category) ? r : { ...r, category: defaultCategoryFor('expense') })));
                }}>지출</button>
                <button className={"btn" + (entryType === 'income' ? ' primary' : '')} onClick={() => {
                  setEntryType('income');
                  setDrafts(prev => prev.map(r => (categoryOptions.income.includes(r.category) ? r : { ...r, category: defaultCategoryFor('income') })));
                }}>수입</button>
              </div>
              <div className="row">
                <button className="btn" onClick={addRow}>행 추가</button>
                <button className="btn primary" onClick={saveAll}>모두 저장</button>
              </div>
            </div>

            <div className="divider" />

            <div className="table-scroll">
              {drafts.length === 0 ? (
                <div style={{ padding: 12 }} className="muted">입력 행이 없어. “행 추가”를 눌러줘.</div>
              ) : (
                isMobile ? (
                  <div className="txcard-list">
                    {drafts.map((r) => (
                      <div key={r.id} className="txcard">
                        <div className="txrow">
                          <label style={{ flex: 1 }}>결제수단
                            <select value={r.cardId} onChange={e => updateRow(r.id, { cardId: e.target.value })}>
                              {app.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </label>
                          <label style={{ flex: 1 }}>카테고리
                            <select value={r.category} onChange={e => updateRow(r.id, { category: e.target.value })}>
                              {(entryType === 'income' ? categoryOptions.income : categoryOptions.expense).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </label>
                        </div>

                        <div className="txrow">
                          <label style={{ flex: 1.2 }}>금액
                            <input value={r.amount} onChange={e => updateRow(r.id, { amount: e.target.value })} inputMode="numeric" placeholder="예: 8200" />
                          </label>
                          <label style={{ flex: .8 }}>할부
                            <select value={r.installments} onChange={e => updateRow(r.id, { installments: Number(e.target.value) })}>
                              {[1,2,3,6,10,12,24].map(n => <option key={n} value={n}>{n===1?'일시불':`${n}개월`}</option>)}
                            </select>
                          </label>
                        </div>

                        <div className="txrow">
                          <label style={{ flex: 1 }}>수수료
                            <select value={r.feeMode} onChange={e => updateRow(r.id, { feeMode: e.target.value as FeeMode })}>
                              <option value="free">무이자</option>
                              <option value="manual">수동%</option>
                            </select>
                          </label>

                          <label style={{ flex: 1 }}>율(%)
                            <input value={r.feeRate} onChange={e => updateRow(r.id, { feeRate: e.target.value })} inputMode="decimal" disabled={r.feeMode !== 'manual'} placeholder="%" />
                          </label>

                          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button className="btn danger" onClick={() => removeRow(r.id)} disabled={drafts.length <= 1}>삭제</button>
                          </div>
                        </div>

                        <label>메모
                          <input value={r.memo} onChange={e => updateRow(r.id, { memo: e.target.value })} placeholder="메모" />
                        </label>

                        <label>태그
                          <input value={r.tags} onChange={e => updateRow(r.id, { tags: e.target.value })} placeholder="#점심, #스터디카페" />
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  <table>
                  <thead>
                    <tr>
                      <th style={{width: 180}}>결제수단</th>
                      <th style={{width: 180}}>카테고리</th>
                      <th className="right" style={{width: 130}}>금액</th>
                      <th style={{width: 90}}>할부</th>
                      <th style={{width: 120}}>수수료</th>
                      <th style={{width: 110}}>수수료율</th>
                      <th style={{width: 240}}>메모</th>
                      <th style={{width: 200}}>태그</th>
                      <th style={{width: 80}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <select value={r.cardId} onChange={e => updateRow(r.id, { cardId: e.target.value })}>
                            {app.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={r.category} onChange={e => updateRow(r.id, { category: e.target.value })}>
                            {(entryType === 'income' ? categoryOptions.income : categoryOptions.expense).map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="right">
                          <input value={r.amount} onChange={e => updateRow(r.id, { amount: e.target.value })} inputMode="numeric" placeholder="예: 8200" />
                        </td>
                        <td>
                          <select value={r.installments} onChange={e => updateRow(r.id, { installments: Number(e.target.value) })}>
                            {[1,2,3,6,10,12,24].map(n => <option key={n} value={n}>{n===1?'일시불':`${n}개월`}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={r.feeMode} onChange={e => updateRow(r.id, { feeMode: e.target.value as FeeMode })}>
                            <option value="free">무이자</option>
                            <option value="manual">수동%</option>
                          </select>
                        </td>
                        <td>
                          <input value={r.feeRate} onChange={e => updateRow(r.id, { feeRate: e.target.value })} inputMode="decimal" disabled={r.feeMode !== 'manual'} placeholder="%" />
                        </td>
                        <td>
                          <input value={r.memo} onChange={e => updateRow(r.id, { memo: e.target.value })} placeholder="메모" />
                        </td>
                      <td>
                        <input
                          value={r.tags}
                          onChange={e => updateRow(r.id, { tags: e.target.value })}
                          placeholder="#점심, #스터디카페"
                        />
                      </td>
                        <td className="right">
                          <button className="btn danger" onClick={() => removeRow(r.id)} disabled={drafts.length <= 1}>삭제</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )
              )}
            </div>

            <div className="divider" />

            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>이미 기록된 거래</h2>
              <div className="row">
                <button className="btn danger" onClick={deleteChecked} disabled={checkedIds.size === 0}>선택 삭제</button>
              </div>
            </div>

            <div className="divider" />

            {existingForDay.length === 0 ? (
              <div style={{ padding: 12 }} className="muted">이 날짜에 기록된 거래가 없어.</div>
            ) : (
              isMobile ? (
                                  <div className="txcard-list">
                                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                      <label style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                        <input
                                          type="checkbox"
                                          checked={checkedAll}
                                          onChange={() => {
                                            if (checkedAll) setCheckedIds(new Set());
                                            else setCheckedIds(new Set(existingForDay.map(t => t.id)));
                                          }}
                                        />
                                        <span className="muted small">전체 선택</span>
                                      </label>
                                      <span className="muted small">{existingForDay.length}건</span>
                                    </div>

                                    <div className="divider" />

                                    {existingForDay.map(t => {
                                      const card = app.cards.find(c => c.id === t.cardId);
                                      const isEditing = editingId === t.id;
                                      const d = editDraft;
                                      const feeTxt = t.feeMode === 'manual' ? `수동 ${t.feeRate}%` : '무이자';
                                      return (
                                        <div key={t.id} className="txcard">
                                          <div className="txrow" style={{ alignItems: 'flex-end' }}>
                                            <label style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                                              <input type="checkbox" checked={checkedIds.has(t.id)} onChange={() => toggleCheck(t.id)} />
                                              <span className="muted small">선택</span>
                                            </label>

                                            <div style={{ flex: 1 }}>
                                              {isEditing ? (
                                                <select
                                                  value={d?.category ?? t.category}
                                                  onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), category: e.target.value }))}
                                                >
                                                  {(entryType === 'income' ? categoryOptions.income : categoryOptions.expense).map(c => (
                                                    <option key={c} value={c}>{c}</option>
                                                  ))}
                                                </select>
                                              ) : (
                                                <div style={{ fontWeight: 700 }}>{t.category}</div>
                                              )}
                                            </div>

                                            <div style={{ width: 140 }}>
                                              {isEditing ? (
                                                <input value={d?.amount ?? String(t.amount)} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), amount: e.target.value }))} inputMode="numeric" />
                                              ) : (
                                                <div className="mono right" style={{ fontWeight: 800 }}>{fmt.format(t.amount)}원</div>
                                              )}
                                            </div>
                                          </div>

                                          <div className="txrow">
                                            <div className="muted small" style={{ flex: 1 }}>
                                              결제수단: {isEditing ? (
                                                <select value={d?.cardId ?? t.cardId} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), cardId: e.target.value }))}>
                                                  {app.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                              ) : (card?.name ?? '(삭제됨)')}
                                            </div>
                                            <div className="muted small" style={{ flex: 1 }}>
                                              할부: {isEditing ? (
                                                <select value={d?.installments ?? t.installments} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), installments: Number(e.target.value) }))}>
                                                  {[1,2,3,6,10,12,24].map(n => <option key={n} value={n}>{n===1?'일시불':`${n}개월`}</option>)}
                                                </select>
                                              ) : (t.installments === 1 ? '일시불' : `${t.installments}개월`)}
                                            </div>
                                          </div>

                                          <div className="txrow">
                                            <div className="muted small" style={{ flex: 1 }}>
                                              수수료: {isEditing ? (
                                                <select value={d?.feeMode ?? t.feeMode} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), feeMode: e.target.value as FeeMode }))}>
                                                  <option value="free">무이자</option>
                                                  <option value="manual">수동%</option>
                                                </select>
                                              ) : feeTxt}
                                            </div>
                                            <div className="muted small" style={{ flex: 1 }}>
                                              수수료율: {isEditing ? (
                                                <input value={d?.feeRate ?? String(t.feeRate)} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), feeRate: e.target.value }))} inputMode="decimal" disabled={(d?.feeMode ?? t.feeMode) !== 'manual'} placeholder="%" />
                                              ) : (t.feeMode === 'manual' ? String(t.feeRate) + '%' : '0%')}
                                            </div>
                                          </div>

                                          <label>메모
                                            {isEditing ? (
                                              <input value={d?.memo ?? t.memo} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), memo: e.target.value }))} />
                                            ) : (
                                              <div className="muted small">{t.memo || '-'}</div>
                                            )}
                                          </label>

                                          <label>태그
                                            {isEditing ? (
                                              <input value={d?.tags ?? (t.tags ?? []).join(', ')} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), tags: e.target.value }))} />
                                            ) : (
                                              <div className="muted small">{t.tags && t.tags.length ? t.tags.map(x => '#' + x).join(', ') : '-'}</div>
                                            )}
                                          </label>

                                          <div className="txactions">
                                            {isEditing ? (
                                              <>
                                                <button className="btn primary" onClick={() => saveInlineEdit(t)}>저장</button>
                                                <button className="btn" onClick={() => { setEditingId(null); setEditDraft(null); }}>취소</button>
                                                <button className="btn danger" onClick={() => deleteSingle(t)}>삭제</button>
                                              </>
                                            ) : (
                                              <>
                                                <button className="btn primary" onClick={() => startInlineEdit(t)}>편집</button>
                                                <button className="btn danger" onClick={() => deleteSingle(t)}>삭제</button>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
              ) : (
                <div className="table-scroll">
                                    <table>
                                    <thead>
                                      <tr>
                                        <th style={{width: 44}}>
                                          <input type="checkbox" checked={checkedAll} onChange={() => {
                                            if (checkedAll) setCheckedIds(new Set());
                                            else setCheckedIds(new Set(existingForDay.map(t => t.id)));
                                          }} />
                                        </th>
                                        <th style={{width: 180}}>카테고리</th>
                                        <th style={{width: 180}}>결제수단</th>
                                        <th className="right" style={{width: 140}}>금액</th>
                                        <th style={{width: 90}}>할부</th>
                                        <th style={{width: 120}}>수수료</th>
                                        <th style={{width: 110}}>수수료율</th>
                                        <th style={{width: 240}}>메모</th>
                                        <th style={{width: 200}}>태그</th>
                                        <th style={{width: 220}}></th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {existingForDay.map(t => {
                                        const card = app.cards.find(c => c.id === t.cardId);
                                        const isEditing = editingId === t.id;
                                        const d = editDraft;
                                        const feeTxt = t.feeMode === 'manual' ? `수동 ${t.feeRate}%` : '무이자';
                                        return (
                                          <tr key={t.id}>
                                            <td>
                                              <input type="checkbox" checked={checkedIds.has(t.id)} onChange={() => toggleCheck(t.id)} />
                                            </td>
                                            <td>
                                              {isEditing ? (
                                                <select value={d?.category ?? t.category} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), category: e.target.value }))}>
                                                  {(entryType === 'income' ? categoryOptions.income : categoryOptions.expense).map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                              ) : t.category}
                                            </td>
                                            <td>
                                              {isEditing ? (
                                                <select value={d?.cardId ?? t.cardId} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), cardId: e.target.value }))}>
                                                  {app.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                </select>
                                              ) : (card?.name ?? '(삭제됨)')}
                                            </td>
                                            <td className="right mono">
                                              {isEditing ? (
                                                <input value={d?.amount ?? String(t.amount)} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), amount: e.target.value }))} inputMode="numeric" />
                                              ) : fmt.format(t.amount) + '원'}
                                            </td>
                                            <td>
                                              {isEditing ? (
                                                <select value={d?.installments ?? t.installments} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), installments: Number(e.target.value) }))}>
                                                  {[1,2,3,6,10,12,24].map(n => <option key={n} value={n}>{n===1?'일시불':`${n}개월`}</option>)}
                                                </select>
                                              ) : (t.installments === 1 ? '일시불' : `${t.installments}개월`)}
                                            </td>
                                            <td>
                                              {isEditing ? (
                                                <select value={d?.feeMode ?? t.feeMode} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), feeMode: e.target.value as FeeMode }))}>
                                                  <option value="free">무이자</option>
                                                  <option value="manual">수동%</option>
                                                </select>
                                              ) : feeTxt}
                                            </td>
                                            <td>
                                              {isEditing ? (
                                                <input
                                                  value={d?.feeRate ?? String(t.feeRate)}
                                                  onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), feeRate: e.target.value }))}
                                                  inputMode="decimal"
                                                  disabled={(d?.feeMode ?? t.feeMode) !== 'manual'}
                                                  placeholder="%"
                                                />
                                              ) : (t.feeMode === 'manual' ? String(t.feeRate) + '%' : '0%')}
                                            </td>
                                            <td className="muted">
                                              {isEditing ? (
                                                <input value={d?.memo ?? t.memo} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), memo: e.target.value }))} />
                                              ) : t.memo}
                                            </td>
                                            <td className="muted">
                                              {isEditing ? (
                                                <input value={d?.tags ?? ((t.tags ?? []).join(', '))} onChange={e => setEditDraft(prev => ({ ...(prev ?? {} as any), tags: e.target.value }))} />
                                              ) : (t.tags && t.tags.length ? t.tags.map(x => '#' + x).join(', ') : '')}
                                            </td>
                                            <td className="right">
                                              {isEditing ? (
                                                <>
                                                  <button className="btn primary" onClick={() => saveInlineEdit(t)}>저장</button>
                                                  <button className="btn" onClick={() => { setEditingId(null); setEditDraft(null); }}>취소</button>
                                                  <button className="btn danger" onClick={() => deleteSingle(t)}>삭제</button>
                                                </>
                                              ) : (
                                                <>
                                                  <button className="btn" onClick={() => startInlineEdit(t)}>편집</button>
                                                  <button className="btn danger" onClick={() => deleteSingle(t)}>삭제</button>
                                                </>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                </div>
              )
            )}

            <div className="divider" />
            <div className="notice">
              팁: 여러 건 삭제가 필요하면 체크박스로 선택 후 “선택 삭제”를 누르면 돼.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}