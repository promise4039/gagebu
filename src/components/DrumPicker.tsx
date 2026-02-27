import React, { useEffect, useRef, useCallback } from 'react';

const ITEM_H = 44; // px per drum item

type ColDef = {
  label: string;
  items: string[];
  value: string;
  onChange: (v: string) => void;
};

function DrumCol({ label, items, value, onChange }: ColDef) {
  const ref = useRef<HTMLDivElement>(null);
  const isScrolling = useRef(false);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const idx = items.indexOf(value);
  const safeIdx = idx >= 0 ? idx : 0;

  // Scroll to selected item on mount and when value changes
  useEffect(() => {
    const el = ref.current;
    if (!el || isScrolling.current) return;
    const targetScrollTop = safeIdx * ITEM_H;
    el.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  }, [safeIdx]);

  const handleScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    isScrolling.current = true;
    if (scrollTimer.current) clearTimeout(scrollTimer.current);
    scrollTimer.current = setTimeout(() => {
      isScrolling.current = false;
      const snappedIdx = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, snappedIdx));
      if (items[clamped] !== value) {
        onChange(items[clamped]);
      }
      // snap to exact position
      el.scrollTo({ top: clamped * ITEM_H, behavior: 'smooth' });
    }, 150);
  }, [items, value, onChange]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
      <div className="muted small" style={{ fontSize: 11, marginBottom: 4, letterSpacing: 0.5 }}>{label}</div>
      <div style={{ position: 'relative', height: ITEM_H * 5, overflow: 'hidden' }}>
        {/* gradient masks top/bottom */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: ITEM_H * 2,
          background: 'linear-gradient(to bottom, var(--panel), transparent)',
          pointerEvents: 'none', zIndex: 2,
        }} />
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: ITEM_H * 2,
          background: 'linear-gradient(to top, var(--panel), transparent)',
          pointerEvents: 'none', zIndex: 2,
        }} />
        {/* center highlight line */}
        <div style={{
          position: 'absolute', top: ITEM_H * 2, left: 4, right: 4, height: ITEM_H,
          border: '1px solid rgba(115,125,255,.35)',
          borderRadius: 10, background: 'rgba(115,125,255,.08)',
          pointerEvents: 'none', zIndex: 1,
        }} />
        <div
          ref={ref}
          onScroll={handleScroll}
          style={{
            height: '100%',
            overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            // hide scrollbar
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            paddingTop: ITEM_H * 2,
            paddingBottom: ITEM_H * 2,
            boxSizing: 'content-box',
          }}
        >
          {items.map((item) => (
            <div
              key={item}
              style={{
                height: ITEM_H,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                scrollSnapAlign: 'center',
                fontSize: item === value ? 18 : 15,
                fontWeight: item === value ? 800 : 400,
                color: item === value ? 'var(--text)' : 'var(--muted)',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'font-size 0.1s, color 0.1s',
              }}
              onClick={() => {
                onChange(item);
                ref.current?.scrollTo({ top: items.indexOf(item) * ITEM_H, behavior: 'smooth' });
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Date picker ─────────────────────────────────────────────────────────────

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

type DatePickerProps = {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  onClose: () => void;
};

function DateDrumPicker({ value, onChange, onClose }: DatePickerProps) {
  const [y, m, d] = value.split('-').map(Number);

  const years = range(2020, 2035).map(String);
  const months = range(1, 12).map(n => String(n).padStart(2, '0'));
  const days = range(1, daysInMonth(y, m)).map(n => String(n).padStart(2, '0'));

  const curYear = String(y);
  const curMonth = String(m).padStart(2, '0');
  const curDay = String(Math.min(d, daysInMonth(y, m))).padStart(2, '0');

  function update(newY: string, newM: string, newD: string) {
    const ny = Number(newY);
    const nm = Number(newM);
    const maxD = daysInMonth(ny, nm);
    const nd = Math.min(Number(newD), maxD);
    onChange(`${newY}-${newM}-${String(nd).padStart(2, '0')}`);
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 0, padding: '0 16px' }}>
        <DrumCol
          label="년"
          items={years}
          value={curYear}
          onChange={v => update(v, curMonth, curDay)}
        />
        <DrumCol
          label="월"
          items={months}
          value={curMonth}
          onChange={v => update(curYear, v, curDay)}
        />
        <DrumCol
          label="일"
          items={days}
          value={curDay}
          onChange={v => update(curYear, curMonth, v)}
        />
      </div>
      <div style={{ padding: '12px 16px 0' }}>
        <button
          className="btn primary"
          style={{ width: '100%', fontSize: 16, padding: '12px 0', borderRadius: 12 }}
          onClick={onClose}
        >확인</button>
      </div>
    </>
  );
}

// ─── Time picker ─────────────────────────────────────────────────────────────

type TimePickerProps = {
  value: string; // HH:mm
  onChange: (v: string) => void;
  onClose: () => void;
};

function TimeDrumPicker({ value, onChange, onClose }: TimePickerProps) {
  const [hh, mm] = value.split(':').map(Number);
  const isPM = hh >= 12;
  const hour12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;

  const ampmItems = ['오전', '오후'];
  const hourItems = range(1, 12).map(String);
  const minItems = range(0, 59).map(n => String(n).padStart(2, '0'));

  const curAmpm = isPM ? '오후' : '오전';
  const curHour = String(hour12);
  const curMin = String(mm).padStart(2, '0');

  function update(ampm: string, h: string, min: string) {
    let h24 = Number(h);
    if (ampm === '오후' && h24 !== 12) h24 += 12;
    if (ampm === '오전' && h24 === 12) h24 = 0;
    onChange(`${String(h24).padStart(2, '0')}:${min}`);
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 0, padding: '0 16px' }}>
        <DrumCol
          label="오전/오후"
          items={ampmItems}
          value={curAmpm}
          onChange={v => update(v, curHour, curMin)}
        />
        <DrumCol
          label="시"
          items={hourItems}
          value={curHour}
          onChange={v => update(curAmpm, v, curMin)}
        />
        <DrumCol
          label="분"
          items={minItems}
          value={curMin}
          onChange={v => update(curAmpm, curHour, v)}
        />
      </div>
      <div style={{ padding: '12px 16px 0' }}>
        <button
          className="btn primary"
          style={{ width: '100%', fontSize: 16, padding: '12px 0', borderRadius: 12 }}
          onClick={onClose}
        >확인</button>
      </div>
    </>
  );
}

// ─── DrumPickerModal ──────────────────────────────────────────────────────────

type DrumPickerModalProps = {
  open: boolean;
  mode: 'date' | 'time';
  title: string;
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
};

export function DrumPickerModal({ open, mode, title, value, onChange, onClose }: DrumPickerModalProps) {
  if (!open) return null;
  return (
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
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 32px rgba(0,0,0,.4)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 16px 8px',
        }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{title}</span>
          <button
            className="btn ghost"
            style={{ fontSize: 13, padding: '4px 12px' }}
            onClick={onClose}
          >닫기</button>
        </div>
        <div className="divider" style={{ margin: '0 0 8px' }} />
        {mode === 'date' ? (
          <DateDrumPicker value={value} onChange={onChange} onClose={onClose} />
        ) : (
          <TimeDrumPicker value={value} onChange={onChange} onClose={onClose} />
        )}
        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
