import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Plus, History, AlertCircle } from 'lucide-react';
import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip 
} from 'recharts';
import { db } from '../db/db';
import { formatCurrency } from '../utils/format';
import { getCurrentBudgetMonth, getLocalDateString, getBudgetMonth } from '../utils/dateUtils';

export default function SavingsPage() {
  const navigate = useNavigate();
  const currentMonthStr = getCurrentBudgetMonth();
  
  const settings = useLiveQuery(() => db.settings.get('master'));
  const allMonthlySettings = useLiveQuery(() => db.monthlySettings.toArray()) || [];
  const savingsRecords = useLiveQuery(() => db.savingsRecords.toArray()) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  // 1. 今月の貯金総額等の集計
  const initialSavings = settings?.targetSavings || 0;
  const monthlyAdditions = allMonthlySettings
    .filter(s => s.month <= currentMonthStr)
    .reduce((sum, s) => sum + (s.targetSavings || 0), 0);
  
  const totalDepletions = useMemo(() => {
    const dbDepletions = savingsRecords
      .filter(r => r.type === 'depletion' && r.month <= currentMonthStr)
      .reduce((sum, r) => sum + (r.amount || 0), 0);
    const txDepletions = transactions
      .filter(t => t.type === 'expense' && t.isSavingsDepletion && getBudgetMonth(t.date) <= currentMonthStr)
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    return dbDepletions + txDepletions;
  }, [savingsRecords, transactions, currentMonthStr]);

  const extraAdditions = savingsRecords
    .filter(r => r.type === 'addition' && r.month <= currentMonthStr)
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  const currentTotalSavings = initialSavings + monthlyAdditions + extraAdditions - totalDepletions;

  // 2. 過去6ヶ月の月末時点での貯金総額の推移データ作成
  const savingsTrendData = useMemo(() => {
    if (!settings || allMonthlySettings.length === 0) return [];

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(getLocalDateString(d).slice(0, 7)); // "YYYY-MM"
    }

    return months.map(m => {
      const monthlyAdditionsLimit = allMonthlySettings
        .filter(s => s.month <= m)
        .reduce((sum, s) => sum + (s.targetSavings || 0), 0);

      const dbExtraAdditions = savingsRecords
        .filter(r => r.type === 'addition' && r.month <= m)
        .reduce((sum, r) => sum + (r.amount || 0), 0);

      const dbDepletions = savingsRecords
        .filter(r => r.type === 'depletion' && r.month <= m)
        .reduce((sum, r) => sum + (r.amount || 0), 0);

      const txDepletions = transactions
        .filter(t => t.type === 'expense' && t.isSavingsDepletion && getBudgetMonth(t.date) <= m)
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      const balance = initialSavings + monthlyAdditionsLimit + dbExtraAdditions - (dbDepletions + txDepletions);

      return {
        name: m.split('-')[1] + '月',
        貯金残高: balance
      };
    });
  }, [settings, allMonthlySettings, savingsRecords, transactions, initialSavings]);

  // 3. 今月の貯金からの支出 (切り崩し)
  const currentMonthDepletionTx = useMemo(() => {
    return transactions.filter(t => 
      t.type === 'expense' && 
      t.isSavingsDepletion && 
      getBudgetMonth(t.date) === currentMonthStr
    );
  }, [transactions, currentMonthStr]);

  // 4. 全期間の貯蓄・切り崩し履歴（手動レコード＋新方式の支出連動）をマージ
  const allSavingsHistory = useMemo(() => {
    const records = savingsRecords.map(r => ({
      id: `record_${r.id}`,
      originalId: r.id,
      isTx: false,
      date: r.date,
      month: r.month,
      type: r.type,
      amount: r.amount,
      note: r.note || (r.type === 'depletion' ? '手動切り崩し' : '臨時貯蓄追加'),
      raw: r
    }));

    const txs = transactions
      .filter(t => t.type === 'expense' && t.isSavingsDepletion)
      .map(t => ({
        id: `tx_${t.id}`,
        originalId: t.id,
        isTx: true,
        date: t.date,
        month: getBudgetMonth(t.date),
        type: 'depletion',
        amount: t.amount,
        note: t.content || '貯金切り崩し支出',
        raw: t
      }));

    return [...records, ...txs].sort((a, b) => b.date.localeCompare(a.date));
  }, [savingsRecords, transactions]);

  const handleAddRecord = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    const recordAmount = Number(amount);

    await db.savingsRecords.add({
      month: currentMonthStr,
      amount: recordAmount,
      type: 'addition', // フォームからは「臨時追加」のみ可能
      note: note.trim(),
      date: getLocalDateString()
    });

    setAmount('');
    setNote('');
  };

  const handleDeleteRecord = async (item) => {
    if (window.confirm('この記録を削除しますか？')) {
      if (item.isTx) {
        // 支出連動トランザクションの削除
        await db.transactions.delete(item.originalId);
      } else {
        // 手動レコードの削除
        if (item.raw.transactionId) {
          await db.transactions.delete(item.raw.transactionId);
        }
        await db.savingsRecords.delete(item.originalId);
      }
    }
  };

  // プレミアムなツールチップ
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid rgba(0, 0, 0, 0.08)',
          borderRadius: '12px',
          padding: '10px 14px',
          boxShadow: 'var(--shadow-md)'
        }}>
          <p style={{ margin: '0 0 4px 0', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}時点</p>
          <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--primary-color)' }}>
            貯金総額: {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex gap-sm items-center mb-lg">
        <button className="btn-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
          <span>戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>貯金ダッシュボード</div>
      </div>

      {/* 👑 貯金総額 & グラフィカルな内訳グリッド */}
      <div className="card mb-lg" style={{ 
        background: 'linear-gradient(135deg, #312e81 0%, #4f46e5 100%)', 
        color: 'white', 
        padding: '24px', 
        borderRadius: '24px',
        boxShadow: '0 12px 20px -4px rgba(79, 70, 229, 0.25)'
      }}>
        <div className="text-sm opacity-80 mb-xs">現在の貯蓄総額 (キープ分)</div>
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
            <div className="font-bold text-sm" style={{ color: '#fca5a5' }}>-{formatCurrency(totalDepletions)}</div>
          </div>
        </div>
      </div>

      {/* 📈 貯蓄推移グラフ */}
      {savingsTrendData.length > 0 && (
        <div className="card mb-lg" style={{ padding: '20px' }}>
          <h3 className="font-bold text-sm mb-md text-primary flex items-center gap-xs" style={{ margin: '0 0 16px 0' }}>
            📈 過去6ヶ月の貯金推移
          </h3>
          <div style={{ width: '100%', height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={savingsTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSavings" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary-color)" stopOpacity={0.25}/>
                    <stop offset="95%" stopColor="var(--primary-color)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="name" tickLine={false} axisLine={false} style={{ fontSize: '10px', fill: 'var(--text-secondary)' }} />
                <YAxis tickLine={false} axisLine={false} style={{ fontSize: '10px', fill: 'var(--text-secondary)' }} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="貯金残高" stroke="var(--primary-color)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorSavings)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 🐷 今月の貯金からの支出（切り崩し） */}
      {currentMonthDepletionTx.length > 0 && (
        <div className="card mb-lg" style={{ padding: '20px' }}>
          <h3 className="font-bold text-sm mb-md text-primary flex items-center gap-xs" style={{ margin: '0 0 12px 0' }}>
            🐷 今月の貯金からの支払い
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {currentMonthDepletionTx.map(tx => {
              const asset = assets.find(a => a.id === tx.assetId);
              return (
                <div key={tx.id} className="list-item" style={{ padding: '12px 0' }}>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                      {tx.content || '名称未設定'}
                    </div>
                    <div className="text-[10px] text-secondary flex gap-sm mt-xs" style={{ opacity: 0.7 }}>
                      <span>{asset?.name || '不明'}</span>
                      <span>{tx.date}</span>
                    </div>
                  </div>
                  <div className="font-bold text-base text-expense" style={{ marginLeft: '12px', flexShrink: 0 }}>
                    -{formatCurrency(tx.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 💰 臨時貯蓄追加フォーム */}
      <div className="card mb-lg">
        <h3 className="font-bold mb-md" style={{ margin: '0 0 16px 0' }}>臨時貯金（追加）の記録</h3>
        <form onSubmit={handleAddRecord}>
          <div className="form-group">
            <label className="form-label">追加する金額 (円)</label>
            <input 
              type="number" 
              inputMode="numeric" 
              pattern="[0-9]*"
              className="form-control text-primary font-bold" 
              placeholder="例: 10000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              min="1"
            />
          </div>
          <div className="form-group mb-lg">
            <label className="form-label">メモ・用途 (任意)</label>
            <input 
              type="text" 
              className="form-control" 
              placeholder="例: ボーナスから貯蓄用へ"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary w-full flex-center gap-xs" style={{ height: '46px', fontSize: '1rem' }}>
            <Plus size={18} />
            <span>貯蓄を臨時追加する</span>
          </button>
        </form>
      </div>

      {/* ⏳ 貯蓄・切り崩し履歴 (手動履歴と新方式の支出連動履歴を時系列マージ) */}
      <div className="card">
        <h3 className="font-bold mb-md text-secondary flex items-center gap-xs" style={{ margin: '0 0 12px 0' }}>
          <History size={16} /> 貯金・切り崩し履歴
        </h3>
        {allSavingsHistory.map(item => (
          <div key={item.id} className="list-item" style={{ padding: '12px 0' }}>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm flex items-center gap-xs" style={{ color: 'var(--text-primary)' }}>
                {item.isTx && <span style={{ fontSize: '12px' }}>🐷</span>}
                <span className="truncate">{item.note}</span>
              </div>
              <div className="text-[10px] text-secondary mt-xs" style={{ opacity: 0.7 }}>
                {item.date} ({item.month}){item.isTx && ' [支出連動]'}
              </div>
            </div>
            <div className="flex items-center gap-md">
              <span className={`font-bold text-base ${item.type === 'depletion' ? 'text-expense' : 'text-income'}`}>
                {item.type === 'depletion' ? '-' : '+'}{formatCurrency(item.amount)}
              </span>
              <button 
                className="btn-icon text-secondary" 
                style={{ padding: '4px' }}
                onClick={() => handleDeleteRecord(item)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        {allSavingsHistory.length === 0 && (
          <div className="text-center py-lg text-secondary text-sm">
            履歴はありません
          </div>
        )}
      </div>
    </div>
  );
}
