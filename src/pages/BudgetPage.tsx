import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { parseYMD } from '../domain/date';

const fmt = new Intl.NumberFormat('ko-KR');

const DEFAULT_BUCKETS: Record<string, number> = {
    '주유': 220000,
    '마트': 170000,
    '외식+편의점': 50000,
    '온라인쇼핑': 30000,
    '이체(소비성)': 70000,
    '생활기타': 50000,
    '예비비': 37268,
  };


function ymKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2,'0')}`;
}

function bucketForCategory(category: string): string | null {
  // 간단 매핑(필요하면 나중에 규칙 편집 UI로 확장)
  if (category.startsWith('교통/주유')) return '주유';
  if (category.startsWith('마트/')) return '마트';
  if (category.startsWith('식비/')) return '외식+편의점';
  if (category.startsWith('쇼핑/')) return '온라인쇼핑';
  if (category.startsWith('생활/')) return '생활기타';
  if (category.startsWith('이체/')) return '이체(소비성)'; // 비지출은 별도 제외 처리
  return null;
}

export function BudgetPage() {
  const app = useApp();
  const settings = app.settings!;
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { y: now.getUTCFullYear(), m: now.getUTCMonth()+1 };
  });

  const buckets = (settings.budgetBuckets && Object.keys(settings.budgetBuckets).length ? settings.budgetBuckets : {});
  const bucketNames = Object.keys(buckets);

  const monthAgg = useMemo(() => {
    const y = cursor.y;
    const m = cursor.m;

    const byBucket = new Map<string, number>();
    const unmapped = new Map<string, number>();
    let total = 0;

    for (const t of app.tx) {
      const dt = parseYMD(t.date);
      if (!dt) continue;
      if (dt.getUTCFullYear() !== y || (dt.getUTCMonth()+1) !== m) continue;

      // 비지출 이체 제외
      if (t.category.startsWith('이체/비지출')) continue;
      const card = app.cards.find(c => c.id === t.cardId);
      if (card?.type === 'transfer_nonspend') continue;

      if (t.amount > 0) total += t.amount;

      const b = bucketForCategory(t.category);
      if (b && buckets[b] !== undefined) {
        byBucket.set(b, (byBucket.get(b) ?? 0) + Math.max(0, t.amount));
      } else {
        unmapped.set(t.category, (unmapped.get(t.category) ?? 0) + Math.max(0, t.amount));
      }
    }

    // ensure all buckets present
    for (const b of bucketNames) {
      if (!byBucket.has(b)) byBucket.set(b, 0);
    }

    return { total, byBucket, unmapped };
  }, [app.tx, app.cards, cursor, bucketNames.join('|'), JSON.stringify(buckets)]);

  const totalBudget = useMemo(() => bucketNames.reduce((s, k) => s + (buckets[k] ?? 0), 0), [bucketNames.join('|'), JSON.stringify(buckets)]);
  const remain = totalBudget - monthAgg.total;

  const [editBuckets, setEditBuckets] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const k of bucketNames) o[k] = String(buckets[k] ?? 0);
    return o;
  });

  React.useEffect(() => {
    const o: Record<string, string> = {};
    for (const k of bucketNames) o[k] = String(buckets[k] ?? 0);
    setEditBuckets(o);
  }, [bucketNames.join('|'), JSON.stringify(buckets)]);

  async function saveBuckets() {
    const next: Record<string, number> = {};
    for (const k of bucketNames) {
      const v = Number(String(editBuckets[k] ?? '0').replaceAll(',','').trim());
      next[k] = Number.isFinite(v) ? v : 0;
    }
    const nextSettings = { ...settings, budgetBuckets: next };
    await app.updateSettings(nextSettings);
    alert('예산(버킷)을 저장했어.');
  }

  return (
    <div className="container">
      <div className="grid">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>예산 대비 실적</h2>
            <div className="row">
              <button className="btn" onClick={() => setCursor(p => {
                const d = new Date(Date.UTC(p.y, p.m-2, 1));
                return { y: d.getUTCFullYear(), m: d.getUTCMonth()+1 };
              })}>◀</button>
              <div className="mono" style={{ fontSize: 16, padding: '0 6px' }}>{ymKey(cursor.y, cursor.m)}</div>
              <button className="btn" onClick={() => setCursor(p => {
                const d = new Date(Date.UTC(p.y, p.m, 1));
                return { y: d.getUTCFullYear(), m: d.getUTCMonth()+1 };
              })}>▶</button>
            </div>
          </div>

          <div className="divider" />

          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <div className="muted small">월 예산 합계</div>
              <div className="mono" style={{ fontSize: 22 }}>{fmt.format(totalBudget)}원</div>
            </div>
            <div className="right">
              <div className="muted small">월 실적 합계</div>
              <div className="mono" style={{ fontSize: 22 }}>{fmt.format(monthAgg.total)}원</div>
            </div>
            <div className="right">
              <div className="muted small">남은 예산</div>
              <div className="mono" style={{ fontSize: 22 }}>{fmt.format(remain)}원</div>
            </div>
          </div>

          <div className="divider" />

          <table>
            <thead>
              <tr>
                <th>버킷</th>
                <th className="right">예산</th>
                <th className="right">실적</th>
                <th className="right">잔액</th>
                <th className="right">소진율</th>
              </tr>
            </thead>
            <tbody>
              {bucketNames.map(b => {
                const bud = buckets[b] ?? 0;
                const act = monthAgg.byBucket.get(b) ?? 0;
                const rem = bud - act;
                const pct = bud === 0 ? 0 : Math.round((act / bud) * 100);
                const cls = pct >= 100 ? 'bad' : (pct >= 80 ? 'warn' : 'good');
                return (
                  <tr key={b}>
                    <td>{b}</td>
                    <td className="right mono">{fmt.format(bud)}원</td>
                    <td className="right mono">{fmt.format(act)}원</td>
                    <td className="right mono">{fmt.format(rem)}원</td>
                    <td className="right"><span className={'pill ' + cls + ' mono'}>{pct}%</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="divider" />

          <div className="notice">
            이 페이지는 “거래일 기준”으로 실적을 잡아. (비지출 이체는 제외) <br />
            버킷 매핑은 현재 기본 규칙(카테고리 접두어)로 되어 있고, 필요하면 “매핑 편집 UI”로 확장할 수 있어.
          </div>
        </div>

        <div className="card">
          <h2>월 예산(버킷) 편집</h2>
          <div className="muted small" style={{ marginTop: 0 }}>
            네가 전에 분석했던 월 예산을 그대로 넣어두었어. 필요하면 여기서 수정하면 돼.
          </div>
          <div className="divider" />

          {bucketNames.length === 0 ? (
            <div className="notice">
              현재 버킷 예산이 비어 있어. 아래 버튼으로 기본 예산을 불러올 수 있어.
              <div className="divider" />
              <button className="btn primary" onClick={async () => {
                const nextSettings = { ...settings, budgetBuckets: DEFAULT_BUCKETS };
                await app.updateSettings(nextSettings);
              }}>기본 예산 불러오기</button>
            </div>
          ) : (
            <div className="form">
              {bucketNames.map(b => (
                <label key={b}>{b}
                  <input value={editBuckets[b] ?? ''} onChange={e => setEditBuckets(prev => ({ ...prev, [b]: e.target.value }))} inputMode="numeric" />
                </label>
              ))}
            </div>
          )}

          <div className="divider" />
          <div className="row">
            <button className="btn primary" onClick={saveBuckets}>저장</button>
          </div>

          <div className="divider" />

          <h2 style={{ marginTop: 0 }}>미배정(매핑 안된 카테고리)</h2>
          {monthAgg.unmapped.size === 0 ? (
            <p className="muted">없음</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>카테고리</th>
                  <th className="right">실적</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(monthAgg.unmapped.entries()).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).map(([cat, val]) => (
                  <tr key={cat}>
                    <td>{cat}</td>
                    <td className="right mono">{fmt.format(val)}원</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
