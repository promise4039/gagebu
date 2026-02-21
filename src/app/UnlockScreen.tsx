import React, { useMemo, useState } from 'react';
import { useApp } from './AppContext';

export function UnlockScreen() {
  const app = useApp();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);

  const isFirst = useMemo(() => !app.isInitialized, [app.isInitialized]);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (pw.length < 6) return false;
    if (isFirst) return pw === pw2;
    return true;
  }, [busy, pw, pw2, isFirst]);

  async function onSubmit() {
    setBusy(true);
    try {
      if (isFirst) await app.initWallet(pw);
      else await app.unlock(pw);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h2>{isFirst ? '처음 설정' : '잠금 해제'}</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          서버 없이 로컬 저장만 쓰고, 데이터는 <b>IndexedDB + AES‑GCM</b>으로 암호화돼.
          비밀번호를 잊으면 복구가 어렵다… 진짜로.
        </p>
        <div className="divider" />
        <div className="form">
          <label>
            {isFirst ? '새 비밀번호(패스프레이즈)' : '비밀번호'}
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="최소 6자" />
          </label>
          {isFirst ? (
            <label>
              비밀번호 확인
              <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="다시 입력" />
            </label>
          ) : (
            <div />
          )}
        </div>
        {app.error ? (
          <div className="notice" style={{ marginTop: 12, borderColor: 'rgba(255,91,106,.35)' }}>
            오류: {app.error}
          </div>
        ) : null}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!canSubmit} onClick={onSubmit}>
            {busy ? '처리중…' : (isFirst ? '지갑 생성' : '잠금 해제')}
          </button>
          <span className="muted small">TIP: 백업 파일을 GitHub에 올리면 끝장임(진짜).</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>백업 가져오기</h2>
        <p className="muted small" style={{ marginTop: 0 }}>
          암호화 백업(JSON)을 가져오면 현재 로컬 데이터는 교체돼. 가져온 뒤엔 다시 비밀번호로 잠금 해제해야 해.
        </p>
        <div className="divider" />
        <input
          type="file"
          accept="application/json"
          onChange={async e => {
            const f = e.target.files?.[0];
            if (!f) return;
            const ok = window.confirm('기존 로컬 데이터가 모두 덮어씌워집니다. 계속하시겠습니까?');
            if (!ok) {
              // reset input so selecting same file again triggers change
              (e.target as HTMLInputElement).value = '';
              return;
            }
            setBusy(true);
            try { await app.importBackup(f); }
            finally { setBusy(false); }
          }}
        />
      </div>
    </div>
  );
}
