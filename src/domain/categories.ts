export const DEFAULT_CATEGORIES: string[] = [
  // 수입 — 급여 (월급·성과급·수당)
  '수입/월급', '수입/성과급', '수입/수당',
  // 부수입 (보험금·환급금·이자)
  '부수입/보험금', '부수입/환급금', '부수입/이자',
  // 기타수입 (용돈·선물·중고판매)
  '기타수입/용돈', '기타수입/선물', '기타수입/중고판매', '기타수입/기타',

  // 식비 🍚
  '식비/식료품·마트', '식비/외식', '식비/배달', '식비/간식·음료', '식비/카페',

  // 교통·차량 🚗
  '교통/주유', '교통/차량할부', '교통/자동차보험', '교통/정비', '교통/주차·톨비', '교통/대중교통',

  // 주거·공과금 🏠
  '주거/전기료', '주거/수도료', '주거/가스', '주거/통신료', '주거/인터넷', '주거/관리비', '주거/월세',

  // 의료·건강 🏥
  '의료/병원', '의료/약국', '의료/건강보조제', '의료/상담치료', '의료/운동',

  // 금융·보험 🏦
  '금융/보험료', '금융/대출상환', '금융/저축·투자', '금융/세금', '금융/수수료',

  // 쇼핑·생활 🛒
  '쇼핑/의류·신발', '쇼핑/생활용품', '쇼핑/가전·가구', '쇼핑/도서', '쇼핑/미용·뷰티',

  // 문화·여가 🎬
  '문화/구독서비스', '문화/취미', '문화/여행', '문화/경조사',

  // 이체·송금 📤 (이체/ 프리픽스로 transfer 성격 유지)
  '이체/가족송금', '이체/개인송금', '이체/기타이체',

  // 기타지출 📎
  '기타/간편결제', '기타/기타',
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
  // 수입 계열
  '수입': '💰',
  '부수입': '💵',
  '기타수입': '📥',
  // 지출 9개 대분류
  '식비': '🍚',
  '교통': '🚗',
  '주거': '🏠',
  '의료': '🏥',
  '금융': '🏦',
  '쇼핑': '🛒',
  '문화': '🎬',
  '이체': '📤',
  '기타': '📎',
  // 구 그룹명 fallback (기존 tx 하위호환)
  '카페': '☕',
  '유흥': '🍺',
  '마트': '🏪',
  '통신': '📱',
  '여행': '✈️',
  '교육': '📚',
  '육아': '👶',
  '미용': '💄',
  '경조사': '🎁',
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
  // 수입 계열
  '수입': '#4ade80',
  '부수입': '#86efac',
  '기타수입': '#bbf7d0',
  // 지출 9개 대분류
  '식비': '#f87171',
  '교통': '#60a5fa',
  '주거': '#a78bfa',
  '의료': '#f472b6',
  '금융': '#34d399',
  '쇼핑': '#c084fc',
  '문화': '#fb923c',
  '이체': '#94a3b8',
  '기타': '#64748b',
  // 구 그룹명 fallback (기존 tx 하위호환)
  '카페': '#fb923c',
  '유흥': '#f472b6',
  '마트': '#fb923c',
  '통신': '#22c55e',
  '여행': '#2dd4bf',
  '교육': '#38bdf8',
  '육아': '#fbbf24',
  '미용': '#ec4899',
  '경조사': '#f97316',
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
  // 수입 계열: 수입/, 부수입/, 기타수입/
  if (fullPath.startsWith('수입/') || fullPath.startsWith('부수입/') || fullPath.startsWith('기타수입/')) return 'income';
  // 이체 계열
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
