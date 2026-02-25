export const DEFAULT_CATEGORIES: string[] = [
  '수입/급여','수입/상여','수입/부수입','수입/환급','수입/이자','수입/기타',
  '식비/카페','식비/외식','식비/배달',
  '마트/식료품','마트/생필품',
  '교통/주유','교통/대중교통','교통/택시','교통/주차',
  '주거/관리비','주거/집세','주거/공과금',
  '통신/구독',
  '의료/약','의료/병원',
  '보험/금융',
  '세금/공과',
  '교육/자기계발',
  '여가/취미',
  '경조/선물',
  '미용/의류',
  '여행/숙박',
  '수수료/연회비','이월/이자','포인트/차감','해외/수수료','조정/기타',
  '이체/비지출',
];

export type CategoryNature = 'income' | 'expense' | 'transfer';

export type CategoryDef = {
  /** CategoryCombo에서 value로 쓰는 값. (우리는 fullPath 문자열을 그대로 id로 사용) */
  id: string;           // e.g. "식비/외식"
  name: string;         // e.g. "외식"
  fullPath: string;     // e.g. "식비/외식"
  group: string;        // e.g. "식비"
  icon: string;         // e.g. "🍽️"
  nature: CategoryNature;
  suggestedTags: string[];
  colorCode: string;
};

const GROUP_ICON: Record<string, string> = {
  '수입': '💰',
  '식비': '🍽️',
  '마트': '🛒',
  '교통': '🚗',
  '주거': '🏠',
  '통신': '📱',
  '의료': '🏥',
  '보험': '🏦',
  '세금': '🧾',
  '교육': '📚',
  '여가': '🎮',
  '경조': '🎁',
  '미용': '💇',
  '여행': '✈️',
  '수수료': '🧾',
  '이월': '💳',
  '포인트': '⭐',
  '해외': '🌍',
  '조정': '🧩',
  '이체': '🔁',
};

const GROUP_COLOR: Record<string, string> = {
  '수입': '#4ade80',
  '식비': '#f87171',
  '마트': '#fb923c',
  '교통': '#60a5fa',
  '주거': '#a78bfa',
  '통신': '#22c55e',
  '의료': '#f472b6',
  '보험': '#34d399',
  '세금': '#fbbf24',
  '교육': '#38bdf8',
  '여가': '#c084fc',
  '경조': '#f97316',
  '미용': '#f472b6',
  '여행': '#2dd4bf',
  '수수료': '#94a3b8',
  '이월': '#94a3b8',
  '포인트': '#94a3b8',
  '해외': '#94a3b8',
  '조정': '#94a3b8',
  '이체': '#94a3b8',
};

function natureOf(fullPath: string): CategoryNature {
  if (fullPath.startsWith('수입/')) return 'income';
  if (fullPath.startsWith('이체/')) return 'transfer';
  return 'expense';
}

function splitPath(fullPath: string): { group: string; leaf: string } {
  const parts = fullPath.split('/');
  if (parts.length >= 2) return { group: parts[0], leaf: parts.slice(1).join('/') };
  return { group: fullPath, leaf: fullPath };
}

export const CATEGORIES: CategoryDef[] = DEFAULT_CATEGORIES.map((fullPath) => {
  const { group, leaf } = splitPath(fullPath);
  const icon = GROUP_ICON[group] ?? '📌';
  const colorCode = GROUP_COLOR[group] ?? '#777';
  return {
    id: fullPath,
    name: leaf,
    fullPath,
    group,
    icon,
    nature: natureOf(fullPath),
    suggestedTags: [],
    colorCode,
  };
});

export const CATEGORY_MAP: Map<string, CategoryDef> = new Map(
  CATEGORIES.map(c => [c.id, c])
);

export const CATEGORY_GROUPS: string[] = Array.from(
  new Set(CATEGORIES.map(c => c.group))
);