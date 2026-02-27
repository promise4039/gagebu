import React, { useState } from 'react';
import { useApp } from '../app/AppContext';
import { AppSettings } from '../domain/models';
import { CsvImportModal } from '../components/CsvImportModal';
import { CategoryMetaEditor } from '../components/CategoryMetaEditor';

export function SettingsPage() {
  const app = useApp();
  const s = app.settings!;

  const [monthCap, setMonthCap] = useState(String(s.budgets.monthCap));
  const [weekCap, setWeekCap] = useState(String(s.budgets.weekCap));
  const [dayCap, setDayCap] = useState(String(s.budgets.dayCap));
  const [autoLockMinutes, setAutoLockMinutes] = useState(String(s.autoLockMinutes));

  const [newCat, setNewCat] = useState('');
  const [csvImportOpen, setCsvImportOpen] = useState(false);

  async function saveBudgets() {
    const next: AppSettings = {
      budgets: {
        monthCap: Number(String(monthCap).replaceAll(',', '').trim()) || 0,
        weekCap: Number(String(weekCap).replaceAll(',', '').trim()) || 0,
        dayCap: Number(String(dayCap).replaceAll(',', '').trim()) || 0,
      },
      autoLockMinutes: Math.max(1, Number(String(autoLockMinutes).replaceAll(',', '').trim()) || 10),
      budgetItems: (s as any).budgetItems ?? [],
      budgetBuckets: (s as any).budgetBuckets ?? {},
      categoryBudgetMap: (s as any).categoryBudgetMap ?? {},
    };
    await app.updateSettings(next);
    alert('저장했어.');
  }

  return (
    <div className="container">
      <div className="grid">
        <div className="card">
          <h2>예산/자동 잠금</h2>
          <div className="form">
            <label>월 변동캡
              <input value={monthCap} onChange={e => setMonthCap(e.target.value)} inputMode="numeric" />
            </label>
            <label>주 변동캡
              <input value={weekCap} onChange={e => setWeekCap(e.target.value)} inputMode="numeric" />
            </label>
            <label>일 변동캡
              <input value={dayCap} onChange={e => setDayCap(e.target.value)} inputMode="numeric" />
            </label>
            <label>자동 잠금(분)
              <input value={autoLockMinutes} onChange={e => setAutoLockMinutes(e.target.value)} inputMode="numeric" />
            </label>
          </div>

          <div className="divider" />
          <button className="btn primary" onClick={saveBudgets}>저장</button>
        </div>

        <div className="card">
          <h2>카테고리 관리</h2>
          <p className="muted">카테고리는 “대분류/소분류” 형태를 추천해. 예: 수입/급여, 식비/외식</p>

          <div className="row">
            <input
              value={newCat}
              onChange={e => setNewCat(e.target.value)}
              placeholder="새 카테고리 (예: 수입/기타)"
              style={{ flex: 1 }}
            />
            <button className="btn" onClick={async () => {
              await app.upsertCategory(newCat);
              setNewCat('');
            }}>추가</button>
          </div>

          <div className="divider" />

          <div className="table-scroll">
            <table className="tight-table">
              <thead>
                <tr>
                  <th>카테고리</th>
                  <th style={{ width: 120 }}></th>
                </tr>
              </thead>
              <tbody>
                {app.categories.map(c => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td className="right">
                      <button className="btn danger" onClick={async () => {
                        if (!confirm('삭제할까?')) return;
                        await app.deleteCategory(c);
                      }}>삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="divider" />
          <div className="notice">
            • 기존 거래가 가진 카테고리를 삭제하면, 해당 거래는 “(삭제된 카테고리)”로 보일 수 있어.<br/>
            • 추천: 카테고리명 변경이 필요하면 “새 카테고리 추가 → 거래 편집(전체 내역)에서 변경 → 기존 카테고리 삭제”.
          </div>
        </div>

        <div className="card">
          <h2>백업/복원 운영</h2>
          <div className="notice">
            • 백업 파일은 암호화된 상태로만 저장돼. (비밀번호 없으면 복구 불가)<br/>
            • GitHub에는 코드만. 백업 파일은 절대 커밋하지 말기.<br/>
            • 다른 기기에서 쓰려면: 백업 내보내기 → 파일 옮기기 → 잠금 화면에서 가져오기 → 같은 비밀번호로 잠금 해제.
          </div>
        </div>

        <div className="card">
          <h2>거래내역 CSV 가져오기/내보내기</h2>
          <div className="notice" style={{ marginBottom: 12 }}>
            • CSV 내보내기: 현재 거래 전체를 CSV 파일로 저장해. 엑셀/구글 시트에서 열기 가능.<br/>
            • 빈 템플릿: 유효한 카드명·카테고리가 주석으로 포함된 빈 양식. 채워서 가져오기에 사용.<br/>
            • CSV 가져오기: 작성한 CSV를 선택하면 유효성 검사 후 한 번에 적용돼.
          </div>
          <div className="row">
            <button className="btn" onClick={() => app.exportTxsCsv()}>
              거래 내보내기 (CSV)
            </button>
            <button className="btn" onClick={() => app.exportTxsTemplate()}>
              빈 템플릿 다운로드
            </button>
            <button className="btn primary" onClick={() => setCsvImportOpen(true)}>
              CSV 가져오기
            </button>
          </div>
        </div>
      </div>

      <CsvImportModal open={csvImportOpen} onClose={() => setCsvImportOpen(false)} />

      <div className="card">
        <h2>카테고리 아이콘/색상 커스터마이징</h2>
        <div className="muted small" style={{ marginBottom: 12 }}>
          각 카테고리의 이모지 아이콘과 색상을 변경할 수 있어. 차트와 거래 목록에 반영돼.
        </div>
        <div className="divider" />
        <CategoryMetaEditor />
      </div>
    </div>
  );
}
