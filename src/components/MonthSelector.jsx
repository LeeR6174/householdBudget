import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getPrevMonth, getNextMonth } from '../utils/dateUtils';

export default function MonthSelector({ currentMonth, onChange }) {
  // currentMonth: 'YYYY-MM'
  const [yearStr, monthStr] = currentMonth.split('-');
  const displayYearMonth = `${yearStr}年${parseInt(monthStr, 10)}月分`;

  return (
    <div className="flex-between card" style={{ padding: '12px 16px', marginBottom: '16px' }}>
      <button 
        className="btn btn-outline"
        style={{ padding: '8px', border: 'none' }}
        onClick={() => onChange(getPrevMonth(currentMonth))}
      >
        <ChevronLeft size={24} />
      </button>
      
      <div className="text-center">
        <div className="font-bold text-lg" style={{ whiteSpace: 'nowrap' }}>{displayYearMonth}</div>
        <div className="text-secondary" style={{ fontSize: '10px', whiteSpace: 'nowrap', transform: 'scale(0.9)' }}>
          (前月25日〜当月24日)
        </div>
      </div>

      <button 
        className="btn btn-outline"
        style={{ padding: '8px', border: 'none' }}
        onClick={() => onChange(getNextMonth(currentMonth))}
      >
        <ChevronRight size={24} />
      </button>
    </div>
  );
}
