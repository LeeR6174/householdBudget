import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { db } from '../db/db';
import { getLocalDateString, getLocalISOString } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';

export default function AddTransactionPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const [type, setType] = useState('expense'); // 'expense' | 'income' | 'transfer'
  
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [assetId, setAssetId] = useState('');
  
  const [fromAssetId, setFromAssetId] = useState(''); // for transfer
  const [toAssetId, setToAssetId] = useState(''); // for transfer
  const [isSavingsDepletion, setIsSavingsDepletion] = useState(false);
  
  const [content, setContent] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(getLocalDateString());

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#9ca3af');

  const handleAddCategorySubmit = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    if (newCatName.trim() === '緊急支出') {
      alert('「緊急支出」は既に固定枠として登録されています');
      return;
    }

    try {
      const newId = `cat_custom_${Date.now()}`;
      const newCat = {
        id: newId,
        name: newCatName.trim(),
        type,
        color: newCatColor,
        monthlyLimit: 0,
        isCarryover: false,
        description: ''
      };
      await db.categories.add(newCat);
      setCategoryId(newId);
      setIsAddingCategory(false);
      setNewCatName('');
      setNewCatColor('#9ca3af');
    } catch (err) {
      console.error(err);
      alert('カテゴリの追加に失敗しました');
    }
  };

  const categories = useLiveQuery(() => db.categories.where('type').equals(type).toArray().then(cats => cats.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))), [type]) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  const settings = useLiveQuery(() => db.settings.get('master'));
  const allMonthlySettings = useLiveQuery(() => db.monthlySettings.toArray()) || [];
  const savingsRecords = useLiveQuery(() => db.savingsRecords.toArray()) || [];
  const allTransactions = useLiveQuery(() => db.transactions.toArray()) || [];

  const currentSavings = useMemo(() => {
    if (!settings) return 0;
    const initial = settings.targetSavings || 0;
    const monthly = allMonthlySettings.reduce((sum, s) => sum + (s.targetSavings || 0), 0);
    const extra = savingsRecords.filter(r => r.type === 'addition').reduce((sum, r) => sum + (r.amount || 0), 0);
    const dbDep = savingsRecords.filter(r => r.type === 'depletion').reduce((sum, r) => sum + (r.amount || 0), 0);
    const txDep = allTransactions
      .filter(t => t.type === 'expense' && t.isSavingsDepletion && (!id || t.id !== id))
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    return Math.max(0, initial + monthly + extra - (dbDep + txDep));
  }, [settings, allMonthlySettings, savingsRecords, allTransactions, id]);

  // Fetch existing transaction if editing
  const existingTx = useLiveQuery(async () => {
    if (!id) return null;
    return await db.transactions.get(id);
  }, [id]);

  React.useEffect(() => {
    if (existingTx) {
      setType(existingTx.type);
      setAmount(existingTx.amount.toString());
      setCategoryId(existingTx.categoryId || '');
      setAssetId(existingTx.assetId || '');
      setFromAssetId(existingTx.fromAssetId || '');
      setToAssetId(existingTx.toAssetId || '');
      setContent(existingTx.content || '');
      setMemo(existingTx.memo || '');
      setDate(existingTx.date);
      setIsSavingsDepletion(existingTx.isSavingsDepletion || false);
    } else if (!isEditing && assets.length === 1) {
      // Auto-select asset if only one exists
      setAssetId(assets[0].id);
    }
  }, [existingTx, assets.length, isEditing]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (isEditing && !existingTx) {
      alert('データの読み込み中です。少々お待ちください。');
      return;
    }

    if (!amount || amount <= 0) {
      alert('金額を正しく入力してください');
      return;
    }

    try {
      const baseTx = {
        id: isEditing ? id : crypto.randomUUID(),
        type,
        amount: Number(amount),
        content,
        memo,
        date,
        createdAt: isEditing ? (existingTx?.createdAt || getLocalISOString()) : getLocalISOString()
      };

      if (type === 'transfer') {
        if (!fromAssetId || !toAssetId || fromAssetId === toAssetId) {
          alert('正しい振替元・振替先を選択してください');
          return;
        }
        baseTx.fromAssetId = fromAssetId;
        baseTx.toAssetId = toAssetId;
        baseTx.categoryId = null;
        baseTx.assetId = null;
      } else {
        if (isSavingsDepletion) {
          if (!assetId) {
            alert('使用資産を選択してください');
            return;
          }
          baseTx.categoryId = null;
          baseTx.assetId = assetId;
          baseTx.isSavingsDepletion = true;
        } else {
          if (!categoryId || !assetId) {
            alert('カテゴリと資産を選択してください');
            return;
          }
          baseTx.categoryId = categoryId;
          baseTx.assetId = assetId;
          baseTx.isSavingsDepletion = false;
        }
        baseTx.fromAssetId = null;
        baseTx.toAssetId = null;

        // もしクレジットカード払いなら未確定状態にする
        const selectedAsset = assets.find(a => a.id === assetId);
        if (selectedAsset && selectedAsset.type === 'credit') {
          baseTx.cardStatus = isEditing ? (existingTx?.cardStatus || 'unconfirmed') : 'unconfirmed';
        } else {
          baseTx.cardStatus = isEditing ? existingTx?.cardStatus : undefined;
        }
      }

      await db.transactions.put(baseTx);
      navigate(-1); // Go back
    } catch (err) {
      console.error(err);
      alert('保存に失敗しました');
    }
  };

  const handleDelete = async () => {
    if (window.confirm('この記録を削除しますか？')) {
      try {
        await db.transactions.delete(id);
        navigate(-1);
      } catch (err) {
        console.error(err);
        alert('削除に失敗しました');
      }
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex gap-sm items-center mb-lg">
        <button 
          className="btn-back" 
          onClick={() => navigate(-1)}
          style={{ position: 'relative', zIndex: 100 }}
        >
          <ChevronLeft size={24} />
          <span>戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>{isEditing ? '記録の編集' : '記録の追加'}</div>
      </div>

      {isEditing && existingTx === undefined ? (
        <div className="flex-center" style={{ minHeight: '50vh' }}>
          <div className="text-secondary font-bold">データを読み込み中...</div>
        </div>
      ) : (
        <>
          <div className="toggle-group" style={{ display: 'flex', gap: '4px' }}>
        <button 
          className={`toggle-btn expense ${type === 'expense' ? 'active' : ''}`}
          onClick={() => setType('expense')}
        >支出</button>
        <button 
          className={`toggle-btn income ${type === 'income' ? 'active' : ''}`}
          onClick={() => setType('income')}
        >収入</button>
        <button 
          className={`toggle-btn ${type === 'transfer' ? 'active' : ''}`}
          style={{ 
            backgroundColor: type === 'transfer' ? 'var(--surface-color)' : 'transparent',
            boxShadow: type === 'transfer' ? 'var(--shadow-sm)' : 'none',
            color: type === 'transfer' ? 'var(--text-primary)' : 'var(--text-secondary)'
          }}
          onClick={() => setType('transfer')}
        >振替</button>
      </div>

      <form onSubmit={handleSave} className="card">
        <div className="form-group">
          <label className="form-label">金額 (円)</label>
          <input 
            type="number" 
            inputMode="numeric"
            pattern="[0-9]*"
            className={`form-control input-amount text-${type === 'expense' ? 'expense' : type === 'income' ? 'income' : 'primary'}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            required
            min="1"
          />
        </div>

        <div className="form-group">
          <label className="form-label">日付</label>
          <input 
            type="date" 
            className="form-control"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          {date > getLocalDateString() && (
            <div className="text-xs text-primary font-bold mt-xs flex items-center gap-xs">
              <span>📅 未来の日付です（予定として記録されます）</span>
            </div>
          )}
        </div>

        {type !== 'transfer' ? (
          <>
            {/* 🐷 貯金（ロック分）から支払うチェックボックス */}
            {type === 'expense' && (
              <div 
                className="form-group flex-between mb-md p-md" 
                style={{ 
                  backgroundColor: isSavingsDepletion ? 'rgba(79, 70, 229, 0.08)' : 'rgba(0,0,0,0.03)', 
                  borderRadius: '16px', 
                  cursor: 'pointer',
                  border: isSavingsDepletion ? '1px solid var(--primary-color-light)' : '1px solid transparent',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '12px'
                }} 
                onClick={() => setIsSavingsDepletion(!isSavingsDepletion)}
              >
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: isSavingsDepletion ? 'var(--primary-color)' : 'var(--text-primary)' }}>
                    🐷 貯金（ロック分）から支払う
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    生活費の残り予算を削らずに、貯蓄から切り崩します
                  </div>
                </div>
                <div style={{ 
                  width: '44px', 
                  height: '24px', 
                  backgroundColor: isSavingsDepletion ? 'var(--primary-color)' : '#cbd5e1', 
                  borderRadius: '12px', 
                  position: 'relative',
                  transition: 'background-color 0.2s',
                  flexShrink: 0
                }}>
                  <div style={{ 
                    width: '18px', 
                    height: '18px', 
                    backgroundColor: 'white', 
                    borderRadius: '50%', 
                    position: 'absolute', 
                    top: '3px', 
                    left: isSavingsDepletion ? '23px' : '3px',
                    transition: 'left 0.2s'
                  }}></div>
                </div>
              </div>
            )}

            {/* 貯金切り崩し時の残高表示と超過アラート */}
            {type === 'expense' && isSavingsDepletion && (
              <div className="mb-md animate-fade-in" style={{ marginTop: '-6px' }}>
                <div className="text-[11px] text-secondary flex-between px-xs font-semibold">
                  <span>現在の貯蓄残高: <strong className="text-primary">{formatCurrency(currentSavings)}</strong></span>
                </div>
                {Number(amount) > currentSavings && (
                  <div className="p-sm mt-xs rounded-xl flex items-start gap-xs animate-fade-in" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '12px' }}>
                    <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>🚨</span>
                    <div className="text-xs leading-relaxed">
                      <span className="font-bold text-expense block">貯金残高（{formatCurrency(currentSavings)}）を超過しています</span>
                      <span className="text-secondary">
                        貯金で不足する <strong className="text-expense font-bold">{formatCurrency(Number(amount) - currentSavings)}</strong> は、自動的に「緊急支出」として計上され、今月末の予測金に反映されます。
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">使用資産</label>
              <select className="form-control" value={assetId} onChange={(e) => setAssetId(e.target.value)} required>
                <option value="" disabled>口座・カードを選択</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.type === 'credit' ? '💳 ' : a.type === 'cash' ? '💵 ' : '🏦 '}{a.name}</option>)}
              </select>
            </div>
            
            {/* 貯金切崩しではない場合のみカテゴリ選択を表示する */}
            {!isSavingsDepletion && (
              <div className="form-group animate-fade-in">
                <div className="flex-between mb-xs">
                  <label className="form-label" style={{ marginBottom: 0 }}>カテゴリ</label>
                  <button 
                    type="button" 
                    className="btn btn-outline" 
                    style={{ padding: '2px 8px', fontSize: '0.75rem', height: 'auto', width: 'auto' }}
                    onClick={() => setIsAddingCategory(true)}
                  >
                    <Plus size={14} style={{ marginRight: '2px', display: 'inline', verticalAlign: 'middle' }} />
                    新規追加
                  </button>
                </div>
                <select className="form-control" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required={!isSavingsDepletion}>
                  <option value="" disabled>分類を選択</option>
                  {categories.map(cat => {
                    const isEm = cat.isEmergency || cat.isFixed || cat.name === '緊急支出';
                    return (
                      <option key={cat.id} value={cat.id}>
                        {isEm ? '🚨 ' : ''}{cat.name}{isEm ? '（特別緊急枠）' : ''}
                      </option>
                    );
                  })}
                </select>
                {(() => {
                  const selectedCat = categories.find(c => c.id === categoryId);
                  const isEmergency = selectedCat?.isEmergency || selectedCat?.isFixed || selectedCat?.name === '緊急支出';
                  if (!isEmergency) return null;
                  return (
                    <div className="p-sm mt-xs rounded-xl flex items-start gap-xs animate-fade-in" style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '12px' }}>
                      <span style={{ fontSize: '1rem', lineHeight: 1 }}>🚨</span>
                      <span className="text-xs text-expense font-bold leading-relaxed">
                        緊急支出は今月の総予算に含まれない特別枠です。突発的・不可避な出費にのみご利用ください。
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        ) : (
          <div className="flex gap-md mb-md">
            <div className="flex-1">
              <label className="form-label">出金元</label>
              <select className="form-control" value={fromAssetId} onChange={(e) => setFromAssetId(e.target.value)} required>
                <option value="" disabled>選択</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.type === 'credit' ? '💳 ' : a.type === 'cash' ? '💵 ' : '🏦 '}{a.name}</option>)}
              </select>
            </div>
            <div className="flex-center mt-lg text-secondary">→</div>
            <div className="flex-1">
              <label className="form-label">入金先</label>
              <select className="form-control" value={toAssetId} onChange={(e) => setToAssetId(e.target.value)} required>
                <option value="" disabled>選択</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.type === 'credit' ? '💳 ' : a.type === 'cash' ? '💵 ' : '🏦 '}{a.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">内容</label>
          <input 
            type="text" 
            className="form-control"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="店名や目的など"
          />
        </div>

        <div className="form-group mb-lg">
          <label className="form-label">メモ (任意)</label>
          <input 
            type="text" 
            className="form-control"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="詳細な自由記述"
          />
        </div>

        <button type="submit" className="btn btn-primary w-full shadow-lg text-lg py-3">
          {isEditing ? '更新する' : '保存する'}
        </button>
        {isEditing && (
          <button 
            type="button" 
            className="btn btn-danger w-full mt-md text-lg py-3 flex-center gap-sm"
            onClick={handleDelete}
          >
            <Trash2 size={20} />
            この記録を削除する
          </button>
        )}
      </form>

      {isAddingCategory && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '16px'
        }}>
          <div className="card" style={{ width: '100%', maxWidth: '400px', margin: 0, zIndex: 1001 }}>
            <h3 className="font-bold mb-md">新規カテゴリの追加 ({type === 'expense' ? '支出' : '収入'})</h3>
            <form onSubmit={handleAddCategorySubmit}>
              <div className="form-group mb-md">
                <label className="form-label">カテゴリ名</label>
                <input 
                  type="text" 
                  className="form-control" 
                  value={newCatName} 
                  onChange={e => setNewCatName(e.target.value)} 
                  required 
                  placeholder="例: 交際費" 
                  autoFocus
                />
              </div>
              <div className="form-group mb-md">
                <label className="form-label">カラー</label>
                <input 
                  type="color" 
                  className="form-control" 
                  style={{ padding: '4px', height: '46px' }} 
                  value={newCatColor} 
                  onChange={e => setNewCatColor(e.target.value)} 
                />
              </div>
              <div className="flex gap-sm">
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  追加
                </button>
                <button 
                  type="button" 
                  className="btn btn-outline" 
                  style={{ flex: 1 }}
                  onClick={() => {
                    setIsAddingCategory(false);
                    setNewCatName('');
                    setNewCatColor('#9ca3af');
                  }}
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
