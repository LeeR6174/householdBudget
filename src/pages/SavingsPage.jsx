import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Plus, Minus, History } from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency } from '../utils/format';
import { getCurrentBudgetMonth } from '../utils/dateUtils';

export default function SavingsPage() {
  const navigate = useNavigate();
  const currentMonthStr = getCurrentBudgetMonth();
  
  const settings = useLiveQuery(() => db.settings.get('master'));
  const allMonthlySettings = useLiveQuery(() => db.monthlySettings.toArray()) || [];
  const savingsRecords = useLiveQuery(() => db.savingsRecords.toArray()) || [];
  
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState('depletion'); // depletion (切り崩し) or addition (追加)

  const initialSavings = settings?.targetSavings || 0;
  const monthlyAdditions = allMonthlySettings.reduce((sum, s) => sum + (s.targetSavings || 0), 0);
  const totalDepletions = savingsRecords
    .filter(r => r.type === 'depletion')
    .reduce((sum, r) => sum + (r.amount || 0), 0);
  const extraAdditions = savingsRecords
    .filter(r => r.type === 'addition')
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const currentTotalSavings = initialSavings + monthlyAdditions + extraAdditions - totalDepletions;

  const handleAddRecord = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    await db.savingsRecords.add({
      month: currentMonthStr,
      amount: Number(amount),
      type,
      note: note.trim(),
      date: new Date().toISOString().split('T')[0]
    });

    setAmount('');
    setNote('');
  };

  const handleDeleteRecord = async (id) => {
    if (window.confirm('この記録を削除しますか？')) {
      await db.savingsRecords.delete(id);
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex gap-sm items-center mb-lg">
        <button className="btn-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
          <span>戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>貯金・切り崩し管理</div>
      </div>

      <div className="card mb-lg" style={{ background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)', color: 'white' }}>
        <div className="text-sm opacity-80 mb-xs">現在の仮想貯金総額</div>
        <div className="text-3xl font-bold">{formatCurrency(currentTotalSavings)}</div>
        <div className="mt-md pt-md" style={{ borderTop: '1px solid rgba(255,255,255,0.2)', fontSize: '0.8rem' }}>
          <div className="flex-between mb-xs">
            <span>初期貯金 + 毎月の積立</span>
            <span>{formatCurrency(initialSavings + monthlyAdditions)}</span>
          </div>
          <div className="flex-between">
            <span>切り崩し累計</span>
            <span style={{ color: '#fecaca' }}>- {formatCurrency(totalDepletions)}</span>
          </div>
        </div>
      </div>

      <div className="card mb-lg">
        <h3 className="font-bold mb-md">貯金の切り崩し・追加記録</h3>
        <form onSubmit={handleAddRecord}>
          <div className="flex gap-sm mb-md">
            <button 
              type="button" 
              className={`flex-1 btn ${type === 'depletion' ? 'btn-danger' : 'btn-outline'}`}
              onClick={() => setType('depletion')}
              style={{ fontSize: '0.8rem' }}
            >
              <Minus size={14} className="mr-xs" /> 切り崩し
            </button>
            <button 
              type="button" 
              className={`flex-1 btn ${type === 'addition' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setType('addition')}
              style={{ fontSize: '0.8rem' }}
            >
              <Plus size={14} className="mr-xs" /> 臨時追加
            </button>
          </div>

          <div className="form-group mb-md">
            <label className="form-label">金額 (円)</label>
            <input 
              type="number" 
              inputMode="numeric" 
              className="form-control" 
              value={amount} 
              onChange={e => setAmount(e.target.value)} 
              placeholder="0" 
            />
          </div>

          <div className="form-group mb-md">
            <label className="form-label">メモ (理由など)</label>
            <input 
              type="text" 
              className="form-control" 
              value={note} 
              onChange={e => setNote(e.target.value)} 
              placeholder="例: 車検費用, 臨時ボーナスなど" 
            />
          </div>

          <button type="submit" className="btn btn-primary w-full font-bold">
            記録する
          </button>
        </form>
      </div>

      <h3 className="font-bold mb-md flex items-center gap-sm">
        <History size={18} />
        履歴
      </h3>
      {savingsRecords.length === 0 ? (
        <div className="text-center p-xl text-secondary">記録がありません</div>
      ) : (
        <div className="card">
          {[...savingsRecords].reverse().map(record => (
            <div key={record.id} className="flex-between py-md" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <div>
                <div className="text-xs text-secondary">{record.month} / {record.date}</div>
                <div className="font-bold">{record.note || (record.type === 'depletion' ? '切り崩し' : '追加')}</div>
              </div>
              <div className="text-right">
                <div className={`font-bold ${record.type === 'depletion' ? 'text-expense' : 'text-income'}`}>
                  {record.type === 'depletion' ? '-' : '+'}{formatCurrency(record.amount)}
                </div>
                <button className="text-xs text-danger-color mt-xs" onClick={() => handleDeleteRecord(record.id)}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
