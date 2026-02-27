import React, { useState, useEffect } from 'react';
import { useApp } from '../app/AppContext';
import { Tx, TxFeeMode } from '../domain/models';
import { natureOf } from '../domain/categories';
import { resolveDisplayName, resolveIcon } from '../domain/categoryMeta';
import { DrumPickerModal } from './DrumPicker';
import { CategoryPicker } from './CategoryPicker';

const fmt = new Intl.NumberFormat('ko-KR');
const DAY_KO = ['일', '월', '화', '수', '목', '금', '토'];

type Nature = 'expense' | 'income' | 'transfer';
const NATURE_LABEL: Record<Nature, string> = { expense: '지출', income: '수입', transfer: '이체' };

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}
function getNowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatDateKo(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split('-').map(Number);
  const dow = DAY_KO[new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 ${dow}`;
}
function formatTimeKo(s: string): string {
  if (!s) return '(없음)';
  const [h, mn] = s.split(':').map(Number);
  const pm = h >= 12;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${pm ? '오후' : '오전'} ${h12}:${String(mn).padStart(2, '0')}`;
}

// ── FieldRow ──────────────────────────────────────────────────────────────────
function FieldRow({
  icon, label, onClick, children,
}: {
  icon: string; label: string; onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 16px',
        borderBottom: '1px solid var(--line)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span style={{ fontSize: 20, width: 26, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 12, color: 'var(--muted)', width: 56, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, fontSize: 14 }}>{children}</div>
      {onClick && <span style={{ color: 'var(--muted)', fontSize: 18, lineHeight: 1 }}>›</span>}
    </div>
  );
}

// ── ToggleRow ─────────────────────────────────────────────────────────────────
function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '13px 16px', borderBottom: '1px solid var(--line)',
    }}>
      <span style={{ fontSize: 14, color: 'var(--text)' }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{
          width: 48, height: 26, borderRadius: 999, position: 'relative', cursor: 'pointer',
          background: value ? 'rgba(43,213,118,.55)' : 'rgba(255,255,255,.10)',
          border: value ? '1px solid rgba(43,213,118,.7)' : '1px solid var(--line)',
          transition: 'background .2s, border-color .2s',
        }}
      >
        <div style={{
          position: 'absolute', top: 3,
          left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: 999,
          background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,.4)',
          transition: 'left .2s',
        }} />
      </div>
    </div>
  );
}

