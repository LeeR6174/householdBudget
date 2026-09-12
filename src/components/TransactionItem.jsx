import React from 'react';
import { ArrowRight } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/format';

export default function TransactionItem({ transaction, categories, assets, onClick, onSettle }) {
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer';
  const isLegacyReimbursement = transaction.type === 'reimbursement';
  const isReimbursement = isLegacyReimbursement || transaction.isReimbursement === true;
  const isPendingReimbursement = transaction.isReimbursement === true && transaction.reimbursementStatus !== 'settled';
  
  const category = categories?.find(c => c.id === transaction.categoryId);
  const asset = assets?.find(a => a.id === transaction.assetId);
  const fromAsset = assets?.find(a => a.id === transaction.fromAssetId);
  const toAsset = assets?.find(a => a.id === transaction.toAssetId);

  if (isLegacyReimbursement) {
    return (
      <div className="list-item transaction-item" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', padding: '12px 0' }}>
        <div className="flex items-center gap-md flex-1 min-w-0">
          <div className="category-block flex-center" style={{ backgroundColor: '#d1fae5', color: '#047857', fontSize: '18px' }}>
            ↔
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="font-bold text-base truncate leading-tight mb-xs">
              {transaction.content || '立替精算'}
            </div>
            <div className="flex items-center gap-sm">
              <span className="text-xs text-secondary truncate">{asset?.name || '不明'} · 支出/収入から除外</span>
              <span className="text-xs text-secondary ml-auto" style={{ opacity: 0.6 }}>{formatDate(transaction.date)}</span>
            </div>
          </div>
        </div>
        <div className="font-bold text-base text-income text-right ml-md flex-shrink-0 transaction-amount">
          精算済み
          {transaction.reimbursementMethod && (
            <div className="text-xs text-secondary">{transaction.reimbursementMethod === 'bank' ? '銀行' : '現金'}返金</div>
          )}
        </div>
      </div>
    );
  }

  // 振替の場合のUI
  if (isTransfer) {
    return (
      <div className="list-item transaction-item" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', padding: '12px 0' }}>
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
        <div className="font-bold text-secondary text-right ml-md flex-shrink-0 transaction-amount">
          {formatCurrency(transaction.amount)}
        </div>
      </div>
    );
  }

  // 収入・支出のUI
  return (
    <div className="list-item transaction-item" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default', padding: '12px 0' }}>
      <div className="flex items-center gap-md flex-1 min-w-0">
        <div 
          className="category-block flex-center"
          style={{ 
            backgroundColor: transaction.isSavingsDepletion ? '#e0e7ff' : `${category?.color || '#64748b'}`, 
            color: transaction.isSavingsDepletion ? '#4f46e5' : '#fff',
            fontSize: transaction.isSavingsDepletion ? '18px' : 'inherit'
          }}
        >
          {transaction.isSavingsDepletion ? '🐷' : (category?.name?.slice(0, 4) || '?')}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="font-bold text-base truncate leading-tight mb-xs">
            {transaction.content || (transaction.memo ? `メモ: ${transaction.memo}` : '') || (transaction.isSavingsDepletion ? '貯金切り崩し' : '未設定')}
          </div>
          <div className="flex items-center gap-sm flex-wrap">
            <span className="text-xs text-secondary truncate" style={{ opacity: 0.7 }}>
              {asset?.name || '不明'}
            </span>
            {transaction.isSavingsDepletion && (
              <span 
                className="text-[9px] font-bold px-sm py-xs rounded" 
                style={{ backgroundColor: 'rgba(79, 70, 229, 0.08)', color: 'var(--primary-color)', lineHeight: 1 }}
              >
                貯金切崩し
              </span>
            )}
            {transaction.isReimbursement && (
              <span
                className="text-[9px] font-bold px-sm py-xs rounded"
                style={{ backgroundColor: isPendingReimbursement ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)', color: isPendingReimbursement ? '#b45309' : 'var(--income-color)', lineHeight: 1 }}
              >
                {isPendingReimbursement ? '立替中' : '立替済み・集計外'}
              </span>
            )}
            <span className="text-xs text-secondary ml-auto" style={{ opacity: 0.6 }}>
              {formatDate(transaction.date)}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-sm ml-md flex-shrink-0 transaction-actions">
        <div className={`font-bold text-lg text-right ${isReimbursement && !isPendingReimbursement ? 'text-income' : isIncome ? 'text-income' : 'text-expense'}`}>
          {isReimbursement && !isPendingReimbursement ? (
            <>
              <div>立替済み</div>
              {transaction.reimbursementMethod && (
                <div className="text-xs text-secondary">{transaction.reimbursementMethod === 'bank' ? '銀行' : '現金'}返金</div>
              )}
            </>
          ) : `${isIncome ? '+' : '-'}${formatCurrency(transaction.amount)}`}
        </div>
        {isPendingReimbursement && onSettle && (
          <button
            type="button"
            className="settle-button"
            onClick={(event) => {
              event.stopPropagation();
              onSettle(transaction);
            }}
          >
            立替済みにする
          </button>
        )}
      </div>
    </div>
  );
}
