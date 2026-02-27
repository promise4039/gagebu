import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { getCategoryDef, natureOf, splitPath } from '../domain/categories';
import { resolveGroupIcon, resolveGroupName, resolveIcon, resolveDisplayName } from '../domain/categoryMeta';

type Nature = 'income' | 'expense' | 'transfer' | 'all';

type CategoryPickerProps = {
  open: boolean;
  nature: Nature;
  value: string;
  onSelect: (path: string) => void;
  onClose: () => void;
};

const NATURE_LABEL: Record<Nature, string> = {
  expense: '지출',
  income: '수입',
  transfer: '이체',
  all: '전체',
};

export function CategoryPicker({ open, nature, value, onSelect, onClose }: CategoryPickerProps) {
  const app = useApp();
  const meta = app.categoryMeta;
  const effectivePaths = app.effectiveCategories;

  const [activeNature, setActiveNature] = useState<'expense' | 'income' | 'transfer'>(
    nature === 'all' ? 'expense' : nature
  );
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Build groups from effectiveCategories
  const groups = useMemo(() => {
    const filtered = effectivePaths.filter(p => {
      const n = natureOf(p);
      if (n !== activeNature) return false;
      if (search) {
        const q = search.toLowerCase();
        return p.toLowerCase().includes(q);
      }
      return true;
    });

    const map = new Map<string, string[]>();
    for (const path of filtered) {
      const { group } = splitPath(path);
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(path);
    }
    return map;
  }, [effectivePaths, activeNature, search]);

  if (!open) return null;

  const natures: Array<'expense' | 'income' | 'transfer'> = ['expense', 'income', 'transfer'];

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
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 'calc(8px + env(safe-area-inset-bottom))',
        boxShadow: '0 -8px 32px rgba(0,0,0,.4)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 14px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>카테고리 선택</span>
            <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={onClose}>닫기</button>
          </div>
          {/* Nature tabs */}
          {nature === 'all' && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {natures.map(n => (
                <button
                  key={n}
                  className={'btn' + (activeNature === n ? ' primary' : '')}
                  style={{ flex: 1, fontSize: 13, padding: '8px 0', borderRadius: 10 }}
                  onClick={() => { setActiveNature(n); setExpandedGroup(null); }}
                >
                  {NATURE_LABEL[n]}
                </button>
              ))}
            </div>
          )}
          {/* Search */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}>🔍</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setExpandedGroup(null); }}
              placeholder="카테고리 검색..."
              style={{ paddingLeft: 32 }}
            />
          </div>
          <div className="divider" style={{ margin: '0 0 4px' }} />
        </div>

        {/* Category grid / sub list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 0' }}>
          {expandedGroup ? (
            /* Sub-category list */
            <>
              <button
                className="btn ghost"
                style={{ fontSize: 13, padding: '6px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => setExpandedGroup(null)}
              >
                ‹ {resolveGroupIcon(expandedGroup, meta)} {resolveGroupName(expandedGroup, meta)}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(groups.get(expandedGroup) ?? []).map(path => {
                  const isSelected = value === path;
                  const icon = resolveIcon(path, meta);
                  const name = resolveDisplayName(path, meta);
                  return (
                    <button
                      key={path}
                      onClick={() => { onSelect(path); onClose(); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: isSelected ? '1px solid rgba(115,125,255,.5)' : '1px solid transparent',
                        background: isSelected ? 'rgba(115,125,255,.12)' : 'rgba(255,255,255,.04)',
                        cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
                        fontSize: 15, width: '100%',
                      }}
                    >
                      <span style={{ fontSize: 22 }}>{icon}</span>
                      <span style={{ flex: 1 }}>{name}</span>
                      {isSelected && <span style={{ color: 'rgba(115,125,255,.8)', fontSize: 18 }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            /* Group grid — 4 columns */
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 8,
              paddingBottom: 8,
            }}>
              {Array.from(groups.keys()).map(group => {
                const paths = groups.get(group) ?? [];
                const groupSelected = paths.some(p => p === value);
                const icon = resolveGroupIcon(group, meta);
                const name = resolveGroupName(group, meta);
                return (
                  <button
                    key={group}
                    onClick={() => {
                      if (paths.length === 1) {
                        onSelect(paths[0]);
                        onClose();
                      } else {
                        setExpandedGroup(group);
                      }
                    }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 4, padding: '12px 4px',
                      borderRadius: 14,
                      border: groupSelected ? '1.5px solid rgba(115,125,255,.5)' : '1px solid var(--line)',
                      background: groupSelected ? 'rgba(115,125,255,.12)' : 'rgba(255,255,255,.03)',
                      cursor: 'pointer', color: 'var(--text)',
                      minHeight: 72,
                    }}
                  >
                    <span style={{ fontSize: 26 }}>{icon}</span>
                    <span style={{ fontSize: 11, fontWeight: groupSelected ? 700 : 400, textAlign: 'center', lineHeight: 1.2 }}>
                      {name}
                    </span>
                  </button>
                );
              })}
              {groups.size === 0 && (
                <div style={{ gridColumn: '1/-1', padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>
                  검색 결과가 없어
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
