import React from 'react';
import { X } from 'lucide-react';

export default function ReimbursementSettlementModal({ isOpen, onClose, onSelect }) {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
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
        padding: '24px'
      }}>
        <div className="flex-between items-center mb-md">
          <h3 className="font-bold text-lg" style={{ margin: 0 }}>返金方法を選択</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-secondary mb-lg">立替分はどの方法で返金されましたか？</p>
        <div className="flex gap-sm">
          <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => onSelect('bank')}>
            銀行
          </button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={() => onSelect('cash')}>
            現金
          </button>
        </div>
      </div>
    </div>
  );
}