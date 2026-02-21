export function parseYMD(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || (dt.getUTCMonth() + 1) !== mo || dt.getUTCDate() !== d) return null;
  return dt;
}

export function ymd(dt: Date): string {
  return dt.toISOString().slice(0, 10);
}

export function monthEndDayUTC(y: number, m1to12: number): number {
  return new Date(Date.UTC(y, m1to12, 0)).getUTCDate();
}

export function addMonthsUTC(ym: { y: number; m: number }, delta: number): { y: number; m: number } {
  let y = ym.y;
  let m = ym.m + delta;
  while (m > 12) { m -= 12; y++; }
  while (m < 1) { m += 12; y--; }
  return { y, m };
}

export function makeUTCDate(y: number, m1to12: number, d: number): Date {
  return new Date(Date.UTC(y, m1to12 - 1, d));
}

export function clampDayToMonthUTC(y: number, m1to12: number, dayOrEom: number | 'EOM', clamp: boolean): number {
  const end = monthEndDayUTC(y, m1to12);
  if (dayOrEom === 'EOM') return end;
  const d = Number(dayOrEom);
  if (!Number.isFinite(d)) return end;
  if (d <= end) return d;
  return clamp ? end : d;
}

export function isWeekendUTC(dt: Date): boolean {
  const wd = dt.getUTCDay();
  return wd === 0 || wd === 6;
}

export function adjustWeekendUTC(dt: Date, mode: 'none' | 'next_business' | 'prev_business'): Date {
  if (mode === 'none') return dt;
  let out = new Date(dt.getTime());
  if (!isWeekendUTC(out)) return out;
  if (mode === 'next_business') {
    while (isWeekendUTC(out)) out = new Date(out.getTime() + 86400000);
    return out;
  }
  if (mode === 'prev_business') {
    while (isWeekendUTC(out)) out = new Date(out.getTime() - 86400000);
    return out;
  }
  return out;
}
