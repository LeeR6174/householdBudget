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
            style={{ backgroundColor: '#e2e8f0', color: '#475569' }}
            className="w-10 h-10 rounded-full flex-center font-bold text-xs flex-shrink-0"
          >
            振替
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold flex items-center gap-sm text-sm truncate">
              <span>{fromAsset?.name || '不明'}</span>
              <ArrowRight size={14} className="text-secondary" />
              <span>{toAsset?.name || '不明'}</span>
            </div>
            <div className="text-xs text-secondary flex flex-col mt-0.5">
              <span>{formatDate(transaction.date)}</span>
              {transaction.content && (
                <span className="text-primary truncate">{transaction.content}</span>
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
          className="w-10 h-10 rounded-full flex-center font-bold flex-shrink-0"
        >
          {category?.name?.[0] || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold flex items-center gap-sm flex-wrap">
            <span className="truncate">{transaction.content || category?.name || '不明'}</span>
            <span className="text-xs px-2 py-0.5 rounded-full text-secondary font-normal" style={{ backgroundColor: 'rgba(0,0,0,0.05)', whiteSpace: 'nowrap' }}>
              {asset?.name || '不明資産'}
            </span>
          </div>
          <div className="text-xs text-secondary flex flex-col mt-0.5">
            <span>{formatDate(transaction.date)}</span>
            {transaction.memo && (
              <span className="truncate text-primary">{transaction.memo}</span>
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
