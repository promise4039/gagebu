import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { parseYMD, addMonthsUTC } from '../domain/date';
import { CATEGORIES, CATEGORY_MAP } from '../domain/categories';

const fmt = new Intl.NumberFormat('ko-KR');

function monthLabel(y: number, m: number) { return `${y}.${String(m).padStart(2, '0')}`; }

/* ──── SVG Bar Chart ──── */
function BarChart({ data }: { data: { label: string; income: number; expense: number }[] }) {
  if (data.length === 0) return <p className="muted">데이터 없음</p>;
  const maxVal = Math.max(...data.flatMap(d => [d.income, d.expense]), 1);
  const count = data.length;
  const vW = 900, vH = 420;
  const padL = 80, padR = 16, padT = 36, padB = 56;
  const chartW = vW - padL - padR, chartH = vH - padT - padB;
  const groupW = chartW / count;
  const barW = Math.min(groupW * 0.34, 32);
  const gap = 3;

  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {[0, 0.25, 0.5, 0.75, 1].map(p => {
        const y = padT + chartH * (1 - p);
        return (<g key={p}>
          <line x1={padL} y1={y} x2={vW - padR} y2={y} stroke="rgba(255,255,255,.08)" strokeWidth="1" />
          <text x={padL - 10} y={y + 5} fill="rgba(255,255,255,.45)" fontSize="12" fontFamily="monospace" textAnchor="end">{(maxVal * p / 10000).toFixed(0)}만</text>
        </g>);
      })}
      {data.map((d, i) => {
        const cx = padL + (i + 0.5) * groupW;
        const hInc = (d.income / maxVal) * chartH, hExp = (d.expense / maxVal) * chartH;
        return (<g key={i}>
          <rect x={cx - barW - gap / 2} y={padT + chartH - hInc} width={barW} height={Math.max(hInc, 1)} fill="#4ade80" rx="3" opacity="0.85"><title>수입: {fmt.format(d.income)}원</title></rect>
          <rect x={cx + gap / 2} y={padT + chartH - hExp} width={barW} height={Math.max(hExp, 1)} fill="#f87171" rx="3" opacity="0.85"><title>지출: {fmt.format(d.expense)}원</title></rect>
          <text x={cx} y={vH - padB + 22} textAnchor="middle" fill="rgba(255,255,255,.55)" fontSize="11" fontFamily="monospace">{d.label.length > 5 ? d.label.slice(2) : d.label}</text>
        </g>);
      })}
      <rect x={vW - 190} y={10} width={14} height={11} fill="#4ade80" rx="2" />
      <text x={vW - 172} y={20} fill="rgba(255,255,255,.6)" fontSize="13">수입</text>
      <rect x={vW - 116} y={10} width={14} height={11} fill="#f87171" rx="2" />
      <text x={vW - 98} y={20} fill="rgba(255,255,255,.6)" fontSize="13">지출</text>
    </svg>
  );
}

