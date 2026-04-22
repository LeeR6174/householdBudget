import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Trash2, Edit2 } from 'lucide-react';
import { db } from '../db/db';

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const subscriptions = useLiveQuery(() => db.subscriptions.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.where('type').equals('expense').toArray()) || [];
  const assets = useLiveQuery(() => db.assets.where('type').equals('credit').toArray()) || []; // クレジットカード限定
  
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  
  const [dayOfMonth, setDayOfMonth] = useState(25);
  const [categoryId, setCategoryId] = useState('');
  const [assetId, setAssetId] = useState('');
  const [amount, setAmount] = useState('');
  const [content, setContent] = useState('');

  const resetForm = () => {
    setEditId(null);
    setDayOfMonth(25);
    setCategoryId('');
    setAssetId('');
    setAmount('');
    setContent('');
    setIsEditing(false);
  };

  const handleEdit = (sub) => {
    setEditId(sub.id);
    setDayOfMonth(sub.dayOfMonth);
    setCategoryId(sub.categoryId);
    setAssetId(sub.assetId);
    setAmount(sub.amount);
    setContent(sub.content);
    setIsEditing(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('この自動設定を削除しますか？')) {
      await db.subscriptions.delete(id);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!categoryId || !amount) {
      return alert('全ての必須項目を入力してください');
    }

    const subData = {
      dayOfMonth: Number(dayOfMonth),
      type: 'expense',
      categoryId,
      assetId,
      amount: Number(amount),
      content,
      memo: '自動入力（サブスク設定）',
      lastProcessedMonth: null // 次回判定時に即処理されるように
    };

    if (editId) {
      await db.subscriptions.update(editId, subData);
    } else {
      subData.id = crypto.randomUUID();
      await db.subscriptions.add(subData);
    }
    resetForm();
  };

  const getCatName = (id) => categories.find(c => c.id === id)?.name || '';
  const getAssetName = (id) => assets.find(a => a.id === id)?.name || '';

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex gap-sm items-center mb-lg">
        <button className="btn btn-outline" style={{ border: 'none', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-color)' }} onClick={() => navigate('/settings')}>
          <ChevronLeft size={20} />
          <span className="font-bold">戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>サブスク・固定費管理</div>
      </div>

      <div className="card mb-lg">
        <h3 className="font-bold mb-md text-primary">{isEditing ? '自動入力の編集' : '新規ルールの追加'}</h3>
        <p className="text-secondary text-sm mb-md">指定した日に自動で「未確定カード支払いリスト」に出現します。</p>
        
        <form onSubmit={handleSave}>
          <div className="flex gap-md mb-md">
            <div className="flex-1">
              <label className="form-label">毎月何日？</label>
              <input type="number" min="1" max="31" className="form-control" value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)} required />
            </div>
            <div className="flex-1">
              <label className="form-label">金額</label>
              <input type="number" className="form-control text-expense" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0" />
            </div>
          </div>

          <div className="form-group mb-md">
            <label className="form-label">使用カード (任意)</label>
            <select className="form-control" value={assetId} onChange={e => setAssetId(e.target.value)}>
              <option value="">(カード未選択)</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div className="form-group mb-md">
            <label className="form-label">カテゴリ</label>
            <select className="form-control" value={categoryId} onChange={e => setCategoryId(e.target.value)} required>
              <option value="" disabled>支出内容を選択</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="form-group mb-lg">
            <label className="form-label">内容 (サービス名など)</label>
            <input type="text" className="form-control" value={content} onChange={e => setContent(e.target.value)} required placeholder="例: Netflix、電気代" />
          </div>

          <div className="flex gap-sm">
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{isEditing ? '更新する' : '追加する'}</button>
            {isEditing && (
              <button type="button" className="btn btn-outline" onClick={resetForm}>キャンセル</button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <h3 className="font-bold mb-md">現在設定されている固定費</h3>
        {subscriptions.map(sub => (
          <div key={sub.id} className="list-item" style={{ alignItems: 'center' }}>
            <div className="w-10 h-10 flex-center bg-gray-100 rounded-full font-bold text-primary">
              {sub.dayOfMonth}日
            </div>
            <div style={{ flex: 1, padding: '0 12px' }}>
              <div className="font-bold">{sub.content}</div>
              <div className="text-xs text-secondary">{getCatName(sub.categoryId)} / {sub.assetId ? getAssetName(sub.assetId) : 'カード未指定'}</div>
            </div>
            <div className="text-right">
              <div className="font-bold text-expense">¥{sub.amount.toLocaleString()}</div>
              <div className="flex justify-end gap-sm mt-xs">
                <button onClick={() => handleEdit(sub)} className="text-primary" style={{ border: 'none', background: 'transparent' }}><Edit2 size={16}/></button>
                <button onClick={() => handleDelete(sub.id)} className="text-danger-color" style={{ border: 'none', background: 'transparent' }}><Trash2 size={16}/></button>
              </div>
            </div>
          </div>
        ))}
        {subscriptions.length === 0 && <p className="text-sm text-secondary text-center py-md">自動設定はありません</p>}
      </div>
    </div>
  );
}
