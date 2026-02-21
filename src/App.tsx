import React from 'react';
import { HashRouter } from 'react-router-dom';
import { AppProvider, useApp } from './app/AppContext';
import { UnlockScreen } from './app/UnlockScreen';
import { AppShell } from './app/AppShell';

function Inner() {
  const app = useApp();
  if (!app.isUnlocked) return <UnlockScreen />;
  return <AppShell />;
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Inner />
      </HashRouter>
    </AppProvider>
  );
}
