import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { resolveColor, resolveIcon } from '../domain/categoryMeta';

export function CategoryMetaEditor() {
  const app = useApp();
  const meta = app.categoryMeta;
  const [draft, setDraft] = useState<Record<string, { icon: string; color: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const categories = app.categories.filter(c => !c.startsWith('이체/비지출'));

  function getDraft(path: string) {
    return draft[path] ?? { icon: resolveIcon(path, meta), color: resolveColor(path, meta) };
  }

  async function save(path: string) {
    const d = getDraft(path);
    setSaving(path);
    try {
      await app.updateCategoryMeta(path, { icon: d.icon.trim() || '📌', color: d.color || '#777' });
      setDraft(prev => { const cp = { ...prev }; delete cp[path]; return cp; });
    } finally {
      setSaving(null);
    }
  }

  function updateDraft(path: string, field: 'icon' | 'color', value: string) {
    setDraft(prev => ({ ...prev, [path]: { ...getDraft(path), [field]: value } }));
  }

  // Group by category root
  const groups: Record<string, string[]> = {};
  for (const c of categories) {
    const g = c.split('/')[0];
    if (!groups[g]) groups[g] = [];
    groups[g].push(c);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Object.entries(groups).map(([group, paths]) => (
        <div key={group}>
          <div className="muted small" style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
            {resolveIcon(group + '/', meta)} {group}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {paths.map(path => {
              const d = getDraft(path);
              const isDirty = draft[path] !== undefined;
              const leaf = path.split('/').slice(1).join('/');
              return (
                <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ width: 24, textAlign: 'center', fontSize: 18 }}>{resolveIcon(path, meta)}</div>
                  <div style={{ flex: 1, minWidth: 80, fontSize: 13 }}>{leaf || path}</div>
                  <input
                    value={d.icon}
                    onChange={e => updateDraft(path, 'icon', e.target.value)}
                    placeholder="이모지"
                    style={{ width: 56, textAlign: 'center', fontSize: 20, padding: '4px 6px' }}
                  />
                  <input
                    type="color"
                    value={d.color}
                    onChange={e => updateDraft(path, 'color', e.target.value)}
                    style={{ width: 40, height: 34, padding: 2, borderRadius: 6, border: '1px solid var(--line)', background: 'none', cursor: 'pointer' }}
                  />
                  <button
                    className={'btn' + (isDirty ? ' primary' : '')}
                    style={{ fontSize: 12, padding: '6px 12px' }}
                    disabled={saving === path || !isDirty}
                    onClick={() => save(path)}
                  >
                    {saving === path ? '...' : '저장'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
