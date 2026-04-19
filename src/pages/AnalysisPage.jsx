import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { db } from '../db/db';
import { getCurrentBudgetMonth, getMonthRange } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';
import MonthSelector from '../components/MonthSelector';

export default function AnalysisPage() {
  const [currentMonth, setCurrentMonth] = useState(getCurrentBudgetMonth());
  const { startDate, endDate } = getMonthRange(currentMonth);

  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray()) || [];
  
  // 期間内の支出トランザクションを取得
  const txFilter = (tx) => {
    return tx.type === 'expense' && tx.date >= startDate && tx.date <= endDate;
  };
  const transactions = useLiveQuery(() => db.transactions.filter(txFilter).toArray(), [startDate, endDate]) || [];

  // カテゴリ別集計
  const expensesByCategory = {};
  categories.forEach(c => expensesByCategory[c.id] = 0);
  transactions.forEach(tx => {
    if (expensesByCategory[tx.categoryId] !== undefined) {
      expensesByCategory[tx.categoryId] += tx.amount;
    }
  });

  // グラフ用データに成形し、金額降順でソート
  const chartData = categories.map(cat => ({
    name: cat.name,
    amount: expensesByCategory[cat.id],
    color: cat.color || '#8884d8'
  }))
  .filter(d => d.amount > 0) // 0円のカテゴリは省く
  .sort((a, b) => b.amount - a.amount);

  const totalExpense = chartData.reduce((sum, d) => sum + d.amount, 0);

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
        
        {chartData.length > 0 ? (
          <>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
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
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-xl">
              <h4 className="text-sm font-bold text-secondary mb-md">支出内訳</h4>
              {chartData.map((item, idx) => (
                <div key={idx} className="list-item">
                  <div className="flex-center gap-sm">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="font-semibold">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{formatCurrency(item.amount)}</div>
                    <div className="text-xs text-secondary">
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
