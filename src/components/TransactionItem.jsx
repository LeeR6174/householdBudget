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
            className="category-block"
            style={{ backgroundColor: '#f1f5f9', color: '#64748b' }}
          >
            振替
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="font-bold flex items-center gap-sm text-base truncate leading-tight mb-xs">
              <span>{fromAsset?.name || '不明'}</span>
              <ArrowRight size={14} className="text-secondary" />
              <span>{toAsset?.name || '不明'}</span>
            </div>
            <div className="flex items-center gap-sm">
              <span className="text-xs text-secondary truncate" style={{ opacity: 0.7 }}>
                {transaction.content || '口座間振替'}
              </span>
              <span className="text-xs text-secondary ml-auto" style={{ opacity: 0.6 }}>
                {formatDate(transaction.date)}
              </span>
            </div>
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
          className="category-block"
          style={{ backgroundColor: `${category?.color || '#64748b'}`, color: '#fff' }}
        >
          {category?.name?.slice(0, 4) || '?'}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="font-bold text-base truncate leading-tight mb-xs">
            {transaction.content || (transaction.memo ? `メモ: ${transaction.memo}` : '') || '未設定'}
          </div>
          <div className="flex items-center gap-sm">
            <span className="text-xs text-secondary truncate" style={{ opacity: 0.7 }}>
              {asset?.name || '不明'}
            </span>
            <span className="text-xs text-secondary ml-auto" style={{ opacity: 0.6 }}>
              {formatDate(transaction.date)}
            </span>
          </div>
        </div>
      </div>
      <div className={`font-bold text-lg text-right ml-md flex-shrink-0 ${isIncome ? 'text-income' : 'text-expense'}`}>
        {isIncome ? '+' : '-'}{formatCurrency(transaction.amount)}
      </div>
    </div>
  );
}
