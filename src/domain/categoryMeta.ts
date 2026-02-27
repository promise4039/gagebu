import { AppSettings } from './models';
import { CATEGORY_MAP } from './categories';

export function resolveIcon(path: string, meta?: AppSettings['categoryMeta']): string {
  if (meta?.[path]?.icon) return meta[path].icon;
  const g = (path || '').split('/')[0];
  const def = CATEGORY_MAP.get(path);
  if (def?.icon) return def.icon;
  // fallback by group
  const groupMap: Record<string, string> = {
    '수입': '💰', '식비': '🍽️', '마트': '🛒', '교통': '🚗', '주거': '🏠', '통신': '📱',
    '의료': '🏥', '보험': '🏦', '세금': '🧾', '교육': '📚', '여가': '🎮', '경조': '🎁',
    '미용': '💇', '여행': '✈️', '수수료': '🧾', '이월': '💳', '포인트': '⭐', '해외': '🌍',
    '조정': '🧩', '이체': '🔁',
  };
  return groupMap[g] ?? '📌';
}

export function resolveColor(path: string, meta?: AppSettings['categoryMeta']): string {
  if (meta?.[path]?.color) return meta[path].color;
  return CATEGORY_MAP.get(path)?.colorCode ?? '#777';
}
