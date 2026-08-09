import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency } from '../utils/format';
import { getCurrentBudgetMonth, getMonthRange, getLocalDateString } from '../utils/dateUtils';
import MonthSelector from '../components/MonthSelector';
import BudgetProgressBar from '../components/BudgetProgressBar';
import TransactionItem from '../components/TransactionItem';
import { useDashboardStats } from '../hooks/useDashboardStats';

export default function HomePage() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(getCurrentBudgetMonth());
  const { startDate, endDate } = getMonthRange(currentMonth);

  const stats = useDashboardStats(currentMonth, startDate, endDate);
  
  // 照合モーダルの状態管理
  const masterSettings = useLiveQuery(() => db.settings.get('master'));
  const [showReconcileModal, setShowReconcileModal] = useState(false);
  const [reconciledAmounts, setReconciledAmounts] = useState({});
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
        const initialAmounts = {};
        stats.assets.filter(a => a.type !== 'credit').forEach(a => {
          initialAmounts[a.id] = '';
        });
        setReconciledAmounts(initialAmounts);
      }
    }
  }, [stats?.isLoaded, masterSettings, skipReconciliation]);

  const handleSkipReconciliation = () => {
    sessionStorage.setItem('skipReconciliation', 'true');
    setSkipReconciliation(true);
    setShowReconcileModal(false);
  };

  const handleCompleteReconciliation = async () => {
    await db.settings.update('master', {
      lastReconciliationDate: getLocalDateString()
    });
    setShowReconcileModal(false);
    alert('残高照合が完了しました！');
  };

  const handleReconciledAmountChange = (assetId, val) => {
    setReconciledAmounts(prev => ({
      ...prev,
      [assetId]: val
    }));
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
          onClick={() => navigate('/settings/initial-balance')}
          style={{ 
            position: 'relative', 
            zIndex: 1, 
            cursor: 'pointer',
            padding: '8px 12px',
            margin: '0 -12px',
            borderRadius: '12px',
            transition: 'background-color 0.2s',
          }}
          className="hover-bg-white-5"
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
          onClick={() => navigate('/card')}
          style={{ 
            position: 'relative', 
            zIndex: 1, 
            cursor: 'pointer',
            padding: '8px 12px',
            margin: '0 -12px',
            borderRadius: '12px',
            transition: 'background-color 0.2s',
          }}
          className="hover-bg-white-5"
        >
          <div className="flex-between">
            <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>💳 カード未払総額</div>
            <div className="font-bold text-base" style={{ color: '#fca5a5' }}>− {formatCurrency(unpaidTotal)}</div>
          </div>
        </div>

        <div style={{ borderLeft: '2px dashed rgba(255,255,255,0.2)', height: '16px', marginLeft: '12px', margin: '4px 0' }}></div>

        {/* ③ 貯金総額 */}
        <div 
          onClick={() => navigate('/settings/savings')}
          style={{ 
            position: 'relative', 
            zIndex: 1, 
            cursor: 'pointer',
            padding: '8px 12px',
            margin: '0 -12px',
            borderRadius: '12px',
            transition: 'background-color 0.2s',
          }}
          className="hover-bg-white-5"
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

        <div style={{ borderLeft: '2px dashed rgba(255,255,255,0.2)', height: '16px', marginLeft: '12px', margin: '4px 0' }}></div>

        {/* ④ 今月の残り予算 */}
        <div 
          onClick={() => navigate('/settings/categories')}
          style={{ 
            position: 'relative', 
            zIndex: 1, 
            cursor: 'pointer',
            padding: '8px 12px',
            margin: '0 -12px',
            borderRadius: '12px',
            transition: 'background-color 0.2s',
          }}
          className="hover-bg-white-5"
        >
          <div className="flex-between">
            <div className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.7)' }}>📅 今月の残り生活費予算</div>
            <div className="font-bold text-base" style={{ color: '#fed7aa' }}>− {formatCurrency(stats.remainingBudget)}</div>
          </div>
          <div className="text-[10px] mt-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
            総予算 {formatCurrency(totalBudget)} / 今月の支出 {formatCurrency(expense)}
          </div>
        </div>

        {/* イコール線 */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', margin: '12px 0 8px 0', position: 'relative', zIndex: 1 }}></div>

        {/* ⑤ 実質残高 */}
        <div style={{ position: 'relative', zIndex: 1, padding: '4px 0' }}>
          <div className="flex-between items-center flex-wrap gap-xs">
            <div>
              <div className="text-sm font-bold" style={{ color: '#38bdf8' }}>💎 実質残高 (使えるお金)</div>
              <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)', marginTop: '2px' }}>今月予算通りに使っても残るフリー資金</div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black" style={{ color: netWorth < 0 ? '#fca5a5' : '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.3)', lineHeight: '1.1' }}>
                {formatCurrency(netWorth)}
              </div>
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

      {/* 照合モーダル */}
      {showReconcileModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '16px'
        }}>
          <div className="card animate-fade-in" style={{
            width: '100%',
            maxWidth: '400px',
            backgroundColor: 'var(--surface-color)',
            borderRadius: '24px',
            boxShadow: 'var(--shadow-xl)',
            padding: '24px',
            maxHeight: '90vh',
            overflowY: 'auto',
            margin: 0
          }}>
            <div className="flex-between items-center mb-md">
              <h3 className="font-bold text-lg flex items-center gap-xs text-primary" style={{ margin: 0 }}>
                ⚖️ 週次の残高照合
              </h3>
              <button 
                onClick={handleSkipReconciliation}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <p className="text-xs text-secondary mb-lg leading-relaxed">
              実際の銀行残高や現金の額と、アプリ上の家計簿残高が一致しているか確認しましょう。
            </p>

            <div style={{ display: 'grid', gap: '16px' }}>
              {stats.assets.filter(a => a.type !== 'credit').map(asset => {
                const inputVal = reconciledAmounts[asset.id];
                const realAmount = inputVal === '' || inputVal === undefined ? null : Number(inputVal);
                const difference = realAmount !== null ? realAmount - (asset.balance || 0) : null;
                
                return (
                  <div key={asset.id} style={{
                    border: '1px solid var(--border-color)',
                    padding: '14px',
                    borderRadius: '16px',
                    backgroundColor: 'rgba(0,0,0,0.01)'
                  }}>
                    <div className="flex-between mb-sm">
                      <span className="font-bold text-sm text-secondary">{asset.name}</span>
                      <span className="text-xs font-bold text-secondary">
                        家計簿: <span className="font-black" style={{ color: 'var(--text-primary)' }}>{formatCurrency(asset.balance || 0)}</span>
                      </span>
                    </div>

                    <div className="flex-center gap-sm">
                      <input 
                        type="number"
                        inputMode="numeric"
                        placeholder="実際の残高を入力"
                        className="form-control"
                        style={{ padding: '8px 12px', fontSize: '14px', flex: 1 }}
                        value={inputVal ?? ''}
                        onChange={(e) => handleReconciledAmountChange(asset.id, e.target.value)}
                      />
                      <span className="text-xs font-bold text-secondary">円</span>
                    </div>

                    {difference !== null && (
                      <div className="mt-sm flex items-center gap-xs text-xs font-bold" style={{
                        color: difference === 0 ? 'var(--income-color)' : 'var(--expense-color)'
                      }}>
                        {difference === 0 ? (
                          <>
                            <CheckCircle2 size={14} />
                            <span>金額が完全に一致しています！🎉</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={14} />
                            <span>差額: {difference > 0 ? `+${formatCurrency(difference)}` : formatCurrency(difference)} (家計簿とのズレあり)</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-sm mt-xl">
              <button 
                className="btn btn-outline" 
                style={{ flex: 1 }}
                onClick={handleSkipReconciliation}
              >
                今はしない
              </button>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, fontWeight: 'bold' }}
                onClick={handleCompleteReconciliation}
              >
                完了する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
