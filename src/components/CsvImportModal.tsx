import React, { useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { parseCsvToTxDrafts, validateDrafts } from '../storage/csvTransform';
import { Tx } from '../domain/models';

const fmt = new Intl.NumberFormat('ko-KR');

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CsvImportModal({ open, onClose }: Props) {
  const app = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState('');
  const [parseErrors, setParseErrors] = useState<{ rowNum: number; message: string }[]>([]);
  const [validRows, setValidRows] = useState<(ReturnType<typeof validateDrafts>['valid'][0])[]>([]);
  const [valErrors, setValErrors] = useState<{ rowNum: number; message: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  function reset() {
    setFileName('');
    setParseErrors([]);
    setValidRows([]);
    setValErrors([]);
    setImporting(false);
    setDone(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setDone(false);
    const text = await file.text();
    const { drafts, parseErrors: pe } = parseCsvToTxDrafts(text);
    const { valid, errors: ve } = validateDrafts(
      drafts,
      app.cards,
      app.categories,
      app.categoryIdByPath,
    );
    setParseErrors(pe);
    setValidRows(valid);
    setValErrors(ve);
  }

  async function handleImport() {
    if (validRows.length === 0) return;
    if (!confirm(`${validRows.length}건의 거래를 가져올까요?`)) return;
    setImporting(true);
    try {
      for (const row of validRows) {
        const tx: Tx = {
          id: 'tx_' + crypto.randomUUID(),
          date: row.date,
          cardId: row.cardId,
          category: row.category,
          categoryId: row.categoryId,
          amount: row.amount,
          installments: row.installments,
          feeMode: row.feeMode,
          feeRate: row.feeRate,
          memo: row.memo,
          tags: row.tags,
        };
        await app.upsertTx(tx);
      }
      setDone(true);
    } finally {
      setImporting(false);
    }
  }

  const allErrors = [...parseErrors, ...valErrors].sort((a, b) => a.rowNum - b.rowNum);
  const hasContent = validRows.length > 0 || allErrors.length > 0;

  return (
    <div className={'modal' + (open ? ' active' : '')} onClick={e => (e.target as HTMLElement).classList.contains('modal') && onClose()}>
      <div className="panel" style={{ maxWidth: 680 }}>
        <div className="panel-head">
          <div>
            <h3>거래 가져오기 (CSV)</h3>
            <p>CSV 파일을 선택하면 미리보기와 유효성 검사 결과를 확인할 수 있어요.</p>
          </div>
          <button className="btn" onClick={() => { reset(); onClose(); }}>닫기</button>
        </div>

        {done ? (
          <div className="card" style={{ boxShadow: 'none', textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 40 }}>✅</div>
            <h3 style={{ marginTop: 12 }}>{validRows.length}건 가져오기 완료!</h3>
            <button className="btn primary" style={{ marginTop: 16 }} onClick={() => { reset(); onClose(); }}>확인</button>
          </div>
        ) : (
          <div className="card" style={{ boxShadow: 'none' }}>
            <label style={{ cursor: 'pointer' }}>
              <div className="notice" style={{ textAlign: 'center', padding: 20, cursor: 'pointer' }}>
                {fileName ? (
                  <>
                    <div style={{ fontSize: 24 }}>📄</div>
                    <div style={{ marginTop: 8, fontWeight: 600 }}>{fileName}</div>
                    <div className="muted small" style={{ marginTop: 4 }}>다른 파일 선택</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 32 }}>📂</div>
                    <div style={{ marginTop: 8 }}>CSV 파일 선택</div>
                    <div className="muted small" style={{ marginTop: 4 }}>또는 여기를 탭</div>
                  </>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: 'none' }}
                  onChange={handleFile}
                />
              </div>
            </label>

            {hasContent && (
              <>
                <div className="divider" />

                {/* 유효 행 미리보기 */}
                {validRows.length > 0 && (
                  <>
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, color: 'var(--good)' }}>✅ 유효한 거래 {validRows.length}건</h3>
                      <span className="muted small">미리보기 (최대 15건)</span>
                    </div>
                    <div className="table-scroll" style={{ marginTop: 10 }}>
                      <table className="tight-table">
                        <thead>
                          <tr>
                            <th>날짜</th>
                            <th>카드</th>
                            <th>카테고리</th>
                            <th className="right">금액</th>
                            <th>메모</th>
                          </tr>
                        </thead>
                        <tbody>
                          {validRows.slice(0, 15).map((r, i) => (
                            <tr key={i}>
                              <td className="mono">{r.date}</td>
                              <td>{r.cardName}</td>
                              <td>{r.category}</td>
                              <td className={`right mono`} style={{ color: r.amount < 0 ? 'var(--good)' : 'inherit' }}>
                                {r.amount < 0 ? '+' : ''}{fmt.format(Math.abs(r.amount))}원
                              </td>
                              <td className="muted">{r.memo}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {validRows.length > 15 && (
                      <p className="muted small" style={{ marginTop: 6 }}>... 나머지 {validRows.length - 15}건 생략</p>
                    )}
                  </>
                )}

                {/* 오류 행 */}
                {allErrors.length > 0 && (
                  <>
                    <div className="divider" />
                    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, color: 'var(--bad)' }}>⚠️ 오류 {allErrors.length}건 (가져오기 제외)</h3>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                      {allErrors.map((e, i) => (
                        <div key={i} className="notice" style={{ border: '1px dashed rgba(255,91,106,.35)', background: 'rgba(255,91,106,.06)' }}>
                          <span className="mono muted small">행 {e.rowNum}</span> {e.message}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="divider" />
                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn" onClick={reset}>초기화</button>
                  <button
                    className="btn primary"
                    onClick={handleImport}
                    disabled={validRows.length === 0 || importing}
                  >
                    {importing ? '가져오는 중...' : `${validRows.length}건 가져오기`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
