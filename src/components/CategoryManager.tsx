import React, { useMemo, useState } from 'react';
import { useApp } from '../app/AppContext';
import { DEFAULT_CATEGORIES, GROUP_ICON, GROUP_COLOR, natureOf, splitPath } from '../domain/categories';
import { resolveGroupIcon, resolveGroupName, resolveIcon, resolveDisplayName, resolveColor } from '../domain/categoryMeta';

type GroupEntry = { group: string; paths: string[] };

export function CategoryManager() {
  const app = useApp();
  const meta = app.categoryMeta;
  const effectivePaths = app.effectiveCategories;

  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editIcon, setEditIcon] = useState('');
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [newSubIcon, setNewSubIcon] = useState('📌');

  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupIcon, setNewGroupIcon] = useState('📌');

  // Build ordered group list
  const groups: GroupEntry[] = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const path of effectivePaths) {
      const { group } = splitPath(path);
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(path);
    }
    return Array.from(map.entries()).map(([group, paths]) => ({ group, paths }));
  }, [effectivePaths]);

  function startEditPath(path: string) {
    setEditingPath(path);
    setEditIcon(resolveIcon(path, meta));
    setEditName(resolveDisplayName(path, meta));
  }

  function startEditGroup(group: string) {
    setEditingPath('@' + group);
    setEditIcon(resolveGroupIcon(group, meta));
    setEditName(resolveGroupName(group, meta));
  }

  async function saveEdit() {
    if (!editingPath) return;
    setSaving(true);
    try {
      const isGroup = editingPath.startsWith('@');
      const key = isGroup ? editingPath.slice(1) : editingPath;
      await app.updateCategoryMeta(key, {
        icon: editIcon.trim() || '📌',
        displayName: editName.trim() || undefined,
      });
      setEditingPath(null);
    } finally {
      setSaving(false);
    }
  }

  async function deletePath(path: string) {
    if (!confirm(`"${resolveDisplayName(path, meta)}"를 삭제할까?\n이 카테고리로 기록된 거래는 '미분류'로 표시됩니다.`)) return;
    const next = effectivePaths.filter(p => p !== path);
    await app.saveCategoryPaths(next);
  }

  async function deleteGroup(group: string) {
    if (!confirm(`"${resolveGroupName(group, meta)}" 그룹 전체를 삭제할까?\n해당 카테고리로 기록된 거래는 '미분류'로 표시됩니다.`)) return;
    const next = effectivePaths.filter(p => !p.startsWith(group + '/'));
    await app.saveCategoryPaths(next);
  }

  async function addSubCategory() {
    if (!addingSubTo || !newSubName.trim()) return;
    const path = `${addingSubTo}/${newSubName.trim()}`;
    if (effectivePaths.includes(path)) { alert('이미 있는 항목이야.'); return; }
    const next = [...effectivePaths, path];
    await app.saveCategoryPaths(next);
    await app.updateCategoryMeta(path, { icon: newSubIcon, color: resolveColor(addingSubTo + '/기타', meta) });
    setAddingSubTo(null);
    setNewSubName('');
    setNewSubIcon('📌');
  }

  async function addGroup() {
    if (!newGroupName.trim()) return;
    const path = `${newGroupName.trim()}/기타`;
    if (effectivePaths.some(p => p.startsWith(newGroupName.trim() + '/'))) {
      alert('이미 있는 그룹이야.');
      return;
    }
    const next = [...effectivePaths, path];
    await app.saveCategoryPaths(next);
    await app.updateCategoryMeta(newGroupName.trim(), { icon: newGroupIcon, color: '#94a3b8' });
    setAddingGroup(false);
    setNewGroupName('');
    setNewGroupIcon('📌');
  }

  async function resetToDefault() {
    if (!confirm('카테고리를 기본값으로 초기화할까?\n아이콘/이름 커스터마이징은 유지돼.')) return;
    await app.saveCategoryPaths(DEFAULT_CATEGORIES);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header actions */}
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="muted small">카테고리를 추가·수정·삭제할 수 있어.</div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost" style={{ fontSize: 12, padding: '6px 10px' }} onClick={resetToDefault}>초기화</button>
          <button className="btn primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setAddingGroup(true)}>+ 그룹 추가</button>
        </div>
      </div>

      {/* New group form */}
      {addingGroup && (
        <div className="budget-edit-card open" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted small" style={{ fontWeight: 700 }}>새 카테고리 그룹</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={newGroupIcon}
              onChange={e => setNewGroupIcon(e.target.value)}
              placeholder="아이콘"
              style={{ width: 56, textAlign: 'center', fontSize: 22, padding: '8px 6px' }}
            />
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="그룹명 (예: 반려동물)"
              style={{ flex: 1 }}
            />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setAddingGroup(false); setNewGroupName(''); }}>취소</button>
            <button className="btn primary" style={{ fontSize: 12, padding: '6px 14px' }} onClick={addGroup}>저장</button>
          </div>
        </div>
      )}

      {/* Edit overlay */}
      {editingPath && (
        <div className="budget-edit-card open" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted small" style={{ fontWeight: 700 }}>
            {editingPath.startsWith('@') ? `그룹 편집: ${editingPath.slice(1)}` : `편집: ${editingPath}`}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={editIcon}
              onChange={e => setEditIcon(e.target.value)}
              placeholder="아이콘"
              style={{ width: 56, textAlign: 'center', fontSize: 22, padding: '8px 6px' }}
            />
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="표시명"
              style={{ flex: 1 }}
            />
          </div>
          <div className="muted small" style={{ fontSize: 11 }}>
            * 표시명만 바뀌어, 내부 경로는 유지돼서 기존 거래가 보존돼.
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setEditingPath(null)}>취소</button>
            <button className="btn primary" style={{ fontSize: 12, padding: '6px 14px' }} disabled={saving} onClick={saveEdit}>
              {saving ? '...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {/* Group list */}
      {groups.map(({ group, paths }) => (
        <div key={group} className="budget-edit-card" style={{ padding: '10px 12px' }}>
          {/* Group header */}
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 22 }}>{resolveGroupIcon(group, meta)}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{resolveGroupName(group, meta)}</div>
                <div className="muted small">{paths.length}개 항목</div>
              </div>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button
                className="btn ghost"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => startEditGroup(group)}
              >편집</button>
              <button
                className="btn danger"
                style={{ fontSize: 11, padding: '4px 10px' }}
                onClick={() => deleteGroup(group)}
              >삭제</button>
            </div>
          </div>

          {/* Sub-category rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginLeft: 4 }}>
            {paths.map(path => {
              const icon = resolveIcon(path, meta);
              const name = resolveDisplayName(path, meta);
              return (
                <div key={path} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '6px 4px', borderRadius: 8 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                    <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span className="muted small" style={{ fontSize: 10 }}>{path}</span>
                  </div>
                  <div className="row" style={{ gap: 4, flexShrink: 0 }}>
                    <button
                      className="btn ghost"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => startEditPath(path)}
                    >편집</button>
                    <button
                      className="btn danger"
                      style={{ fontSize: 11, padding: '3px 8px' }}
                      onClick={() => deletePath(path)}
                    >삭제</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add sub-category */}
          {addingSubTo === group ? (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={newSubIcon}
                onChange={e => setNewSubIcon(e.target.value)}
                placeholder="아이콘"
                style={{ width: 50, textAlign: 'center', fontSize: 20, padding: '6px 4px' }}
              />
              <input
                value={newSubName}
                onChange={e => setNewSubName(e.target.value)}
                placeholder="세부 카테고리명"
                style={{ flex: 1, minWidth: 100 }}
                onKeyDown={e => e.key === 'Enter' && addSubCategory()}
              />
              <button className="btn" style={{ fontSize: 12, padding: '6px 10px' }} onClick={() => { setAddingSubTo(null); setNewSubName(''); }}>취소</button>
              <button className="btn primary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={addSubCategory}>추가</button>
            </div>
          ) : (
            <button
              className="btn ghost"
              style={{ fontSize: 12, padding: '5px 10px', marginTop: 6, width: '100%' }}
              onClick={() => { setAddingSubTo(group); setNewSubName(''); setNewSubIcon(resolveGroupIcon(group, meta)); }}
            >
              + 세부 항목 추가
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
