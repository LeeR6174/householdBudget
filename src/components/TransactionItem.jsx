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
      <div className="list-item" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', alignItems: 'center' }}>
        <div className="flex items-center gap-md flex-1 min-w-0">
          <div 
            style={{ backgroundColor: '#e2e8f0', color: '#475569', border: '0' }}
            className="w-12 h-12 rounded-full flex-center font-bold text-xs flex-shrink-0"
          >
            振替
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-secondary mb-xs">
              {formatDate(transaction.date)}
            </div>
            <div className="font-bold flex items-center gap-sm text-base truncate">
              <span>{fromAsset?.name || '不明'}</span>
              <ArrowRight size={14} className="text-secondary" />
              <span>{toAsset?.name || '不明'}</span>
            </div>
            {transaction.content && (
              <div className="text-xs text-secondary truncate mt-xs">{transaction.content}</div>
            )}
          </div>
        </div>
        <div className="font-bold text-secondary text-right ml-md">
          {formatCurrency(transaction.amount)}
        </div>
      </div>
    );
  }

  // 収入・支出のUI
  return (
    <div className="list-item" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', alignItems: 'center' }}>
      <div className="flex items-center gap-md flex-1 min-w-0">
        <div 
          style={{ backgroundColor: `${category?.color || '#64748b'}`, color: '#fff', border: '0' }}
          className="w-12 h-12 rounded-full flex-center font-bold flex-shrink-0 text-xl"
        >
          {category?.name?.[0] || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-sm flex-wrap mb-xs">
            <span 
              className="category-pill" 
              style={{ backgroundColor: `${category?.color || '#64748b'}20`, color: category?.color || '#64748b' }}
            >
              {category?.name || '不明'}
            </span>
            <span className="text-xs text-secondary truncate" style={{ opacity: 0.8 }}>
              {asset?.name || '不明資産'}
            </span>
          </div>
          <div className="font-bold text-base truncate">
            {transaction.content || (transaction.memo ? `メモ: ${transaction.memo}` : '') || '名称未設定'}
          </div>
        </div>
      </div>
      <div className={`font-bold text-lg text-right ml-md ${isIncome ? 'text-income' : 'text-expense'}`}>
        {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
      </div>
    </div>
  );
}
