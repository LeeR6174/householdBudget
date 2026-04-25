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
      <div className="list-item" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', padding: '12px 0' }}>
        <div className="flex items-center gap-md flex-1 min-w-0">
          <div 
            style={{ backgroundColor: '#f1f5f9', color: '#64748b', border: '0' }}
            className="w-11 h-11 rounded-full flex-center font-bold text-xs flex-shrink-0"
          >
            振替
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="text-xs text-secondary mb-xs">
              {formatDate(transaction.date)}
            </div>
            <div className="font-bold flex items-center gap-sm text-base truncate leading-tight">
              <span>{fromAsset?.name || '不明'}</span>
              <ArrowRight size={14} className="text-secondary" />
              <span>{toAsset?.name || '不明'}</span>
            </div>
            {transaction.content && (
              <div className="text-xs text-secondary truncate mt-xs opacity-70">{transaction.content}</div>
            )}
          </div>
        </div>
        <div className="font-bold text-secondary text-right ml-md flex-shrink-0">
          {formatCurrency(transaction.amount)}
        </div>
      </div>
    );
  }

  // 収入・支出のUI
  return (
    <div className="list-item" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', padding: '12px 0' }}>
      <div className="flex items-center gap-md flex-1 min-w-0">
        <div 
          style={{ backgroundColor: `${category?.color || '#64748b'}`, color: '#fff', border: '0', fontSize: '1.2rem' }}
          className="w-11 h-11 rounded-full flex-center font-bold flex-shrink-0"
        >
          {category?.name?.[0] || '?'}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-sm mb-xs">
            <span 
              className="category-pill" 
              style={{ backgroundColor: `${category?.color || '#64748b'}15`, color: category?.color || '#64748b', fontSize: '0.7rem' }}
            >
              {category?.name || '不明'}
            </span>
            <span className="text-xs text-secondary truncate" style={{ opacity: 0.7 }}>
              {asset?.name || '不明'}
            </span>
            <span className="text-xs text-secondary ml-auto" style={{ opacity: 0.6 }}>
              {formatDate(transaction.date)}
            </span>
          </div>
          <div className="font-bold text-base truncate leading-tight">
            {transaction.content || (transaction.memo ? `メモ: ${transaction.memo}` : '') || '未設定'}
          </div>
        </div>
      </div>
      <div className={`font-bold text-lg text-right ml-md flex-shrink-0 ${isIncome ? 'text-income' : 'text-expense'}`}>
        {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
      </div>
    </div>
  );
}
