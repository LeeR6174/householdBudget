import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatCurrency } from '../utils/format';

export default function BudgetPage() {
  const expenseCategories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray()) || [];
  
  // Local state for editing limits
  const [editingId, setEditingId] = useState(null);
  const [tempLimit, setTempLimit] = useState('');

  const handleEditClick = (cat) => {
    setEditingId(cat.id);
    setTempLimit(cat.monthlyLimit.toString());
  };

  const handleSave = async (id) => {
    try {
      await db.categories.update(id, { monthlyLimit: Number(tempLimit) });
      setEditingId(null);
    } catch (err) {
      console.error(err);
      alert('保存に失敗しました');
    }
  };

  return (
    <div className="page-container">
      <div className="page-title">予算管理</div>
      <p className="text-sm text-secondary mb-md">カテゴリごとの月額予算を設定できます。</p>

      <div className="card">
        {expenseCategories.map(cat => (
          <div key={cat.id} className="list-item flex-col items-start" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="flex-between w-full mb-sm">
              <div className="flex-center gap-sm">
                <span style={{ color: cat.color }} className="font-semibold">{cat.name}</span>
              </div>
              {editingId !== cat.id && (
                <div className="font-bold">
                  {formatCurrency(cat.monthlyLimit)}
                </div>
              )}
            </div>
            
            {editingId === cat.id ? (
              <div className="flex gap-sm w-full mt-sm">
                <input
                  type="number"
                  inputMode="numeric"
                  className="form-control"
                  style={{ flex: 1 }}
                  value={tempLimit}
                  onChange={(e) => setTempLimit(e.target.value)}
                />
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => handleSave(cat.id)}>
                  保存
                </button>
                <button className="btn btn-outline" style={{ width: 'auto' }} onClick={() => setEditingId(null)}>
                  取消
                </button>
              </div>
            ) : (
              <button 
                className="btn btn-outline mt-sm"
                onClick={() => handleEditClick(cat)}
              >
                予算を変更
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
