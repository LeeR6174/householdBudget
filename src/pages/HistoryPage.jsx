import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Filter, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { db } from '../db/db';
import { getCurrentBudgetMonth, getMonthRange } from '../utils/dateUtils';
import MonthSelector from '../components/MonthSelector';
import TransactionItem from '../components/TransactionItem';

export default function HistoryPage() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(getCurrentBudgetMonth());
  const monthRange = getMonthRange(currentMonth);
  
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    startDate: monthRange.startDate,
    endDate: monthRange.endDate,
    minAmount: '',
    maxAmount: '',
    assetType: 'all', // all, bank, cash, credit
  });

  // フィルタが初期状態から変更されているか
  const isFilterActive = 
    filters.minAmount !== '' || 
    filters.maxAmount !== '' || 
    filters.assetType !== 'all' ||
    filters.startDate !== monthRange.startDate ||
    filters.endDate !== monthRange.endDate;

  // 月選択が変わったらフィルターの日付も更新する
  useEffect(() => {
    const range = getMonthRange(currentMonth);
    setFilters(prev => ({
      ...prev,
      startDate: range.startDate,
      endDate: range.endDate
    }));
  }, [currentMonth]);

  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];

  const transactions = useLiveQuery(async () => {
    // 日付範囲でまず取得
    let items = await db.transactions
      .where('date').between(filters.startDate, filters.endDate, true, true)
      .toArray();
    
    // メモリ内で追加フィルタを適用
    return items.filter(tx => {
      // 金額フィルタ
      const min = filters.minAmount === '' ? 0 : Number(filters.minAmount);
      const max = filters.maxAmount === '' ? Infinity : Number(filters.maxAmount);
      const amountOk = tx.amount >= min && tx.amount <= max;
      
      // 資産タイプフィルタ
      let assetOk = true;
      if (filters.assetType !== 'all') {
        const asset = assets.find(a => a.id === tx.assetId);
        assetOk = asset && asset.type === filters.assetType;
      }
      
      return amountOk && assetOk;
    }).sort((a, b) => {
      // 日付の降順
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      // 同じ日付なら作成日時の降順
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [filters, assets]) || [];

  const handleDelete = async (id) => {
    if (window.confirm('この記録を削除しますか？')) {
      await db.transactions.delete(id);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const resetFilters = () => {
    const range = getMonthRange(currentMonth);
    setFilters({
      startDate: range.startDate,
      endDate: range.endDate,
      minAmount: '',
      maxAmount: '',
      assetType: 'all',
    });
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex-between items-center mb-lg">
        <div className="page-title mb-0">履歴一覧</div>
        <button 
          className={`btn-icon ${showFilters ? 'text-primary' : ''}`} 
          onClick={() => setShowFilters(!showFilters)}
          style={{ 
            backgroundColor: showFilters ? 'rgba(79, 70, 229, 0.1)' : '',
            position: 'relative'
          }}
        >
          <Filter size={20} />
          {isFilterActive && !showFilters && (
            <span style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              width: '8px',
              height: '8px',
              backgroundColor: 'var(--expense-color)',
              borderRadius: '50%',
              border: '2px solid white'
            }}></span>
          )}
        </button>
      </div>

      {!showFilters && (
        <MonthSelector currentMonth={currentMonth} onChange={setCurrentMonth} />
      )}

      {showFilters && (
        <div className="card animate-fade-in mb-lg" style={{ padding: '20px', border: '1px solid var(--primary-color-light)', backgroundColor: 'rgba(79, 70, 229, 0.02)' }}>
          <div className="flex-between items-center mb-md">
            <h3 className="font-bold text-sm text-primary flex items-center gap-xs">
              <Search size={16} /> 絞り込み条件
            </h3>
            <button className="text-[10px] font-bold text-secondary bg-slate-100 hover:bg-slate-200 px-sm py-xs rounded-full flex items-center gap-xs transition-colors" onClick={resetFilters}>
              <X size={12} /> 条件をクリア
            </button>
          </div>
          
          <div className="grid gap-md">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group mb-0">
                <label className="form-label text-[10px]">開始日</label>
                <input 
                  type="date" 
                  name="startDate" 
                  className="form-control" 
                  style={{ padding: '8px 12px', fontSize: '14px' }} 
                  value={filters.startDate}
                  onChange={handleFilterChange}
                />
              </div>
              <div className="form-group mb-0">
                <label className="form-label text-[10px]">終了日</label>
                <input 
                  type="date" 
                  name="endDate" 
                  className="form-control" 
                  style={{ padding: '8px 12px', fontSize: '14px' }} 
                  value={filters.endDate}
                  onChange={handleFilterChange}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group mb-0">
                <label className="form-label text-[10px]">最小金額</label>
                <input 
                  type="number" 
                  name="minAmount" 
                  placeholder="0"
                  className="form-control" 
                  style={{ padding: '8px 12px', fontSize: '14px' }} 
                  value={filters.minAmount}
                  onChange={handleFilterChange}
                />
              </div>
              <div className="form-group mb-0">
                <label className="form-label text-[10px]">最大金額</label>
                <input 
                  type="number" 
                  name="maxAmount" 
                  placeholder="なし"
                  className="form-control" 
                  style={{ padding: '8px 12px', fontSize: '14px' }} 
                  value={filters.maxAmount}
                  onChange={handleFilterChange}
                />
              </div>
            </div>

            <div className="form-group mb-0">
              <label className="form-label text-[10px]">支払い方法</label>
              <select 
                name="assetType" 
                className="form-control" 
                style={{ padding: '8px 12px', fontSize: '14px' }}
                value={filters.assetType}
                onChange={handleFilterChange}
              >
                <option value="all">すべて</option>
                <option value="bank">銀行・口座</option>
                <option value="cash">現金</option>
                <option value="credit">クレジットカード</option>
              </select>
            </div>
          </div>
        </div>
      )}
      
      <div className="card" style={{ padding: '0 16px' }}>
        {transactions.map(tx => (
          <div key={tx.id} style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <TransactionItem 
                transaction={tx} 
                categories={categories} 
                assets={assets} 
                onClick={() => navigate(`/edit/${tx.id}`)}
              />
            </div>
            <button 
              onClick={() => handleDelete(tx.id)}
              style={{ padding: '16px 0 16px 16px', border: 'none', background: 'transparent', color: 'var(--danger-color)', cursor: 'pointer' }}
            >
              <Trash2 size={20} />
            </button>
          </div>
        ))}
        {transactions.length === 0 && (
          <div className="text-center py-xl text-secondary">
            条件に一致する履歴がありません
          </div>
        )}
      </div>
    </div>
  );
}
