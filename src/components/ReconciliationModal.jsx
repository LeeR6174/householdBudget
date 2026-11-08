import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { X } from 'lucide-react';
import { db } from '../db/db';
import { getLocalDateString } from '../utils/dateUtils';

export default function ReconciliationModal({ isOpen, onClose, onComplete }) {
  const masterSettings = useLiveQuery(() => db.settings.get('master'));
  // 今日の日付
  const todayStr = getLocalDateString();

  if (!isOpen) return null;

  const handleComplete = async () => {
    const existingHistory = masterSettings?.reconciliationHistory || [];
    const newHistory = [...existingHistory, { date: todayStr, timestamp: new Date().toISOString() }];

    try {
      await db.settings.update('master', {
        lastReconciliationDate: todayStr,
        reconciliationHistory: newHistory
      });

      alert(`残高照合が完了しました！（照合日: ${todayStr}）`);
      if (onComplete) onComplete(todayStr);
      onClose();
    } catch (error) {
      console.error('Failed to save reconciliation history:', error);
      alert('残高照合の記録に失敗しました。もう一度お試しください。');
    }
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
          現在の家計簿残高を確認し、口座や現金の実際の残高との照合が完了したら記録してください。
        </p>

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
