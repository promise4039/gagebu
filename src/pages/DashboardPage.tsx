import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { BudgetItem, Tx } from '../domain/models';
import { addMonthsUTC, makeUTCDate, parseYMD, ymd } from '../domain/date';
import { BulkEntryModal } from '../components/BulkEntryModal';
import { TransactionsManagerModal } from '../components/TransactionsManagerModal';
import { APP_VERSION } from '../app/version';
import { useIsMobile } from '../app/useMedia';

const fmt = new Intl.NumberFormat('ko-KR');

function iconForBudgetItem(kind: BudgetItem['kind']): string {
  switch (kind) {
    case 'fuel': return '⛽️';
    case 'grocery': return '🛒';
    case 'food': return '🍽️';
    case 'online': return '🛍️';
    case 'transfer': return '🔁';
    case 'life': return '🏠';
    case 'custom': return '🧩';
    default: return '📌';
  }
}

function iconForCategoryPath(path: string): string {
  const g = (path || '').split('/')[0];
  const map: Record<string, string> = {
    '수입': '💰', '식비': '🍽️', '마트': '🛒', '교통': '🚗', '주거': '🏠', '통신': '📱',
    '의료': '🏥', '보험': '🏦', '세금': '🧾', '교육': '📚', '여가': '🎮', '경조': '🎁',
    '미용': '💇', '여행': '✈️', '수수료': '🧾', '이월': '💳', '포인트': '⭐', '해외': '🌍',
    '조정': '🧩', '이체': '🔁',
  };
  return map[g] ?? '📌';
}


function kindForCategory(category: string): BudgetItem['kind'] | null {
  if (category.startsWith('교통/주유')) return 'fuel';
  if (category.startsWith('마트/')) return 'grocery';
  if (category.startsWith('식비/')) return 'food';
  if (category.startsWith('쇼핑/')) return 'online';
  if (category.startsWith('생활/')) return 'life';
  if (category.startsWith('이체/')) return 'transfer';
  return null;
}

function monthGrid(y: number, m: number) {
  const first = makeUTCDate(y, m, 1);
  const firstW = first.getUTCDay();
  const cells: Array<{ ymd: string; inMonth: boolean; day: number }> = [];
  const startOffset = -firstW;
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(y, m - 1, 1 + startOffset + i));
    cells.push({ ymd: ymd(d), inMonth: (d.getUTCMonth() + 1) === m, day: d.getUTCDate() });
  }
  return cells;
}

function kpiFromTx(arr: Tx[]) {
  let income = 0;
  let expense = 0;
  for (const t of arr) {
    if (t.amount < 0) income += -t.amount;
    else expense += t.amount;
  }
  return { income, expense, net: income - expense };
}

