import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { getCurrentBudgetMonth, getMonthRange } from '../utils/dateUtils';
import MonthSelector from '../components/MonthSelector';
import BudgetProgressBar from '../components/BudgetProgressBar';
import TransactionItem from '../components/TransactionItem';
import { useDashboardStats } from '../hooks/useDashboardStats';

export default function HomePage() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(getCurrentBudgetMonth());
  const { startDate, endDate } = getMonthRange(currentMonth);

  const stats = useDashboardStats(currentMonth, startDate, endDate);
  
  if (!stats) {
    return (
      <div className="page-container flex-center" style={{ minHeight: '100vh', paddingBottom: '100px' }}>
        <div className="text-secondary font-bold">データを読み込み中...</div>
      </div>
    );
  }

  const {
    assets,
    categories,
    realBalance,
    bankBalance,
    cashBalance,
    unpaidTotal,
    totalSavings,
    netWorth,
    income,
    expense,
    totalBudget,
    recentTransactions,
    categoryStats,
    uncategorizedExpense
  } = stats;

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
        
        <div className="mb-md" style={{ position: 'relative', zIndex: 1 }}>
          <div className="flex-between">
            <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>🏦 銀行・現金（手元資金）</div>
            <div className="font-bold text-lg" style={{ color: '#fff' }}>{formatCurrency(realBalance)}</div>
          </div>
          <div className="flex gap-md mt-xs" style={{ opacity: 0.8 }}>
            <div className="text-xs">
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>銀行: </span>
              <span className="font-bold" style={{ color: '#fff' }}>{formatCurrency(bankBalance)}</span>
            </div>
            <div className="text-xs">
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>現金: </span>
              <span className="font-bold" style={{ color: '#fff' }}>{formatCurrency(cashBalance)}</span>
            </div>
          </div>
        </div>

        <div className="flex-between mb-sm" style={{ position: 'relative', zIndex: 1 }}>
          <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>💳 カード未払総額</div>
          <div className="font-bold text-lg" style={{ color: '#fca5a5' }}>-{formatCurrency(unpaidTotal)}</div>
        </div>

        <div className="flex-between pb-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.15)', position: 'relative', zIndex: 1 }}>
          <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>🐷 貯金総額</div>
          <div className="font-bold text-lg" style={{ color: '#818cf8' }}>-{formatCurrency(totalSavings)}</div>
        </div>

        <div className="flex-between pt-md mt-sm" style={{ borderTop: '1px solid rgba(255,255,255,0.15)', position: 'relative', zIndex: 1, gap: '12px', flexWrap: 'wrap' }}>
          <div className="text-sm font-bold opacity-90" style={{ color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>💎 実質残高 (使えるお金)</div>
          <div className="text-right" style={{ minWidth: '120px' }}>
            <div className="text-3xl font-black" style={{ color: netWorth < 0 ? '#fca5a5' : '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.3)', lineHeight: '1.1' }}>
              {formatCurrency(netWorth)}
            </div>
            <div className="text-[10px] mt-xs" style={{ color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
              今月の残り支出: {formatCurrency(totalBudget - expense)}
            </div>
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
        {categoryStats.map(catStat => (
          <BudgetProgressBar 
            key={catStat.id} 
            category={catStat} 
            spent={catStat.spent} 
            limit={catStat.limit}
            isCarryover={catStat.isCarryover}
            onClick={() => navigate(`/settings/categories?edit=${catStat.id}`)}
          />
        ))}
        
        {/* カテゴリ未設定の支出がある場合 */}
        {uncategorizedExpense > 0 && (
          <BudgetProgressBar 
            category={{ name: '未分類・不明', color: '#9ca3af', type: 'expense' }} 
            spent={uncategorizedExpense} 
            limit={0}
            onClick={() => navigate('/settings/categories')}
          />
        )}

        {categoryStats.length === 0 && uncategorizedExpense === 0 && (
          <p className="text-secondary text-sm text-center">カテゴリがありません</p>
        )}

        
        <div className="flex-between text-xs text-secondary mt-xs" style={{ opacity: 0.8 }}>
          <span>積立を含む総合計</span>
          <div>
            <span>{formatCurrency(expense)}</span>
            {totalBudget > 0 && (
              <span className="ml-sm">/ {formatCurrency(totalBudget)}</span>
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
