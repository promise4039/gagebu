import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, CATEGORY_MAP, CATEGORY_GROUPS, CategoryDef } from '../domain/categories';

/* ──── Searchable Category ComboBox ──── */
export function CategoryCombo({
  value, onChange, filterType, dropUp,
}: {
  value: string;
  onChange: (id: string) => void;
  filterType?: 'expense' | 'income' | 'all';
  dropUp?: boolean;  // dropdown opens upward
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let cats = CATEGORIES;
    if (filterType === 'income') cats = cats.filter(c => c.nature === 'income');
    else if (filterType === 'expense') cats = cats.filter(c => c.nature !== 'income' && c.nature !== 'transfer');
    if (!query.trim()) return cats;
    const q = query.trim().toLowerCase();
    return cats.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.icon.includes(q) ||
      c.group.toLowerCase().includes(q) ||
      c.suggestedTags.some(t => t.toLowerCase().includes(q))
    );
  }, [query, filterType]);

  // Group filtered categories
  const grouped = useMemo(() => {
    const groups: { group: string; items: CategoryDef[] }[] = [];
    const gMap = new Map<string, CategoryDef[]>();
    for (const c of filtered) {
      const arr = gMap.get(c.group) ?? [];
      arr.push(c);
      gMap.set(c.group, arr);
    }
    for (const [g, items] of gMap) groups.push({ group: g, items });
    return groups;
  }, [filtered]);

  const selected = CATEGORY_MAP.get(value);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const dropStyle: React.CSSProperties = dropUp
    ? { bottom: 'calc(100% + 4px)', top: 'auto' }
    : {};

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div onClick={() => { setOpen(!open); setQuery(''); }} className="combo-trigger">
        {selected ? <span>{selected.icon} {selected.name}</span> : <span style={{ color: 'var(--muted)' }}>카테고리 선택</span>}
        <span style={{ marginLeft: 'auto', opacity: 0.4, fontSize: 10 }}>▾</span>
      </div>
      {open && (
        <div className="combo-dropdown" style={dropStyle}>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="검색 (이름/태그)..." className="combo-search"
            onClick={e => e.stopPropagation()} />
          <div className="combo-list">
            {grouped.length === 0 ? (
              <div className="combo-item muted" style={{ justifyContent: 'center' }}>결과 없음</div>
            ) : grouped.map(g => (
              <div key={g.group}>
                <div style={{ padding: '6px 12px', fontSize: 11, color: 'rgba(255,255,255,.4)', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                  {g.group}
                </div>
                {g.items.map(c => (
                  <div key={c.id} className={'combo-item' + (c.id === value ? ' selected' : '')}
                    onClick={() => { onChange(c.id); setOpen(false); }}>
                    <span>{c.icon} {c.name}</span>
                    <span className="combo-tags">{c.suggestedTags.slice(0, 3).map(t => '#' + t).join(' ')}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──── Tag Input with auto-suggestions ──── */
export function TagInput({
  value, onChange, categoryId, allTags,
}: {
  value: string;
  onChange: (v: string) => void;
  categoryId?: string;
  allTags?: string[];
}) {
  const [focused, setFocused] = useState(false);
  const [inputText, setInputText] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const tags = useMemo(() => value.split(',').map(s => s.replace('#', '').trim()).filter(Boolean), [value]);

  const suggestions = useMemo(() => {
    const cat = categoryId ? CATEGORY_MAP.get(categoryId) : null;
    const catTags = cat?.suggestedTags ?? [];
    const all = new Set([...catTags, ...(allTags ?? [])]);
    for (const t of tags) all.delete(t);
    const q = inputText.trim().toLowerCase();
    if (!q) return Array.from(all).slice(0, 8);
    return Array.from(all).filter(t => t.toLowerCase().includes(q)).slice(0, 8);
  }, [categoryId, allTags, tags, inputText]);

  function addTag(tag: string) {
    const t = tag.trim();
    if (!t || tags.includes(t)) return;
    onChange([...tags, t].join(', '));
    setInputText('');
  }
  function removeTag(tag: string) { onChange(tags.filter(t => t !== tag).join(', ')); }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); if (inputText.trim()) addTag(inputText); }
    if (e.key === 'Backspace' && !inputText && tags.length > 0) removeTag(tags[tags.length - 1]);
  }

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setFocused(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div className="tag-input-box" onClick={() => setFocused(true)}>
        {tags.map(t => (
          <span key={t} className="tag-chip">
            #{t}<span className="tag-x" onClick={e => { e.stopPropagation(); removeTag(t); }}>×</span>
          </span>
        ))}
        <input value={inputText} onChange={e => setInputText(e.target.value)}
          onFocus={() => setFocused(true)} onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? '#태그 입력...' : ''} className="tag-text-input" />
      </div>
      {focused && suggestions.length > 0 && (
        <div className="combo-dropdown" style={{ top: '100%' }}>
          <div className="combo-list" style={{ maxHeight: 160 }}>
            {suggestions.map(s => (
              <div key={s} className="combo-item" onClick={() => addTag(s)}>#{s}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──── Inline Tag Hint (카테고리 선택 시 추천 태그 표시) ──── */
export function TagHint({ categoryId }: { categoryId: string }) {
  const cat = CATEGORY_MAP.get(categoryId);
  if (!cat || cat.suggestedTags.length === 0) return null;
  return (
    <span className="muted" style={{ fontSize: 11, marginLeft: 4 }}>
      예: {cat.suggestedTags.slice(0, 4).map(t => '#' + t).join(' ')}
    </span>
  );
}
