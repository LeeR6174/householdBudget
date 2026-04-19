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

        // --- 2. リマインダー処理 (セッション中1回のみ) ---
        if (!sessionStorage.getItem('reminded')) {
          sessionStorage.setItem('reminded', 'true');
          
          // 15日付近: カード振り分け
          if (currentDay >= 14 && currentDay <= 16) {
            const unconfirmedTx = await db.transactions.toArray();
            const hasUnconfirmed = unconfirmedTx.some(t => t.cardStatus === 'unconfirmed');
            
            if (hasUnconfirmed) {
              setTimeout(() => {
                alert('💳【お知らせ】\n\nカードの明細が届く時期です。\n未分類のカード利用を「カード」タブでスワイプして、今月の支払いに振り分けましょう！');
              }, 1000);
            }
          }
          
          // 25日付近: 答え合わせ
          if (currentDay >= 24 && currentDay <= 26) {
            setTimeout(() => {
              alert('🏦【給料日＆照合リマインド】\n\n家計簿の締め日です！\n実際の通帳の残高と、アプリ上の「口座残高」がピタリと合っているか答え合わせをしましょう！');
            }, 1000);
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
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/card" element={<CardPage />} />
          <Route path="/analysis" element={<AnalysisPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/categories" element={<CategoriesPage />} />
          <Route path="/settings/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/settings/initial-balance" element={<InitialBalancePage />} />
        </Routes>
        <BottomNav />
      </div>
    </BrowserRouter>
  );
}

export default App;
