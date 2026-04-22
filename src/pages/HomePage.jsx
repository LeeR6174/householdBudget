import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency } from '../utils/format';
import { getCurrentBudgetMonth, getMonthRange } from '../utils/dateUtils';
import MonthSelector from '../components/MonthSelector';
import BudgetProgressBar from '../components/BudgetProgressBar';
import TransactionItem from '../components/TransactionItem';
import { calculateCarryoverBalance } from '../utils/budgetUtils';

export default function HomePage() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(getCurrentBudgetMonth());
  const { startDate, endDate } = getMonthRange(currentMonth);

  // Queries
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get('master'));
  const monthlyBudgets = useLiveQuery(() => db.monthlyBudgets.where('month').equals(currentMonth).toArray(), [currentMonth]) || [];
  const allMonthlyBudgets = useLiveQuery(() => db.monthlyBudgets.toArray()) || [];
  const monthlySettings = useLiveQuery(() => db.monthlySettings.get(currentMonth), [currentMonth]);
  const allMonthlySettings = useLiveQuery(() => db.monthlySettings.toArray()) || [];
  
  const currentMonthTx = useLiveQuery(() => {
    return db.transactions
      .filter(tx => tx.date >= startDate && tx.date <= endDate)
      .reverse()
      .toArray();
  }, [startDate, endDate]) || [];

  const allTx = useLiveQuery(() => db.transactions.toArray()) || [];

  // --- 資産計算 ---
  const assetBalances = {};
  assets.forEach(a => assetBalances[a.id] = a.initialBalance || 0);

  allTx.forEach(t => {
    // --- 【残高計算】 ---
    if (t.type === 'income') {
      if (assetBalances[t.assetId] !== undefined) assetBalances[t.assetId] += t.amount;
    } else if (t.type === 'expense') {
      if (assetBalances[t.assetId] !== undefined) assetBalances[t.assetId] -= t.amount;
    } else if (t.type === 'transfer') {
      if (assetBalances[t.fromAssetId] !== undefined) assetBalances[t.fromAssetId] -= t.amount;
      if (assetBalances[t.toAssetId] !== undefined) assetBalances[t.toAssetId] += t.amount;
    }
  });

  // 手元実資産 (銀行＋現金の合計)
  const realBalance = assets
    .filter(a => a.type === 'bank' || a.type === 'cash')
    .reduce((sum, a) => sum + (assetBalances[a.id] || 0), 0);

  // クレジットカード残高合計
  const creditBalance = assets
    .filter(a => a.type === 'credit')
    .reduce((sum, a) => sum + (assetBalances[a.id] || 0), 0);

  // 未払い総額 (マイナス残高の絶対値、UI表示用)
  const unpaidTotal = creditBalance < 0 ? Math.abs(creditBalance) : 0;

  // --- 貯金確保額の解決 (初期貯金額 + 現在の月までの累計積み立て額) ---
  const initialSavings = settings?.targetSavings || 0;
  const accumulatedSavings = allMonthlySettings
    .filter(s => s.month <= currentMonth)
    .reduce((sum, s) => sum + s.targetSavings, 0);
  
  const totalSavings = initialSavings + accumulatedSavings;

  // 本当の意味で使えるお金 (手元資金 + クレカ残高(通常マイナス) - 貯金確保額)
  const netWorth = realBalance + creditBalance - totalSavings;

  // --- 今月の収支計算 (カード払いは利用月としてそのまま計上) ---
  let income = 0;
  let expense = 0;
  const expenseByCategory = {};
  
  currentMonthTx.forEach(t => {
    if (t.type === 'income') income += t.amount;
    if (t.type === 'expense') {
      expense += t.amount;
      expenseByCategory[t.categoryId || 'uncategorized'] = (expenseByCategory[t.categoryId || 'uncategorized'] || 0) + t.amount;
    }
  });

  // 予算合計の計算
  const budgetMap = {};
  monthlyBudgets.forEach(b => budgetMap[b.categoryId] = b.budget);
  
  let totalBudget = 0;
  categories.filter(c => c.type === 'expense').forEach(cat => {
    const limit = cat.isCarryover 
      ? calculateCarryoverBalance(cat, currentMonth, allTx, allMonthlyBudgets) + (expenseByCategory[cat.id] || 0)
      : (budgetMap[cat.id] !== undefined ? budgetMap[cat.id] : (cat.monthlyLimit || 0));
    totalBudget += limit;
  });

  const recentTransactions = currentMonthTx.slice(0, 5);

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="page-title">ホーム</div>

      {/* 初期設定案内バナー */}
      {assets.length === 0 && (
        <div className="card mb-lg" style={{ border: '2px dashed var(--primary-color)', backgroundColor: 'rgba(79, 70, 229, 0.05)', textAlign: 'center' }}>
          <div className="text-2xl mb-sm">👋 はじめまして！</div>
          <p className="text-sm text-secondary mb-md">
            まずは口座の残高や貯金の目標を設定して、家計簿をスタートしましょう。
          </p>
          <button className="btn btn-primary" onClick={() => navigate('/settings/initial-balance')}>
            初期設定をする
          </button>
        </div>
      )}
      <MonthSelector currentMonth={currentMonth} onChange={setCurrentMonth} />
      
      {/* 👑 4階層の資産表示 (Premium Card Widget) */}
      <div className="card" style={{ 
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)', 
        color: 'white',
        padding: '24px', 
        borderRadius: '24px',
        boxShadow: '0 20px 25px -5px rgba(15, 23, 42, 0.2), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
        position: 'relative',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)'
      }}>
        {/* Decorative background circle */}
        <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', blur: '20px' }}></div>
        
        <div className="flex-between mb-sm" style={{ position: 'relative', zIndex: 1 }}>
          <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>🏦 口座残高（手元資金）</div>
          <div className="font-bold text-lg" style={{ color: '#fff' }}>{formatCurrency(realBalance)}</div>
        </div>

        <div className="flex-between mb-sm" style={{ position: 'relative', zIndex: 1 }}>
          <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>💳 カード未払総額</div>
          <div className="font-bold text-lg" style={{ color: '#fca5a5' }}>-{formatCurrency(unpaidTotal)}</div>
        </div>

        <div className="flex-between pb-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', position: 'relative', zIndex: 1 }}>
          <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>🐷 貯金総額</div>
          <div className="font-bold text-lg" style={{ color: '#818cf8' }}>-{formatCurrency(totalSavings)}</div>
        </div>

        <div className="flex-between pt-md" style={{ position: 'relative', zIndex: 1 }}>
          <div className="text-sm font-bold opacity-90" style={{ color: 'rgba(255,255,255,0.9)' }}>💎 実質残高 (使えるお金)</div>
          <div className="text-3xl font-black" style={{ color: netWorth < 0 ? '#fca5a5' : '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}>
            {formatCurrency(netWorth)}
          </div>
        </div>
      </div>

      <div className="flex-between gap-md mb-lg">
        <div className="card w-full text-center" style={{ margin: 0, padding: '16px' }}>
          <div className="text-xs text-secondary">当月 収入</div>
          <div className="font-bold text-income text-lg">{formatCurrency(income)}</div>
        </div>
        <div className="card w-full text-center" style={{ margin: 0, padding: '16px' }}>
          <div className="text-xs text-secondary">当月 支出</div>
          <div className="font-bold text-expense text-lg">{formatCurrency(expense)}</div>
        </div>
      </div>

      <h3 className="font-bold mb-md mt-lg">当月のカテゴリ別予算・支出</h3>
      <div className="card">
        {categories.filter(c => c.type === 'expense').map(cat => {
          const limit = cat.isCarryover 
            ? calculateCarryoverBalance(cat, currentMonth, allTx, allMonthlyBudgets) + (expenseByCategory[cat.id] || 0)
            : (budgetMap[cat.id] !== undefined ? budgetMap[cat.id] : (cat.monthlyLimit || 0));
            
          return (
            <BudgetProgressBar 
              key={cat.id} 
              category={cat} 
              spent={expenseByCategory[cat.id] || 0} 
              limit={limit}
              isCarryover={cat.isCarryover}
            />
          );
        })}
        
        {/* カテゴリ未設定の支出がある場合 */}
        {expenseByCategory['uncategorized'] > 0 && (
          <BudgetProgressBar 
            category={{ name: '未分類・不明', color: '#9ca3af', type: 'expense' }} 
            spent={expenseByCategory['uncategorized']} 
            limit={0}
          />
        )}

        {categories.filter(c => c.type === 'expense').length === 0 && !expenseByCategory['uncategorized'] && (
          <p className="text-secondary text-sm text-center">カテゴリがありません</p>
        )}

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border-color)' }} />
        
        <div className="flex-between font-bold text-sm">
          <span>合計</span>
          <div>
            <span className="text-expense">{formatCurrency(expense)}</span>
            {totalBudget > 0 && (
              <span className="text-secondary ml-sm">/ {formatCurrency(totalBudget)}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-between mb-md mt-lg">
        <h3 className="font-bold">当月の履歴</h3>
        <button className="text-sm text-primary font-semibold" onClick={() => navigate('/history')} style={{ background:'transparent', border:'none' }}>
          すべて見る
        </button>
      </div>
      <div className="card" style={{ padding: '0 16px' }}>
        {recentTransactions.map(tx => (
          <TransactionItem 
            key={tx.id} 
            transaction={tx} 
            categories={categories} 
            assets={assets} 
            onClick={() => navigate(`/edit/${tx.id}`)}
          />
        ))}
        {recentTransactions.length === 0 && (
          <p className="text-secondary text-sm text-center py-md mt-md">履歴がありません</p>
        )}
      </div>

      <button className="fab" onClick={() => navigate('/add')}>
        <Plus size={28} />
      </button>
    </div>
  );
}
