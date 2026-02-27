export const DEFAULT_CATEGORIES: string[] = [
  // 수입
  '수입/급여','수입/상여','수입/부수입','수입/이자수입','수입/기타',
  // 식비
  '식비/외식','식비/카페','식비/배달','식비/편의점',
  // 카페
  '카페/카페','카페/디저트',
  // 유흥
  '유흥/술집','유흥/노래방',
  // 마트
  '마트/식료품','마트/생필품',
  // 쇼핑
  '쇼핑/온라인','쇼핑/의류','쇼핑/잡화',
  // 의료
  '의료/병원','의료/약국',
  // 교통
  '교통/대중교통','교통/주유','교통/택시','교통/주차',
  // 통신
  '통신/통신요금','통신/구독',
  // 문화
  '문화/취미','문화/영화',
  // 여행
  '여행/숙박','여행/항공',
  // 교육
  '교육/학원','교육/자기계발',
  // 금융
  '금융/보험','금융/수수료','금융/세금',
  // 주거
  '주거/월세','주거/관리비','주거/공과금',
  // 육아
  '육아/유치원','육아/용품',
  // 미용
  '미용/미용실','미용/화장품',
  // 경조사
  '경조사/선물','경조사/경조금',
  // 기타
  '기타/기타',
  // 이체
  '이체/비지출','이체/저축','이체/투자',
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

export const GROUP_ICON: Record<string, string> = {
  '수입': '💰',
  '식비': '🍽️',
  '카페': '☕',
  '유흥': '🍺',
  '마트': '🏪',
  '쇼핑': '🛍️',
  '의료': '💊',
  '교통': '🚗',
  '통신': '📱',
  '문화': '🎭',
  '여행': '✈️',
  '교육': '📚',
  '금융': '💳',
  '주거': '🏠',
  '육아': '👶',
  '미용': '💄',
  '경조사': '🎁',
  '기타': '📌',
  '이체': '🔁',
  // 구 그룹명 fallback (기존 tx 하위호환)
  '마트(구)': '🛒',
  '보험': '🏦',
  '세금': '🧾',
  '여가': '🎮',
  '경조': '🎁',
  '미용(구)': '💇',
  '수수료': '🧾',
  '이월': '💳',
  '포인트': '⭐',
  '해외': '🌍',
  '조정': '🧩',
};

export const GROUP_COLOR: Record<string, string> = {
  '수입': '#4ade80',
  '식비': '#f87171',
  '카페': '#fb923c',
  '유흥': '#f472b6',
  '마트': '#fb923c',
  '쇼핑': '#a78bfa',
  '의료': '#f472b6',
  '교통': '#60a5fa',
  '통신': '#22c55e',
  '문화': '#c084fc',
  '여행': '#2dd4bf',
  '교육': '#38bdf8',
  '금융': '#34d399',
  '주거': '#a78bfa',
  '육아': '#fbbf24',
  '미용': '#ec4899',
  '경조사': '#f97316',
  '기타': '#94a3b8',
  '이체': '#94a3b8',
  // 구 그룹명 fallback
  '보험': '#34d399',
  '세금': '#fbbf24',
  '여가': '#c084fc',
  '경조': '#f97316',
  '수수료': '#94a3b8',
  '이월': '#94a3b8',
  '포인트': '#94a3b8',
  '해외': '#94a3b8',
  '조정': '#94a3b8',
};

export function natureOf(fullPath: string): CategoryNature {
  if (fullPath.startsWith('수입/')) return 'income';
  if (fullPath.startsWith('이체/')) return 'transfer';
  return 'expense';
}

export function splitPath(fullPath: string): { group: string; leaf: string } {
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

/** fullPath로 CategoryDef 조회. 없으면 group/icon을 추론해 임시 def 반환 */
export function getCategoryDef(fullPath: string): CategoryDef {
  const existing = CATEGORY_MAP.get(fullPath);
  if (existing) return existing;
  const { group, leaf } = splitPath(fullPath);
  return {
    id: fullPath,
    name: leaf || fullPath,
    fullPath,
    group,
    icon: GROUP_ICON[group] ?? '📌',
    nature: natureOf(fullPath),
    suggestedTags: [],
    colorCode: GROUP_COLOR[group] ?? '#777',
  };
}
