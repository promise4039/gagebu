import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { Card, CardVersion, WeekendAdjust } from '../domain/models';
import { addMonthsUTC, ymd } from '../domain/date';
import { cycleRangeForPayment, paymentDateForMonth } from '../domain/billingEngine';

type MonthRef = 'prev2' | 'prev1' | 'curr';

function monthRefLabel(r: MonthRef): string {
  if (r === 'prev2') return '전전월';
  if (r === 'prev1') return '전월';
  return '당월';
}
function monthRefToOffset(r: MonthRef): number {
  if (r === 'prev2') return -2;
  if (r === 'prev1') return -1;
  return 0;
}
function offsetToMonthRef(off: number): MonthRef {
  if (off <= -2) return 'prev2';
  if (off === -1) return 'prev1';
  return 'curr';
}
function dayLabel(day: number | 'EOM') {
  return day === 'EOM' ? '말일' : `${day}일`;
}
function typeLabel(t: Card['type']) {
  if (t === 'credit') return '신용';
  if (t === 'debit') return '체크';
  if (t === 'cash') return '현금';
  if (t === 'account') return '계좌';
  if (t === 'transfer_spend') return '이체(소비)';
  return '이체(비지출)';
}
function weekendLabel(w: WeekendAdjust) {
  if (w === 'next_business') return '주말→다음영업일';
  if (w === 'prev_business') return '주말→전영업일';
  return '보정없음';
}
function summarizeCycle(v: CardVersion): string {
  if (v.cycleStart.monthOffset === -1 && v.cycleStart.day === 1 && v.cycleEnd.monthOffset === -1 && v.cycleEnd.day === 'EOM') return '전월 1일 ~ 전월 말일';
  if (v.cycleStart.monthOffset === -1 && v.cycleStart.day === 13 && v.cycleEnd.monthOffset === 0 && v.cycleEnd.day === 12) return '전월 13일 ~ 당월 12일';
  if (v.cycleStart.monthOffset === -2 && v.cycleStart.day === 30 && v.cycleEnd.monthOffset === -1 && v.cycleEnd.day === 29) return '전전월 30일 ~ 전월 29일';
  return `${monthRefLabel(offsetToMonthRef(v.cycleStart.monthOffset))} ${dayLabel(v.cycleStart.day)} ~ ${monthRefLabel(offsetToMonthRef(v.cycleEnd.monthOffset))} ${dayLabel(v.cycleEnd.day)}`;
}

