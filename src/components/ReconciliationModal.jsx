import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { db } from '../db/db';
import { getLocalDateString } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';

export default function ReconciliationModal({ isOpen, onClose, onComplete }) {
  const [reconciledAmounts, setReconciledAmounts] = useState({});
  const masterSettings = useLiveQuery(() => db.settings.get('master'));
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  
  // 今日の日付
  const todayStr = getLocalDateString();

  // 今日時点までの全取引を取得して、現在実残高を計算
  const todayAssetBalances = useLiveQuery(async () => {
    const allTx = await db.transactions.toArray();
    const balances = {};
    const nonCreditAssets = await db.assets.toArray();
    nonCreditAssets.forEach(a => {
      balances[a.id] = a.initialBalance || 0;
    });

    // 今日以前（当日含む）の取引のみを加減算（未来の予定は今日時点の口座残高に影響させない）
    allTx.forEach(t => {
      if (t.date && t.date <= todayStr) {
        if (t.type === 'income') {
          if (balances[t.assetId] !== undefined) balances[t.assetId] += t.amount;
        } else if (t.type === 'expense') {
          if (balances[t.assetId] !== undefined) balances[t.assetId] -= t.amount;
        } else if (t.type === 'transfer') {
          if (balances[t.fromAssetId] !== undefined) balances[t.fromAssetId] -= t.amount;
          if (balances[t.toAssetId] !== undefined) balances[t.toAssetId] += t.amount;
        }
      }
    });

    return balances;
  }, [todayStr]);

  const targetAssets = assets.filter(a => a.type !== 'credit');

  useEffect(() => {
    if (isOpen && targetAssets.length > 0) {
      const initial = {};
      targetAssets.forEach(a => {
        initial[a.id] = '';
      });
      setReconciledAmounts(initial);
    }
  }, [isOpen, assets.length]);

  if (!isOpen) return null;

  const handleReconciledAmountChange = (assetId, val) => {
    setReconciledAmounts(prev => ({
      ...prev,
      [assetId]: val
    }));
  };

  const handleComplete = async () => {
    const existingHistory = masterSettings?.reconciliationHistory || [];
    const newHistory = [...existingHistory, { date: todayStr, timestamp: new Date().toISOString() }];

    await db.settings.update('master', {
      lastReconciliationDate: todayStr,
      reconciliationHistory: newHistory
    });

    alert(`残高照合が完了しました！（照合日: ${todayStr}）`);
    if (onComplete) onComplete(todayStr);
    onClose();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '未実施';
    const [y, m, d] = dateStr.split('-');
    return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      padding: '16px'
    }}>
      <div className="card animate-fade-in" style={{
        width: '100%',
        maxWidth: '420px',
        backgroundColor: 'var(--surface-color)',
        borderRadius: '24px',
        boxShadow: 'var(--shadow-xl)',
        padding: '24px',
        maxHeight: '90vh',
        overflowY: 'auto',
        margin: 0
      }}>
        <div className="flex-between items-center mb-xs">
          <h3 className="font-bold text-lg flex items-center gap-xs text-primary" style={{ margin: 0 }}>
            ⚖️ 残高照合確認
          </h3>
          <button 
            type="button"
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="text-xs text-secondary font-semibold mb-sm">
          🗓 前回の最終照合日: {masterSettings?.lastReconciliationDate ? formatDate(masterSettings.lastReconciliationDate) : '未実施'}
        </div>
        
        <p className="text-xs text-secondary mb-lg leading-relaxed">
          実際の銀行口座や現金の現在額と、家計簿の現在残高（本日までの記録）が一致しているか確認しましょう。
        </p>

        <div style={{ display: 'grid', gap: '16px' }}>
          {targetAssets.map(asset => {
            const calculatedBalance = todayAssetBalances ? (todayAssetBalances[asset.id] || 0) : (asset.initialBalance || 0);
            const inputVal = reconciledAmounts[asset.id];
            const realAmount = inputVal === '' || inputVal === undefined ? null : Number(inputVal);
            const difference = realAmount !== null ? realAmount - calculatedBalance : null;
            
            return (
              <div key={asset.id} style={{
                border: '1px solid var(--border-color)',
                padding: '14px',
                borderRadius: '16px',
                backgroundColor: 'rgba(0,0,0,0.01)'
              }}>
                <div className="flex-between mb-sm">
                  <span className="font-bold text-sm text-secondary">{asset.name}</span>
                  <span className="text-xs font-bold text-secondary">
                    家計簿残高: <span className="font-black" style={{ color: 'var(--text-primary)' }}>{formatCurrency(calculatedBalance)}</span>
                  </span>
                </div>

                <div className="flex-center gap-sm">
                  <input 
                    type="number"
                    inputMode="numeric"
                    placeholder="実際の残高を入力"
                    className="form-control"
                    style={{ padding: '8px 12px', fontSize: '14px', flex: 1 }}
                    value={inputVal ?? ''}
                    onChange={(e) => handleReconciledAmountChange(asset.id, e.target.value)}
                  />
                  <span className="text-xs font-bold text-secondary">円</span>
                </div>

                {difference !== null && (
                  <div className="mt-sm flex items-center gap-xs text-xs font-bold" style={{
                    color: difference === 0 ? 'var(--income-color)' : 'var(--expense-color)'
                  }}>
                    {difference === 0 ? (
                      <>
                        <CheckCircle2 size={14} />
                        <span>金額が完全に一致しています！🎉</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={14} />
                        <span>差額: {difference > 0 ? `+${formatCurrency(difference)}` : formatCurrency(difference)} (家計簿とのズレあり)</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex gap-sm mt-xl">
          <button 
            type="button"
            className="btn btn-outline" 
            style={{ flex: 1 }}
            onClick={onClose}
          >
            閉じる
          </button>
          <button 
            type="button"
            className="btn btn-primary" 
            style={{ flex: 1, fontWeight: 'bold' }}
            onClick={handleComplete}
          >
            照合を完了する
          </button>
        </div>
      </div>
    </div>
  );
}