// ── CardSheet ─────────────────────────────────────────────────────────────────
function CardSheet({ open, cards, value, onSelect, onClose }: {
  open: boolean;
  cards: Array<{ id: string; name: string }>;
  value: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="modal active"
      style={{ alignItems: 'flex-end' }}
      onClick={e => (e.target as HTMLElement).classList.contains('modal') && onClose()}
    >
      <div style={{
        background: 'var(--panel)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: 480, margin: '0 auto',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 32px rgba(0,0,0,.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 16px 8px' }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>결제 수단 선택</span>
          <button className="btn ghost" style={{ fontSize: 13, padding: '4px 12px' }} onClick={onClose}>닫기</button>
        </div>
        <div className="divider" style={{ margin: 0 }} />
        <div style={{ padding: '8px 0' }}>
          {cards.map(c => (
            <div
              key={c.id}
              onClick={() => { onSelect(c.id); onClose(); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 16px', cursor: 'pointer',
                background: value === c.id ? 'rgba(115,125,255,.12)' : 'transparent',
              }}
            >
              <span style={{ fontSize: 20 }}>💳</span>
              <span style={{ flex: 1, fontSize: 15 }}>{c.name}</span>
              {value === c.id && <span style={{ color: 'rgba(115,125,255,.8)' }}>✓</span>}
            </div>
          ))}
          {cards.length === 0 && (
            <div style={{ padding: '20px 16px', color: 'var(--muted)', fontSize: 14, textAlign: 'center' }}>
              등록된 결제 수단이 없어.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Draft type ────────────────────────────────────────────────────────────────
type TxEntryDraft = {
  nature: Nature;
  amountStr: string;
  category: string;
  merchant: string;
  cardId: string;
  date: string;    // YYYY-MM-DD
  time: string;    // HH:mm
  memo: string;
  tags: string;
  installments: number;
  feeMode: TxFeeMode;
  feeRate: string;
  excludeFromBudget: boolean;
  isFixed: boolean;
};

function makeDraft(cardId: string, category: string, date: string): TxEntryDraft {
  return {
    nature: 'expense',
    amountStr: '',
    category,
    merchant: '',
    cardId,
    date,
    time: getNowTimeStr(),
    memo: '',
    tags: '',
    installments: 1,
    feeMode: 'free',
    feeRate: '',
    excludeFromBudget: false,
    isFixed: false,
  };
}

// ── Main export ───────────────────────────────────────────────────────────────
export function BulkEntryModal({ open, onClose, initialDate }: {
  open: boolean;
  onClose: () => void;
  initialDate?: string;
}) {
  const app = useApp();

  const todayStr = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
    ? initialDate
    : getTodayStr();

  const firstExpCat = app.effectiveCategories.find(c => natureOf(c) === 'expense') ?? '기타/기타';
  const firstCardId = app.cards[0]?.id ?? '';

  const [draft, setDraft] = useState<TxEntryDraft>(() => makeDraft(firstCardId, firstExpCat, todayStr));
  const [amountFocused, setAmountFocused] = useState(false);

  const [catOpen, setCatOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const date = initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : getTodayStr();
    const cat = app.effectiveCategories.find(c => natureOf(c) === 'expense') ?? '기타/기타';
    setDraft(makeDraft(app.cards[0]?.id ?? '', cat, date));
    setAmountFocused(false);
    setCatOpen(false);
    setDateOpen(false);
    setTimeOpen(false);
    setCardOpen(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function upd(patch: Partial<TxEntryDraft>) {
    setDraft(prev => ({ ...prev, ...patch }));
  }

  function handleNatureChange(n: Nature) {
    // Switch category to first matching nature if current doesn't match
    const currentNature = natureOf(draft.category);
    if (currentNature === n) { upd({ nature: n }); return; }
    const cat = app.effectiveCategories.find(c => natureOf(c) === n) ?? draft.category;
    upd({ nature: n, category: cat });
  }

  async function handleSave() {
    const rawAmt = Number(String(draft.amountStr).replaceAll(',', '').trim());
    if (!Number.isFinite(rawAmt) || rawAmt === 0) { alert('금액을 입력해줘.'); return; }
    if (!draft.cardId) { alert('결제 수단을 선택해줘.'); return; }
    if (!draft.category) { alert('카테고리를 선택해줘.'); return; }

    const amount = draft.nature === 'income' ? -Math.abs(rawAmt) : Math.abs(rawAmt);
    const feeRate = draft.feeMode === 'manual' ? Number(draft.feeRate.replace(',', '.')) : 0;

    setSaving(true);
    try {
      const tx: Tx = {
        id: 'tx_' + crypto.randomUUID(),
        date: draft.date,
        cardId: draft.cardId,
        category: draft.category,
        categoryId: app.categoryIdByPath[draft.category] ?? undefined,
        amount,
        installments: Math.max(1, draft.installments),
        feeMode: draft.feeMode,
        feeRate,
        memo: draft.memo.trim(),
        tags: draft.tags.split(',').map(x => x.replace('#', '').trim()).filter(Boolean),
        time: draft.time || undefined,
        merchant: draft.merchant.trim() || undefined,
        excludeFromBudget: draft.excludeFromBudget || undefined,
        isFixed: draft.isFixed || undefined,
      };
      await app.upsertTx(tx);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const card = app.cards.find(c => c.id === draft.cardId);
  const catIcon = resolveIcon(draft.category, app.categoryMeta);
  const catName = resolveDisplayName(draft.category, app.categoryMeta);
  const amountNum = Number(String(draft.amountStr).replaceAll(',', '').trim()) || 0;
  const amountDisplay = amountNum ? fmt.format(amountNum) + '원' : '0원';
  const amountColor = draft.nature === 'income'
    ? 'var(--good)'
    : draft.nature === 'transfer'
      ? 'var(--warn)'
      : 'var(--text)';
  const activeCards = app.cards.length > 0 ? app.cards : [];

  return (
    <>
      {/* Main bottom-sheet modal */}
      <div
        className="modal active"
        style={{ alignItems: 'flex-end' }}
        onClick={e => (e.target as HTMLElement).classList.contains('modal') && onClose()}
      >
        <div style={{
          background: 'var(--panel)',
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxWidth: 480,
          margin: '0 auto',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 -8px 32px rgba(0,0,0,.4)',
        }}>
          {/* ── Header ── */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '16px 16px 10px', flexShrink: 0,
          }}>
            <button
              className="btn ghost"
              style={{ width: 38, height: 38, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, borderRadius: 999 }}
              onClick={onClose}
            >✕</button>
            <span style={{ fontWeight: 700, fontSize: 16 }}>{NATURE_LABEL[draft.nature]} 추가</span>
            <div style={{ width: 38 }} />
          </div>

          {/* ── Nature pills ── */}
          <div style={{ display: 'flex', gap: 6, padding: '0 16px 12px', flexShrink: 0 }}>
            {(['expense', 'income', 'transfer'] as Nature[]).map(n => (
              <button
                key={n}
                onClick={() => handleNatureChange(n)}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 999, fontSize: 14, fontWeight: 600,
                  border: draft.nature === n ? '1.5px solid rgba(115,125,255,.55)' : '1px solid var(--line)',
                  background: draft.nature === n ? 'rgba(115,125,255,.18)' : 'rgba(255,255,255,.04)',
                  color: draft.nature === n ? '#b8c0ff' : 'var(--muted)',
                  cursor: 'pointer',
                }}
              >
                {NATURE_LABEL[n]}
              </button>
            ))}
          </div>

          <div className="divider" style={{ margin: '0', flexShrink: 0 }} />

          {/* ── Amount ── */}
          <div
            style={{ padding: '18px 16px', textAlign: 'center', flexShrink: 0, cursor: 'pointer' }}
            onClick={() => !amountFocused && setAmountFocused(true)}
          >
            {amountFocused ? (
              <input
                autoFocus
                value={draft.amountStr}
                onChange={e => upd({ amountStr: e.target.value.replace(/[^0-9]/g, '') })}
                onBlur={() => setAmountFocused(false)}
                inputMode="numeric"
                style={{
                  fontSize: 36, fontWeight: 800, textAlign: 'center',
                  background: 'transparent', border: 'none', outline: 'none',
                  borderBottom: '2px solid rgba(115,125,255,.6)',
                  color: amountColor, width: '100%', padding: '4px 0',
                }}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                <span style={{ fontSize: 36, fontWeight: 800, color: amountColor }}>
                  {amountDisplay}
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 20 }}>✏️</span>
              </div>
            )}
          </div>

          <div className="divider" style={{ margin: '0', flexShrink: 0 }} />

          {/* ── Fields (scrollable) ── */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <FieldRow icon={catIcon} label="카테고리" onClick={() => setCatOpen(true)}>
              <span>{catName}</span>
            </FieldRow>

            <FieldRow icon="🏦" label="거래처">
              <input
                value={draft.merchant}
                onChange={e => upd({ merchant: e.target.value })}
                placeholder="(선택)"
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  padding: 0, width: '100%', color: 'var(--text)', fontSize: 14,
                }}
              />
            </FieldRow>

            <FieldRow icon="💳" label="결제수단" onClick={() => setCardOpen(true)}>
              <span>{card?.name ?? '(선택)'}</span>
            </FieldRow>

            <FieldRow icon="📅" label="날짜" onClick={() => setDateOpen(true)}>
              <span>{formatDateKo(draft.date)}</span>
            </FieldRow>

            <FieldRow icon="⏰" label="시간" onClick={() => setTimeOpen(true)}>
              <span>{formatTimeKo(draft.time)}</span>
            </FieldRow>

            <FieldRow icon="📝" label="메모">
              <input
                value={draft.memo}
                onChange={e => upd({ memo: e.target.value })}
                placeholder="(선택)"
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  padding: 0, width: '100%', color: 'var(--text)', fontSize: 14,
                }}
              />
            </FieldRow>

            <FieldRow icon="🏷️" label="태그">
              <input
                value={draft.tags}
                onChange={e => upd({ tags: e.target.value })}
                placeholder="#점심, #스터디카페"
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  padding: 0, width: '100%', color: 'var(--text)', fontSize: 14,
                }}
              />
            </FieldRow>

            <FieldRow icon="💰" label="할부">
              <select
                value={draft.installments}
                onChange={e => upd({ installments: Number(e.target.value) })}
                onClick={e => e.stopPropagation()}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  padding: 0, color: 'var(--text)', fontSize: 14, cursor: 'pointer', width: 'auto',
                }}
              >
                {[1, 2, 3, 6, 10, 12, 24].map(n => (
                  <option key={n} value={n} style={{ background: 'var(--panel)' }}>
                    {n === 1 ? '일시불' : `${n}개월`}
                  </option>
                ))}
              </select>
            </FieldRow>

            <ToggleRow label="예산에서 제외" value={draft.excludeFromBudget} onChange={v => upd({ excludeFromBudget: v })} />
            <ToggleRow label="고정 지출" value={draft.isFixed} onChange={v => upd({ isFixed: v })} />

            <div style={{ height: 8 }} />
          </div>

          {/* ── Save button ── */}
          <div style={{
            padding: '12px 16px',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            flexShrink: 0,
          }}>
            <button
              disabled={saving}
              onClick={handleSave}
              style={{
                width: '100%', fontSize: 17, fontWeight: 700,
                padding: '15px 0', borderRadius: 14,
                border: '1.5px solid rgba(43,213,118,.5)',
                background: 'rgba(43,213,118,.2)',
                color: '#c8ffe0', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Sub-pickers (rendered after main modal so they stack on top) ── */}
      <CategoryPicker
        open={catOpen}
        nature={draft.nature}
        value={draft.category}
        onSelect={cat => upd({ category: cat })}
        onClose={() => setCatOpen(false)}
      />

      <DrumPickerModal
        open={dateOpen}
        mode="date"
        title="날짜 선택"
        value={draft.date}
        onChange={v => upd({ date: v })}
        onClose={() => setDateOpen(false)}
      />

      <DrumPickerModal
        open={timeOpen}
        mode="time"
        title="시간 선택"
        value={draft.time}
        onChange={v => upd({ time: v })}
        onClose={() => setTimeOpen(false)}
      />

      <CardSheet
        open={cardOpen}
        cards={activeCards}
        value={draft.cardId}
        onSelect={id => upd({ cardId: id })}
        onClose={() => setCardOpen(false)}
      />
    </>
  );
}

// Alias for any future imports
export { BulkEntryModal as TxEntryModal };