export function CardsPage() {
  const app = useApp();
  const [editMode, setEditMode] = useState(false);
const isMobile = useIsMobile(520);
const [filter, setFilter] = useState<'all' | 'account' | 'credit' | 'debit_cash' | 'transfer'>('all');
const [expanded, setExpanded] = useState<Set<string>>(new Set());


  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [verModal, setVerModal] = useState<{ cardId: string; verId: string | null } | null>(null);

  const cards = useMemo(() => [...app.cards].sort((a,b)=>a.name.localeCompare(b.name)), [app.cards]);

const filteredCards = useMemo(() => {
  if (filter === 'all') return cards;
  if (filter === 'account') return cards.filter(c => c.type === 'account');
  if (filter === 'credit') return cards.filter(c => c.type === 'credit');
  if (filter === 'debit_cash') return cards.filter(c => c.type === 'debit' || c.type === 'cash');
  return cards.filter(c => c.type === 'transfer_spend' || c.type === 'transfer_nonspend');
}, [cards, filter]);


  const versionsByCard = useMemo(() => {
    const map = new Map<string, CardVersion[]>();
    for (const v of app.cardVersions) {
      const arr = map.get(v.cardId) ?? [];
      arr.push(v);
      map.set(v.cardId, arr);
    }
    for (const [k, arr] of map.entries()) {
      arr.sort((a,b)=>a.validFrom.localeCompare(b.validFrom));
      map.set(k, arr);
    }
    return map;
  }, [app.cardVersions]);

  function startEdit(c: Card) {
    if (!editMode) return;
    setExpanded(prev => {
      const n = new Set(prev);
      n.add(c.id);
      return n;
    });
    setEditingId(c.id);
    setDraft({
      name: c.name,
      type: c.type,
      isActive: c.isActive,
      trackBalance: c.type === 'credit' ? false : c.trackBalance,
      balance: c.balance ?? 0,
      purpose: c.purpose ?? '',
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({});
  }

  async function saveEdit() {
    if (!editingId) return;
    const base = app.cards.find(c => c.id === editingId);
    if (!base) return cancelEdit();

    const type = draft.type as Card['type'];
    const next: Card = {
      ...base,
      name: String(draft.name ?? '').trim() || '결제수단',
      type,
      isActive: Boolean(draft.isActive),
      trackBalance: type === 'credit' ? false : Boolean(draft.trackBalance),
      balance: type === 'credit' ? null : (Boolean(draft.trackBalance) ? (Number(String(draft.balance).replaceAll(',','').trim()) || 0) : null),
      purpose: type === 'account' ? String(draft.purpose ?? '').trim() : (String(draft.purpose ?? '').trim() || ''),
    };
    await app.upsertCard(next);
    cancelEdit();
  }

  async function add() {
    if (!editMode) return;
    const id = 'card_' + crypto.randomUUID();
    const c: Card = { id, name: '새 계좌', type: 'account', isActive: true, trackBalance: true, balance: 0, purpose: '' };
    await app.upsertCard(c);
    startEdit(c);
  }

  async function del(id: string) {
    if (!editMode) return;
    if (!confirm('삭제할까?')) return;
    await app.deleteCard(id);
    if (editingId === id) cancelEdit();
  }

  function exitEditMode() {
    setEditMode(false);
    cancelEdit();
    setVerModal(null);
  }



function toggleExpand(id: string) {
  setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
}

  return (
    <div className="container">
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>계좌/카드</h2>
          <div className="row">
            {!editMode ? (
              <button className="btn" onClick={() => setEditMode(true)}>편집</button>
            ) : (
              <>
                <button className="btn primary" onClick={add}>추가</button>
                <button className="btn" onClick={exitEditMode}>편집 종료</button>
              </>
            )}
          </div>
        </div>

<div className="divider" />

{isMobile ? (
  <>
    <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
      <button className={filter === 'all' ? 'btn primary' : 'btn'} onClick={() => setFilter('all')}>전체</button>
      <button className={filter === 'account' ? 'btn primary' : 'btn'} onClick={() => setFilter('account')}>계좌</button>
      <button className={filter === 'credit' ? 'btn primary' : 'btn'} onClick={() => setFilter('credit')}>신용</button>
      <button className={filter === 'debit_cash' ? 'btn primary' : 'btn'} onClick={() => setFilter('debit_cash')}>체크·현금</button>
      <button className={filter === 'transfer' ? 'btn primary' : 'btn'} onClick={() => setFilter('transfer')}>이체</button>
    </div>

    {filteredCards.length === 0 ? (
      <p className="muted">표시할 결제수단이 없어.</p>
    ) : (
      <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
        {filteredCards.map(c => {
          const isEditing = editingId === c.id;
          const d = isEditing ? draft : null;
          const isOpen = expanded.has(c.id) || isEditing;

          const vers = versionsByCard.get(c.id) ?? [];
          const today = ymd(new Date());
          const activeVer = vers.filter(v => v.validFrom <= today).slice(-1)[0] ?? null;
          const cycleTxt = activeVer ? summarizeCycle(activeVer) : '규칙 없음';
          const payDayTxt = activeVer ? dayLabel(activeVer.paymentDay) : '-';

          const balanceTxt = moneyFmt.format(Number((c.balance ?? 0) || 0)) + '원';

          return (
            <div key={c.id} className="card" style={{ padding: 12 }}>
              <div
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                onClick={() => toggleExpand(c.id)}
              >
                <div className="row" style={{ gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <div style={{ width: 30, minWidth: 30, textAlign: 'center' }}>{typeIcon(c.type)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.name}
                    </div>
                    <div className="muted small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {typeLabel(c.type)}
                      {c.type === 'credit' ? ` · ${cycleTxt} · 결제 ${payDayTxt}` : (c.purpose ? ` · ${c.purpose}` : '')}
                    </div>
                  </div>
                </div>

                <div className="right" style={{ minWidth: 110 }}>
                  <div className="muted small">{c.type === 'credit' ? '결제일' : '잔액'}</div>
                  <div className="mono" style={{ fontWeight: 800, textAlign: 'right' }}>
                    {c.type === 'credit' ? payDayTxt : balanceTxt}
                  </div>
                </div>
              </div>

              {isOpen ? (
                <div style={{ marginTop: 12 }}>
                  <div className="card" style={{ boxShadow: 'none', padding: 12 }}>
                    <div className="form">
                      <label>이름
                        {isEditing ? (
                          <input style={{ fontSize: 16 }} value={d.name} onChange={e => setDraft((p: any) => ({ ...p, name: e.target.value }))} />
                        ) : (
                          <input style={{ fontSize: 16 }} value={c.name} disabled />
                        )}
                      </label>

                      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                        <label style={{ flex: 1, minWidth: 180 }}>타입
                          {isEditing ? (
                            <select style={{ fontSize: 16 }} value={d.type} onChange={e => {
                              const nextType = e.target.value as Card['type'];
                              setDraft((p: any) => ({
                                ...p,
                                type: nextType,
                                trackBalance: nextType === 'credit' ? false : Boolean(p.trackBalance),
                              }));
                            }}>
                              <option value="account">계좌</option>
                              <option value="credit">신용</option>
                              <option value="debit">체크</option>
                              <option value="cash">현금</option>
                              <option value="transfer_spend">이체(소비)</option>
                              <option value="transfer_nospend">이체(비지출)</option>
                            </select>
                          ) : (
                            <input style={{ fontSize: 16 }} value={typeLabel(c.type)} disabled />
                          )}
                        </label>

                        <label style={{ width: 120 }}>활성
                          {isEditing ? (
                            <select style={{ fontSize: 16 }} value={d.isActive ? 'Y' : 'N'} onChange={e => setDraft((p: any) => ({ ...p, isActive: e.target.value === 'Y' }))}>
                              <option value="Y">켜짐</option>
                              <option value="N">꺼짐</option>
                            </select>
                          ) : (
                            <input style={{ fontSize: 16 }} value={c.isActive ? '켜짐' : '꺼짐'} disabled />
                          )}
                        </label>
                      </div>

                      {((isEditing ? d.type : c.type) !== 'credit') ? (
                        <>
                          <label>잔액 추적
                            {isEditing ? (
                              <select style={{ fontSize: 16 }} value={d.trackBalance ? 'Y' : 'N'} onChange={e => setDraft((p: any) => ({ ...p, trackBalance: e.target.value === 'Y' }))}>
                                <option value="Y">켜짐</option>
                                <option value="N">꺼짐</option>
                              </select>
                            ) : (
                              <input style={{ fontSize: 16 }} value={c.trackBalance ? '켜짐' : '꺼짐'} disabled />
                            )}
                          </label>

                          <label>잔액(원)
                            {isEditing ? (
                              <input
                                style={{ fontSize: 16, textAlign: 'right' as const }}
                                value={moneyFmt.format(Number(d.balance ?? 0))}
                                onChange={e => {
                                  const n = Number(String(e.target.value).replace(/[^0-9\-]/g, '')) || 0;
                                  setDraft((p: any) => ({ ...p, balance: n }));
                                }}
                                inputMode="numeric"
                              />
                            ) : (
                              <input style={{ fontSize: 16, textAlign: 'right' as const }} value={balanceTxt} disabled />
                            )}
                          </label>
                        </>
                      ) : (
                        <div className="notice">신용카드는 잔액 추적을 사용하지 않고, 청구/명세서에서 관리해.</div>
                      )}

                      {(isEditing ? d.type : c.type) === 'account' ? (
                        <label>목적(계좌 메모)
                          {isEditing ? (
                            <input style={{ fontSize: 16 }} value={d.purpose ?? ''} onChange={e => setDraft((p: any) => ({ ...p, purpose: e.target.value }))} />
                          ) : (
                            <input style={{ fontSize: 16 }} value={c.purpose ?? ''} disabled />
                          )}
                        </label>
                      ) : null}
                    </div>

                    {(!isMobile && editMode) ? (
                      <div className="row" style={{ justifyContent: 'space-between', marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                        {isEditing ? (
                          <>
                            <button className="btn" onClick={cancelEdit}>취소</button>
                            <button className="btn danger" onClick={() => del(c.id)}>삭제</button>
                            <button className="btn primary" onClick={saveEdit}>저장</button>
                          </>
                        ) : (
                          <>
                            <button className="btn" onClick={() => startEdit(c)}>수정</button>
                            <button className="btn danger" onClick={() => del(c.id)}>삭제</button>
                            {c.type === 'credit' ? (
                              <button className="btn" onClick={() => setVerModal({ cardId: c.id, verId: null })}>규칙</button>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="muted small" style={{ marginTop: 10 }}>편집을 켜면 수정/삭제가 가능해.</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    )}
  </>
) : (
  <>
    {cards.length === 0 ? (
      <p className="muted">아직 결제수단이 없어.</p>
    ) : (
      <div className="table-scroll">
        <table className="tight-table">
          <thead>
            <tr>
              <th style={{ width: 190 }}>이름</th>
              <th style={{ width: 90 }}>타입</th>
              <th style={{ width: 90 }}>활성</th>
              <th style={{ width: 120 }}>잔액추적</th>
              <th style={{ width: 140 }} className="right">잔액</th>
              <th>목적(계좌)</th>
              <th style={{ width: 240 }}></th>
            </tr>
          </thead>
          <tbody>
            {cards.map(c => {
              const isEditing = editingId === c.id;
              const d = isEditing ? draft : null;
              return (
                <tr key={c.id}>
                  <td>{isEditing ? <input value={d.name} onChange={e=>setDraft((p:any)=>({...p,name:e.target.value}))}/> : c.name}</td>
                  <td>
                    {isEditing ? (
                      <select value={d.type} onChange={e => {
                        const nextType = e.target.value as Card['type'];
                        setDraft((p:any)=>({
                          ...p,
                          type: nextType,
                          trackBalance: nextType === 'credit' ? false : Boolean(p.trackBalance),
                        }));
                      }}>
                        <option value="account">계좌</option>
                        <option value="credit">신용</option>
                        <option value="debit">체크</option>
                        <option value="cash">현금</option>
                        <option value="transfer_spend">이체(소비)</option>
                        <option value="transfer_nospend">이체(비지출)</option>
                      </select>
                    ) : typeLabel(c.type)}
                  </td>
                  <td>{isEditing ? (
                    <select value={d.isActive?'Y':'N'} onChange={e=>setDraft((p:any)=>({...p,isActive:e.target.value==='Y'}))}>
                      <option value="Y">Y</option>
                      <option value="N">N</option>
                    </select>
                  ) : (c.isActive ? 'Y' : 'N')}</td>
                  <td>{(isEditing ? d.type : c.type) === 'credit' ? <span className="muted small">—</span> : (
                    isEditing ? (
                      <select value={d.trackBalance?'Y':'N'} onChange={e=>setDraft((p:any)=>({...p,trackBalance:e.target.value==='Y'}))}>
                        <option value="Y">Y</option>
                        <option value="N">N</option>
                      </select>
                    ) : (c.trackBalance ? 'Y' : 'N')
                  )}</td>
                  <td className="right">{(isEditing ? d.type : c.type) === 'credit' ? <span className="muted small">—</span> : (
                    isEditing ? (
                      <input className="right" value={moneyFmt.format(Number(d.balance ?? 0))} onChange={e => {
                        const n = Number(String(e.target.value).replace(/[^0-9\-]/g, '')) || 0;
                        setDraft((p:any)=>({...p,balance:n}));
                      }} inputMode="numeric" />
                    ) : moneyFmt.format(Number(c.balance ?? 0))
                  )}</td>
                  <td>{(isEditing ? d.type : c.type) === 'account' ? (
                    isEditing ? (
                      <input value={d.purpose ?? ''} onChange={e=>setDraft((p:any)=>({...p,purpose:e.target.value}))}/>
                    ) : (c.purpose ?? '')
                  ) : <span className="muted small">—</span>}</td>
                  <td className="right">
                    {editMode ? (
                      isEditing ? (
                        <>
                          <button className="btn primary" onClick={saveEdit}>저장</button>
                          <button className="btn" onClick={cancelEdit}>취소</button>
                          <button className="btn danger" onClick={() => del(c.id)}>삭제</button>
                          {c.type === 'credit' ? <button className="btn" onClick={() => setVerModal({ cardId: c.id, verId: null })}>규칙</button> : null}
                        </>
                      ) : (
                        <>
                          <button className="btn" onClick={() => startEdit(c)}>편집</button>
                          <button className="btn danger" onClick={() => del(c.id)}>삭제</button>
                          {c.type === 'credit' ? <button className="btn" onClick={() => setVerModal({ cardId: c.id, verId: null })}>규칙</button> : null}
                        </>
                      )
                    ) : (
                      <span className="muted small">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </>
)}
        <div className="divider" />
        <div className="notice">
          • “목적”은 계좌 관리용 메모야. (예: 생활비/고정지출, 비상금 등)<br/>
          • 잔액 추적이 켜진 결제수단은 거래 입력에 따라 자동으로 증감돼.
        </div>
      </div>

      {editMode ? (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>신용카드 청구기간 규칙</h2>
            <div className="muted small">카드별 규칙(버전)을 관리해</div>
          </div>

          <div className="divider" />

          {cards.filter(c => c.type === 'credit').length === 0 ? (
            <p className="muted">신용카드가 없어.</p>
          ) : (
            cards.filter(c => c.type === 'credit').map(c => {
              const vers = versionsByCard.get(c.id) ?? [];
              return (
                <div key={c.id} style={{ marginBottom: 12 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div><b>{c.name}</b> <span className="muted small">(결제일/청구기간)</span></div>
                    <button className="btn" onClick={() => setVerModal({ cardId: c.id, verId: null })}>규칙 추가</button>
                  </div>

                  {vers.length === 0 ? (
                    <div className="notice" style={{ marginTop: 8 }}>규칙이 없어. “규칙 추가”로 등록해줘.</div>
                  ) : (
                    <div className="table-scroll" style={{ marginTop: 8 }}>
                      <table className="tight-table">
                        <thead>
                          <tr>
                            <th>적용 시작일</th>
                            <th>결제일</th>
                            <th>청구기간</th>
                            <th>주말 보정</th>
                            <th style={{ width: 200 }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {vers.map(v => (
                            <tr key={v.id}>
                              <td className="mono">{v.validFrom}</td>
                              <td>{dayLabel(v.paymentDay)}</td>
                              <td>{summarizeCycle(v)}</td>
                              <td>{weekendLabel(v.weekendAdjust)}</td>
                              <td className="right">
                                <button className="btn" onClick={() => setVerModal({ cardId: c.id, verId: v.id })}>편집</button>
                                <button className="btn danger" onClick={async () => {
                                  if (vers.length <= 1) { alert('최소 1개 규칙은 남겨야 해.'); return; }
                                  if (!confirm('이 규칙을 삭제할까?')) return;
                                  await app.deleteCardVersion(v.id);
                                }}>삭제</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : null}

      <VersionModal open={!!verModal} cardId={verModal?.cardId ?? ''} verId={verModal?.verId ?? null} onClose={() => setVerModal(null)} />
    </div>
  );

  function VersionModal({ open, onClose, cardId, verId }: { open: boolean; onClose: () => void; cardId: string; verId: string | null }) {
    const existing = verId ? (app.cardVersions.find(v => v.id === verId) ?? null) : null;

    const [validFrom, setValidFrom] = useState(existing?.validFrom ?? new Date().toISOString().slice(0, 10));
    const [paymentDay, setPaymentDay] = useState<string>(existing?.paymentDay === 'EOM' ? 'EOM' : String(existing?.paymentDay ?? 13));
    const [clamp, setClamp] = useState<boolean>(existing?.clamp ?? true);
    const [weekendAdjust, setWeekendAdjust] = useState<WeekendAdjust>(existing?.weekendAdjust ?? 'prev_business');

    const [preset, setPreset] = useState<'prevMonth' | 'm2_30_m1_29' | 'm1_13_m0_12' | 'custom'>(() => {
      if (!existing) return 'prevMonth';
      if (existing.cycleStart.monthOffset === -1 && existing.cycleStart.day === 1 && existing.cycleEnd.monthOffset === -1 && existing.cycleEnd.day === 'EOM') return 'prevMonth';
      if (existing.cycleStart.monthOffset === -2 && existing.cycleStart.day === 30 && existing.cycleEnd.monthOffset === -1 && existing.cycleEnd.day === 29) return 'm2_30_m1_29';
      if (existing.cycleStart.monthOffset === -1 && existing.cycleStart.day === 13 && existing.cycleEnd.monthOffset === 0 && existing.cycleEnd.day === 12) return 'm1_13_m0_12';
      return 'custom';
    });

    const [startRef, setStartRef] = useState<MonthRef>(existing ? offsetToMonthRef(existing.cycleStart.monthOffset) : 'prev1');
    const [startDay, setStartDay] = useState<string>(existing?.cycleStart.day === 'EOM' ? 'EOM' : String(existing?.cycleStart.day ?? 1));
    const [endRef, setEndRef] = useState<MonthRef>(existing ? offsetToMonthRef(existing.cycleEnd.monthOffset) : 'prev1');
    const [endDay, setEndDay] = useState<string>(existing?.cycleEnd.day === 'EOM' ? 'EOM' : String(existing?.cycleEnd.day ?? 'EOM'));

    React.useEffect(() => {
      if (!open) return;
      const ex = verId ? (app.cardVersions.find(v => v.id === verId) ?? null) : null;
      setValidFrom(ex?.validFrom ?? new Date().toISOString().slice(0, 10));
      setPaymentDay(ex?.paymentDay === 'EOM' ? 'EOM' : String(ex?.paymentDay ?? 13));
      setClamp(ex?.clamp ?? true);
      setWeekendAdjust(ex?.weekendAdjust ?? 'prev_business');

      const nextPreset = (() => {
        if (!ex) return 'prevMonth';
        if (ex.cycleStart.monthOffset === -1 && ex.cycleStart.day === 1 && ex.cycleEnd.monthOffset === -1 && ex.cycleEnd.day === 'EOM') return 'prevMonth';
        if (ex.cycleStart.monthOffset === -2 && ex.cycleStart.day === 30 && ex.cycleEnd.monthOffset === -1 && ex.cycleEnd.day === 29) return 'm2_30_m1_29';
        if (ex.cycleStart.monthOffset === -1 && ex.cycleStart.day === 13 && ex.cycleEnd.monthOffset === 0 && ex.cycleEnd.day === 12) return 'm1_13_m0_12';
        return 'custom';
      })();
      setPreset(nextPreset);

      setStartRef(ex ? offsetToMonthRef(ex.cycleStart.monthOffset) : 'prev1');
      setStartDay(ex?.cycleStart.day === 'EOM' ? 'EOM' : String(ex?.cycleStart.day ?? 1));
      setEndRef(ex ? offsetToMonthRef(ex.cycleEnd.monthOffset) : 'prev1');
      setEndDay(ex?.cycleEnd.day === 'EOM' ? 'EOM' : String(ex?.cycleEnd.day ?? 'EOM'));
    }, [open, verId, app.cardVersions]);

    function dayOpts() {
      const arr: Array<{ value: string; label: string }> = [{ value: 'EOM', label: '말일' }];
      for (let i = 1; i <= 31; i++) arr.push({ value: String(i), label: `${i}일` });
      return arr;
    }

    React.useEffect(() => {
      if (preset === 'prevMonth') { setStartRef('prev1'); setStartDay('1'); setEndRef('prev1'); setEndDay('EOM'); }
      else if (preset === 'm2_30_m1_29') { setStartRef('prev2'); setStartDay('30'); setEndRef('prev1'); setEndDay('29'); }
      else if (preset === 'm1_13_m0_12') { setStartRef('prev1'); setStartDay('13'); setEndRef('curr'); setEndDay('12'); }
    }, [preset]);

    const draftV: CardVersion = useMemo(() => ({
      id: existing?.id ?? 'ver_preview',
      cardId,
      validFrom,
      paymentDay: paymentDay === 'EOM' ? 'EOM' : Number(paymentDay),
      clamp,
      weekendAdjust,
      cycleStart: { monthOffset: monthRefToOffset(startRef), day: startDay === 'EOM' ? 'EOM' : Number(startDay) },
      cycleEnd: { monthOffset: monthRefToOffset(endRef), day: endDay === 'EOM' ? 'EOM' : Number(endDay) },
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }), [existing?.id, existing?.createdAt, cardId, validFrom, paymentDay, clamp, weekendAdjust, startRef, startDay, endRef, endDay]);

    const preview = useMemo(() => {
      const now = new Date();
      const ym0 = { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 };
      const rows: Array<{ paymentDate: string; cycleStart: string; cycleEnd: string }> = [];
      for (let i = 0; i < 3; i++) {
        const ym = addMonthsUTC(ym0, i);
        const pay = paymentDateForMonth(draftV, ym);
        const range = cycleRangeForPayment(draftV, pay);
        rows.push({ paymentDate: ymd(pay), cycleStart: ymd(range.start), cycleEnd: ymd(range.end) });
      }
      return rows;
    }, [draftV]);

    async function save() {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(validFrom)) { alert('적용 시작일 형식이 이상해.'); return; }
      const v: CardVersion = {
        id: existing?.id ?? ('ver_' + crypto.randomUUID()),
        cardId,
        validFrom,
        paymentDay: paymentDay === 'EOM' ? 'EOM' : Number(paymentDay),
        clamp,
        weekendAdjust,
        cycleStart: { monthOffset: monthRefToOffset(startRef), day: startDay === 'EOM' ? 'EOM' : Number(startDay) },
        cycleEnd: { monthOffset: monthRefToOffset(endRef), day: endDay === 'EOM' ? 'EOM' : Number(endDay) },
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      await app.upsertCardVersion(v);
      onClose();
    }

    return (
      <div className={'modal' + (open ? ' active' : '')} onClick={e => (e.target as HTMLElement).classList.contains('modal') && onClose()}>
        <div className="panel">
          <div className="panel-head">
            <div><h3>{existing ? '청구기간 규칙 편집' : '청구기간 규칙 추가'}</h3><p>결제일 기준 “청구기간”을 정해.</p></div>
            <div className="row"><button className="btn" onClick={onClose}>닫기</button></div>
          </div>

          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="form">
              <label>적용 시작일 <input value={validFrom} onChange={e => setValidFrom(e.target.value)} /></label>
              <label>결제일
                <select value={paymentDay} onChange={e => setPaymentDay(e.target.value)}>
                  <option value="EOM">말일</option>
                  {Array.from({ length: 31 }).map((_, i) => <option key={i+1} value={String(i+1)}>{i+1}일</option>)}
                </select>
              </label>
              <label>주말 보정
                <select value={weekendAdjust} onChange={e => setWeekendAdjust(e.target.value as WeekendAdjust)}>
                  <option value="none">보정 없음</option>
                  <option value="prev_business">주말→전영업일</option>
                  <option value="next_business">주말→다음영업일</option>
                </select>
              </label>
              <label>없는 날짜 처리
                <select value={String(clamp)} onChange={e => setClamp(e.target.value === 'true')}>
                  <option value="true">말일로 보정</option>
                  <option value="false">보정 안함</option>
                </select>
              </label>
            </div>

            <div className="divider" />

            <div className="form">
              <label>프리셋
                <select value={preset} onChange={e => setPreset(e.target.value as any)}>
                  <option value="prevMonth">전월 1일 ~ 전월 말일</option>
                  <option value="m1_13_m0_12">전월 13일 ~ 당월 12일</option>
                  <option value="m2_30_m1_29">전전월 30일 ~ 전월 29일</option>
                  <option value="custom">직접 설정</option>
                </select>
              </label>
              <div />
            </div>

            <div className="divider" />

            <h2 style={{ marginTop: 0 }}>직접 설정</h2>
            <div className="form">
              <label>시작 월
                <select value={startRef} onChange={e => { setPreset('custom'); setStartRef(e.target.value as MonthRef); }}>
                  <option value="prev2">전전월</option><option value="prev1">전월</option><option value="curr">당월</option>
                </select>
              </label>
              <label>시작 일
                <select value={startDay} onChange={e => { setPreset('custom'); setStartDay(e.target.value); }}>
                  {dayOpts().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
              <label>종료 월
                <select value={endRef} onChange={e => { setPreset('custom'); setEndRef(e.target.value as MonthRef); }}>
                  <option value="prev2">전전월</option><option value="prev1">전월</option><option value="curr">당월</option>
                </select>
              </label>
              <label>종료 일
                <select value={endDay} onChange={e => { setPreset('custom'); setEndDay(e.target.value); }}>
                  {dayOpts().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </label>
            </div>

            <div className="divider" />
            <h2 style={{ marginTop: 0 }}>미리보기(다음 3회차)</h2>
            <table className="tight-table">
              <thead><tr><th>결제일</th><th>청구기간</th></tr></thead>
              <tbody>
                {preview.map((r, idx) => (
                  <tr key={idx}>
                    <td className="mono">{r.paymentDate}</td>
                    <td className="mono">{r.cycleStart} ~ {r.cycleEnd}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="divider" />
            <button className="btn primary" onClick={save}>저장</button>
          </div>
        </div>
      </div>
    );
  }
}


function useIsMobile(maxWidth = 520): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches
    : false);

  const [isMobile, setIsMobile] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    // Safari old fallback
    // eslint-disable-next-line deprecation/deprecation
    mql.addListener(onChange);
    // eslint-disable-next-line deprecation/deprecation
    return () => mql.removeListener(onChange);
  }, [maxWidth]);

  return isMobile;
}

const moneyFmt = new Intl.NumberFormat('ko-KR');

function typeIcon(t: Card['type']) {
  if (t === 'credit') return '💳';
  if (t === 'debit') return '💳';
  if (t === 'cash') return '💵';
  if (t === 'account') return '🏦';
  if (t === 'transfer_spend') return '🔁';
  return '🔁';
}