export function DashboardPage() {
  const app = useApp();
  const settings = app.settings!;
  const isMobile = useIsMobile(520);
  const now = new Date();

  const [monthCursor, setMonthCursor] = useState<{ y: number; m: number }>({ y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 });
  const [yearCursor, setYearCursor] = useState<number>(now.getUTCFullYear());
  const [selectedDay, setSelectedDay] = useState<string>(new Date().toISOString().slice(0, 10));

  const [bulkOpen, setBulkOpen] = useState(false);
  const [allOpen, setAllOpen] = useState(false);

  const [budgetEditMode, setBudgetEditMode] = useState(false);
  const [mapDraft, setMapDraft] = useState<Record<string, string>>({});

  const categoryBudgetMap = settings.categoryBudgetMap ?? {};

  async function linkCategoryToBudget(category: string, itemId: string) {
    const cid = app.categoryIdByPath[category];
    if (!cid) { alert('카테고리 ID를 찾지 못했어. (카테고리 다시 추가/동기화 필요)'); return; }
    const next = { ...categoryBudgetMap, [cid]: itemId };
    await app.updateSettings({ ...settings, categoryBudgetMap: next } as any);
  }

  async function unlinkCategory(category: string) {
    const cid = app.categoryIdByPath[category];
    if (!cid) return;
    const next = { ...categoryBudgetMap };
    delete next[cid];
    await app.updateSettings({ ...settings, categoryBudgetMap: next } as any);
  }

  function draftTargetForCategory(category: string): string {
    return mapDraft[category] ?? (editItems[0]?.id ?? '');
  }


  const monthCells = useMemo(() => monthGrid(monthCursor.y, monthCursor.m), [monthCursor]);

  const budgetItems = settings.budgetItems ?? [];
  const [editItems, setEditItems] = useState<BudgetItem[]>(budgetItems);
  React.useEffect(() => setEditItems(budgetItems), [JSON.stringify(budgetItems)]);

  async function saveBudgetItems() {
    await app.updateSettings({ ...settings, budgetItems: editItems });
    alert('예산 캡을 저장했어.');
  }
  function addBudgetItem() {
    setEditItems(prev => [...prev, { id: 'b_' + crypto.randomUUID(), kind: 'custom', name: '새 항목', monthCap: 0, yearCap: null }]);
  }
  function deleteBudgetItem(id: string) { setEditItems(prev => prev.filter(x => x.id !== id)); }
  function updateItem(id: string, patch: Partial<BudgetItem>) { setEditItems(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x)); }

  const monthTx = useMemo(() => {
    return app.tx.filter(t => {
      const dt = parseYMD(t.date);
      if (!dt) return false;
      if (dt.getUTCFullYear() !== monthCursor.y) return false;
      if ((dt.getUTCMonth() + 1) !== monthCursor.m) return false;
      if (t.category.startsWith('이체/비지출')) return false;
      const card = app.cards.find(c => c.id === t.cardId);
      if (card?.type === 'transfer_nonspend') return false;
      return true;
    });
  }, [app.tx, app.cards, monthCursor.y, monthCursor.m]);

  const yearTx = useMemo(() => {
    return app.tx.filter(t => {
      const dt = parseYMD(t.date);
      if (!dt) return false;
      if (dt.getUTCFullYear() !== yearCursor) return false;
      if (t.category.startsWith('이체/비지출')) return false;
      const card = app.cards.find(c => c.id === t.cardId);
      if (card?.type === 'transfer_nonspend') return false;
      return true;
    });
  }, [app.tx, app.cards, yearCursor]);

  const monthKpi = useMemo(() => kpiFromTx(monthTx), [monthTx]);
  const yearKpi = useMemo(() => kpiFromTx(yearTx), [yearTx]);

  const dayAgg = useMemo(() => {
    const map = new Map<string, { inc: number; exp: number; incN: number; expN: number }>();
    for (const t of monthTx) {
      const rec = map.get(t.date) ?? { inc: 0, exp: 0, incN: 0, expN: 0 };
      if (t.amount < 0) { rec.inc += -t.amount; rec.incN += 1; }
      else { rec.exp += t.amount; rec.expN += 1; }
      map.set(t.date, rec);
    }
    return map;
  }, [monthTx]);
  const selectedAgg = dayAgg.get(selectedDay) ?? null;

  const actual = useMemo(() => {
  const primaryByKind = new Map<BudgetItem['kind'], string>();
  for (const it of editItems) {
    if (it.kind !== 'custom' && !primaryByKind.has(it.kind)) primaryByKind.set(it.kind, it.id);
  }
  const validItemIds = new Set(editItems.map(i => i.id));

  const monthActualByItem = new Map<string, number>();
  const yearActualByItem = new Map<string, number>();
  const monthUnmapped = new Map<string, number>();
  const yearUnmapped = new Map<string, number>();

  function resolveItemId(category: string): string | null {
    const cid = app.categoryIdByPath[category];
    if (!cid) return null;
    const mapped = (categoryBudgetMap as any)[cid];
    return typeof mapped === 'string' ? mapped : null;
  }

  for (const t of monthTx) {
    const id = resolveItemId(t.category);
    if (id) monthActualByItem.set(id, (monthActualByItem.get(id) ?? 0) + Math.max(0, t.amount));
    else monthUnmapped.set(t.category, (monthUnmapped.get(t.category) ?? 0) + Math.max(0, t.amount));
  }
  for (const t of yearTx) {
    const id = resolveItemId(t.category);
    if (id) yearActualByItem.set(id, (yearActualByItem.get(id) ?? 0) + Math.max(0, t.amount));
    else yearUnmapped.set(t.category, (yearUnmapped.get(t.category) ?? 0) + Math.max(0, t.amount));
  }

  return { monthActualByItem, yearActualByItem, monthUnmapped, yearUnmapped };
}, [monthTx, yearTx, editItems, categoryBudgetMap]);


  function yearCapFor(it: BudgetItem) { return it.yearCap === null ? it.monthCap * 12 : it.yearCap; }
  function monthActualFor(it: BudgetItem) { return actual.monthActualByItem.get(it.id) ?? 0; }
  function yearActualFor(it: BudgetItem) { return actual.yearActualByItem.get(it.id) ?? 0; }

  const monthBudgetTotal = useMemo(() => editItems.reduce((s, it) => s + (it.monthCap || 0), 0), [editItems]);
  const yearBudgetTotal = useMemo(() => editItems.reduce((s, it) => s + (yearCapFor(it) || 0), 0), [editItems, yearCursor]);

  const recentTx = useMemo(() => [...monthTx].sort((a,b)=>b.date.localeCompare(a.date)).slice(0, 25), [monthTx]);

  const [editing, setEditing] = useState<Record<string, any>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const checkedAll = recentTx.length > 0 && checked.size === recentTx.length;

  function toggle(id: string) {
    setChecked(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function startEdit(t: Tx) {
    setEditing(prev => ({ ...prev, [t.id]: { cardId: t.cardId, category: t.category, amount: String(t.amount), memo: t.memo } }));
  }
  function cancelEdit(id: string) {
    setEditing(prev => { const cp = { ...prev }; delete cp[id]; return cp; });
  }
  async function saveEdit(t: Tx) {
    const d = editing[t.id];
    if (!d) return;
    const a = Number(String(d.amount).replaceAll(',', '').trim());
    if (!Number.isFinite(a) || a === 0) { alert('금액을 숫자로 넣어줘.'); return; }
    await app.upsertTx({ ...t, cardId: d.cardId, category: d.category, categoryId: app.categoryIdByPath[d.category] ?? undefined, amount: a, memo: String(d.memo ?? '').trim(), tags: t.tags ?? [] });
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
          <div>
            <div className="muted small">PERSONAL BUDGET</div>
            <h2 style={{ margin: 0 }}>명준님의 가계부 <span className="muted small" style={{ marginLeft: 8 }}>{APP_VERSION}</span></h2>
          </div>
          <div className="right">
            <div className="mono">{new Date().toISOString().slice(0, 10)}</div>
            <div className="muted small">월 목표 {fmt.format(settings.budgets.monthCap)}원</div>
          </div>
        </div>

        <div className="divider" />

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <button className="btn" onClick={() => setMonthCursor(p => addMonthsUTC(p, -1))}>◀</button>
            <div className="mono" style={{ fontSize: 20, padding: '0 10px' }}>{monthCursor.y}년 {monthCursor.m}월</div>
            <button className="btn" onClick={() => setMonthCursor(p => addMonthsUTC(p, 1))}>▶</button>
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => setBulkOpen(true)}>거래 내역 추가</button>
          </div>
        </div>

        <div className="divider" />

        <div className="cal-head">
          {['일', '월', '화', '수', '목', '금', '토'].map(d => <div key={d}>{d}</div>)}
        </div>

        <div className="calendar" style={{ gap: 6 }}>
          {monthCells.map((c, idx) => {
            const agg = dayAgg.get(c.ymd);
            const cls = 'cal-cell' + (c.inMonth ? '' : ' muted') + (c.ymd === selectedDay ? ' selected' : '');
            return (
              <div key={idx} className={cls} style={{ minHeight: isMobile ? 52 : 78 }} onClick={() => setSelectedDay(c.ymd)} title={c.ymd}>
                <div className="num mono">{c.day}</div>
                {agg && (agg.incN + agg.expN) > 0 ? (
                  isMobile ? (
                    <div className="dots" aria-label="요약">
                      {agg.incN > 0 ? <span className="dot inc" title={`수입 ${fmt.format(agg.inc)}원 · ${agg.incN}건`} /> : null}
                      {agg.expN > 0 ? <span className="dot exp" title={`지출 ${fmt.format(agg.exp)}원 · ${agg.expN}건`} /> : null}
                    </div>
                  ) : (
                    <div className="mini">
                      {agg.incN > 0 ? <div className="inc">수입 {fmt.format(agg.inc)}원 · {agg.incN}건</div> : null}
                      {agg.expN > 0 ? <div className="exp">지출 {fmt.format(agg.exp)}원 · {agg.expN}건</div> : null}
                    </div>
                  )
                ) : null}
              </div>
            );
          })}
        </div>

        {isMobile ? (
          <div className="card" style={{ boxShadow: 'none', marginTop: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="muted small">선택일</div>
              <div className="mono">{selectedDay}</div>
            </div>
            <div className="divider" />
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="card" style={{ boxShadow: 'none', background: 'rgba(20,60,35,.22)' }}>
                <div className="muted small">수입</div>
                <div className="mono" style={{ fontSize: 18 }}>{fmt.format(selectedAgg ? selectedAgg.inc : 0)}원</div>
                <div className="muted small">({selectedAgg ? selectedAgg.incN : 0}건)</div>
              </div>
              <div className="card" style={{ boxShadow: 'none', background: 'rgba(70,30,30,.22)' }}>
                <div className="muted small">지출</div>
                <div className="mono" style={{ fontSize: 18 }}>{fmt.format(selectedAgg ? selectedAgg.exp : 0)}원</div>
                <div className="muted small">({selectedAgg ? selectedAgg.expN : 0}건)</div>
              </div>
            </div>
          </div>
        ) : null}

        <div className="divider" />

        <div className={isMobile ? "swipe-row" : "two-col"}>
          <div className="card kpi-card" style={{ boxShadow: 'none' }}>
            <div className="pill mono">월간</div>
            <div className="divider" />
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="card" style={{ boxShadow: 'none', background: 'rgba(20,60,35,.28)' }}>
                <div className="muted small">수입</div>
                <div className="mono" style={{ fontSize: 22 }}>{fmt.format(monthKpi.income)}원</div>
              </div>
              <div className="card" style={{ boxShadow: 'none', background: 'rgba(70,30,30,.28)' }}>
                <div className="muted small">지출</div>
                <div className="mono" style={{ fontSize: 22 }}>{fmt.format(monthKpi.expense)}원</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none', marginTop: 10 }}>
              <div className="muted small">잔액</div>
              <div className="mono" style={{ fontSize: 22 }}>{monthKpi.net >= 0 ? '+' : '−'}{fmt.format(Math.abs(monthKpi.net))}원</div>
            </div>
          </div>

          <div className="card kpi-card" style={{ boxShadow: 'none' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="pill mono">연간</div>
              <div className="row">
                <button className="btn" onClick={() => setYearCursor(y => y - 1)}>◀</button>
                <div className="mono" style={{ fontSize: 16, padding: '0 8px' }}>{yearCursor}년</div>
                <button className="btn" onClick={() => setYearCursor(y => y + 1)}>▶</button>
              </div>
            </div>
            <div className="divider" />
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="card" style={{ boxShadow: 'none', background: 'rgba(20,60,35,.28)' }}>
                <div className="muted small">수입</div>
                <div className="mono" style={{ fontSize: 22 }}>{fmt.format(yearKpi.income)}원</div>
              </div>
              <div className="card" style={{ boxShadow: 'none', background: 'rgba(70,30,30,.28)' }}>
                <div className="muted small">지출</div>
                <div className="mono" style={{ fontSize: 22 }}>{fmt.format(yearKpi.expense)}원</div>
              </div>
            </div>
            <div className="card" style={{ boxShadow: 'none', marginTop: 10 }}>
              <div className="muted small">잔액</div>
              <div className="mono" style={{ fontSize: 22 }}>{yearKpi.net >= 0 ? '+' : '−'}{fmt.format(Math.abs(yearKpi.net))}원</div>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className={isMobile ? "swipe-row" : "two-col"}>
          <div className="card budget-card" style={{ boxShadow: 'none' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>예산대비 현황(월)</h2>
              <div className="mono">{fmt.format(monthKpi.expense)}원 / {fmt.format(monthBudgetTotal)}원</div>
            </div>

            <div className="divider" />

            <div className="section-head">
              <div className="muted small">
                {budgetEditMode ? '편집 모드: 항목/캡을 수정하고 저장할 수 있어.' : '편집을 누르면 항목/캡 수정이 가능해.'}
              </div>
              <div className="actions">
                {!budgetEditMode ? (
                  <button className="btn" onClick={() => setBudgetEditMode(true)}>편집</button>
                ) : (
                  <>
                    <button className="btn" onClick={addBudgetItem}>항목 추가</button>
                    <button className="btn primary" onClick={saveBudgetItems}>저장</button>
                    <button className="btn" onClick={() => { setBudgetEditMode(false); setEditItems(budgetItems); }}>편집 종료</button>
                  </>
                )}
              </div>
            </div>

            <div className="divider" />

            {budgetEditMode ? (
              <div className="table-scroll">
                <table className="tight-table">
                  <thead>
                    <tr>
                      <th style={{ width: 200 }}>항목 이름</th>
                      <th style={{ width: 120 }}>분류</th>
                      <th className="right" style={{ width: 140 }}>캡(월)</th>
                      <th className="right" style={{ width: 160 }}>캡(연)</th>
                      <th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editItems.map(it => (
                      <tr key={it.id}>
                        <td>
                          <input value={it.name} onChange={e => updateItem(it.id, { name: e.target.value })} />
                        </td>
                        <td>
                          <select value={it.kind} onChange={e => updateItem(it.id, { kind: e.target.value as any })}>
                            <option value="fuel">주유</option>
                            <option value="grocery">마트</option>
                            <option value="food">식비</option>
                            <option value="online">온라인</option>
                            <option value="transfer">이체(소비)</option>
                            <option value="life">생활</option>
                            <option value="buffer">예비비</option>
                            <option value="custom">커스텀</option>
                          </select>
                        </td>
                        <td className="right">
                          <input value={String(it.monthCap)} inputMode="numeric" onChange={e => updateItem(it.id, { monthCap: Number(e.target.value.replaceAll(',','').trim()) || 0 })} />
                        </td>
                        <td className="right">
                          <input
                            value={it.yearCap === null ? '' : String(it.yearCap)}
                            inputMode="numeric"
                            placeholder={String(it.monthCap * 12)}
                            onChange={e => {
                              const v = e.target.value.trim();
                              updateItem(it.id, { yearCap: v === '' ? null : (Number(v.replaceAll(',','').trim()) || 0) });
                            }}
                          />
                        </td>
                        <td className="right">
                          <button className="btn danger" onClick={() => deleteBudgetItem(it.id)}>삭제</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: budgetEditMode ? 12 : 0 }}>
              {editItems.map(it => {
                const bud = it.monthCap;
                const act = monthActualFor(it);
                const pct = bud === 0 ? 0 : Math.round((act / bud) * 100);
                const cls = pct >= 100 ? 'bad' : (pct >= 80 ? 'warn' : 'good');
                const w = Math.min(100, Math.max(0, pct));
                return (
                  <div key={it.id} className="budgetbar">
                    <div className={'fill ' + (cls === 'bad' ? 'bad' : cls === 'warn' ? 'warn' : '')} style={{ width: w + '%' }} />
                    <div className="content">
                      <div className="left"><span className="catIcon" aria-hidden>{iconForBudgetItem(it.kind)}</span>{it.name}</div>
                      <div className="right">
                        <div className="top">{fmt.format(act)} / {fmt.format(bud)}원</div>
                        <div className="bottom">소진율 {pct}%</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="divider" />
            <h2 style={{ marginTop: 0 }}>미분류(월)</h2>
            {actual.monthUnmapped.size === 0 ? <p className="muted">없음</p> : (
              <div className="table-scroll">
                <table className="tight-table">
                  <thead>
                    <tr>
                      <th>카테고리</th>
                      <th className="right">실적</th>
                      <th style={{ width: 220 }}>예산 항목 연결</th>
                      <th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(actual.monthUnmapped.entries()).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
                      <tr key={k}>
                        <td><span className="catIcon" aria-hidden>{iconForCategoryPath(k)}</span>{k}</td>
                        <td className="right mono">{fmt.format(v)}원</td>
                        <td>
                          {editItems.length === 0 ? (
                            <span className="muted small">예산 항목이 없어</span>
                          ) : (
                            <select value={draftTargetForCategory(k)} onChange={e => setMapDraft(p => ({ ...p, [k]: e.target.value }))}>
                              {editItems.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="right">
                          <button className="btn" disabled={editItems.length === 0} onClick={async () => {
                            const id = draftTargetForCategory(k);
                            if (!id) return;
                            await linkCategoryToBudget(k, id);
                          }}>연결</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="divider" />
            <h2 style={{ marginTop: 0 }}>카테고리 매핑</h2>
            {Object.keys(categoryBudgetMap).length === 0 ? (
              <p className="muted">아직 매핑이 없어.</p>
            ) : (
              <div className="table-scroll">
                <table className="tight-table">
                  <thead>
                    <tr>
                      <th>카테고리</th>
                      <th>예산 항목</th>
                      <th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(categoryBudgetMap).map(([cat, id]) => {
                      const it = editItems.find(x => x.id === id);
                      if (!it) return null;
                      return (
                        <tr key={cat}>
                          <td>{cat}</td>
                          <td>{it.name}</td>
                          <td className="right">
                            <button className="btn danger" onClick={async () => { await unlinkCategory(cat); }}>해제</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card budget-card" style={{ boxShadow: 'none' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>예산대비 현황({yearCursor}년)</h2>
              <div className="mono">{fmt.format(yearKpi.expense)}원 / {fmt.format(yearBudgetTotal)}원</div>
            </div>

            <div className="divider" />
            <div className="muted small">연도는 상단 ‘연간’ 선택(◀/▶)을 따라가.</div>
            <div className="divider" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {editItems.map(it => {
                const bud = yearCapFor(it);
                const act = yearActualFor(it);
                const pct = bud === 0 ? 0 : Math.round((act / bud) * 100);
                const cls = pct >= 100 ? 'bad' : (pct >= 80 ? 'warn' : 'good');
                const w = Math.min(100, Math.max(0, pct));
                return (
                  <div key={it.id} className="budgetbar">
                    <div className={'fill ' + (cls === 'bad' ? 'bad' : cls === 'warn' ? 'warn' : '')} style={{ width: w + '%' }} />
                    <div className="content">
                      <div className="left"><span className="catIcon" aria-hidden>{iconForBudgetItem(it.kind)}</span>{it.name}</div>
                      <div className="right">
                        <div className="top">{fmt.format(act)} / {fmt.format(bud)}원</div>
                        <div className="bottom">소진율 {pct}%</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="divider" />
            <h2 style={{ marginTop: 0 }}>미분류({yearCursor}년)</h2>
            {actual.yearUnmapped.size === 0 ? <p className="muted">없음</p> : (
              <div className="table-scroll">
                <table className="tight-table">
                  <thead>
                    <tr>
                      <th>카테고리</th>
                      <th className="right">실적</th>
                      <th style={{ width: 220 }}>예산 항목 연결</th>
                      <th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(actual.yearUnmapped.entries()).sort((a,b)=>b[1]-a[1]).map(([k,v]) => (
                      <tr key={k}>
                        <td><span className="catIcon" aria-hidden>{iconForCategoryPath(k)}</span>{k}</td>
                        <td className="right mono">{fmt.format(v)}원</td>
                        <td>
                          {editItems.length === 0 ? (
                            <span className="muted small">예산 항목이 없어</span>
                          ) : (
                            <select value={draftTargetForCategory(k)} onChange={e => setMapDraft(p => ({ ...p, [k]: e.target.value }))}>
                              {editItems.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="right">
                          <button className="btn" disabled={editItems.length === 0} onClick={async () => {
                            const id = draftTargetForCategory(k);
                            if (!id) return;
                            await linkCategoryToBudget(k, id);
                          }}>연결</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="divider" />

        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>최근 거래(월)</h2>
          <div className="row">
            <button className="btn" onClick={() => setAllOpen(true)}>전체 내역</button>
            <button className="btn danger" onClick={deleteChecked} disabled={checked.size === 0}>선택 삭제</button>
          </div>
        </div>

        <div className="divider" />

        {recentTx.length === 0 ? <p className="muted">거래가 없어.</p> : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 44 }}><input type="checkbox" checked={checkedAll} onChange={() => {
                    if (checkedAll) setChecked(new Set());
                    else setChecked(new Set(recentTx.map(t => t.id)));
                  }} /></th>
                  <th style={{ width: 110 }}>날짜</th>
                  <th style={{ width: 180 }}>결제수단</th>
                  <th style={{ width: 220 }}>카테고리</th>
                  <th>메모</th>
                  <th className="right" style={{ width: 140 }}>금액</th>
                  <th style={{ width: 220 }}></th>
                </tr>
              </thead>
              <tbody>
                {recentTx.map(t => {
                  const card = app.cards.find(c => c.id === t.cardId);
                  const isEditing = !!editing[t.id];
                  const d = editing[t.id];
                  return (
                    <tr key={t.id}>
                      <td><input type="checkbox" checked={checked.has(t.id)} onChange={() => toggle(t.id)} /></td>
                      <td className="mono">{t.date}</td>
                      <td>{isEditing ? (
                        <select value={d.cardId} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], cardId: e.target.value } }))}>
                          {app.cards.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      ) : (card?.name ?? '(삭제됨)')}</td>
                      <td>{isEditing ? (
                        <select value={d.category} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], category: e.target.value } }))}>
                          {app.categories.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      ) : t.category}</td>
                      <td className="muted">{isEditing ? (
                        <input value={d.memo} onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], memo: e.target.value } }))} />
                      ) : t.memo}</td>
                      <td className="right mono">{isEditing ? (
                        <input value={d.amount} inputMode="numeric" onChange={e => setEditing(p => ({ ...p, [t.id]: { ...p[t.id], amount: e.target.value } }))} />
                      ) : fmt.format(t.amount) + '원'}</td>
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

      <BulkEntryModal open={bulkOpen} onClose={() => setBulkOpen(false)} initialDate={selectedDay} />
      <TransactionsManagerModal open={allOpen} onClose={() => setAllOpen(false)} defaultYm={monthCursor} />
    </div>
  );
}
