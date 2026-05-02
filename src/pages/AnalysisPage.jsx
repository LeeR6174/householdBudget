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
import { ArrowUpRight, ArrowDownRight, TrendingUp, PiggyBank, CreditCard, Calendar } from 'lucide-react';

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
    const dayOfWeekExpenses = { weekday: 0, weekend: 0, weekdayCount: 0, weekendCount: 0 };

    // 今月の日数
    const d = new Date(startDate);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    
    // 日別データの初期化と曜日カウント
    for (let i = 1; i <= daysInMonth; i++) {
      dailyExpenses[i] = 0;
      const date = new Date(d.getFullYear(), d.getMonth(), i);
      const dayOfWeek = date.getDay(); // 0: Sun, 6: Sat
      if (dayOfWeek === 0 || dayOfWeek === 6) dayOfWeekExpenses.weekendCount++;
      else dayOfWeekExpenses.weekdayCount++;
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

        // 曜日別
        const txDate = new Date(tx.date);
        const dayOfWeek = txDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) dayOfWeekExpenses.weekend += tx.amount;
        else dayOfWeekExpenses.weekday += tx.amount;
      }
    });

    // 貯蓄率
    const savingsRate = income > 0 ? Math.max(0, ((income - expense) / income) * 100) : 0;

    return { 
      income, expense, catExpenses, dailyExpenses, assetTypeExpenses, 
      dayOfWeekExpenses, savingsRate, daysInMonth 
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
        amount: analytics.catExpenses[cat.id] || 0,
        color: cat.color || '#8884d8'
      }));
    if (analytics.catExpenses['uncategorized'] > 0) {
      data.push({ name: '未分類・不明', amount: analytics.catExpenses['uncategorized'], color: '#9ca3af' });
    }
    return data.filter(d => d.amount > 0).sort((a, b) => b.amount - a.amount);
  }, [categories, analytics.catExpenses]);

  // 支払い方法データの整形
  const paymentChartData = useMemo(() => [
    { name: '銀行振替', value: analytics.assetTypeExpenses.bank, color: '#4f46e5' },
    { name: '現金', value: analytics.assetTypeExpenses.cash, color: '#10b981' },
    { name: 'クレジットカード', value: analytics.assetTypeExpenses.credit, color: '#f43f5e' },
  ].filter(d => d.value > 0), [analytics.assetTypeExpenses]);

  // 曜日別データの整形 (1日あたり平均)
  const weekdayAvg = analytics.dayOfWeekExpenses.weekday / (analytics.dayOfWeekExpenses.weekdayCount || 1);
  const weekendAvg = analytics.dayOfWeekExpenses.weekend / (analytics.dayOfWeekExpenses.weekendCount || 1);

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

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="page-title">分析ダッシュボード</div>
      <MonthSelector currentMonth={currentMonth} onChange={setCurrentMonth} />

      {/* 1. 収支サマリー & 貯蓄率 */}
      <div className="grid grid-cols-2 gap-md mb-md" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div className="card" style={{ margin: 0, padding: '12px' }}>
          <div className="text-[10px] text-secondary font-bold mb-xs flex items-center gap-xs">
            <ArrowUpRight size={12} className="text-income" /> 収入
          </div>
          <div className="text-lg font-bold text-income">{formatCurrency(analytics.income)}</div>
        </div>
        <div className="card" style={{ margin: 0, padding: '12px' }}>
          <div className="text-[10px] text-secondary font-bold mb-xs flex items-center gap-xs">
            <ArrowDownRight size={12} className="text-expense" /> 支出
          </div>
          <div className="text-lg font-bold text-expense">{formatCurrency(analytics.expense)}</div>
        </div>
      </div>

      <div className="card mb-lg" style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', color: 'white', padding: '20px' }}>
        <div className="flex-between items-center">
          <div>
            <div className="text-xs opacity-70 font-bold mb-xs flex items-center gap-xs">
              <PiggyBank size={14} /> 貯蓄率
            </div>
            <div className="text-3xl font-black">{analytics.savingsRate.toFixed(1)}%</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] opacity-60 font-bold">今月の貯金額</div>
            <div className="text-xl font-bold">{formatCurrency(analytics.income - analytics.expense)}</div>
          </div>
        </div>
        <div className="progress-container mt-md" style={{ backgroundColor: 'rgba(255,255,255,0.1)', height: '6px' }}>
          <div className="progress-bar" style={{ width: `${analytics.savingsRate}%`, backgroundColor: analytics.savingsRate > 20 ? 'var(--income-color)' : 'var(--warning-color)' }}></div>
        </div>
        <p className="text-[10px] mt-xs opacity-50">※ 20%以上を目指すと資産形成が加速します</p>
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
              <Area type="monotone" name="収入" dataKey="income" stroke="var(--income-color)" strokeWidth={3} fill="url(#colorInc)" />
              <Area type="monotone" name="支出" dataKey="expense" stroke="var(--expense-color)" strokeWidth={3} fill="url(#colorExp)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. 支払い方法 & 曜日別 */}
      <div className="grid grid-cols-1 gap-md mb-lg" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
        <div className="card" style={{ margin: 0 }}>
          <h3 className="font-bold mb-md flex items-center gap-sm">
            <CreditCard size={18} className="text-primary" /> 支払い方法別
          </h3>
          <div className="flex items-center">
            <div style={{ width: '50%', height: 140 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={paymentChartData} innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                    {paymentChartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1">
              {paymentChartData.map((item, i) => (
                <div key={i} className="flex-between items-center mb-xs">
                  <div className="flex items-center gap-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-[10px] font-bold text-secondary">{item.name}</span>
                  </div>
                  <span className="text-xs font-bold">{((item.value / analytics.expense) * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ margin: 0 }}>
          <h3 className="font-bold mb-md flex items-center gap-sm">
            <Calendar size={18} className="text-primary" /> 曜日別 (1日平均)
          </h3>
          <div className="flex gap-md">
            <div className="flex-1 p-md rounded-lg text-center" style={{ backgroundColor: 'rgba(79, 70, 229, 0.05)' }}>
              <div className="text-[10px] font-bold text-secondary mb-xs">平日平均</div>
              <div className="text-lg font-black text-primary">{formatCurrency(Math.round(weekdayAvg))}</div>
            </div>
            <div className="flex-1 p-md rounded-lg text-center" style={{ backgroundColor: 'rgba(244, 63, 94, 0.05)' }}>
              <div className="text-[10px] font-bold text-secondary mb-xs">週末平均</div>
              <div className="text-lg font-black text-expense">{formatCurrency(Math.round(weekendAvg))}</div>
            </div>
          </div>
          <p className="text-[10px] mt-sm text-center text-secondary">
            {weekendAvg > weekdayAvg * 1.5 ? '⚠️ 週末の支出が平日よりかなり高い傾向です' : '✨ 安定した支出バランスです'}
          </p>
        </div>
      </div>

      {/* 4. カテゴリ別詳細 */}
      <div className="card">
        <h3 className="font-bold mb-lg">カテゴリ別支出</h3>
        {categoryChartData.length > 0 ? (
          <>
            <div className="mt-md">
              {categoryChartData.map((item, idx) => (
                <div key={idx} className="list-item" style={{ padding: '12px 0' }}>
                  <div className="flex items-center gap-md flex-1 min-w-0">
                    <div className="category-block" style={{ backgroundColor: item.color, color: '#fff' }}>
                      {item.name.slice(0, 4)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-base truncate mb-1">{item.name}</div>
                      <div className="progress-container" style={{ height: '4px', backgroundColor: 'rgba(0,0,0,0.05)' }}>
                        <div className="progress-bar" style={{ width: `${(item.amount / analytics.expense) * 100}%`, backgroundColor: item.color }}></div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right ml-md flex-shrink-0">
                    <div className="font-bold text-base">{formatCurrency(item.amount)}</div>
                    <div className="text-[10px] text-secondary font-bold">{((item.amount / analytics.expense) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-xl text-center text-secondary">データがありません</div>
        )}
      </div>
    </div>
  );
}