/* ──── Category stacked horizontal bar ──── */
function CategoryBar({ items }: { items: { name: string; amount: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  if (total === 0) return <p className="muted">지출 없음</p>;
  return (
    <div>
      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 36 }}>
        {items.map((it, idx) => {
          const pct = (it.amount / total) * 100;
          if (pct < 0.5) return null;
          return (<div key={idx} title={`${it.name}: ${fmt.format(it.amount)}원 (${pct.toFixed(1)}%)`}
            style={{ width: pct + '%', background: it.color, minWidth: pct > 2 ? 4 : 0, transition: 'width .3s' }} />);
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', marginTop: 14 }}>
        {items.filter(it => it.amount > 0).map((it, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 13, height: 13, borderRadius: 3, background: it.color, flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,.78)' }}>
              {it.name} <span className="mono">{fmt.format(it.amount)}</span>원 ({((it.amount / total) * 100).toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──── Net savings sparkline ──── */
function SavingsLine({ data }: { data: { label: string; net: number }[] }) {
  if (data.length < 2) return null;
  const maxAbs = Math.max(...data.map(d => Math.abs(d.net)), 1);
  const vW = 900, vH = 240, padX = 80, padY = 30;
  const chartW = vW - padX * 2, chartH = vH - padY * 2;
  const midY = padY + chartH / 2;
  const points = data.map((d, i) => ({ x: padX + (i / (data.length - 1)) * chartW, y: midY - (d.net / maxAbs) * (chartH / 2), net: d.net }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = path + ` L${points[points.length - 1].x},${midY} L${points[0].x},${midY} Z`;

  return (
    <svg viewBox={`0 0 ${vW} ${vH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={padX} y1={midY} x2={vW - padX} y2={midY} stroke="rgba(255,255,255,.12)" strokeWidth="1" strokeDasharray="4,4" />
      <text x={padX - 12} y={midY + 4} fill="rgba(255,255,255,.35)" fontSize="12" textAnchor="end" fontFamily="monospace">0</text>
      <text x={padX - 12} y={padY + 12} fill="rgba(255,255,255,.3)" fontSize="11" textAnchor="end" fontFamily="monospace">+{(maxAbs / 10000).toFixed(0)}만</text>
      <text x={padX - 12} y={vH - padY - 2} fill="rgba(255,255,255,.3)" fontSize="11" textAnchor="end" fontFamily="monospace">−{(maxAbs / 10000).toFixed(0)}만</text>
      <path d={areaPath} fill="url(#netGrad)" />
      <path d={path} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="5" fill={p.net >= 0 ? '#4ade80' : '#f87171'} stroke="rgba(0,0,0,.3)" strokeWidth="1">
            <title>{data[i].label}: {p.net >= 0 ? '+' : ''}{fmt.format(p.net)}원</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

/* ──── Donut Chart ──── */
function DonutChart({ items }: { items: { name: string; amount: number; color: string }[] }) {
  const total = items.reduce((s, i) => s + i.amount, 0);
  if (total === 0) return null;
  const filtered = items.filter(it => it.amount / total > 0.02);
  const size = 220, cx = size / 2, cy = size / 2, r = 85, inner = 52;
  let angle = -Math.PI / 2;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, display: 'block', margin: '0 auto' }}>
      {filtered.map((it, idx) => {
        const pct = it.amount / total;
        const a1 = angle, a2 = angle + pct * Math.PI * 2;
        angle = a2;
        const large = pct > 0.5 ? 1 : 0;
        const x1o = cx + r * Math.cos(a1), y1o = cy + r * Math.sin(a1);
        const x2o = cx + r * Math.cos(a2), y2o = cy + r * Math.sin(a2);
        const x1i = cx + inner * Math.cos(a2), y1i = cy + inner * Math.sin(a2);
        const x2i = cx + inner * Math.cos(a1), y2i = cy + inner * Math.sin(a1);
        return (<path key={idx} d={`M${x1o},${y1o} A${r},${r} 0 ${large} 1 ${x2o},${y2o} L${x1i},${y1i} A${inner},${inner} 0 ${large} 0 ${x2i},${y2i} Z`}
          fill={it.color} opacity="0.88"><title>{it.name}: {fmt.format(it.amount)}원 ({(pct * 100).toFixed(1)}%)</title></path>);
      })}
      <text x={cx} y={cy - 8} textAnchor="middle" fill="rgba(255,255,255,.6)" fontSize="11">총 지출</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="rgba(255,255,255,.85)" fontSize="15" fontFamily="monospace" fontWeight="bold">{(total / 10000).toFixed(0)}만원</text>
    </svg>
  );
}

/* ──── Main Page ──── */
export function AnalyticsPage() {
  const app = useApp();
  const now = new Date();
  const [yearCursor, setYearCursor] = useState(now.getUTCFullYear());
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [customRange, setCustomRange] = useState<{ fromY: number; fromM: number; toY: number; toM: number } | null>(null);

  const { startYm, endYm, rangeMonths } = useMemo(() => {
    if (customRange) {
      const start = { y: customRange.fromY, m: customRange.fromM };
      const end = { y: customRange.toY, m: customRange.toM };
      const months = (end.y - start.y) * 12 + (end.m - start.m) + 1;
      return { startYm: start, endYm: end, rangeMonths: Math.max(1, months) };
    }
    return { startYm: { y: yearCursor, m: 1 }, endYm: { y: yearCursor, m: 12 }, rangeMonths: 12 };
  }, [yearCursor, customRange]);

  const monthlyData = useMemo(() => {
    const months: { y: number; m: number; label: string; income: number; expense: number; net: number; byCategory: Map<string, number> }[] = [];
    for (let i = 0; i < rangeMonths; i++) {
      const ym = addMonthsUTC(startYm, i);
      months.push({ ...ym, label: monthLabel(ym.y, ym.m), income: 0, expense: 0, net: 0, byCategory: new Map() });
    }
    for (const t of app.tx) {
      const dt = parseYMD(t.date);
      if (!dt) continue;
      const ty = dt.getUTCFullYear(), tm = dt.getUTCMonth() + 1;
      if (t.category === 'transfer' && (t.tags ?? []).some(tag => ['비지출', '저축', '투자'].includes(tag))) continue;
      const catNature = CATEGORY_MAP.get(t.category)?.nature;
      if (catNature === 'transfer') continue;
      const card = app.cards.find(c => c.id === t.cardId);
      if (card?.type === 'transfer_nonspend') continue;
      const mObj = months.find(m => m.y === ty && m.m === tm);
      if (!mObj) continue;
      if (t.amount < 0) { mObj.income += -t.amount; }
      else {
        mObj.expense += t.amount;
        const catDef = CATEGORY_MAP.get(t.category);
        const catName = catDef ? catDef.name : t.category;
        mObj.byCategory.set(catName, (mObj.byCategory.get(catName) ?? 0) + t.amount);
      }
    }
    for (const m of months) m.net = m.income - m.expense;
    return months;
  }, [app.tx, app.cards, startYm, rangeMonths]);

  const totals = useMemo(() => {
    const income = monthlyData.reduce((s, m) => s + m.income, 0);
    const expense = monthlyData.reduce((s, m) => s + m.expense, 0);
    const activeMonths = monthlyData.filter(m => m.income > 0 || m.expense > 0).length || 1;
    return { income, expense, net: income - expense, avgExpense: Math.round(expense / activeMonths) };
  }, [monthlyData]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of monthlyData) { for (const [cat, amt] of m.byCategory) map.set(cat, (map.get(cat) ?? 0) + amt); }
    return Array.from(map.entries()).map(([name, amount]) => {
      const catDef = CATEGORIES.find(c => c.name === name);
      return { name, amount, color: catDef?.colorCode ?? '#777' };
    }).sort((a, b) => b.amount - a.amount);
  }, [monthlyData]);

  const [selectedMonth, setSelectedMonth] = useState(now.getUTCMonth() + 1);
  const monthCatBreakdown = useMemo(() => {
    const m = monthlyData.find(mo => mo.y === yearCursor && mo.m === selectedMonth);
    if (!m) return [];
    return Array.from(m.byCategory.entries()).map(([name, amount]) => {
      const catDef = CATEGORIES.find(c => c.name === name);
      return { name, amount, color: catDef?.colorCode ?? '#777' };
    }).sort((a, b) => b.amount - a.amount);
  }, [monthlyData, yearCursor, selectedMonth]);

  const topCategories = useMemo(() => {
    const map = new Map<string, { total: number; count: number; months: Set<string> }>();
    for (const t of app.tx) {
      const dt = parseYMD(t.date);
      if (!dt) continue;
      const ty = dt.getUTCFullYear(), tm = dt.getUTCMonth() + 1;
      const tYm = ty * 100 + tm, sYm = startYm.y * 100 + startYm.m, eYm = endYm.y * 100 + endYm.m;
      if (tYm < sYm || tYm > eYm) continue;
      if (t.amount <= 0) continue;
      const catNature2 = CATEGORY_MAP.get(t.category)?.nature;
      if (catNature2 === 'transfer') continue;
      const card = app.cards.find(c => c.id === t.cardId);
      if (card?.type === 'transfer_nonspend') continue;
      const catDef = CATEGORY_MAP.get(t.category);
      const catName = catDef ? `${catDef.icon} ${catDef.name}` : t.category;
      const rec = map.get(catName) ?? { total: 0, count: 0, months: new Set<string>() };
      rec.total += t.amount; rec.count += 1; rec.months.add(`${ty}-${tm}`);
      map.set(catName, rec);
    }
    return Array.from(map.entries()).map(([cat, r]) => ({
      category: cat, ...r, avgMonth: r.months.size ? Math.round(r.total / r.months.size) : r.total
    })).sort((a, b) => b.total - a.total).slice(0, 15);
  }, [app.tx, app.cards, startYm, endYm]);

  const rangeLabel = customRange
    ? `${customRange.fromY}.${String(customRange.fromM).padStart(2, '0')} ~ ${customRange.toY}.${String(customRange.toM).padStart(2, '0')}`
    : `${yearCursor}년`;

  return (
    <div className="container">
      <div className="card">
        {/* Header */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>📊 분석/통계</h2>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn" onClick={() => { setYearCursor(y => y - 1); setCustomRange(null); }}>◀</button>
            <div className="mono" style={{
              fontSize: 20, padding: '6px 14px', cursor: 'pointer', borderRadius: 8,
              background: showRangePicker ? 'rgba(96,165,250,.15)' : 'transparent',
              border: '1px solid ' + (showRangePicker ? 'rgba(96,165,250,.3)' : 'rgba(255,255,255,.12)'),
              transition: 'all .2s',
            }} onClick={() => setShowRangePicker(!showRangePicker)}>
              {rangeLabel}
            </div>
            <button className="btn" onClick={() => { setYearCursor(y => y + 1); setCustomRange(null); }}>▶</button>
          </div>
        </div>

        {showRangePicker && (
          <div style={{ marginTop: 12, padding: 14, background: 'rgba(0,0,0,.25)', borderRadius: 12, border: '1px solid var(--line)' }}>
            <div className="muted small" style={{ marginBottom: 8 }}>커스텀 기간 설정</div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <input type="month" defaultValue={customRange ? `${customRange.fromY}-${String(customRange.fromM).padStart(2, '0')}` : `${yearCursor}-01`}
                onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setCustomRange(prev => ({ fromY: y, fromM: m, toY: prev?.toY ?? yearCursor, toM: prev?.toM ?? 12 })); }}
                style={{ width: 160 }} />
              <span className="muted">~</span>
              <input type="month" defaultValue={customRange ? `${customRange.toY}-${String(customRange.toM).padStart(2, '0')}` : `${yearCursor}-12`}
                onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setCustomRange(prev => ({ fromY: prev?.fromY ?? yearCursor, fromM: prev?.fromM ?? 1, toY: y, toM: m })); }}
                style={{ width: 160 }} />
              <button className="btn" onClick={() => { setCustomRange(null); setShowRangePicker(false); }}>연도 기본</button>
              <button className="btn primary" onClick={() => setShowRangePicker(false)}>적용</button>
            </div>
          </div>
        )}

        <div className="divider" />

        {/* KPI */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <div className="card" style={{ boxShadow: 'none', background: 'rgba(20,60,35,.28)' }}>
            <div className="muted small">총 수입</div>
            <div className="mono" style={{ fontSize: 22, marginTop: 4 }}>{fmt.format(totals.income)}원</div>
          </div>
          <div className="card" style={{ boxShadow: 'none', background: 'rgba(70,30,30,.28)' }}>
            <div className="muted small">총 지출</div>
            <div className="mono" style={{ fontSize: 22, marginTop: 4 }}>{fmt.format(totals.expense)}원</div>
          </div>
          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="muted small">잔액</div>
            <div className="mono" style={{ fontSize: 22, marginTop: 4, color: totals.net >= 0 ? '#4ade80' : '#f87171' }}>
              {totals.net >= 0 ? '+' : '−'}{fmt.format(Math.abs(totals.net))}원
            </div>
          </div>
          <div className="card" style={{ boxShadow: 'none' }}>
            <div className="muted small">월평균 지출</div>
            <div className="mono" style={{ fontSize: 22, marginTop: 4 }}>{fmt.format(totals.avgExpense)}원</div>
          </div>
        </div>

        <div className="divider" />
        <h2 style={{ marginTop: 0 }}>📈 월별 수입/지출 추이</h2>
        <BarChart data={monthlyData} />

        <div className="divider" />
        <h2 style={{ marginTop: 0 }}>💰 월별 순저축 추이</h2>
        <SavingsLine data={monthlyData} />

        <div className="divider" />
        <h2 style={{ marginTop: 0 }}>📊 카테고리별 지출 (전체 기간)</h2>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <DonutChart items={categoryBreakdown} />
          <div style={{ flex: 1, minWidth: 280 }}><CategoryBar items={categoryBreakdown} /></div>
        </div>

        <div className="divider" />
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>📊 카테고리별 지출 (월별)</h2>
          <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} style={{ fontSize: 15, padding: '4px 12px' }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
          </select>
        </div>
        <div style={{ marginTop: 14 }}><CategoryBar items={monthCatBreakdown} /></div>

        <div className="divider" />
        <h2 style={{ marginTop: 0 }}>🏆 카테고리별 상세 (Top 15)</h2>
        {topCategories.length === 0 ? <p className="muted">데이터 없음</p> : (
          <div className="table-scroll">
            <table className="tight-table">
              <thead><tr>
                <th style={{ width: 40 }}>#</th><th>카테고리</th><th className="right">합계</th><th className="right">월평균</th><th className="right">건수</th><th className="right">비율</th>
              </tr></thead>
              <tbody>
                {topCategories.map((c, idx) => {
                  const pct = totals.expense > 0 ? ((c.total / totals.expense) * 100).toFixed(1) : '0';
                  return (<tr key={c.category}>
                    <td className="mono muted">{idx + 1}</td><td>{c.category}</td>
                    <td className="right mono">{fmt.format(c.total)}원</td><td className="right mono">{fmt.format(c.avgMonth)}원</td>
                    <td className="right mono">{c.count}</td><td className="right"><span className="pill mono">{pct}%</span></td>
                  </tr>);
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
