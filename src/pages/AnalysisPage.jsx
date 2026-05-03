import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, 
  LineChart, Line, AreaChart, Area, Legend, PieChart, Pie
} from 'recharts';
import { db } from '../db/db';
import { getCurrentBudgetMonth, getMonthRange } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';
import MonthSelector from '../components/MonthSelector';
import { ArrowUpRight, ArrowDownRight, TrendingUp, PiggyBank, CreditCard, Calendar, HelpCircle } from 'lucide-react';

export default function AnalysisPage() {
  const [currentMonth, setCurrentMonth] = useState(getCurrentBudgetMonth());
  const { startDate, endDate } = getMonthRange(currentMonth);

  // 1. 基本データ取得
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  
  // 過去6ヶ月分のトレンド用データを取得
  const trendStartDate = useMemo(() => {
    const d = new Date(startDate);
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().slice(0, 7) + '-01';
  }, [startDate]);

  const allRelevantTx = useLiveQuery(() => 
    db.transactions
      .where('date').between(trendStartDate, endDate, true, true)
      .toArray()
  , [trendStartDate, endDate]) || [];

  // 2. データ加工
  const currentMonthTx = allRelevantTx.filter(tx => tx.date >= startDate && tx.date <= endDate);
  
  const analytics = useMemo(() => {
    let income = 0;
    let expense = 0;
    const catExpenses = {};
    const dailyExpenses = {};
    const assetTypeExpenses = { bank: 0, cash: 0, credit: 0 };
    
    // 曜日別詳細データ (0:日, 1:月, ..., 6:土)
    const dayOfWeekStats = {
      0: { total: 0, count: 0 },
      1: { total: 0, count: 0 },
      2: { total: 0, count: 0 },
      3: { total: 0, count: 0 },
      4: { total: 0, count: 0 },
      5: { total: 0, count: 0 },
      6: { total: 0, count: 0 },
    };

    // 今月の日数と各曜日の出現回数
    const d = new Date(startDate);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    
    for (let i = 1; i <= daysInMonth; i++) {
      dailyExpenses[i] = 0;
      const date = new Date(d.getFullYear(), d.getMonth(), i);
      const dayOfWeek = date.getDay();
      dayOfWeekStats[dayOfWeek].count++;
    }

    currentMonthTx.forEach(tx => {
      if (tx.type === 'income') income += tx.amount;
      if (tx.type === 'expense') {
        expense += tx.amount;
        
        // カテゴリ別
        catExpenses[tx.categoryId || 'uncategorized'] = (catExpenses[tx.categoryId || 'uncategorized'] || 0) + tx.amount;
        
        // 日別
        const day = parseInt(tx.date.split('-')[2]);
        dailyExpenses[day] = (dailyExpenses[day] || 0) + tx.amount;

        // 支払い方法別
        const asset = assets.find(a => a.id === tx.assetId);
        if (asset) assetTypeExpenses[asset.type] += tx.amount;

        // 曜日別詳細
        const txDate = new Date(tx.date);
        const dayOfWeek = txDate.getDay();
        dayOfWeekStats[dayOfWeek].total += tx.amount;
      }
    });

    // 貯蓄率
    const savingsRate = income > 0 ? Math.max(0, ((income - expense) / income) * 100) : 0;

    // 曜日別平均データの整形 (月曜から順に)
    const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const weekdayChartData = [1, 2, 3, 4, 5, 6, 0].map(dayIdx => {
      const stats = dayOfWeekStats[dayIdx];
      return {
        name: weekdayNames[dayIdx],
        avg: stats.count > 0 ? Math.round(stats.total / stats.count) : 0,
        dayIdx
      };
    });

    // 最も出費が多い曜日
    const maxSpendingDay = [...weekdayChartData].sort((a, b) => b.avg - a.avg)[0];

    return { 
      income, expense, catExpenses, dailyExpenses, assetTypeExpenses, 
      weekdayChartData, maxSpendingDay, savingsRate, daysInMonth 
    };
  }, [currentMonthTx, startDate, assets]);

  // トレンドデータの整形
  const trendData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }

    return months.map(m => {
      const monthTx = allRelevantTx.filter(tx => tx.date.startsWith(m));
      const inc = monthTx.filter(tx => tx.type === 'income').reduce((s, t) => s + t.amount, 0);
      const exp = monthTx.filter(tx => tx.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return { name: m.split('-')[1] + '月', income: inc, expense: exp };
    });
  }, [allRelevantTx, startDate]);

  // カテゴリ別データの整形
  const categoryChartData = useMemo(() => {
    const data = categories
      .filter(c => c.type === 'expense')
      .map(cat => ({
        name: cat.name,
        value: analytics.catExpenses[cat.id] || 0,
        color: cat.color || '#8884d8'
      }));
    if (analytics.catExpenses['uncategorized'] > 0) {
      data.push({ name: '未分類・不明', value: analytics.catExpenses['uncategorized'], color: '#9ca3af' });
    }
    return data.filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  }, [categories, analytics.catExpenses]);

  // 支払い方法データの整形
  const paymentChartData = useMemo(() => [
    { name: '銀行振替', value: analytics.assetTypeExpenses.bank, color: '#4f46e5' },
    { name: '現金', value: analytics.assetTypeExpenses.cash, color: '#10b981' },
    { name: 'クレジットカード', value: analytics.assetTypeExpenses.credit, color: '#f43f5e' },
  ].filter(d => d.value > 0), [analytics.assetTypeExpenses]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="card" style={{ padding: '8px 12px', border: '1px solid var(--border-color)', marginBottom: 0, boxShadow: 'var(--shadow-md)' }}>
          <p className="font-bold text-xs mb-xs">{label}</p>
          {payload.map((p, i) => (
            <p key={i} style={{ color: p.color || p.fill, fontSize: '0.875rem', fontWeight: 700 }}>
              {p.name}: {formatCurrency(p.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const [activeTab, setActiveTab] = useState('summary'); // 'summary', 'categories', 'weekday'
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
          カテゴリ別
        </button>
        <button 
          className={`toggle-btn ${activeTab === 'weekday' ? 'active expense' : ''}`}
          onClick={() => setActiveTab('weekday')}
        >
          曜日別
        </button>
      </div>

      {activeTab === 'summary' && (
        <div className="animate-fade-in">
          {/* 1. 収支サマリー & 貯蓄率 */}
          <div className="grid grid-cols-2 gap-md mb-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="card" style={{ margin: 0, padding: '16px', backgroundColor: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
              <div className="text-[10px] text-secondary font-bold mb-xs flex items-center gap-xs">
                <ArrowUpRight size={12} className="text-income" /> 収入
              </div>
              <div className="text-xl font-bold text-income">{formatCurrency(analytics.income)}</div>
            </div>
            <div className="card" style={{ margin: 0, padding: '16px', backgroundColor: 'rgba(244, 63, 94, 0.05)', border: '1px solid rgba(244, 63, 94, 0.1)' }}>
              <div className="text-[10px] text-secondary font-bold mb-xs flex items-center gap-xs">
                <ArrowDownRight size={12} className="text-expense" /> 支出
              </div>
              <div className="text-xl font-bold text-expense">{formatCurrency(analytics.expense)}</div>
            </div>
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
            <div className="progress-container mt-md" style={{ backgroundColor: 'rgba(255,255,255,0.1)', height: '8px' }}>
              <div className="progress-bar" style={{ width: `${Math.min(100, analytics.savingsRate)}%`, backgroundColor: analytics.savingsRate > 20 ? 'var(--income-color)' : analytics.savingsRate > 10 ? 'var(--warning-color)' : 'var(--expense-color)' }}></div>
            </div>
          </div>

          {/* 貯蓄率の簡潔な説明 */}
          <div className="card mb-lg" style={{ backgroundColor: 'rgba(79, 70, 229, 0.05)', border: '1px solid rgba(79, 70, 229, 0.1)', padding: '16px' }}>
            <div className="flex-between items-center mb-sm">
              <h4 className="text-sm font-bold text-primary flex items-center gap-xs">
                <TrendingUp size={16} /> 貯蓄率について
              </h4>
              <button 
                onClick={() => setShowSavingsHelp(!showSavingsHelp)}
                className="flex items-center gap-xs text-[10px] font-bold text-primary opacity-70 hover:opacity-100 transition-opacity"
              >
                <HelpCircle size={14} /> 詳しく見る
              </button>
            </div>
            
            <p className="text-xs text-secondary leading-relaxed">
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
            <h3 className="font-bold mb-lg flex items-center gap-sm">
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
            <h3 className="font-bold mb-md flex items-center gap-sm">
              <CreditCard size={18} className="text-primary" /> 支払い方法別
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
                    <div className="flex items-center gap-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></div>
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
          <div className="card mb-lg">
            <h3 className="font-bold mb-lg flex items-center gap-sm">
              <TrendingUp size={18} className="text-primary" /> カテゴリ別支出内訳
            </h3>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={categoryChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    animationDuration={1200}
                  >
                    {categoryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold mb-lg">詳細リスト</h3>
            {categoryChartData.length > 0 ? (
              <div className="mt-md">
                {categoryChartData.map((item, idx) => (
                  <div key={idx} className="list-item" style={{ padding: '12px 0' }}>
                    <div className="flex items-center gap-md flex-1 min-w-0">
                      <div className="category-block" style={{ backgroundColor: item.color, color: '#fff' }}>
                        {item.name.slice(0, 4)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate mb-1">{item.name}</div>
                        <div className="progress-container" style={{ height: '6px', backgroundColor: 'rgba(0,0,0,0.03)' }}>
                          <div className="progress-bar" style={{ 
                            width: `${(item.value / analytics.expense) * 100}%`, 
                            backgroundColor: item.color,
                            boxShadow: `0 0 8px ${item.color}44`
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

      {activeTab === 'weekday' && (
        <div className="animate-fade-in">
          <div className="card mb-lg">
            <h3 className="font-bold mb-lg flex items-center gap-sm">
              <Calendar size={18} className="text-primary" /> 曜日別平均支出
            </h3>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={analytics.weekdayChartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700 }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10 }} 
                    tickFormatter={(v) => v >= 10000 ? `${(v/10000).toFixed(1).replace('.0', '')}万` : v} 
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]} name="平均支出" animationDuration={1000}>
                    {analytics.weekdayChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={analytics.expense > 0 && entry.avg === analytics.maxSpendingDay.avg ? 'var(--expense-color)' : 'var(--primary-color-light)'} 
                        fillOpacity={analytics.expense > 0 && entry.avg === analytics.maxSpendingDay.avg ? 1 : 0.6}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {analytics.expense > 0 ? (
            <div className="card" style={{ backgroundColor: 'rgba(244, 63, 94, 0.05)', border: '1px solid rgba(244, 63, 94, 0.1)', padding: '20px' }}>
              <h4 className="font-bold text-expense flex items-center gap-sm mb-md">
                <TrendingUp size={16} /> 曜日別の傾向分析
              </h4>
              <p className="text-xs font-bold text-secondary mb-md">
                今月は <span className="text-expense text-lg">{analytics.maxSpendingDay.name}曜日</span> の出費が最も多い傾向にあります。
              </p>
              <div className="p-md rounded-xl bg-white shadow-sm border border-slate-50">
                <div className="flex-between">
                  <span className="text-xs font-bold text-secondary">{analytics.maxSpendingDay.name}曜日の平均支出</span>
                  <span className="text-lg font-black text-expense">{formatCurrency(analytics.maxSpendingDay.avg)}</span>
                </div>
              </div>
              <p className="text-[10px] mt-md text-secondary opacity-70 leading-relaxed">
                ※ 各曜日の総支出を、その曜日の日数で割った「1日あたりの平均」を表示しています。特定の曜日に買い出しをまとめたり、固定の出費があったりする場合に数値が高くなります。
              </p>
            </div>
          ) : (
            <div className="card text-center py-xl text-secondary" style={{ backgroundColor: 'rgba(0,0,0,0.02)', border: '1px dashed var(--border-color)' }}>
              今月の支出データがまだありません。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
