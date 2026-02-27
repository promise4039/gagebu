import { AppSettings } from './models';
import { CATEGORY_MAP, GROUP_ICON, GROUP_COLOR, splitPath } from './categories';

export function resolveIcon(path: string, meta?: AppSettings['categoryMeta']): string {
  if (meta?.[path]?.icon) return meta[path].icon;
  const g = (path || '').split('/')[0];
  const def = CATEGORY_MAP.get(path);
  if (def?.icon) return def.icon;
  return GROUP_ICON[g] ?? '📌';
}

export function resolveColor(path: string, meta?: AppSettings['categoryMeta']): string {
  if (meta?.[path]?.color) return meta[path].color;
  const def = CATEGORY_MAP.get(path);
  if (def?.colorCode) return def.colorCode;
  const g = (path || '').split('/')[0];
  return GROUP_COLOR[g] ?? '#777';
}

/** 세부 카테고리 표시명 반환 (meta override → path leaf → path 전체) */
export function resolveDisplayName(path: string, meta?: AppSettings['categoryMeta']): string {
  if (meta?.[path]?.displayName) return meta[path].displayName!;
  const { leaf } = splitPath(path);
  return leaf || path;
}

/** 그룹 표시명 반환 */
export function resolveGroupName(group: string, meta?: AppSettings['categoryMeta']): string {
  return meta?.[group]?.displayName ?? group;
}

/** 그룹 아이콘 반환 */
export function resolveGroupIcon(group: string, meta?: AppSettings['categoryMeta']): string {
  if (meta?.[group]?.icon) return meta[group].icon;
  return GROUP_ICON[group] ?? '📌';
}
