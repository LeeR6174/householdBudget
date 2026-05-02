import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { db } from '../db/db';
import { getCurrentBudgetMonth, getMonthRange } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';
import MonthSelector from '../components/MonthSelector';

export default function AnalysisPage() {
  const [currentMonth, setCurrentMonth] = useState(getCurrentBudgetMonth());
  const { startDate, endDate } = getMonthRange(currentMonth);

  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray()) || [];
  
  // 期間内の支出トランザクションを取得 (Indexed Query)
  const transactions = useLiveQuery(() => 
    db.transactions
      .where('date').between(startDate, endDate, true, true)
      .filter(tx => tx.type === 'expense')
      .toArray()
  , [startDate, endDate]) || [];

  // カテゴリ別集計
  const expensesByCategory = {};
  categories.forEach(c => expensesByCategory[c.id] = 0);
  expensesByCategory['uncategorized'] = 0;

  transactions.forEach(tx => {
    if (tx.categoryId && expensesByCategory[tx.categoryId] !== undefined) {
      expensesByCategory[tx.categoryId] += tx.amount;
    } else {
      expensesByCategory['uncategorized'] += tx.amount;
    }
  });

  // グラフ用データに成形し、金額降順でソート
  const chartData = categories.map(cat => ({
    name: cat.name,
    amount: expensesByCategory[cat.id],
    color: cat.color || '#8884d8'
  }));

  if (expensesByCategory['uncategorized'] > 0) {
    chartData.push({
      name: '未分類・不明',
      amount: expensesByCategory['uncategorized'],
      color: '#9ca3af'
    });
  }

  const sortedChartData = chartData
    .filter(d => d.amount > 0) // 0円のカテゴリは省く
    .sort((a, b) => b.amount - a.amount);

  const totalExpense = sortedChartData.reduce((sum, d) => sum + d.amount, 0);

  // カスタムツールチップ
  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="card" style={{ padding: '8px 12px', border: '1px solid #e5e7eb', marginBottom: 0 }}>
          <p className="font-bold">{payload[0].payload.name}</p>
          <p style={{ color: payload[0].payload.color }}>{formatCurrency(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="page-container">
      <div className="page-title">分析</div>
      <MonthSelector currentMonth={currentMonth} onChange={setCurrentMonth} />

      <div className="card text-center">
        <h3 className="text-sm text-secondary mb-sm">当月支出合計</h3>
        <div className="text-3xl font-bold text-expense">{formatCurrency(totalExpense)}</div>
      </div>

      <div className="card">
        <h3 className="font-bold mb-lg">カテゴリ別支出</h3>
        
        {sortedChartData.length > 0 ? (
          <>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={sortedChartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tickFormatter={(val) => `¥${val.toLocaleString()}`} 
                    width={80} 
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip cursor={{ fill: 'rgba(0,0,0,0.05)' }} content={<CustomTooltip />} />
                  <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                    {sortedChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-xl">
              <h4 className="text-sm font-bold text-secondary mb-md">支出内訳</h4>
              {sortedChartData.map((item, idx) => (
                <div key={idx} className="list-item" style={{ padding: '12px 0' }}>
                  <div className="flex items-center gap-md flex-1 min-w-0">
                    <div className="category-block" style={{ backgroundColor: item.color, color: '#fff' }}>
                      {item.name.slice(0, 4)}
                    </div>
                    <span className="font-semibold text-base truncate">{item.name}</span>
                  </div>
                  <div className="text-right ml-md flex-shrink-0">
                    <div className="font-bold text-base">{formatCurrency(item.amount)}</div>
                    <div className="text-[10px] text-secondary font-bold">
                      {((item.amount / totalExpense) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-xl text-center text-secondary">
            この期間の支出データがありません
          </div>
        )}
      </div>
    </div>
  );
}
