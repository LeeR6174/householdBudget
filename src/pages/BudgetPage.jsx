import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  ChevronLeft, Copy, Check, Save, Sparkles, RotateCcw, 
  TrendingUp, TrendingDown, ArrowRight, Info
} from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency } from '../utils/format';
import { getCurrentBudgetMonth, getPrevMonth, getMonthRange } from '../utils/dateUtils';
import MonthSelector from '../components/MonthSelector';

export default function BudgetPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const initialMonth = searchParams.get('month') || getCurrentBudgetMonth();
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  
  // Local state for all category budget inputs for the selected month: { [catId]: string }
  const [budgetInputs, setBudgetInputs] = useState({});
  const [isSaved, setIsSaved] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const categories = useLiveQuery(() => 
    db.categories.where('type').equals('expense').toArray().then(cats => cats.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
  ) || [];

  const currentMonthBudgets = useLiveQuery(() => 
    db.monthlyBudgets.where('month').equals(selectedMonth).toArray()
  , [selectedMonth]) || [];

  const prevMonth = getPrevMonth(selectedMonth);
  const prevMonthBudgets = useLiveQuery(() => 
    db.monthlyBudgets.where('month').equals(prevMonth).toArray()
  , [prevMonth]) || [];

  // 前月の支出実績を取得
  const { startDate: prevStart, endDate: prevEnd } = useMemo(() => getMonthRange(prevMonth), [prevMonth]);
  const prevMonthTxs = useLiveQuery(() => 
    db.transactions.where('date').between(prevStart, prevEnd, true, true).toArray()
  , [prevStart, prevEnd]) || [];

  const prevSpentByCat = useMemo(() => {
    const map = {};
    prevMonthTxs.forEach(t => {
      if (t.type === 'expense' && !t.isSavingsDepletion && t.categoryId) {
        map[t.categoryId] = (map[t.categoryId] || 0) + t.amount;
      }
    });
    return map;
  }, [prevMonthTxs]);

  // その月の設定済みステータス判定
  const isConfiguredForThisMonth = currentMonthBudgets.length > 0;

  // 当月の入力初期化
  useEffect(() => {
    if (categories.length > 0) {
      const inputs = {};
      categories.forEach(cat => {
        const existing = currentMonthBudgets.find(b => b.categoryId === cat.id);
        if (existing) {
          inputs[cat.id] = existing.budget.toString();
        } else if (cat.monthlyLimit !== undefined && cat.monthlyLimit !== null && cat.monthlyLimit > 0) {
          inputs[cat.id] = cat.monthlyLimit.toString();
        } else {
          inputs[cat.id] = '';
        }
      });
      setBudgetInputs(inputs);
      setIsSaved(false);
      setHasChanges(false);
    }
  }, [selectedMonth, categories.length, currentMonthBudgets]);

  const handleMonthChange = (newMonth) => {
    setSelectedMonth(newMonth);
    setSearchParams({ month: newMonth });
  };

  const handleInputChange = (catId, val) => {
    setBudgetInputs(prev => ({
      ...prev,
      [catId]: val
    }));
    setIsSaved(false);
    setHasChanges(true);
  };

  // カテゴリ個別に先月の予算を適用
  const handleApplySinglePrevBudget = (catId, amount) => {
    handleInputChange(catId, (amount || 0).toString());
  };

  // 全カテゴリに先月の予算を一括反映
  const handleCopyPrevMonth = async () => {
    if (categories.length === 0) return;
    
    const newInputs = {};
    categories.forEach(cat => {
      const prevEntry = prevMonthBudgets.find(b => b.categoryId === cat.id);
      if (prevEntry && prevEntry.budget !== undefined) {
        newInputs[cat.id] = prevEntry.budget.toString();
      } else if (cat.monthlyLimit) {
        newInputs[cat.id] = cat.monthlyLimit.toString();
      } else {
        newInputs[cat.id] = '';
      }
    });

    setBudgetInputs(newInputs);

    // 一括保存
    await db.transaction('rw', db.monthlyBudgets, async () => {
      const existing = await db.monthlyBudgets.where('month').equals(selectedMonth).toArray();
      for (const item of existing) {
        await db.monthlyBudgets.delete(item.id);
      }

      for (const cat of categories) {
        if (cat.isEmergency || cat.isFixed || cat.name === '緊急支出') continue;
        const val = newInputs[cat.id];
        if (val !== '' && !isNaN(Number(val))) {
          await db.monthlyBudgets.add({
            categoryId: cat.id,
            month: selectedMonth,
            budget: Number(val)
          });
        }
      }
    });

    setIsSaved(true);
    setHasChanges(false);
    alert(`📋 前月（${displayPrevMonthStr}）の予算を反映して保存しました！`);
  };

  // 全て0円にリセット
  const handleResetAll = () => {
    if (!window.confirm('すべてのカテゴリの予算を0円（未設定）にしますか？')) return;
    const newInputs = {};
    categories.forEach(cat => {
      newInputs[cat.id] = '0';
    });
    setBudgetInputs(newInputs);
    setHasChanges(true);
  };

  // 一括保存
  const handleSaveAll = async (e) => {
    if (e) e.preventDefault();

    try {
      await db.transaction('rw', db.monthlyBudgets, async () => {
        const existing = await db.monthlyBudgets.where('month').equals(selectedMonth).toArray();
        for (const item of existing) {
          await db.monthlyBudgets.delete(item.id);
        }

        for (const cat of categories) {
          if (cat.isEmergency || cat.isFixed || cat.name === '緊急支出') continue;
          const val = budgetInputs[cat.id];
          if (val !== '' && val !== undefined && !isNaN(Number(val))) {
            await db.monthlyBudgets.add({
              categoryId: cat.id,
              month: selectedMonth,
              budget: Number(val)
            });
          }
        }
      });

      setIsSaved(true);
      setHasChanges(false);
      setTimeout(() => setIsSaved(false), 3000);
      alert('予算を保存しました！');
    } catch (err) {
      console.error(err);
      alert('保存に失敗しました');
    }
  };

  // 計算：当月総予算（緊急支出は除外）
  const totalBudget = useMemo(() => {
    return categories.reduce((sum, cat) => {
      const isEm = cat.isEmergency || cat.isFixed || cat.name === '緊急支出';
      if (isEm) return sum;
      const num = Number(budgetInputs[cat.id]);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  }, [categories, budgetInputs]);

  // 計算：前月総予算（緊急支出は除外）
  const prevTotalBudget = useMemo(() => {
    return categories.reduce((sum, cat) => {
      const isEm = cat.isEmergency || cat.isFixed || cat.name === '緊急支出';
      if (isEm) return sum;
      const prevEntry = prevMonthBudgets.find(b => b.categoryId === cat.id);
      const val = prevEntry ? prevEntry.budget : (cat.monthlyLimit || 0);
      return sum + val;
    }, 0);
  }, [categories, prevMonthBudgets]);

  const budgetDiff = totalBudget - prevTotalBudget;

  // 表示用の年月
  const [yearStr, monthNumStr] = selectedMonth.split('-');
  const displayMonthStr = `${yearStr}年${parseInt(monthNumStr, 10)}月分`;

  const [prevYearStr, prevMonthNumStr] = prevMonth.split('-');
  const displayPrevMonthStr = `${prevYearStr}年${parseInt(prevMonthNumStr, 10)}月分`;

  return (
    <div className="page-container" style={{ paddingBottom: '120px' }}>
      {/* Header */}
      <div className="flex gap-sm items-center mb-md">
        <button className="btn-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
          <span>戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>毎月の予算管理</div>
      </div>

      <p className="text-xs text-secondary mb-md leading-relaxed">
        各カテゴリの予算を月ごとに設定できます。先月の予算をワンクリックで引き継ぐことも可能です。
      </p>

      {/* Month Selector */}
      <MonthSelector currentMonth={selectedMonth} onChange={handleMonthChange} />

      {/* Monthly Budget Summary Hero Card */}
      <div className="card mb-md" style={{ 
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)',
        color: '#fff',
        padding: '22px 20px',
        borderRadius: '24px',
        boxShadow: '0 12px 28px -6px rgba(49, 46, 129, 0.35)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Decorative ambient blur */}
        <div style={{
          position: 'absolute',
          top: '-40px',
          right: '-40px',
          width: '130px',
          height: '130px',
          borderRadius: '50%',
          background: 'rgba(99, 102, 241, 0.25)',
          filter: 'blur(30px)'
        }} />

        <div className="flex-between items-start mb-xs">
          <div className="text-xs font-bold" style={{ color: 'rgba(255,255,255,0.7)', letterSpacing: '0.02em' }}>
            {displayMonthStr} 総予算
          </div>
          <div style={{
            fontSize: '0.65rem',
            fontWeight: '700',
            padding: '3px 8px',
            borderRadius: '9999px',
            backgroundColor: isConfiguredForThisMonth ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)',
            color: isConfiguredForThisMonth ? '#6ee7b7' : '#fde68a',
            border: isConfiguredForThisMonth ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)'
          }}>
            {isConfiguredForThisMonth ? '● 設定済み' : '○ 未保存'}
          </div>
        </div>

        <div className="text-3xl font-black mb-sm" style={{ color: '#fff', letterSpacing: '-0.02em' }}>
          {formatCurrency(totalBudget)}
        </div>

        {/* 前月比較 */}
        <div className="flex items-center gap-sm text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>
          <span>前月総予算: {formatCurrency(prevTotalBudget)}</span>
          {budgetDiff !== 0 && (
            <span style={{ 
              color: budgetDiff > 0 ? '#fca5a5' : '#86efac',
              display: 'flex',
              alignItems: 'center',
              gap: '2px'
            }}>
              ({budgetDiff > 0 ? `+${formatCurrency(budgetDiff)}` : formatCurrency(budgetDiff)})
            </span>
          )}
        </div>
      </div>

      {/* Quick Action Toolbar */}
      <div className="flex gap-sm mb-lg">
        <button 
          type="button"
          className="btn btn-outline flex-1 flex-center gap-xs font-bold"
          style={{ 
            fontSize: '0.8rem', 
            padding: '10px 12px', 
            borderRadius: '14px',
            backgroundColor: 'var(--surface-color)',
            borderColor: 'var(--primary-color-light)',
            color: 'var(--primary-color)'
          }}
          onClick={handleCopyPrevMonth}
        >
          <Copy size={16} />
          <span>先月の予算を一括反映</span>
        </button>
        <button 
          type="button"
          className="btn btn-outline flex-center gap-xs"
          style={{ 
            fontSize: '0.8rem', 
            padding: '10px 14px', 
            borderRadius: '14px',
            backgroundColor: 'var(--surface-color)',
            color: 'var(--text-secondary)'
          }}
          onClick={handleResetAll}
          title="すべて0円にする"
        >
          <RotateCcw size={15} />
          <span>クリア</span>
        </button>
      </div>

      {/* Categories List */}
      <div className="card" style={{ padding: '20px 16px' }}>
        <div className="flex-between items-center mb-md">
          <h3 className="font-bold text-sm text-secondary" style={{ margin: 0 }}>
            予算カテゴリ一覧（{displayMonthStr}）
          </h3>
          <span className="text-xs text-secondary">{categories.length}件</span>
        </div>

        <div style={{ display: 'grid', gap: '14px' }}>
          {categories.map(cat => {
            const isEmergency = cat.isEmergency || cat.isFixed || cat.name === '緊急支出';
            const val = budgetInputs[cat.id] ?? '';
            const prevEntry = prevMonthBudgets.find(b => b.categoryId === cat.id);
            const prevBudgetAmount = prevEntry ? prevEntry.budget : (cat.monthlyLimit || 0);
            const prevSpentAmount = prevSpentByCat[cat.id] || 0;

            return (
              <div 
                key={cat.id} 
                style={{
                  border: isEmergency ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--border-color)',
                  padding: '14px',
                  borderRadius: '18px',
                  backgroundColor: isEmergency ? 'rgba(239, 68, 68, 0.02)' : 'rgba(0,0,0,0.01)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
              >
                {/* Left Accent Strip */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: '4px',
                  backgroundColor: isEmergency ? 'var(--expense-color)' : (cat.color || 'var(--primary-color)')
                }} />

                {/* Header: Category Name & Type */}
                <div className="flex-between mb-sm" style={{ paddingLeft: '6px' }}>
                  <div className="flex-center gap-sm">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color || '#333' }} />
                    <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>{cat.name}</span>
                    {isEmergency && (
                      <span style={{ 
                        fontSize: '0.65rem', 
                        backgroundColor: 'rgba(239, 68, 68, 0.15)', 
                        color: 'var(--expense-color)', 
                        padding: '1px 6px', 
                        borderRadius: '9999px',
                        fontWeight: 'bold',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }}>
                        🚨 特別緊急枠
                      </span>
                    )}
                    {cat.isCarryover && (
                      <span style={{ 
                        fontSize: '0.65rem', 
                        backgroundColor: 'var(--primary-color)', 
                        color: 'white', 
                        padding: '1px 6px', 
                        borderRadius: '4px',
                        fontWeight: '600'
                      }}>
                        積立型
                      </span>
                    )}
                  </div>
                  {cat.description && (
                    <span className="text-xs text-secondary">{cat.description}</span>
                  )}
                </div>

                {/* Input Field or Emergency Notice */}
                {isEmergency ? (
                  <div className="flex-between items-center p-sm rounded-xl" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px dashed rgba(239, 68, 68, 0.3)', marginLeft: '6px', minHeight: '44px' }}>
                    <span className="text-xs font-bold text-expense flex items-center gap-xs">
                      <span>🚨</span>
                      <span>上限なし（今月の総予算に含まれません）</span>
                    </span>
                    <span className="text-[10px] font-bold text-secondary px-xs py-0.5 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.04)' }}>
                      設定不要
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex-center gap-sm" style={{ paddingLeft: '6px' }}>
                      <span className="font-bold text-sm text-secondary">¥</span>
                      <input 
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        className="form-control"
                        style={{ 
                          padding: '8px 12px', 
                          fontSize: '16px', 
                          fontWeight: '800', 
                          flex: 1,
                          borderRadius: '12px'
                        }}
                        value={val}
                        onChange={(e) => handleInputChange(cat.id, e.target.value)}
                      />
                      <span className="text-xs font-bold text-secondary">円</span>
                    </div>

                    {/* Contextual Reference Chips */}
                    <div className="flex items-center gap-sm mt-xs text-xs" style={{ paddingLeft: '6px', flexWrap: 'wrap' }}>
                      {prevBudgetAmount > 0 && (
                        <button
                          type="button"
                          className="text-[11px] text-secondary font-medium"
                          style={{
                            background: 'rgba(0,0,0,0.03)',
                            border: '1px solid var(--border-color)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          onClick={() => handleApplySinglePrevBudget(cat.id, prevBudgetAmount)}
                          title="クリックで先月の予算金額をセット"
                        >
                          先月予算: <span className="font-bold text-primary">{formatCurrency(prevBudgetAmount)}</span> ⤺
                        </button>
                      )}
                      {prevSpentAmount > 0 && (
                        <span className="text-[11px] text-secondary">
                          先月支出: {formatCurrency(prevSpentAmount)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {categories.length === 0 && (
            <p className="text-secondary text-sm text-center py-lg">支出カテゴリがありません</p>
          )}
        </div>

        {categories.length > 0 && (
          <div className="mt-xl">
            <button 
              type="button" 
              className="btn btn-primary w-full flex-center gap-xs"
              style={{ 
                height: '50px', 
                fontSize: '1.05rem', 
                fontWeight: 'bold',
                borderRadius: '16px',
                boxShadow: 'var(--shadow-md)'
              }}
              onClick={handleSaveAll}
            >
              {isSaved ? <Check size={20} /> : <Save size={20} />}
              <span>{isSaved ? '保存完了！' : 'この月の予算を保存する'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
