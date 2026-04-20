import React from 'react';
import { ArrowRight } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/format';

export default function TransactionItem({ transaction, categories, assets, onClick }) {
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer';
  
  const category = categories?.find(c => c.id === transaction.categoryId);
  const asset = assets?.find(a => a.id === transaction.assetId);
  const fromAsset = assets?.find(a => a.id === transaction.fromAssetId);
  const toAsset = assets?.find(a => a.id === transaction.toAssetId);

  // 振替の場合のUI
  if (isTransfer) {
    return (
      <div className="list-item" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
        <div className="flex-center gap-md">
          <div 
            style={{ backgroundColor: '#e5e7eb', color: '#4b5563' }}
            className="w-10 h-10 rounded-full flex-center font-bold text-xs"
          >
            振替
          </div>
          <div>
            <div className="font-semibold flex-center gap-sm text-sm">
              <span>{fromAsset?.name || '不明'}</span>
              <ArrowRight size={14} className="text-secondary" />
              <span>{toAsset?.name || '不明'}</span>
            </div>
            <div className="text-xs text-secondary flex-col gap-xs mt-xs">
              <span>{formatDate(transaction.date)}</span>
              {(transaction.content || transaction.memo) && (
                <span className="text-primary truncate" style={{ maxWidth: '180px' }}>
                  {transaction.content} {transaction.memo ? `(${transaction.memo})` : ''}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="font-bold text-secondary">
          {formatCurrency(transaction.amount)}
        </div>
      </div>
    );
  }

  // 収入・支出のUI
  return (
    <div className="list-item" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="flex-center gap-md">
        <div 
          style={{ backgroundColor: `${category?.color || '#64748b'}`, color: '#fff' }}
          className="w-10 h-10 rounded-full flex-center font-bold"
        >
          {category?.name?.[0] || '?'}
        </div>
        <div>
          <div className="font-semibold flex-center gap-sm">
            <span>{category?.name || '不明'}</span>
            <span className="text-xs px-2 py-1 rounded-full text-secondary" style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: '2px 8px' }}>
              {asset?.name || '不明資産'}
            </span>
          </div>
          <div className="text-xs text-secondary flex-col gap-xs mt-xs">
            <span>{formatDate(transaction.date)}</span>
            {(transaction.content || transaction.memo) && (
              <span className="truncate" style={{ maxWidth: '180px' }}>
                <span className="text-primary">{transaction.content}</span>
                {transaction.memo && ` • ${transaction.memo}`}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className={`font-bold ${isIncome ? 'text-income' : 'text-expense'}`}>
        {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
      </div>
    </div>
  );
}
