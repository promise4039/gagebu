import React from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useApp } from './AppContext';
import { DashboardPage } from '../pages/DashboardPage';
import { CardsPage } from '../pages/CardsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { LoansPage } from '../pages/LoansPage';

function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')} style={{ textDecoration: 'none' }}>
      {label}
    </NavLink>
  );
}

export function AppShell() {
  const app = useApp();
  return (
    <>
      <div className="header">
        <div className="header-inner">
          <div>
            <div className="h1">Secure Budget</div>
            <div className="sub">카드 청구 전망 + 대조 + 로컬 암호화</div>
          </div>
          <div className="nav">
            <Tab to="/" label="대시보드" />
            <Tab to="/cards" label="계좌/카드" />
            <Tab to="/loans" label="대출/카드 현황" />
            <Tab to="/settings" label="설정" />
          </div>
          <div className="row">
            <button className="btn" onClick={() => app.exportBackup()}>백업 내보내기</button>
            <button className="btn danger" onClick={() => app.lock()}>잠금</button>
          </div>
        </div>
      </div>

      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/cards" element={<CardsPage />} />
        <Route path="/loans" element={<LoansPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>

      <div className="container" style={{ paddingTop: 0 }}>
        <div className="notice">
          ⚠️ 이 앱은 네트워크 전송이 CSP로 차단돼 있어. 그래도 “백업 파일”을 실수로 GitHub에 올리는 게 제일 위험해.
          레포에는 코드만 올리고, 백업은 개인 저장소로만 관리해.
        </div>
      </div>
    </>
  );
}
