import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Filter, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
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
    exactAmount: '',
    keyword: '',
    categoryId: 'all',
    transactionType: 'all', // all, income, expense, transfer
    assetType: 'all', // all, bank, cash, credit
  });

  // フィルタが初期状態から変更されているか
  const isFilterActive = 
    filters.minAmount !== '' || 
    filters.maxAmount !== '' || 
    filters.exactAmount !== '' || 
    filters.keyword !== '' || 
    filters.categoryId !== 'all' || 
    filters.transactionType !== 'all' || 
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

  const categories = useLiveQuery(() => db.categories.toArray().then(cats => cats.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];

  const transactions = useLiveQuery(async () => {
    // 日付範囲でまず取得
    let items = await db.transactions
      .where('date').between(filters.startDate, filters.endDate, true, true)
      .toArray();
    
    // メモリ内で追加フィルタを適用
    return items.filter(tx => {
      // 金額範囲フィルタ
      const min = filters.minAmount === '' ? 0 : Number(filters.minAmount);
      const max = filters.maxAmount === '' ? Infinity : Number(filters.maxAmount);
      const amountOk = tx.amount >= min && tx.amount <= max;

      // 金額一致フィルタ
      let exactAmountOk = true;
      if (filters.exactAmount !== '') {
        exactAmountOk = tx.amount === Number(filters.exactAmount);
      }

      // キーワード検索 (内容 or メモ)
      let keywordOk = true;
      if (filters.keyword !== '') {
        const kw = filters.keyword.toLowerCase();
        const contentMatch = tx.content && tx.content.toLowerCase().includes(kw);
        const memoMatch = tx.memo && tx.memo.toLowerCase().includes(kw);
        keywordOk = contentMatch || memoMatch;
      }

      // カテゴリフィルタ
      let categoryOk = true;
      if (filters.categoryId !== 'all') {
        categoryOk = tx.categoryId === filters.categoryId;
      }

      // 取引タイプフィルタ
      let typeOk = true;
      if (filters.transactionType !== 'all') {
        typeOk = tx.type === filters.transactionType;
      }
      
      // 資産タイプフィルタ
      let assetOk = true;
      if (filters.assetType !== 'all') {
        const asset = assets.find(a => a.id === tx.assetId);
        assetOk = asset && asset.type === filters.assetType;
      }
      
      return amountOk && exactAmountOk && keywordOk && categoryOk && typeOk && assetOk;
    }).sort((a, b) => {
      // 日付の降順
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      // 同じ日付なら作成日時の降順
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }, [filters, assets]) || [];

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
      exactAmount: '',
      keyword: '',
      categoryId: 'all',
      transactionType: 'all',
      assetType: 'all',
    });
  };

  const handleRemoveFilter = (key, defaultValue = '') => {
    if (key === 'startDate' || key === 'endDate') {
      const range = getMonthRange(currentMonth);
      setFilters(prev => ({
        ...prev,
        [key]: key === 'startDate' ? range.startDate : range.endDate
      }));
    } else {
      setFilters(prev => ({
        ...prev,
        [key]: defaultValue
      }));
    }
  };

  const renderFilterChips = () => {
    if (!isFilterActive) return null;

    const chips = [];
    const range = getMonthRange(currentMonth);

    if (filters.keyword) {
      chips.push({ label: `キーワード: ${filters.keyword}`, onClick: () => handleRemoveFilter('keyword', '') });
    }
    if (filters.exactAmount) {
      chips.push({ label: `金額: ${filters.exactAmount}円`, onClick: () => handleRemoveFilter('exactAmount', '') });
    }
    if (filters.minAmount || filters.maxAmount) {
      const minText = filters.minAmount ? `${filters.minAmount}円以上` : '';
      const maxText = filters.maxAmount ? `${filters.maxAmount}円以下` : '';
      chips.push({
        label: `金額範囲: ${minText}${minText && maxText ? ' 〜 ' : ''}${maxText}`,
        onClick: () => {
          handleRemoveFilter('minAmount', '');
          handleRemoveFilter('maxAmount', '');
        }
      });
    }
    if (filters.categoryId !== 'all') {
      const cat = categories.find(c => c.id === filters.categoryId);
      chips.push({ label: `カテゴリ: ${cat?.name || '不明'}`, onClick: () => handleRemoveFilter('categoryId', 'all') });
    }
    if (filters.transactionType !== 'all') {
      const typeLabel = { income: '収入', expense: '支出', transfer: '振替' }[filters.transactionType];
      chips.push({ label: `タイプ: ${typeLabel}`, onClick: () => handleRemoveFilter('transactionType', 'all') });
    }
    if (filters.assetType !== 'all') {
      const assetLabel = { bank: '銀行', cash: '現金', credit: 'カード' }[filters.assetType];
      chips.push({ label: `支払方法: ${assetLabel}`, onClick: () => handleRemoveFilter('assetType', 'all') });
    }
    if (filters.startDate !== range.startDate || filters.endDate !== range.endDate) {
      chips.push({
        label: `期間: ${filters.startDate} 〜 ${filters.endDate}`,
        onClick: () => {
          handleRemoveFilter('startDate', range.startDate);
          handleRemoveFilter('endDate', range.endDate);
        }
      });
    }

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        {chips.map((chip, idx) => (
          <span 
            key={idx} 
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(79, 70, 229, 0.08)',
              color: 'var(--primary-color)',
              padding: '6px 12px',
              borderRadius: '9999px',
              border: '1px solid rgba(79, 70, 229, 0.15)',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
            onClick={chip.onClick}
          >
            {chip.label}
            <X size={12} style={{ opacity: 0.6 }} />
          </span>
        ))}
      </div>
    );
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
            <button className="text-[10px] font-bold text-secondary bg-slate-100 hover:bg-slate-200 px-sm py-xs rounded-full flex items-center gap-xs transition-colors" onClick={resetFilters} style={{ border: 'none', cursor: 'pointer', padding: '4px 8px' }}>
              <X size={12} /> 条件をクリア
            </button>
          </div>
          
          <div className="grid gap-md" style={{ display: 'grid', gap: '16px' }}>
            {/* 1. キーワード */}
            <div className="form-group mb-0">
              <label className="form-label text-[10px]">キーワード (内容・メモ)</label>
              <input 
                type="text" 
                name="keyword" 
                placeholder="マクドナルド、電気代 など"
                className="form-control" 
                style={{ padding: '8px 12px', fontSize: '14px' }} 
                value={filters.keyword}
                onChange={handleFilterChange}
              />
            </div>

            {/* 2. 日付範囲 */}
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

            {/* 3. 金額一致 */}
            <div className="form-group mb-0">
              <label className="form-label text-[10px]">金額 (完全一致)</label>
              <input 
                type="number" 
                name="exactAmount" 
                placeholder="金額を入力"
                className="form-control" 
                style={{ padding: '8px 12px', fontSize: '14px' }} 
                value={filters.exactAmount}
                onChange={handleFilterChange}
              />
            </div>

            {/* 4. 金額範囲 */}
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

            {/* 5. 取引タイプ & カテゴリ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group mb-0">
                <label className="form-label text-[10px]">取引タイプ</label>
                <select 
                  name="transactionType" 
                  className="form-control" 
                  style={{ padding: '8px 12px', fontSize: '14px' }}
                  value={filters.transactionType}
                  onChange={handleFilterChange}
                >
                  <option value="all">すべて</option>
                  <option value="expense">支出</option>
                  <option value="income">収入</option>
                  <option value="transfer">振替</option>
                </select>
              </div>
              <div className="form-group mb-0">
                <label className="form-label text-[10px]">カテゴリ</label>
                <select 
                  name="categoryId" 
                  className="form-control" 
                  style={{ padding: '8px 12px', fontSize: '14px' }}
                  value={filters.categoryId}
                  onChange={handleFilterChange}
                >
                  <option value="all">すべて</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 6. 支払い方法 */}
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

      {renderFilterChips()}
      
      <div className="card" style={{ padding: '0 16px' }}>
        {transactions.map(tx => (
          <TransactionItem 
            key={tx.id} 
            transaction={tx} 
            categories={categories} 
            assets={assets} 
            onClick={() => navigate(`/edit/${tx.id}`)}
          />
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
