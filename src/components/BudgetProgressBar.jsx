import React from 'react';
import { formatCurrency } from '../utils/format';

export default function BudgetProgressBar({ category, spent, limit: propLimit }) {
  const limit = propLimit !== undefined ? propLimit : (category.monthlyLimit || 0);
  const isUnbudgeted = limit === 0;
  
  const percentage = isUnbudgeted ? 0 : Math.min((spent / limit) * 100, 100);
  const displayPercentage = isUnbudgeted ? 0 : (spent / limit) * 100;

  let colorClass = 'safe-color';
  let barColor = 'var(--safe-color)';
  if (displayPercentage >= 100) {
    colorClass = 'danger-color';
    barColor = 'var(--danger-color)';
  } else if (displayPercentage >= 80) {
    colorClass = 'warning-color';
    barColor = 'var(--warning-color)';
  }

  // もし全く使っていなくて予算も未設定なら表示を控えめにする
  if (isUnbudgeted && spent === 0) return null;

  return (
    <div className="mb-md">
      <div className="flex-between gap-sm text-sm mb-sm">
        <div className="flex-center gap-sm font-semibold">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: category.color || '#333' }}></div>
          <span>{category.name}</span>
        </div>
        <div className="text-right">
          <span className={`font-bold ${isUnbudgeted ? '' : `text-${colorClass}`}`}>{formatCurrency(spent)}</span>
          {!isUnbudgeted && (
            <span className="text-secondary text-xs ml-sm">/ {formatCurrency(limit)}</span>
          )}
        </div>
      </div>
      
      {!isUnbudgeted ? (
        <>
          <div className="progress-container" style={{ height: '10px' }}>
            <div 
              className="progress-bar" 
              style={{ width: `${percentage}%`, backgroundColor: barColor }}
            ></div>
          </div>
          <div className="text-right text-xs mt-xs text-secondary font-semibold">
            {displayPercentage.toFixed(1)}%
          </div>
        </>
      ) : (
        <div className="text-right text-xs mt-xs text-secondary">予算未設定</div>
      )}
    </div>
  );
}
