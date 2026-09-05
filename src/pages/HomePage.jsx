import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, SlidersHorizontal, Sparkles } from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency } from '../utils/format';
import { getCurrentBudgetMonth, getMonthRange, getLocalDateString } from '../utils/dateUtils';
import MonthSelector from '../components/MonthSelector';
import BudgetProgressBar from '../components/BudgetProgressBar';
import TransactionItem from '../components/TransactionItem';
import ReconciliationModal from '../components/ReconciliationModal';
import { useDashboardStats } from '../hooks/useDashboardStats';

export default function HomePage() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(getCurrentBudgetMonth());
  const { startDate, endDate } = getMonthRange(currentMonth);

  const stats = useDashboardStats(currentMonth, startDate, endDate);
  
  // 照合モーダルの状態管理
  const masterSettings = useLiveQuery(() => db.settings.get('master'));
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [skipReconciliation, setSkipReconciliation] = useState(
    sessionStorage.getItem('skipReconciliation') === 'true'
  );

  useEffect(() => {
    if (stats?.isLoaded && masterSettings && !skipReconciliation) {
      const lastDateStr = masterSettings.lastReconciliationDate;
      let shouldShow = false;
      
      if (!lastDateStr) {
        shouldShow = true;
      } else {
        const lastDate = new Date(lastDateStr);
        const today = new Date(getLocalDateString());
        const diffTime = Math.abs(today - lastDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        shouldShow = diffDays >= 7;
      }

      if (shouldShow) {
        setShowReconcileModal(true);
      }
    }
  }, [stats?.isLoaded, masterSettings, skipReconciliation]);

  const handleSkipReconciliation = () => {
    sessionStorage.setItem('skipReconciliation', 'true');
    setSkipReconciliation(true);
    setShowReconcileModal(false);
  };
  
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
    realNetBalance,
    projectedMonthEndBalance,
    netWorth,
    income,
    expense,
    normalExpense,
    emergencyExpense,
    totalBudget,
    remainingBudget,
    recentTransactions,
    categoryStats,
    uncategorizedExpense
  } = stats;

  const currentRealNet = realNetBalance !== undefined ? realNetBalance : netWorth;
  const currentProjected = projectedMonthEndBalance !== undefined ? projectedMonthEndBalance : (currentRealNet - Math.max(0, remainingBudget || 0));
  const currentProjectedWithEmergency = stats.projectedMonthEndBalanceWithEmergency !== undefined 
    ? stats.projectedMonthEndBalanceWithEmergency 
    : (currentProjected - (emergencyExpense || 0));

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
      
      {/* 👑 資産引き算ダッシュボード (Premium Card Widget) */}
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
        <div style={{ position: 'absolute', top: '-20px', right: '-20px', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', filter: 'blur(20px)' }}></div>
        
        {/* ① 手元資金 */}
        <div 
          style={{ 
            position: 'relative', 
            zIndex: 1, 
            padding: '8px 12px',
            margin: '0 -12px',
            borderRadius: '12px',
          }}
        >
          <div className="flex-between">
            <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>🏦 手元資金 (銀行＋現金)</div>
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

        {/* 差し引き記号とボーダー */}
        <div style={{ borderLeft: '2px dashed rgba(255,255,255,0.2)', height: '16px', marginLeft: '12px', margin: '4px 0' }}></div>

        {/* ② カード未払額 */}
        <div 
          style={{ 
            position: 'relative', 
            zIndex: 1, 
            padding: '8px 12px',
            margin: '0 -12px',
            borderRadius: '12px',
          }}
        >
          <div className="flex-between">
            <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>💳 カード未払総額</div>
            <div className="font-bold text-base" style={{ color: '#fca5a5' }}>− {formatCurrency(unpaidTotal)}</div>
          </div>
        </div>

        <div style={{ borderLeft: '2px dashed rgba(255,255,255,0.2)', height: '16px', marginLeft: '12px', margin: '4px 0' }}></div>

        {/* ③ 貯金総額 */}
        <div 
          style={{ 
            position: 'relative', 
            zIndex: 1, 
            padding: '8px 12px',
            margin: '0 -12px',
            borderRadius: '12px',
          }}
        >
          <div className="flex-between">
            <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>🐷 貯金総額 (キープ分)</div>
            <div className="font-bold text-base" style={{ color: '#818cf8' }}>− {formatCurrency(totalSavings)}</div>
          </div>
          {(stats.currentMonthTargetSavings > 0 || stats.currentMonthDepletions > 0 || stats.currentMonthExtraAdditions > 0) && (
            <div className="text-[10px] mt-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              今月の動き: {stats.currentMonthTargetSavings > 0 && `積立+${formatCurrency(stats.currentMonthTargetSavings)} `}
              {stats.currentMonthExtraAdditions > 0 && `臨時+${formatCurrency(stats.currentMonthExtraAdditions)} `}
              {stats.currentMonthDepletions > 0 && `切り崩し-${formatCurrency(stats.currentMonthDepletions)}`}
            </div>
          )}
        </div>

        {/* イコール線 */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', margin: '14px 0 10px 0', position: 'relative', zIndex: 1 }}></div>

        {/* ④ 実質残高（現在のフリー資金） */}
        <div style={{ position: 'relative', zIndex: 1, padding: '4px 0' }}>
          <div className="flex-between items-center flex-wrap gap-xs">
            <div>
              <div className="text-sm font-bold" style={{ color: '#38bdf8' }}>💎 実質残高 (現在のフリー資金)</div>
              <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>手元資金 − カード未払額 − 貯金総額</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black" style={{ color: currentRealNet < 0 ? '#fca5a5' : '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.3)', lineHeight: '1.1' }}>
                {formatCurrency(currentRealNet)}
              </div>
            </div>
          </div>
        </div>

        {/* ⑤ 今月の予算 & 今月末での予測金 */}
        <div style={{ 
          marginTop: '16px', 
          padding: '14px 16px', 
          backgroundColor: 'rgba(255,255,255,0.06)', 
          borderRadius: '18px', 
          border: '1px solid rgba(255,255,255,0.12)',
          position: 'relative', 
          zIndex: 1 
        }}>
          {/* 総予算 / 通常支出 */}
          <div className="flex-between items-center mb-xs">
            <span className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.85)' }}>
              📅 今月の総予算 / 通常支出
            </span>
            <span className="text-xs font-bold" style={{ color: '#fed7aa' }}>
              {formatCurrency(totalBudget)} / {formatCurrency(normalExpense !== undefined ? normalExpense : expense)}
            </span>
          </div>
          <div className="flex-between items-center text-[11px] mb-xs" style={{ color: 'rgba(255,255,255,0.6)' }}>
            <span>残り通常予算</span>
            <span className="font-bold" style={{ color: (remainingBudget ?? 0) < 0 ? '#fca5a5' : '#a7f3d0' }}>
              {(remainingBudget ?? 0) < 0 ? `超過 -${formatCurrency(Math.abs(remainingBudget))}` : formatCurrency(remainingBudget || 0)}
            </span>
          </div>
          {emergencyExpense > 0 && (
            <div className="text-[10px] text-right font-medium mb-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
              ※緊急支出 {formatCurrency(emergencyExpense)} は総予算に含まれません
            </div>
          )}

          <div style={{ borderTop: '1px dashed rgba(255,255,255,0.15)', margin: '10px 0 10px 0' }}></div>

          {/* 今月末での予測金（通常予算ベース） */}
          <div className="flex-between items-center">
            <div>
              <div className="text-xs font-bold flex items-center gap-xs" style={{ color: '#c084fc' }}>
                <span>🔮 今月末での予測金</span>
                <span style={{ fontSize: '9px', opacity: 0.8, fontWeight: 'normal', backgroundColor: 'rgba(192, 132, 252, 0.2)', padding: '1px 5px', borderRadius: '4px' }}>通常予算ベース</span>
              </div>
              <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>実質残高 − 残り通常予算 (予算通りの着地)</div>
            </div>
            <div className="text-xl font-black" style={{ color: currentProjected < 0 ? '#fca5a5' : '#e9d5ff', letterSpacing: '-0.02em' }}>
              {formatCurrency(currentProjected)}
            </div>
          </div>

          {/* その下で、追加で（緊急支出を引いた金額）で今月末の予測金を記述 */}
          {emergencyExpense > 0 ? (
            <div style={{
              marginTop: '12px',
              padding: '12px 14px',
              backgroundColor: 'rgba(239, 68, 68, 0.16)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '14px',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.18)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)'
            }}>
              <div className="flex-between items-center">
                <div>
                  <div className="text-xs font-black flex items-center gap-xs" style={{ color: '#fca5a5' }}>
                    <span style={{ fontSize: '13px' }}>🚨</span>
                    <span>緊急支出差引後の予測金</span>
                  </div>
                  <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.75)', marginTop: '3px' }}>
                    通常予測 − 緊急支出 ({formatCurrency(emergencyExpense)})
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-black" style={{ color: currentProjectedWithEmergency < 0 ? '#f87171' : '#fecaca', letterSpacing: '-0.02em' }}>
                    {formatCurrency(currentProjectedWithEmergency)}
                  </div>
                  <div className="text-[9px] font-bold" style={{ color: '#fca5a5', opacity: 0.8 }}>
                    差引額: -{formatCurrency(emergencyExpense)}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-between items-center mt-xs pt-xs" style={{ borderTop: '1px dotted rgba(255,255,255,0.12)' }}>
              <div>
                <div className="text-[11px] font-bold flex items-center gap-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  <span>🚨 緊急支出差引後の予測金</span>
                </div>
                <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  今月の緊急支出なし (¥0)
                </div>
              </div>
              <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.75)' }}>
                {formatCurrency(currentProjected)}
              </div>
            </div>
          )}
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
          {emergencyExpense > 0 && (
            <div className="text-[10px] font-bold mt-xs text-expense" style={{ opacity: 0.85 }}>
              (内 緊急 {formatCurrency(emergencyExpense)})
            </div>
          )}
        </div>
      </div>

      <div className="flex-between items-center mb-md mt-lg">
        <h3 className="font-bold" style={{ margin: 0 }}>当月のカテゴリ別予算・支出</h3>
        <button 
          className="text-xs text-primary font-bold flex items-center gap-xs" 
          onClick={() => navigate(`/budget?month=${currentMonth}`)}
          style={{ 
            background: 'rgba(79, 70, 229, 0.08)', 
            border: 'none', 
            padding: '6px 12px', 
            borderRadius: '12px', 
            cursor: 'pointer' 
          }}
        >
          <SlidersHorizontal size={14} />
          <span>予算設定</span>
        </button>
      </div>

      <div className="card">
        {/* もし当月の総予算が未設定（0円）の場合にクイック設定アシストを表示 */}
        {totalBudget === 0 && categoryStats.length > 0 && (
          <div className="p-sm mb-md flex-between items-center" style={{ 
            backgroundColor: 'rgba(79, 70, 229, 0.06)', 
            borderRadius: '12px', 
            border: '1px dashed var(--primary-color-light)' 
          }}>
            <div className="text-xs text-secondary font-bold flex items-center gap-xs">
              <Sparkles size={14} className="text-primary" />
              <span>今月の予算が未設定です</span>
            </div>
            <button 
              className="btn btn-primary" 
              style={{ fontSize: '0.75rem', padding: '6px 12px', height: 'auto', borderRadius: '8px', fontWeight: 'bold' }}
              onClick={() => navigate(`/budget?month=${currentMonth}`)}
            >
              予算を設定する
            </button>
          </div>
        )}

        {categoryStats.map(catStat => (
          <BudgetProgressBar 
            key={catStat.id} 
            category={catStat} 
            spent={catStat.spent} 
            limit={catStat.limit}
            isCarryover={catStat.isCarryover}
            isEmergency={catStat.isEmergency}
            onClick={() => navigate(`/budget?month=${currentMonth}`)}
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

        <div className="flex-between text-xs text-secondary mt-xs flex-wrap gap-xs" style={{ opacity: 0.85 }}>
          <span>積立・緊急を含む総合計</span>
          <div>
            <span className="font-semibold">{formatCurrency(expense)}</span>
            {totalBudget > 0 && (
              <span className="ml-xs">/ 通常総予算 {formatCurrency(totalBudget)}</span>
            )}
            {emergencyExpense > 0 && (
              <span className="ml-xs text-expense font-bold">(内 緊急 {formatCurrency(emergencyExpense)})</span>
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

      {/* 残高照合モーダル */}
      <ReconciliationModal 
        isOpen={showReconcileModal} 
        onClose={handleSkipReconciliation} 
        onComplete={() => setShowReconcileModal(false)} 
      />
    </div>
  );
}
