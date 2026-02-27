import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../app/AppContext';
import { parseYMD, addMonthsUTC } from '../domain/date';
import { CATEGORIES, CATEGORY_MAP } from '../domain/categories';
import { resolveColor, resolveIcon } from '../domain/categoryMeta';
import { useIsMobile } from '../app/useMedia';

const fmt = new Intl.NumberFormat('ko-KR');

function monthLabel(y: number, m: number) { return `${y}.${String(m).padStart(2, '0')}`; }

/* ──── Day-of-week Chart ──── */
const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function DayOfWeekChart({ data }: { data: { day: string; avg: number; total: number }[] }) {
  const maxVal = Math.max(...data.map(d => d.avg), 1);
  const vW = 560, vH = 220, padL = 30, padR = 16, padT = 20, padB = 44;
  const chartW = vW - padL - padR, chartH = vH - padT - padB;
  const barW = Math.min(chartW / 7 * 0.55, 48);
  const groupW = chartW / 7;
  const maxDay = data.reduce((a, b) => b.avg > a.avg ? b : a, data[0])?.day ?? '';

  return (
    <div>
      <svg viewBox={`0 0 ${vW} ${vH}`} style={{ width: '100%', maxWidth: 560, height: 'auto', display: 'block' }}>
        {[0, 0.5, 1].map(p => {
          const y = padT + chartH * (1 - p);
          return <line key={p} x1={padL} y1={y} x2={vW - padR} y2={y} stroke="rgba(255,255,255,.07)" strokeWidth="1" />;
        })}
        {data.map((d, i) => {
          const cx = padL + (i + 0.5) * groupW;
          const h = Math.max((d.avg / maxVal) * chartH, 2);
          const isMax = d.day === maxDay;
          return (
            <g key={i}>
              <rect x={cx - barW / 2} y={padT + chartH - h} width={barW} height={h}
                fill={isMax ? '#f87171' : 'rgba(96,165,250,.60)'} rx="5" opacity="0.9">
                <title>{d.day}요일: 평균 {fmt.format(d.avg)}원 ({d.total > 0 ? `합계 ${fmt.format(d.total)}원` : '데이터 없음'})</title>
              </rect>
              <text x={cx} y={vH - padB + 18} textAnchor="middle" fill="rgba(255,255,255,.60)" fontSize="13" fontFamily="monospace">{d.day}</text>
              {d.avg > 0 && (
                <text x={cx} y={padT + chartH - h - 5} textAnchor="middle" fill="rgba(255,255,255,.45)" fontSize="10" fontFamily="monospace">
                  {(d.avg / 10000).toFixed(0)}만
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {maxDay && <div className="muted small" style={{ marginTop: 6 }}>가장 많이 지출하는 요일: <strong style={{ color: '#f87171' }}>{maxDay}요일</strong></div>}
    </div>
  );
}

/* ──── Spending Heatmap ──── */
function SpendingHeatmap({ year, month, dayExpense }: { year: number; month: number; dayExpense: Map<string, number> }) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const maxExp = Math.max(...Array.from(dayExpense.values()), 1);

  function heatColor(exp: number): string {
    if (exp === 0) return 'rgba(255,255,255,.04)';
    const ratio = exp / maxExp;
    if (ratio < 0.25) return 'rgba(96,165,250,.25)';
    if (ratio < 0.5)  return 'rgba(96,165,250,.50)';
    if (ratio < 0.75) return 'rgba(251,146,60,.60)';
    return 'rgba(248,113,113,.80)';
  }

  const cells: React.ReactNode[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(<div key={'e' + i} className="heatmap-cell" style={{ background: 'transparent' }} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const exp = dayExpense.get(dateStr) ?? 0;
    cells.push(
      <div key={d} className="heatmap-cell" style={{ background: heatColor(exp) }} title={`${d}일: ${fmt.format(exp)}원`}>
        {d}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 6 }}>
        {DOW_LABELS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', padding: '2px 0' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {cells}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
        {[
          { label: '없음', color: 'rgba(255,255,255,.04)' },
          { label: '적음', color: 'rgba(96,165,250,.25)' },
          { label: '보통', color: 'rgba(96,165,250,.50)' },
          { label: '많음', color: 'rgba(251,146,60,.60)' },
          { label: '매우 많음', color: 'rgba(248,113,113,.80)' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, background: color, border: '1px solid var(--line)' }} />
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const meta = app.categoryMeta;
  const isMobile = useIsMobile(520);
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
      if (t.excludeFromBudget) continue;
      if (t.category.startsWith('이체/')) continue;
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
      // name은 catDef.name (leaf)이므로 fullPath를 역으로 찾아야 함
      const catDef = CATEGORIES.find(c => c.name === name);
      const color = catDef ? resolveColor(catDef.fullPath, meta) : '#777';
      return { name, amount, color };
    }).sort((a, b) => b.amount - a.amount);
  }, [monthlyData, meta]);

  const [selectedMonth, setSelectedMonth] = useState(now.getUTCMonth() + 1);
  const monthCatBreakdown = useMemo(() => {
    const m = monthlyData.find(mo => mo.y === yearCursor && mo.m === selectedMonth);
    if (!m) return [];
    return Array.from(m.byCategory.entries()).map(([name, amount]) => {
      const catDef = CATEGORIES.find(c => c.name === name);
      const color = catDef ? resolveColor(catDef.fullPath, meta) : '#777';
      return { name, amount, color };
    }).sort((a, b) => b.amount - a.amount);
  }, [monthlyData, yearCursor, selectedMonth, meta]);

  const topCategories = useMemo(() => {
    const map = new Map<string, { total: number; count: number; months: Set<string> }>();
    for (const t of app.tx) {
      const dt = parseYMD(t.date);
      if (!dt) continue;
      const ty = dt.getUTCFullYear(), tm = dt.getUTCMonth() + 1;
      const tYm = ty * 100 + tm, sYm = startYm.y * 100 + startYm.m, eYm = endYm.y * 100 + endYm.m;
      if (tYm < sYm || tYm > eYm) continue;
      if (t.amount <= 0) continue;
      if (t.excludeFromBudget) continue;
      if (t.category.startsWith('이체/')) continue;
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

  // 요일별 지출 패턴 (전체 기간)
  const dowData = useMemo(() => {
    const byDow: { total: number; count: number }[] = Array.from({ length: 7 }, () => ({ total: 0, count: 0 }));
    for (const t of app.tx) {
      if (t.amount <= 0) continue;
      const dt = parseYMD(t.date);
      if (!dt) continue;
      const ty = dt.getUTCFullYear(), tm = dt.getUTCMonth() + 1;
      const tYm = ty * 100 + tm, sYm = startYm.y * 100 + startYm.m, eYm = endYm.y * 100 + endYm.m;
      if (tYm < sYm || tYm > eYm) continue;
      const card = app.cards.find(c => c.id === t.cardId);
      if (card?.type === 'transfer_nonspend') continue;
      if (t.category.startsWith('이체/비지출')) continue;
      const dow = dt.getUTCDay(); // 0=일
      byDow[dow].total += t.amount;
      byDow[dow].count += 1;
    }
    return DOW_LABELS.map((label, i) => {
      const { total, count } = byDow[i];
      return { day: label, total, avg: count > 0 ? Math.round(total / count) : 0 };
    });
  }, [app.tx, app.cards, startYm, endYm]);

  // 월별 일별 지출 히트맵 (선택 월)
  const [heatmapMonth, setHeatmapMonth] = useState(now.getUTCMonth() + 1);
  const [heatmapYear, setHeatmapYear] = useState(now.getUTCFullYear());
  const heatmapDayExpense = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of app.tx) {
      if (t.amount <= 0) continue;
      const dt = parseYMD(t.date);
      if (!dt) continue;
      if (dt.getUTCFullYear() !== heatmapYear || (dt.getUTCMonth() + 1) !== heatmapMonth) continue;
      if (t.category.startsWith('이체/비지출')) continue;
      const card = app.cards.find(c => c.id === t.cardId);
      if (card?.type === 'transfer_nonspend') continue;
      map.set(t.date, (map.get(t.date) ?? 0) + t.amount);
    }
    return map;
  }, [app.tx, app.cards, heatmapYear, heatmapMonth]);

  // 고정 지출 감지 (3개월 이상 동일 카테고리 반복)
  const recurringExpenses = useMemo(() => {
    const catMonths = new Map<string, { months: Set<string>; total: number; amounts: number[] }>();
    for (const t of app.tx) {
      if (t.amount <= 0) continue;
      const dt = parseYMD(t.date);
      if (!dt) continue;
      if (t.category.startsWith('이체/비지출')) continue;
      const card = app.cards.find(c => c.id === t.cardId);
      if (card?.type === 'transfer_nonspend') continue;
      const monthKey = `${dt.getUTCFullYear()}-${dt.getUTCMonth()}`;
      const rec = catMonths.get(t.category) ?? { months: new Set(), total: 0, amounts: [] };
      rec.months.add(monthKey);
      rec.total += t.amount;
      rec.amounts.push(t.amount);
      catMonths.set(t.category, rec);
    }
    return Array.from(catMonths.entries())
      .filter(([, r]) => r.months.size >= 3)
      .map(([cat, r]) => ({
        category: cat,
        icon: resolveIcon(cat, meta),
        monthCount: r.months.size,
        avgAmount: Math.round(r.total / r.months.size),
        lastAmount: r.amounts[r.amounts.length - 1],
      }))
      .sort((a, b) => b.avgAmount - a.avgAmount);
  }, [app.tx, app.cards, meta]);

  // 인사이트: 이번 달 vs 지난달
  const insightData = useMemo(() => {
    const thisM = monthlyData.find(m => m.y === now.getUTCFullYear() && m.m === (now.getUTCMonth() + 1));
    const lastM = monthlyData.find(m => {
      const prev = addMonthsUTC({ y: now.getUTCFullYear(), m: now.getUTCMonth() + 1 }, -1);
      return m.y === prev.y && m.m === prev.m;
    });
    const topCat = topCategories[0];
    const budgetTotal = (app.settings?.budgetItems ?? []).reduce((s, it) => s + (it.monthCap || 0), 0);
    const thisExpense = thisM?.expense ?? 0;
    const lastExpense = lastM?.expense ?? 0;
    const pct = lastExpense > 0 ? Math.round(((thisExpense - lastExpense) / lastExpense) * 100) : null;
    return { thisExpense, lastExpense, pct, topCat, budgetTotal, budgetRemain: budgetTotal - thisExpense };
  }, [monthlyData, topCategories, app.settings]);

  const rangeLabel = customRange
    ? `${customRange.fromY}.${String(customRange.fromM).padStart(2, '0')} ~ ${customRange.toY}.${String(customRange.toM).padStart(2, '0')}`
    : `${yearCursor}년`;

  return (
    <div className="container">
      <div className="card">
        {/* Header */}
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            {isMobile && <Link to="/" className="btn" style={{ textDecoration: 'none', padding: '8px 10px' }}>← 홈</Link>}
            <h2 style={{ margin: 0 }}>📊 분석/통계</h2>
          </div>
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

        {/* ── 인사이트 카드 ── */}
        <div className="insight-row">
          <div className="insight-card">
            <div className="ic-label">이번 달 지출</div>
            <div className="ic-value">{(insightData.thisExpense / 10000).toFixed(0)}만원</div>
            {insightData.pct !== null && (
              <div className="ic-sub" style={{ color: insightData.pct > 0 ? 'var(--bad)' : 'var(--good)' }}>
                {insightData.pct > 0 ? `↑ ${insightData.pct}%` : `↓ ${Math.abs(insightData.pct)}%`} vs 지난달
              </div>
            )}
          </div>
          {insightData.topCat && (
            <div className="insight-card">
              <div className="ic-label">최다 지출 카테고리</div>
              <div className="ic-value" style={{ fontSize: 15 }}>{insightData.topCat.category}</div>
              <div className="ic-sub">{fmt.format(insightData.topCat.total)}원</div>
            </div>
          )}
          {insightData.budgetTotal > 0 && (
            <div className="insight-card">
              <div className="ic-label">예산 잔여</div>
              <div className="ic-value" style={{ color: insightData.budgetRemain >= 0 ? 'var(--good)' : 'var(--bad)' }}>
                {insightData.budgetRemain >= 0 ? '+' : ''}{(insightData.budgetRemain / 10000).toFixed(0)}만원
              </div>
              <div className="ic-sub">{insightData.budgetRemain >= 0 ? '예산 내 지출 중' : '예산 초과!'}</div>
            </div>
          )}
        </div>

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
        {topCategories.length === 0 ? <p className="muted">데이터 없음</p> : isMobile ? (
          <div className="txcard-list">
            {topCategories.map((c, idx) => {
              const pct = totals.expense > 0 ? ((c.total / totals.expense) * 100).toFixed(1) : '0';
              return (
                <div key={c.category} className="txcard">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        <span className="muted small" style={{ marginRight: 6 }}>#{idx + 1}</span>
                        {c.category}
                      </div>
                      <div className="muted small" style={{ marginTop: 3 }}>{c.count}건 · 월평균 {fmt.format(c.avgMonth)}원</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{fmt.format(c.total)}원</div>
                      <span className="pill mono" style={{ marginTop: 4, display: 'inline-block' }}>{pct}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
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

        {/* ── 요일별 지출 패턴 ── */}
        <div className="divider" />
        <h2 style={{ marginTop: 0 }}>📅 요일별 지출 패턴</h2>
        <DayOfWeekChart data={dowData} />

        {/* ── 일별 지출 히트맵 ── */}
        <div className="divider" />
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>🗓️ 일별 지출 달력</h2>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn" onClick={() => {
              const d = new Date(Date.UTC(heatmapYear, heatmapMonth - 2, 1));
              setHeatmapYear(d.getUTCFullYear()); setHeatmapMonth(d.getUTCMonth() + 1);
            }}>◀</button>
            <div className="mono" style={{ padding: '0 8px', fontSize: 16 }}>{heatmapYear}년 {heatmapMonth}월</div>
            <button className="btn" onClick={() => {
              const d = new Date(Date.UTC(heatmapYear, heatmapMonth, 1));
              setHeatmapYear(d.getUTCFullYear()); setHeatmapMonth(d.getUTCMonth() + 1);
            }}>▶</button>
          </div>
        </div>
        <SpendingHeatmap year={heatmapYear} month={heatmapMonth} dayExpense={heatmapDayExpense} />

        {/* ── 고정 지출 감지 ── */}
        {recurringExpenses.length > 0 && <>
          <div className="divider" />
          <h2 style={{ marginTop: 0 }}>🔁 고정 지출로 보이는 항목</h2>
          <div className="muted small" style={{ marginBottom: 10 }}>3개월 이상 반복 지출된 카테고리야.</div>
          {isMobile ? (
            <div className="txcard-list">
              {recurringExpenses.slice(0, 10).map(r => (
                <div key={r.category} className="txcard">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}><span className="catIcon">{r.icon}</span>{r.category}</div>
                      <div className="muted small">{r.monthCount}개월 반복</div>
                    </div>
                    <div className="right">
                      <div className="mono" style={{ fontWeight: 700 }}>월평균 {fmt.format(r.avgAmount)}원</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="table-scroll">
              <table className="tight-table">
                <thead><tr>
                  <th>카테고리</th><th className="right">반복 개월</th><th className="right">월평균</th><th className="right">최근 금액</th>
                </tr></thead>
                <tbody>
                  {recurringExpenses.slice(0, 15).map(r => (
                    <tr key={r.category}>
                      <td><span className="catIcon">{r.icon}</span>{r.category}</td>
                      <td className="right mono">{r.monthCount}개월</td>
                      <td className="right mono">{fmt.format(r.avgAmount)}원</td>
                      <td className="right mono">{fmt.format(r.lastAmount)}원</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>}
      </div>
    </div>
  );
}
