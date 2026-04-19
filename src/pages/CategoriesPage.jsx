import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Trash2, Edit2, Plus } from 'lucide-react';
import { db } from '../db/db';

export default function CategoriesPage() {
  const navigate = useNavigate();
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  
  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [color, setColor] = useState('#9ca3af');
  const [monthlyLimit, setMonthlyLimit] = useState('');

  const resetForm = () => {
    setEditId(null);
    setName('');
    setType('expense');
    setColor('#9ca3af');
    setMonthlyLimit('');
    setIsEditing(false);
  };

  const handleEdit = (cat) => {
    setEditId(cat.id);
    setName(cat.name);
    setType(cat.type);
    setColor(cat.color || '#9ca3af');
    setMonthlyLimit(cat.monthlyLimit?.toString() || '');
    setIsEditing(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('このカテゴリを削除しますか？（過去の記録のカテゴリは「不明」と表示されるようになります）')) {
      await db.categories.delete(id);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name.trim()) return alert('カテゴリ名を入力してください');

    const catData = {
      name: name.trim(),
      type,
      color,
      monthlyLimit: Number(monthlyLimit) || 0
    };

    if (editId) {
      await db.categories.update(editId, catData);
    } else {
      catData.id = `cat_custom_${Date.now()}`;
      await db.categories.add(catData);
    }
    resetForm();
  };

  const expenseCats = categories.filter(c => c.type === 'expense');
  const incomeCats = categories.filter(c => c.type === 'income');

  const CategoryList = ({ cats, title }) => (
    <div className="mb-lg">
      <h3 className="font-bold mb-sm text-secondary">{title}</h3>
      {cats.map(cat => (
        <div key={cat.id} className="list-item" style={{ padding: '8px 0' }}>
          <div className="flex-center gap-sm">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: cat.color || '#333' }}></div>
            <span className="font-semibold">{cat.name}</span>
          </div>
          <div className="flex gap-sm">
            <button onClick={() => handleEdit(cat)} className="btn btn-outline" style={{ padding: '6px', border: 'none' }}>
              <Edit2 size={18} />
            </button>
            <button onClick={() => handleDelete(cat.id)} className="btn btn-outline text-danger-color" style={{ padding: '6px', border: 'none', color: 'var(--danger-color)' }}>
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ))}
      {cats.length === 0 && <p className="text-secondary text-sm">カテゴリがありません</p>}
    </div>
  );

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex gap-sm items-center mb-lg">
        <button className="btn btn-outline" style={{ border: 'none', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-color)' }} onClick={() => navigate('/settings')}>
          <ChevronLeft size={20} />
          <span className="font-bold">戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>カテゴリ管理</div>
      </div>

      <div className="card mb-lg">
        <h3 className="font-bold mb-md">{isEditing ? 'カテゴリの編集' : '新規カテゴリの追加'}</h3>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">カテゴリ名</label>
            <input type="text" className="form-control" value={name} onChange={e => setName(e.target.value)} required placeholder="例: 交際費" />
          </div>
          
          <div className="flex gap-md mb-md">
            <div className="flex-1">
              <label className="form-label">収支タイプ</label>
              <select className="form-control" value={type} onChange={e => setType(e.target.value)}>
                <option value="expense">支出</option>
                <option value="income">収入</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="form-label">カラー</label>
              <input type="color" className="form-control" style={{ padding: '4px', height: '46px' }} value={color} onChange={e => setColor(e.target.value)} />
            </div>
          </div>

          {type === 'expense' && (
            <div className="form-group mb-md">
              <label className="form-label">月額予算 (円) ※任意</label>
              <input type="number" inputMode="numeric" className="form-control" value={monthlyLimit} onChange={e => setMonthlyLimit(e.target.value)} placeholder="0" />
            </div>
          )}

          <div className="flex gap-sm">
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              {isEditing ? '更新する' : '追加する'}
            </button>
            {isEditing && (
              <button type="button" className="btn btn-outline" onClick={resetForm}>
                キャンセル
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <CategoryList cats={expenseCats} title="支出カテゴリー" />
        <CategoryList cats={incomeCats} title="収入カテゴリー" />
      </div>
    </div>
  );
}
