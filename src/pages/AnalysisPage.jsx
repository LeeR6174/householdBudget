import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, 
  AreaChart, Area, PieChart, Pie
} from 'recharts';
import { db } from '../db/db';
import { getCurrentBudgetMonth, getMonthRange, getLocalDateString } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';
import MonthSelector from '../components/MonthSelector';
import { ArrowUpRight, ArrowDownRight, TrendingUp, PiggyBank, CreditCard, HelpCircle, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function AnalysisPage() {
  const [currentMonth, setCurrentMonth] = useState(getCurrentBudgetMonth());
  const { startDate, endDate } = getMonthRange(currentMonth);

  // 1. 基本データ取得
  const categories = useLiveQuery(() => db.categories.toArray().then(cats => cats.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  const subscriptions = useLiveQuery(() => db.subscriptions.toArray()) || [];
  
  // 過去6ヶ月分のトレンド用データを取得
  const trendStartDate = useMemo(() => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() - 5);
    return getLocalDateString(d).slice(0, 7) + '-01';
  }, [startDate]);

  const allRelevantTx = useLiveQuery(() => 
    db.transactions
      .where('date').between(trendStartDate, endDate, true, true)
      .toArray()
  , [trendStartDate, endDate]) || [];

  // 2. データ加工（当月）
  const currentMonthTx = allRelevantTx.filter(tx => tx.date >= startDate && tx.date <= endDate);
  
  const analytics = useMemo(() => {
    let income = 0;
    let expense = 0;
    const catExpenses = {};
    const dailyExpenses = {};
    const assetTypeExpenses = { bank: 0, cash: 0, credit: 0 };
    
    // 固定費・変動費・緊急支出の分類
    let fixedExpense = 0;
    let variableExpense = 0;
    let emergencyExpense = 0;
    const fixedKeywords = ['家賃', '住宅', '電気', 'ガス', '水道', '通信', '光熱費', '保険', 'サブスク', 'ローン', '学費', '固定費', '定期'];
    const subCategoryIds = subscriptions.map(s => s.categoryId);

    // 今月の日数
    const d = new Date(startDate);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

    currentMonthTx.forEach(tx => {
      if (tx.type === 'income') income += tx.amount;
      if (tx.type === 'expense') {
        if (!tx.isSavingsDepletion) {
          expense += tx.amount;
          
          // カテゴリ別
          catExpenses[tx.categoryId || 'uncategorized'] = (catExpenses[tx.categoryId || 'uncategorized'] || 0) + tx.amount;
          
          // 日別
          const day = parseInt(tx.date.split('-')[2]);
          dailyExpenses[day] = (dailyExpenses[day] || 0) + tx.amount;

          // 支払い方法別
          const asset = assets.find(a => a.id === tx.assetId);
          if (asset) assetTypeExpenses[asset.type] += tx.amount;

          // 固定費 vs 変動費 vs 緊急支出
          const cat = categories.find(c => c.id === tx.categoryId);
          const isEmergency = cat && (cat.isEmergency || cat.isFixed || cat.name === '緊急支出');
          const isFixed = cat && (
            subCategoryIds.includes(cat.id) ||
            fixedKeywords.some(kw => cat.name.includes(kw))
          );
          
          if (isEmergency) {
            emergencyExpense += tx.amount;
          } else if (isFixed) {
            fixedExpense += tx.amount;
          } else {
            variableExpense += tx.amount;
          }
        }
      }
    });

    const savingsRate = income > 0 ? Math.max(0, ((income - expense) / income) * 100) : 0;

    return { 
      income, expense, catExpenses, dailyExpenses, assetTypeExpenses, 
      savingsRate, fixedExpense, variableExpense, emergencyExpense, daysInMonth 
    };
  }, [currentMonthTx, startDate, assets, categories, subscriptions]);

  // 先月データの集計（MoM用）
  const lastMonthStr = useMemo(() => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() - 1);
    return getLocalDateString(d).slice(0, 7);
  }, [startDate]);

  const lastMonthStats = useMemo(() => {
    const lastMonthTx = allRelevantTx.filter(tx => tx.date.startsWith(lastMonthStr));
    let income = 0;
    let expense = 0;
    let variableExpense = 0;
    let emergencyExpense = 0;
    
    const fixedKeywords = ['家賃', '住宅', '電気', 'ガス', '水道', '通信', '光熱費', '保険', 'サブスク', 'ローン', '学費', '固定費', '定期'];
    const subCategoryIds = subscriptions.map(s => s.categoryId);

    lastMonthTx.forEach(tx => {
      if (tx.type === 'income') income += tx.amount;
      if (tx.type === 'expense') {
        if (!tx.isSavingsDepletion) {
          expense += tx.amount;
          
          const cat = categories.find(c => c.id === tx.categoryId);
          const isEmergency = cat && (cat.isEmergency || cat.isFixed || cat.name === '緊急支出');
          const isFixed = cat && (
            subCategoryIds.includes(cat.id) ||
            fixedKeywords.some(kw => cat.name.includes(kw))
          );
          
          if (isEmergency) {
            emergencyExpense += tx.amount;
          } else if (!isFixed) {
            variableExpense += tx.amount;
          }
        }
      }
    });

    return { income, expense, variableExpense, emergencyExpense };
  }, [allRelevantTx, lastMonthStr, categories, subscriptions]);

  // 過去平均と比較した「削減ターゲット」自動選出ロジック
  const reconciliationAdvice = useMemo(() => {
    const pastMonths = [];
    for (let i = 5; i >= 1; i--) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() - i);
      pastMonths.push(getLocalDateString(d).slice(0, 7));
    }

    if (pastMonths.length === 0 || categories.length === 0) return null;

    const categoryAverages = {};
    categories.filter(c => c.type === 'expense').forEach(cat => {
      const pastTx = allRelevantTx.filter(tx => 
        tx.categoryId === cat.id && 
        tx.type === 'expense' && 
        !tx.isSavingsDepletion && 
        pastMonths.some(m => tx.date.startsWith(m))
      );
      
      const total = pastTx.reduce((sum, t) => sum + t.amount, 0);
      categoryAverages[cat.id] = total / pastMonths.length;
    });

    let maxOverAmount = 0;
    let targetCategory = null;
    let avgAmountForTarget = 0;

    categories.filter(c => c.type === 'expense' && !c.isEmergency && !c.isFixed && c.name !== '緊急支出').forEach(cat => {
      const currentSpent = analytics.catExpenses[cat.id] || 0;
      const average = categoryAverages[cat.id] || 0;
      const overAmount = currentSpent - average;
      
      if (overAmount > maxOverAmount && average > 0) {
        maxOverAmount = overAmount;
        targetCategory = cat;
        avgAmountForTarget = average;
      }
    });

    return {
      targetCategory,
      overAmount: maxOverAmount,
      average: avgAmountForTarget
    };
  }, [allRelevantTx, categories, startDate, analytics.catExpenses]);

  // カテゴリ別支出推移のためのState
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  useEffect(() => {
    if (categories.length > 0 && !selectedCategoryId) {
      // 最大支出カテゴリを初期値とする
      let maxCatId = '';
      let maxAmount = -1;
      categories.filter(c => c.type === 'expense').forEach(cat => {
        const spent = analytics.catExpenses[cat.id] || 0;
        if (spent > maxAmount) {
          maxAmount = spent;
          maxCatId = cat.id;
        }
      });
      if (maxCatId) {
        setSelectedCategoryId(maxCatId);
      } else {
        const expenseCats = categories.filter(c => c.type === 'expense');
        if (expenseCats.length > 0) {
          setSelectedCategoryId(expenseCats[0].id);
        }
      }
    }
  }, [categories, analytics.catExpenses, selectedCategoryId]);

  // 選択カテゴリの過去6ヶ月の月別支出データ作成
  const categoryTrendData = useMemo(() => {
    if (!selectedCategoryId) return [];
    
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() - i);
      months.push(getLocalDateString(d).slice(0, 7));
    }

    return months.map(m => {
      const monthTx = allRelevantTx.filter(tx => 
        tx.date.startsWith(m) && 
        tx.categoryId === selectedCategoryId && 
        tx.type === 'expense' &&
        !tx.isSavingsDepletion
      );
      const amount = monthTx.reduce((sum, t) => sum + t.amount, 0);
      return {
        name: m.split('-')[1] + '月',
        amount: amount
      };
    });
  }, [allRelevantTx, selectedCategoryId, startDate]);

  // トレンドデータの整形 (6ヶ月全体収支)
  const trendData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() - i);
      months.push(getLocalDateString(d).slice(0, 7));
    }

    return months.map(m => {
      const monthTx = allRelevantTx.filter(tx => tx.date.startsWith(m));
      const inc = monthTx.filter(tx => tx.type === 'income').reduce((s, t) => s + t.amount, 0);
      const exp = monthTx.filter(tx => tx.type === 'expense' && !tx.isSavingsDepletion).reduce((s, t) => s + t.amount, 0);
      return { name: m.split('-')[1] + '月', income: inc, expense: exp };
    });
  }, [allRelevantTx, startDate]);

  // カテゴリ別データの整形
  const categoryChartData = useMemo(() => {
    const data = categories
      .filter(c => c.type === 'expense')
      .map(cat => ({
        id: cat.id,
        name: cat.name,
        value: analytics.catExpenses[cat.id] || 0,
        fill: cat.color || '#8884d8',
        isEmergency: cat.id === 'cat_special_emergency' || cat.name === '緊急支出'
      }));
    if (analytics.catExpenses['uncategorized'] > 0) {
      data.push({ id: 'uncategorized', name: '未分類・不明', value: analytics.catExpenses['uncategorized'], fill: '#9ca3af', isEmergency: false });
    }
    return data.filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [categories, analytics.catExpenses]);

  // 支払い方法データの整形
  const paymentChartData = useMemo(() => [
    { name: '銀行振替', value: analytics.assetTypeExpenses.bank, color: '#4f46e5' },
    { name: '現金', value: analytics.assetTypeExpenses.cash, color: '#10b981' },
    { name: 'クレジットカード', value: analytics.assetTypeExpenses.credit, color: '#f43f5e' },
  ].filter(d => d.value > 0), [analytics.assetTypeExpenses]);

  // プレミアムなガラスモルフィズム風カスタムツールチップ
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: '12px',
          padding: '10px 14px',
          boxShadow: 'var(--shadow-md)',
          margin: 0
        }}>
          <p className="font-bold text-xs mb-xs" style={{ color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>{label}</p>
          {payload.map((p, i) => (
            <p key={i} style={{ color: p.color || p.fill, fontSize: '0.85rem', fontWeight: 800, margin: 0 }}>
              {p.name}: {formatCurrency(p.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const [activeTab, setActiveTab] = useState('summary'); // 'summary', 'categories'
  const [showSavingsHelp, setShowSavingsHelp] = useState(false);

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="page-title">分析ダッシュボード</div>
      <MonthSelector currentMonth={currentMonth} onChange={setCurrentMonth} />

      {/* Tabs */}
      <div className="toggle-group mb-lg">
        <button 
          className={`toggle-btn ${activeTab === 'summary' ? 'active expense' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          概要
        </button>
        <button 
          className={`toggle-btn ${activeTab === 'categories' ? 'active expense' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          カテゴリ分析
        </button>
      </div>

      {activeTab === 'summary' && (
        <div className="animate-fade-in">
          {/* 💡 削減ターゲット自動提案カード */}
          {reconciliationAdvice && reconciliationAdvice.targetCategory ? (
            <div className="card mb-md" style={{
              backgroundColor: 'rgba(244, 63, 94, 0.04)',
              border: '1px dashed rgba(244, 63, 94, 0.2)',
              padding: '16px',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'start',
              gap: '12px'
            }}>
              <AlertCircle className="text-expense flex-shrink-0" size={20} style={{ marginTop: '2px' }} />
              <div>
                <h4 className="font-bold text-sm text-expense" style={{ margin: '0 0 4px 0' }}>💡 今月の削減ターゲット</h4>
                <p className="text-xs text-secondary leading-relaxed" style={{ margin: 0 }}>
                  今月は <span className="font-bold text-slate-800" style={{ color: 'var(--text-primary)' }}>{reconciliationAdvice.targetCategory.name}</span> の支出が過去平均（{formatCurrency(reconciliationAdvice.average)}）より <span className="font-black text-expense">{formatCurrency(reconciliationAdvice.overAmount)}</span> 多くなっています。少しセーブすることを意識してみましょう。
                </p>
              </div>
            </div>
          ) : (
            <div className="card mb-md" style={{
              backgroundColor: 'rgba(16, 185, 129, 0.04)',
              border: '1px dashed rgba(16, 185, 129, 0.2)',
              padding: '16px',
              borderRadius: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <CheckCircle2 className="text-income flex-shrink-0" size={20} />
              <div>
                <h4 className="font-bold text-sm text-income" style={{ margin: '0 0 2px 0' }}>🎉 順調な家計簿</h4>
                <p className="text-xs text-secondary" style={{ margin: 0 }}>
                  すべてのカテゴリが過去の平均支出以下に抑えられています！素晴らしいペースです。
                </p>
              </div>
            </div>
          )}

          {/* 1. 収支サマリー & 前月比インジケータ */}
          <div className="grid grid-cols-2 gap-md mb-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="card" style={{ margin: 0, padding: '16px', backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
              <div className="text-[10px] text-secondary font-bold mb-xs flex items-center gap-xs">
                <ArrowUpRight size={12} className="text-income" /> 収入
              </div>
              <div className="text-xl font-bold text-income flex items-center justify-between">
                <span>{formatCurrency(analytics.income)}</span>
                {lastMonthStats.income > 0 && (
                  <span style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '9999px',
                    backgroundColor: analytics.income >= lastMonthStats.income ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                    color: analytics.income >= lastMonthStats.income ? 'var(--income-color)' : 'var(--expense-color)',
                    fontWeight: 'bold'
                  }}>
                    {analytics.income >= lastMonthStats.income ? `↑ ` : `↓ `}
                    {Math.abs(((analytics.income - lastMonthStats.income) / lastMonthStats.income) * 100).toFixed(0)}%
                  </span>
                )}
              </div>
            </div>
            <div className="card" style={{ margin: 0, padding: '16px', backgroundColor: 'rgba(244, 63, 94, 0.05)', border: '1px solid rgba(244, 63, 94, 0.1)' }}>
              <div className="text-[10px] text-secondary font-bold mb-xs flex items-center gap-xs">
                <ArrowDownRight size={12} className="text-expense" /> 支出
              </div>
              <div className="text-xl font-bold text-expense flex items-center justify-between">
                <span>{formatCurrency(analytics.expense)}</span>
                {lastMonthStats.expense > 0 && (
                  <span style={{
                    fontSize: '9px',
                    padding: '2px 6px',
                    borderRadius: '9999px',
                    backgroundColor: analytics.expense <= lastMonthStats.expense ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                    color: analytics.expense <= lastMonthStats.expense ? 'var(--income-color)' : 'var(--expense-color)',
                    fontWeight: 'bold'
                  }}>
                    {analytics.expense <= lastMonthStats.expense ? `↓ ` : `↑ `}
                    {Math.abs(((analytics.expense - lastMonthStats.expense) / lastMonthStats.expense) * 100).toFixed(0)}%
                  </span>
                )}
              </div>
              {analytics.emergencyExpense > 0 && (
                <div className="text-[10px] font-bold text-rose-500 mt-xs">
                  (内 緊急 {formatCurrency(analytics.emergencyExpense)})
                </div>
              )}
            </div>
          </div>

          {/* ⚖️ 固定費・変動費の分離分析 */}
          <div className="card mb-md" style={{ padding: '20px' }}>
            <h3 className="font-bold text-sm mb-sm flex items-center gap-xs text-primary" style={{ margin: '0 0 12px 0' }}>
              ⚖️ 固定費・変動費バランス
            </h3>
            <div className="flex-between text-xs text-secondary mb-xs font-bold">
              <span>固定費 (削りにくい)</span>
              <span>変動費 (自分の努力)</span>
              {analytics.emergencyExpense > 0 && (
                <span className="text-rose-500 font-bold">🚨 緊急支出</span>
              )}
            </div>
            <div className="flex-between text-base font-bold mb-sm">
              <span style={{ color: 'var(--primary-color)' }}>{formatCurrency(analytics.fixedExpense)}</span>
              <span style={{ color: '#ec4899' }}>{formatCurrency(analytics.variableExpense)}</span>
              {analytics.emergencyExpense > 0 && (
                <span style={{ color: '#f43f5e' }}>{formatCurrency(analytics.emergencyExpense)}</span>
              )}
            </div>
            <div className="progress-container" style={{ height: '10px', backgroundColor: 'rgba(0,0,0,0.05)', display: 'flex', overflow: 'hidden' }}>
              <div style={{
                width: `${analytics.expense > 0 ? (analytics.fixedExpense / analytics.expense) * 100 : 50}%`,
                backgroundColor: 'var(--primary-color)',
                height: '100%'
              }}></div>
              <div style={{
                width: `${analytics.expense > 0 ? (analytics.variableExpense / analytics.expense) * 100 : 50}%`,
                backgroundColor: '#ec4899',
                height: '100%'
              }}></div>
              {analytics.emergencyExpense > 0 && (
                <div style={{
                  width: `${analytics.expense > 0 ? (analytics.emergencyExpense / analytics.expense) * 100 : 0}%`,
                  backgroundColor: '#f43f5e',
                  height: '100%'
                }}></div>
              )}
            </div>
            {lastMonthStats.variableExpense > 0 && (
              <div className="text-[10px] text-secondary mt-md font-bold flex items-center justify-between" style={{ opacity: 0.8 }}>
                <span>努力の成果 (変動費の前月比 ※緊急支出を除く)</span>
                <span style={{
                  color: analytics.variableExpense <= lastMonthStats.variableExpense ? 'var(--income-color)' : 'var(--expense-color)',
                  fontSize: '11px'
                }}>
                  {analytics.variableExpense <= lastMonthStats.variableExpense ? '▼ 先月より ' : '▲ 先月より '}
                  {formatCurrency(Math.abs(analytics.variableExpense - lastMonthStats.variableExpense))}
                  {analytics.variableExpense <= lastMonthStats.variableExpense ? ' 削減！' : ' 増加'}
                </span>
              </div>
            )}
          </div>

          <div className="card mb-md" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: 'white', padding: '24px' }}>
            <div className="flex-between items-center">
              <div>
                <div className="text-xs opacity-70 font-bold mb-xs flex items-center gap-xs">
                  <PiggyBank size={14} /> 貯蓄率
                </div>
                <div className="text-4xl font-black">{analytics.savingsRate.toFixed(1)}%</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] opacity-60 font-bold mb-xs">今月の手残り額</div>
                <div className="text-xl font-bold">{formatCurrency(analytics.income - analytics.expense)}</div>
              </div>
            </div>
            <div className="progress-container" style={{ backgroundColor: 'rgba(255,255,255,0.1)', height: '8px' }}>
              <div className="progress-bar" style={{ width: `${Math.min(100, analytics.savingsRate)}%`, backgroundColor: analytics.savingsRate > 20 ? 'var(--income-color)' : analytics.savingsRate > 10 ? 'var(--warning-color)' : 'var(--expense-color)' }}></div>
            </div>
          </div>

          {/* 貯蓄率の簡潔な説明 */}
          <div className="card mb-lg" style={{ backgroundColor: 'rgba(79, 70, 229, 0.05)', border: '1px solid rgba(79, 70, 229, 0.1)', padding: '16px' }}>
            <div className="flex-between items-center mb-sm">
              <h4 className="text-sm font-bold text-primary flex items-center gap-xs" style={{ margin: 0 }}>
                <TrendingUp size={16} /> 貯蓄率について
              </h4>
              <button 
                onClick={() => setShowSavingsHelp(!showSavingsHelp)}
                className="flex items-center gap-xs text-[10px] font-bold text-primary opacity-70 hover:opacity-100 transition-opacity"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                <HelpCircle size={14} /> 詳しく見る
              </button>
            </div>
            
            <p className="text-xs text-secondary leading-relaxed" style={{ margin: 0 }}>
              収入のうち、どれだけを将来のために残せたかを示す指標です。資産形成のスピードを測る重要な数字です。
            </p>

            {showSavingsHelp && (
              <div className="mt-md animate-fade-in">
                <div className="grid grid-cols-1 gap-md">
                  <div className="flex items-center gap-md p-md rounded-xl bg-white shadow-sm border border-slate-50">
                    <div className="w-10 h-10 rounded-full flex-center flex-shrink-0 font-black text-xs" style={{ backgroundColor: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary-color)' }}>式</div>
                    <div className="text-[11px] text-secondary">
                      <span className="font-bold text-primary block mb-xs">計算方法</span>
                      (収入 - 支出) ÷ 収入 × 100
                    </div>
                  </div>
                  <div className="flex items-center gap-md p-md rounded-xl bg-white shadow-sm border border-slate-50">
                    <div className="w-10 h-10 rounded-full flex-center flex-shrink-0 font-black text-xs" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--income-color)' }}>20</div>
                    <div className="text-[11px] text-secondary">
                      <span className="font-bold text-income block mb-xs">目標: 20%以上</span>
                      20%を超えると資産形成が加速します。まずはこのラインを目指して家計を最適化しましょう。
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. 推移グラフ */}
          <div className="card mb-lg">
            <h3 className="font-bold mb-lg flex items-center gap-sm" style={{ margin: '0 0 16px 0' }}>
              <TrendingUp size={18} className="text-primary" /> 月別推移 (6ヶ月)
            </h3>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer>
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--income-color)" stopOpacity={0.1}/><stop offset="95%" stopColor="var(--income-color)" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorExp" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--expense-color)" stopOpacity={0.1}/><stop offset="95%" stopColor="var(--expense-color)" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 10000 ? `${v/10000}万` : v} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" name="収入" dataKey="income" stroke="var(--income-color)" strokeWidth={3} fill="url(#colorInc)" animationDuration={1500} />
                  <Area type="monotone" name="支出" dataKey="expense" stroke="var(--expense-color)" strokeWidth={3} fill="url(#colorExp)" animationDuration={1500} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card" style={{ margin: 0 }}>
            <h3 className="font-bold mb-md flex items-center gap-sm text-primary" style={{ margin: '0 0 16px 0' }}>
              <CreditCard size={18} /> 支払い方法別
            </h3>
            <div className="flex items-center">
              <div style={{ width: '50%', height: 140 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie 
                      data={paymentChartData} 
                      innerRadius={40} 
                      outerRadius={60} 
                      paddingAngle={5} 
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                      animationDuration={1000}
                    >
                      {paymentChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1">
                {paymentChartData.map((item, i) => (
                  <div key={i} className="flex-between items-center mb-xs">
                    <div className="flex items-center gap-sm">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                      <span className="text-xs font-bold text-secondary">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold">{((item.value / analytics.expense) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'categories' && (
        <div className="animate-fade-in">
          {/* ドーナツチャート ＋ 中央総額ラベル */}
          <div className="card mb-lg">
            <h3 className="font-bold mb-lg flex items-center gap-sm" style={{ margin: '0 0 16px 0' }}>
              <TrendingUp size={18} className="text-primary" /> カテゴリ別支出内訳
            </h3>
            <div style={{ position: 'relative', width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    animationDuration={1200}
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              
              {/* ドーナツ中央ラベル */}
              <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none'
              }}>
                <div style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>今月の総支出</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--text-primary)', marginTop: '2px' }}>{formatCurrency(analytics.expense)}</div>
              </div>
            </div>
          </div>

          {/* 📈 カテゴリ別支出の時系列推移（過去6ヶ月） */}
          <div className="card mb-lg">
            <div className="flex-between items-center mb-md">
              <h3 className="font-bold flex items-center gap-xs text-primary" style={{ margin: 0 }}>
                <TrendingUp size={18} /> カテゴリ別推移 (6ヶ月)
              </h3>
              <select 
                className="form-control"
                style={{ width: 'auto', padding: '6px 12px', fontSize: '12px', margin: 0, height: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
              >
                {categories.filter(c => c.type === 'expense').map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {categoryTrendData.length > 0 && categoryTrendData.some(d => d.amount > 0) ? (
              <div style={{ width: '100%', height: 200, marginTop: '16px' }}>
                <ResponsiveContainer>
                  <AreaChart data={categoryTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCatTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={categories.find(c => c.id === selectedCategoryId)?.color || 'var(--primary-color)'} stopOpacity={0.2}/>
                        <stop offset="95%" stopColor={categories.find(c => c.id === selectedCategoryId)?.color || 'var(--primary-color)'} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} tickFormatter={(v) => v >= 10000 ? `${v/10000}万` : v} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area 
                      type="monotone" 
                      name="支出額" 
                      dataKey="amount" 
                      stroke={categories.find(c => c.id === selectedCategoryId)?.color || 'var(--primary-color)'} 
                      strokeWidth={3} 
                      fill="url(#colorCatTrend)" 
                      animationDuration={1000} 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-xl text-center text-secondary text-sm">
                このカテゴリの過去6ヶ月間の支出データがありません
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="font-bold mb-lg" style={{ margin: '0 0 16px 0' }}>詳細リスト</h3>
            {categoryChartData.length > 0 ? (
              <div className="mt-md">
                {categoryChartData.map((item, idx) => (
                  <div key={idx} className="list-item" style={{ padding: '12px 0' }}>
                    <div className="flex items-center gap-md flex-1 min-w-0">
                      <div className="category-block" style={{ backgroundColor: item.fill, color: '#fff' }}>
                        {item.name.slice(0, 4)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate mb-1 flex items-center gap-xs">
                          <span>{item.name}</span>
                          {item.isEmergency && (
                            <span style={{
                              fontSize: '9px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(244,63,94,0.15)',
                              color: '#f43f5e',
                              fontWeight: 800
                            }}>
                              🚨 緊急枠
                            </span>
                          )}
                        </div>
                        <div className="progress-container" style={{ height: '6px', backgroundColor: 'rgba(0,0,0,0.03)' }}>
                          <div className="progress-bar" style={{ 
                            width: `${(item.value / analytics.expense) * 100}%`, 
                            backgroundColor: item.fill,
                            boxShadow: `0 0 8px ${item.fill}44`
                          }}></div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-md flex-shrink-0">
                      <div className="font-bold text-base">{formatCurrency(item.value)}</div>
                      <div className="text-[10px] text-secondary font-bold">{((item.value / analytics.expense) * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-xl text-center text-secondary">データがありません</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
