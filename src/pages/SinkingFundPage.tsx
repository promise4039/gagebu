import React, { useMemo } from 'react';
import { useApp } from '../app/AppContext';

const fmt = new Intl.NumberFormat('ko-KR');

// ── Sinking Fund 항목 정의 (CLAUDE.md 기준) ─────────────────────────
type FundItem = {
  id: string;
  icon: string;
  name: string;
  monthlyAmount: number;  // 월 적립액
  annualTarget: number;   // 연간 목표 지출
  paymentNote: string;    // 납부 시기 메모
};

const FUND_ITEMS: FundItem[] = [
  { id: 'car_insurance', icon: '🚗', name: '자동차보험',     monthlyAmount: 58333,  annualTarget: 700000,  paymentNote: '9월 납부' },
  { id: 'rent',          icon: '🏡', name: '집세(영농회)',   monthlyAmount: 166667, annualTarget: 2000000, paymentNote: '10월 납부' },
  { id: 'supplement',    icon: '💊', name: '보충제',         monthlyAmount: 82500,  annualTarget: 990000,  paymentNote: '수시 구매' },
  { id: 'hair_loss',     icon: '💊', name: '탈모약',         monthlyAmount: 50000,  annualTarget: 200000,  paymentNote: '3개월마다' },
  { id: 'boiler',        icon: '🔥', name: '보일러',         monthlyAmount: 83333,  annualTarget: 1000000, paymentNote: '11~3월 사용' },
  { id: 'car_repair',    icon: '🔧', name: '차량 정비 예비비', monthlyAmount: 50000,  annualTarget: 600000,  paymentNote: '비정기' },
];

const TOTAL_MONTHLY = FUND_ITEMS.reduce((s, f) => s + f.monthlyAmount, 0); // 491,000

// 2026년 1월 기준으로 경과 개월 수 계산
function getElapsedMonths(): number {
  const start = new Date(2026, 0, 1); // 2026-01-01
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
  return Math.max(1, months);
}

export function SinkingFundPage() {
  const app = useApp();

  // 카카오뱅크 잔액 (실제 적립 총액)
  const kakaoBalance = useMemo(() => {
    const kakao = app.cards.find(c => c.name === '카카오뱅크');
    return kakao?.balance ?? null;
  }, [app.cards]);

  const elapsed = useMemo(() => getElapsedMonths(), []);

  return (
    <div className="container" style={{ paddingBottom: 32 }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700 }}>🏦 Sinking Fund</h2>
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>카카오뱅크 세이프박스 · 월 {fmt.format(TOTAL_MONTHLY)}원 적립</div>
      </div>

      {/* 총 적립 현황 카드 */}
      <div style={{
        background: 'var(--surface)',
        borderRadius: 14,
        padding: '16px 18px',
        marginBottom: 20,
        display: 'flex',
        gap: 0,
        flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>이론상 적립액 ({elapsed}개월)</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)' }}>
              {fmt.format(TOTAL_MONTHLY * elapsed)}원
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 2 }}>카카오뱅크 잔액</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: kakaoBalance != null ? 'var(--good)' : 'var(--muted)' }}>
              {kakaoBalance != null ? fmt.format(kakaoBalance) + '원' : '미입력'}
            </div>
          </div>
        </div>
        {kakaoBalance != null && (
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            이론 대비 {kakaoBalance >= TOTAL_MONTHLY * elapsed ? '▲ 초과' : '▼ 부족'}{' '}
            <span style={{ color: kakaoBalance >= TOTAL_MONTHLY * elapsed ? 'var(--good)' : 'var(--bad)', fontWeight: 600 }}>
              {fmt.format(Math.abs(kakaoBalance - TOTAL_MONTHLY * elapsed))}원
            </span>
          </div>
        )}
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
          * 이론값은 2026년 1월부터 {elapsed}개월 적립 기준
        </div>
      </div>

      {/* 항목별 카드 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FUND_ITEMS.map(item => {
          const accumulated = item.monthlyAmount * elapsed;
          const pct = Math.min(100, Math.round((accumulated / item.annualTarget) * 100));
          const isOver = pct >= 100;

          return (
            <div key={item.id} style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: '14px 16px',
            }}>
              {/* 항목 헤더 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 22 }}>{item.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{item.paymentNote}</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isOver ? 'var(--good)' : 'var(--accent)' }}>
                    {fmt.format(accumulated)}원
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>/ {fmt.format(item.annualTarget)}원</div>
                </div>
              </div>

              {/* 프로그레스 바 */}
              <div style={{
                height: 6,
                background: 'rgba(255,255,255,0.08)',
                borderRadius: 3,
                overflow: 'hidden',
                marginBottom: 6,
              }}>
                <div style={{
                  height: '100%',
                  width: pct + '%',
                  background: isOver ? 'var(--good)' : 'var(--accent)',
                  borderRadius: 3,
                  transition: 'width 0.4s ease',
                }} />
              </div>

              {/* 하단 정보 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
                <span>월 {fmt.format(item.monthlyAmount)}원 적립</span>
                <span style={{ color: isOver ? 'var(--good)' : undefined }}>{pct}% 달성</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 안내 문구 */}
      <div style={{
        marginTop: 20,
        padding: '12px 14px',
        background: 'rgba(108,159,255,0.08)',
        borderRadius: 10,
        fontSize: 12,
        color: 'var(--muted)',
        lineHeight: 1.6,
      }}>
        💡 카카오뱅크 잔액은 계좌/카드 탭에서 직접 입력하면 이 화면에 반영됩니다.
      </div>
    </div>
  );
}
