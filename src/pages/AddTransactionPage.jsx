import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { db } from '../db/db';

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
  
  const [content, setContent] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#9ca3af');

  const handleAddCategorySubmit = async (e) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

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
        createdAt: isEditing ? (existingTx?.createdAt || new Date().toISOString()) : new Date().toISOString()
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
        if (!categoryId || !assetId) {
          alert('カテゴリと資産を選択してください');
          return;
        }
        baseTx.categoryId = categoryId;
        baseTx.assetId = assetId;
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
        </div>

        {type !== 'transfer' ? (
          <>
            <div className="form-group">
              <label className="form-label">使用資産</label>
              <select className="form-control" value={assetId} onChange={(e) => setAssetId(e.target.value)} required>
                <option value="" disabled>口座・カードを選択</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.type === 'credit' ? '💳 ' : a.type === 'cash' ? '💵 ' : '🏦 '}{a.name}</option>)}
              </select>
            </div>
            
            <div className="form-group">
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
              <select className="form-control" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
                <option value="" disabled>分類を選択</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            </div>
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
