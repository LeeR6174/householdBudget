import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Home, Clock, PieChart, Settings as SettingsIcon, CreditCard, BarChart2 } from 'lucide-react';
import { initDB, db } from './db/db';
import { getCurrentBudgetMonth } from './utils/dateUtils';

// Pages
import HomePage from './pages/HomePage';
import AddTransactionPage from './pages/AddTransactionPage';
import HistoryPage from './pages/HistoryPage';
import CardPage from './pages/CardPage';
import SettingsPage from './pages/SettingsPage';
import AnalysisPage from './pages/AnalysisPage';
import CategoriesPage from './pages/CategoriesPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import InitialBalancePage from './pages/InitialBalancePage';
import AIImportPage from './pages/AIImportPage';
import SavingsPage from './pages/SavingsPage';

function BottomNav() {
  const location = useLocation();
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`) ? 'active' : '';

  return (
    <nav className="bottom-nav">
      <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
        <Home size={24} />
        <span style={{ fontSize: '10px' }}>ホーム</span>
      </Link>
      <Link to="/history" className={`nav-item ${isActive('/history')}`}>
        <Clock size={24} />
        <span style={{ fontSize: '10px' }}>履歴</span>
      </Link>
      <Link to="/card" className={`nav-item ${isActive('/card')}`}>
        <CreditCard size={24} />
        <span style={{ fontSize: '10px' }}>カード</span>
      </Link>
      <Link to="/analysis" className={`nav-item ${isActive('/analysis')}`}>
        <BarChart2 size={24} />
        <span style={{ fontSize: '10px' }}>分析</span>
      </Link>
      <Link to="/settings" className={`nav-item ${isActive('/settings')}`}>
        <SettingsIcon size={24} />
        <span style={{ fontSize: '10px' }}>設定</span>
      </Link>
    </nav>
  );
}

function App() {
  useEffect(() => {
    // 💡 UX Fix: Enable immediate :active CSS states on iOS Safari
    document.body.addEventListener('touchstart', function() {}, { passive: true });

    initDB().then(async () => {
      try {
        // --- 1. サブスク・固定費の自動入力処理 ---
        const subs = await db.subscriptions.toArray();
        const today = new Date();
        const currentDay = today.getDate();
        const currentBudgetMonth = getCurrentBudgetMonth();
        
        for (const sub of subs) {
          if (currentDay >= sub.dayOfMonth && sub.lastProcessedMonth !== currentBudgetMonth) {
            // 自動作成
            await db.transactions.add({
              id: crypto.randomUUID(),
              type: sub.type || 'expense',
              categoryId: sub.categoryId,
              assetId: sub.assetId,
              amount: sub.amount,
              content: sub.content,
              memo: sub.memo || '自動入力(サブスク)',
              date: today.toISOString().split('T')[0],
              createdAt: new Date().toISOString(),
              cardStatus: 'unconfirmed'
            });
            await db.subscriptions.update(sub.id, { lastProcessedMonth: currentBudgetMonth });
          }
        }

        // --- 2. 通知権限と Periodic Sync の登録 ---
        if ('serviceWorker' in navigator && 'Notification' in window) {
          const registration = await navigator.serviceWorker.ready;
          
          // 通知権限の確認とリクエスト
          if (Notification.permission === 'default') {
            await Notification.requestPermission();
          }

          // Periodic Sync の登録 (Chrome/Edgeなどの対応ブラウザのみ)
          if ('periodicSync' in registration) {
            try {
              const status = await navigator.permissions.query({
                name: 'periodic-background-sync',
              });
              
              if (status.state === 'granted') {
                await registration.periodicSync.register('check-notifications', {
                  minInterval: 24 * 60 * 60 * 1000, // 最小1日間隔
                });
              }
            } catch (err) {
              console.warn('Periodic Sync registration failed:', err);
            }
          }
          
          // --- 3. アプリ起動時のシステム通知（フォールバック） ---
          // 通知が煩わしいとの意見があったため、現在は Service Worker (sw.js) の
          // Periodic Background Sync での通知のみに制限しています。
        }
        // --- 4. 通知リマインドの処理 ---
        const notifications = await db.notifications.toArray();
        for (const n of notifications) {
          if (currentDay >= n.day && n.lastProcessedMonth !== currentBudgetMonth) {
            const registration = await navigator.serviceWorker.ready;
            registration.showNotification('格が違う家計簿', {
              body: n.message,
              icon: '/favicon.png',
              badge: '/pwa-192x192.png',
              tag: `reminder-${n.id}`,
              silent: true
            });
            await db.notifications.update(n.id, { lastProcessedMonth: currentBudgetMonth });
          }
        }
      } catch (err) {
        console.error('Initial DB Process error:', err);
      }
    });
  }, []);

  return (
    <BrowserRouter>
      <div className="app-container">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/add" element={<AddTransactionPage />} />
          <Route path="/edit/:id" element={<AddTransactionPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/card" element={<CardPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/categories" element={<CategoriesPage />} />
          <Route path="/settings/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/settings/initial-balance" element={<InitialBalancePage />} />
          <Route path="/settings/ai-import" element={<AIImportPage />} />
          <Route path="/settings/savings" element={<SavingsPage />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;
