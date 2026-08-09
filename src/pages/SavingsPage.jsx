import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Plus, Minus, History, Link2, AlertCircle } from 'lucide-react';
import { db } from '../db/db';
import { formatCurrency } from '../utils/format';
import { getCurrentBudgetMonth, getNextMonth, getLocalDateString } from '../utils/dateUtils';

export default function SavingsPage() {
  const navigate = useNavigate();
  const currentMonthStr = getCurrentBudgetMonth();
  
  const settings = useLiveQuery(() => db.settings.get('master'));
  const monthlySettings = useLiveQuery(() => db.monthlySettings.get(currentMonthStr), [currentMonthStr]);
  const nextMonthStr = getNextMonth(currentMonthStr);
  const nextMonthlySettings = useLiveQuery(() => db.monthlySettings.get(nextMonthStr), [nextMonthStr]);
  const allMonthlySettings = useLiveQuery(() => db.monthlySettings.toArray()) || [];
  const savingsRecords = useLiveQuery(() => db.savingsRecords.toArray()) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [type, setType] = useState('depletion'); // depletion (切り崩し) or addition (追加)
  
  // 取引連動関連のState
  const [autoLink, setAutoLink] = useState(false);
  const [fromAssetId, setFromAssetId] = useState('');
  const [toAssetId, setToAssetId] = useState('');

  // アセット読み込み時に初期値をセット
  useEffect(() => {
    if (assets.length > 0) {
      if (!fromAssetId) setFromAssetId(assets[0].id);
      if (!toAssetId) setToAssetId(assets.length > 1 ? assets[1].id : assets[0].id);
    }
  }, [assets]);

  const initialSavings = settings?.targetSavings || 0;
  const monthlyAdditions = allMonthlySettings
    .filter(s => s.month <= currentMonthStr)
    .reduce((sum, s) => sum + (s.targetSavings || 0), 0);
  const totalDepletions = savingsRecords
    .filter(r => r.type === 'depletion' && r.month <= currentMonthStr)
    .reduce((sum, r) => sum + (r.amount || 0), 0);
  const extraAdditions = savingsRecords
    .filter(r => r.type === 'addition' && r.month <= currentMonthStr)
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const currentTotalSavings = initialSavings + monthlyAdditions + extraAdditions - totalDepletions;

  const handleUpdateMonthlySavings = async (value) => {
    const amount = Number(value) || 0;
    await db.monthlySettings.put({ month: currentMonthStr, targetSavings: amount });
    
    // 来月の設定がまだない場合、当月の設定を反映する
    const nextSettings = await db.monthlySettings.get(nextMonthStr);
    if (!nextSettings) {
      await db.monthlySettings.put({ month: nextMonthStr, targetSavings: amount });
    }
  };

  const handleUpdateNextMonthlySavings = async (value) => {
    const amount = Number(value) || 0;
    await db.monthlySettings.put({ month: nextMonthStr, targetSavings: amount });
  };

  const handleAddRecord = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    let transactionId = null;
    const recordAmount = Number(amount);

    // 取引履歴との自動連動処理
    if (autoLink && fromAssetId && toAssetId) {
      transactionId = crypto.randomUUID();
      const content = type === 'depletion' ? `貯金切り崩し (${note.trim() || '振替'})` : `貯蓄臨時追加 (${note.trim() || '振替'})`;
      
      await db.transactions.add({
        id: transactionId,
        type: 'transfer',
        fromAssetId: fromAssetId,
        toAssetId: toAssetId,
        amount: recordAmount,
        content: content,
        memo: note.trim() || (type === 'depletion' ? '貯金切り崩し' : '貯蓄追加'),
        date: getLocalDateString(),
        createdAt: new Date().toISOString()
      });
    }

    await db.savingsRecords.add({
      month: currentMonthStr,
      amount: recordAmount,
      type,
      note: note.trim(),
      date: getLocalDateString(),
      transactionId // 連動した取引IDを保持
    });

    setAmount('');
    setNote('');
    setAutoLink(false);
  };

  const handleDeleteRecord = async (record) => {
    if (window.confirm('この記録を削除しますか？')) {
      if (record.transactionId) {
        // 連動して登録された取引も自動削除する
        await db.transactions.delete(record.transactionId);
      }
      await db.savingsRecords.delete(record.id);
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

      {/* 👑 貯金総額 & グラフィカルな内訳グリッド */}
      <div className="card mb-lg" style={{ 
        background: 'linear-gradient(135deg, #064e3b 0%, #059669 100%)', 
        color: 'white', 
        padding: '24px', 
        borderRadius: '24px',
        boxShadow: '0 10px 15px -3px rgba(6, 78, 59, 0.2), 0 4px 6px -4px rgba(6, 78, 59, 0.1)'
      }}>
        <div className="text-sm opacity-80 mb-xs">現在の仮想貯金総額</div>
        <div className="text-4xl font-black mb-lg" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
          {formatCurrency(currentTotalSavings)}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '16px' }}>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '10px 12px', borderRadius: '12px' }}>
            <div className="text-[10px] opacity-70 mb-xs">初期貯金</div>
            <div className="font-bold text-sm">{formatCurrency(initialSavings)}</div>
          </div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '10px 12px', borderRadius: '12px' }}>
            <div className="text-[10px] opacity-70 mb-xs">毎月の積立累計</div>
            <div className="font-bold text-sm" style={{ color: '#a7f3d0' }}>+{formatCurrency(monthlyAdditions)}</div>
          </div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '10px 12px', borderRadius: '12px' }}>
            <div className="text-[10px] opacity-70 mb-xs">臨時追加累計</div>
            <div className="font-bold text-sm" style={{ color: '#a7f3d0' }}>+{formatCurrency(extraAdditions)}</div>
          </div>
          <div style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: '10px 12px', borderRadius: '12px' }}>
            <div className="text-[10px] opacity-70 mb-xs">切り崩し累計</div>
            <div className="font-bold text-sm" style={{ color: '#fecaca' }}>-{formatCurrency(totalDepletions)}</div>
          </div>
        </div>
      </div>

      <div className="card mb-lg" style={{ border: '2px solid var(--primary-color-light)', backgroundColor: 'rgba(79, 70, 229, 0.02)' }}>
        <h3 className="font-bold mb-sm" style={{ color: 'var(--primary-color)' }}>🐷 {currentMonthStr} の積立額</h3>
        <p className="text-xs text-secondary mb-md">
          今月追加で貯金に回す額を設定します。
        </p>
        <div className="flex-center gap-md">
          <input 
            type="number" 
            inputMode="numeric" 
            className="form-control" 
            value={monthlySettings?.targetSavings ?? ''} 
            onChange={(e) => handleUpdateMonthlySavings(e.target.value)}
            placeholder="0"
            style={{ fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'right' }}
          />
          <span className="font-bold text-sm">円</span>
        </div>
      </div>

      <div className="card mb-lg" style={{ border: '1px dashed var(--primary-color-light)', backgroundColor: 'rgba(79, 70, 229, 0.01)' }}>
        <h3 className="font-bold mb-sm" style={{ color: 'var(--primary-color)', opacity: 0.8 }}>📅 {nextMonthStr} の積立額 (予定)</h3>
        <p className="text-xs text-secondary mb-md">
          来月の積立予定額を設定します。
        </p>
        <div className="flex-center gap-md">
          <input 
            type="number" 
            inputMode="numeric" 
            className="form-control" 
            value={nextMonthlySettings?.targetSavings ?? ''} 
            onChange={(e) => handleUpdateNextMonthlySavings(e.target.value)}
            placeholder="0"
            style={{ fontSize: '1.1rem', fontWeight: 'bold', textAlign: 'right', opacity: 0.8 }}
          />
          <span className="font-bold text-sm" style={{ opacity: 0.8 }}>円</span>
        </div>
      </div>

      {/* 貯金の切り崩し・追加フォーム */}
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

          {/* 取引連動機能 */}
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginTop: '16px' }}>
            <label className="flex items-center gap-sm cursor-pointer mb-md" style={{ userSelect: 'none' }}>
              <input 
                type="checkbox" 
                checked={autoLink}
                onChange={(e) => setAutoLink(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span className="text-xs font-bold flex items-center gap-xs text-secondary">
                <Link2 size={14} /> 家計簿の取引履歴に自動反映する
              </span>
            </label>

            {autoLink && (
              <div className="animate-fade-in" style={{ backgroundColor: 'rgba(79, 70, 229, 0.03)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(79, 70, 229, 0.08)', marginBottom: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group mb-0">
                    <label className="form-label text-[10px]">
                      {type === 'depletion' ? '振替元 (貯蓄元)' : '振替元 (生活費口座)'}
                    </label>
                    <select 
                      className="form-control" 
                      style={{ padding: '8px 12px', fontSize: '13px' }}
                      value={fromAssetId}
                      onChange={(e) => setFromAssetId(e.target.value)}
                    >
                      {assets.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group mb-0">
                    <label className="form-label text-[10px]">
                      {type === 'depletion' ? '振替先 (受取口座)' : '振替先 (貯蓄先)'}
                    </label>
                    <select 
                      className="form-control" 
                      style={{ padding: '8px 12px', fontSize: '13px' }}
                      value={toAssetId}
                      onChange={(e) => setToAssetId(e.target.value)}
                    >
                      {assets.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="text-[10px] text-secondary mt-sm flex items-start gap-xs" style={{ opacity: 0.8 }}>
                  <AlertCircle size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
                  <span>指定口座間で振替取引が自動作成されます。この貯蓄記録を削除すると、紐づく振替取引も自動で削除されます。</span>
                </div>
              </div>
            )}
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
                <div className="text-xs text-secondary flex items-center gap-xs">
                  <span>{record.month} / {record.date}</span>
                  {record.transactionId && (
                    <span className="flex items-center text-[9px] bg-slate-100 text-secondary px-xs py-2xs rounded-sm font-bold border border-slate-200">
                      <Link2 size={8} className="mr-3xs" /> 連動済
                    </span>
                  )}
                </div>
                <div className="font-bold">{record.note || (record.type === 'depletion' ? '切り崩し' : '追加')}</div>
              </div>
              <div className="text-right">
                <div className={`font-bold ${record.type === 'depletion' ? 'text-expense' : 'text-income'}`}>
                  {record.type === 'depletion' ? '-' : '+'}{formatCurrency(record.amount)}
                </div>
                <button className="text-xs text-danger-color mt-xs" onClick={() => handleDeleteRecord(record)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
