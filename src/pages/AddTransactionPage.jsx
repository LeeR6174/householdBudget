import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft } from 'lucide-react';
import { db } from '../db/db';

export default function AddTransactionPage() {
  const navigate = useNavigate();
  const [type, setType] = useState('expense'); // 'expense' | 'income' | 'transfer'
  
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [assetId, setAssetId] = useState('');
  
  const [fromAssetId, setFromAssetId] = useState(''); // for transfer
  const [toAssetId, setToAssetId] = useState(''); // for transfer
  
  const [content, setContent] = useState('');
  const [memo, setMemo] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const categories = useLiveQuery(() => db.categories.where('type').equals(type).toArray(), [type]) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  
  const allTx = useLiveQuery(() => db.transactions.toArray()) || [];
  const contentSuggestions = Array.from(new Set(allTx.filter(t => t.content).map(t => t.content)));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!amount || amount <= 0) {
      alert('金額を正しく入力してください');
      return;
    }

    try {
      const baseTx = {
        id: crypto.randomUUID(),
        type,
        amount: Number(amount),
        content,
        memo,
        date,
        createdAt: new Date().toISOString()
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
          baseTx.cardStatus = 'unconfirmed';
        }
      }

      await db.transactions.add(baseTx);
      navigate('/');
    } catch (err) {
      console.error(err);
      alert('保存に失敗しました');
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex gap-sm items-center mb-lg">
        <button className="btn btn-outline" style={{ border: 'none', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-color)' }} onClick={() => navigate('/')}>
          <ChevronLeft size={20} />
          <span className="font-bold">戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>記録の追加</div>
      </div>
      
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

        <div className="form-group flex gap-md">
          <div className="flex-1">
            <label className="form-label">日付</label>
            <input 
              type="date" 
              className="form-control"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
        </div>

        {type !== 'transfer' ? (
          <>
            <div className="form-group">
              <label className="form-label">使用資産</label>
              <select className="form-control" value={assetId} onChange={(e) => setAssetId(e.target.value)} required>
                <option value="" disabled>口座・カードを選択</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.type === 'credit' ? '💳 ' : '🏦 '}{a.name}</option>)}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">カテゴリ</label>
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
                {assets.map(a => <option key={a.id} value={a.id}>{a.type === 'credit' ? '💳 ' : '🏦 '}{a.name}</option>)}
              </select>
            </div>
            <div className="flex-center mt-lg text-secondary">→</div>
            <div className="flex-1">
              <label className="form-label">入金先</label>
              <select className="form-control" value={toAssetId} onChange={(e) => setToAssetId(e.target.value)} required>
                <option value="" disabled>選択</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.type === 'credit' ? '💳 ' : '🏦 '}{a.name}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">内容</label>
          <input 
            type="text" 
            list="contentSuggestions"
            className="form-control"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="店名や目的など"
          />
          <datalist id="contentSuggestions">
            {contentSuggestions.map((s, i) => (
              <option key={i} value={s} />
            ))}
          </datalist>
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
          保存する
        </button>
      </form>
    </div>
  );
}
