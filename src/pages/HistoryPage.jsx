import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2 } from 'lucide-react';
import { db } from '../db/db';
import { getCurrentBudgetMonth, getMonthRange } from '../utils/dateUtils';
import MonthSelector from '../components/MonthSelector';
import TransactionItem from '../components/TransactionItem';

export default function HistoryPage() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(getCurrentBudgetMonth());
  const { startDate, endDate } = getMonthRange(currentMonth);

  const transactions = useLiveQuery(() => {
    return db.transactions
      .filter(tx => tx.date >= startDate && tx.date <= endDate)
      .toArray()
      .then(items => items.sort((a, b) => {
        // 日付の降順（新しい日が上）
        if (a.date !== b.date) {
          return b.date.localeCompare(a.date);
        }
        // 同じ日付なら作成日時の降順（新しい入力が上）
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      }));
  }, [startDate, endDate]) || [];

  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];

  const handleDelete = async (id) => {
    if (window.confirm('この記録を削除しますか？')) {
      await db.transactions.delete(id);
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="page-title">履歴一覧</div>
      <MonthSelector currentMonth={currentMonth} onChange={setCurrentMonth} />
      
      <div className="card" style={{ padding: '0 16px' }}>
        {transactions.map(tx => (
          <div key={tx.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <TransactionItem 
                transaction={tx} 
                categories={categories} 
                assets={assets} 
                onClick={() => navigate(`/edit/${tx.id}`)}
              />
            </div>
            <button 
              onClick={() => handleDelete(tx.id)}
              style={{ padding: '16px 0 16px 16px', border: 'none', background: 'transparent', color: 'var(--danger-color)', cursor: 'pointer' }}
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))}
        {transactions.length === 0 && (
          <div className="text-center py-xl text-secondary">
            この期間の履歴がありません
          </div>
        )}
      </div>
    </div>
  );
}
