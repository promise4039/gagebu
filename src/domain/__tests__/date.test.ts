import { describe, it, expect } from 'vitest';
import {
  parseYMD, ymd, monthEndDayUTC, addMonthsUTC,
  makeUTCDate, clampDayToMonthUTC, isWeekendUTC, adjustWeekendUTC,
} from '../date';

describe('parseYMD', () => {
  it('유효한 날짜 파싱', () => {
    const d = parseYMD('2024-01-15');
    expect(d).not.toBeNull();
    expect(d!.getUTCFullYear()).toBe(2024);
    expect(d!.getUTCMonth()).toBe(0); // 0-based
    expect(d!.getUTCDate()).toBe(15);
  });

  it('잘못된 형식 → null', () => {
    expect(parseYMD('20240115')).toBeNull();
    expect(parseYMD('2024/01/15')).toBeNull();
    expect(parseYMD('')).toBeNull();
  });

  it('존재하지 않는 날짜 → null', () => {
    expect(parseYMD('2024-02-30')).toBeNull();
    expect(parseYMD('2024-13-01')).toBeNull();
  });
});

describe('ymd', () => {
  it('Date → YYYY-MM-DD 문자열', () => {
    const d = new Date(Date.UTC(2024, 5, 7)); // June 7
    expect(ymd(d)).toBe('2024-06-07');
  });
});

describe('monthEndDayUTC', () => {
  it('2월 말일 (윤년/비윤년)', () => {
    expect(monthEndDayUTC(2024, 2)).toBe(29); // 윤년
    expect(monthEndDayUTC(2023, 2)).toBe(28); // 비윤년
  });
  it('12월은 31일', () => {
    expect(monthEndDayUTC(2024, 12)).toBe(31);
  });
  it('4월은 30일', () => {
    expect(monthEndDayUTC(2024, 4)).toBe(30);
  });
});

describe('addMonthsUTC', () => {
  it('1개월 더하기', () => {
    expect(addMonthsUTC({ y: 2024, m: 1 }, 1)).toEqual({ y: 2024, m: 2 });
  });
  it('12월 + 1 → 다음 해 1월', () => {
    expect(addMonthsUTC({ y: 2024, m: 12 }, 1)).toEqual({ y: 2025, m: 1 });
  });
  it('1월 - 1 → 이전 해 12월', () => {
    expect(addMonthsUTC({ y: 2024, m: 1 }, -1)).toEqual({ y: 2023, m: 12 });
  });
  it('12개월 더하기 → 같은 달 다음 해', () => {
    expect(addMonthsUTC({ y: 2024, m: 3 }, 12)).toEqual({ y: 2025, m: 3 });
  });
});

describe('clampDayToMonthUTC', () => {
  it('EOM → 해당 월의 마지막 날', () => {
    expect(clampDayToMonthUTC(2024, 2, 'EOM', false)).toBe(29);
  });
  it('day가 월의 마지막 날 이하 → 그대로', () => {
    expect(clampDayToMonthUTC(2024, 4, 30, false)).toBe(30);
  });
  it('day가 월 범위 초과 + clamp=true → 말일로', () => {
    expect(clampDayToMonthUTC(2024, 4, 31, true)).toBe(30);
  });
  it('day가 월 범위 초과 + clamp=false → 그대로(원래 값)', () => {
    expect(clampDayToMonthUTC(2024, 4, 31, false)).toBe(31);
  });
});

describe('adjustWeekendUTC', () => {
  // 2024-01-06 토요일, 2024-01-07 일요일, 2024-01-08 월요일(다음 평일), 2024-01-05 금요일(이전 평일)
  it('mode=none → 변경 없음', () => {
    const sat = makeUTCDate(2024, 1, 6);
    expect(ymd(adjustWeekendUTC(sat, 'none'))).toBe('2024-01-06');
  });
  it('토요일 + next_business → 월요일', () => {
    const sat = makeUTCDate(2024, 1, 6);
    expect(ymd(adjustWeekendUTC(sat, 'next_business'))).toBe('2024-01-08');
  });
  it('일요일 + next_business → 월요일', () => {
    const sun = makeUTCDate(2024, 1, 7);
    expect(ymd(adjustWeekendUTC(sun, 'next_business'))).toBe('2024-01-08');
  });
  it('토요일 + prev_business → 금요일', () => {
    const sat = makeUTCDate(2024, 1, 6);
    expect(ymd(adjustWeekendUTC(sat, 'prev_business'))).toBe('2024-01-05');
  });
  it('평일은 변경 없음', () => {
    const mon = makeUTCDate(2024, 1, 8); // 월요일
    expect(ymd(adjustWeekendUTC(mon, 'next_business'))).toBe('2024-01-08');
  });
});
