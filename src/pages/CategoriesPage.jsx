import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Trash2, Edit2, Plus } from 'lucide-react';
import { db } from '../db/db';
import { getCurrentBudgetMonth } from '../utils/dateUtils';

export default function CategoriesPage() {
  const navigate = useNavigate();
  const formRef = useRef(null);
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);
  
  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState('expense');
  const [color, setColor] = useState('#9ca3af');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const [thisMonthBudget, setThisMonthBudget] = useState('');
  const [isCarryover, setIsCarryover] = useState(false);
  const [description, setDescription] = useState('');
  const currentMonthStr = getCurrentBudgetMonth();

  const thisMonthSettings = useLiveQuery(async () => {
    if (!editId) return null;
    return await db.monthlyBudgets
      .where('categoryId').equals(editId)
      .and(b => b.month === currentMonthStr)
      .first();
  }, [editId, currentMonthStr]);

  // Update thisMonthBudget when thisMonthSettings changes
  React.useEffect(() => {
    if (thisMonthSettings) {
      setThisMonthBudget(thisMonthSettings.budget.toString());
    } else {
      setThisMonthBudget('');
    }
  }, [thisMonthSettings]);

  const resetForm = () => {
    setEditId(null);
    setName('');
    setType('expense');
    setColor('#9ca3af');
    setMonthlyLimit('');
    setThisMonthBudget('');
    setIsCarryover(false);
    setDescription('');
    setIsEditing(false);
  };

  const handleEdit = (cat) => {
    setEditId(cat.id);
    setName(cat.name);
    setType(cat.type);
    setColor(cat.color || '#9ca3af');
    setMonthlyLimit(cat.monthlyLimit?.toString() || '');
    setIsCarryover(cat.isCarryover || false);
    setDescription(cat.description || '');
    setIsEditing(true);
    
    // Smooth scroll to top/form
    window.scrollTo({ top: 0, behavior: 'smooth' });
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
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
      monthlyLimit: Number(monthlyLimit) || 0,
      isCarryover,
      description: description.trim()
    };

    if (editId) {
      await db.categories.update(editId, catData);
      // Save monthly budget if specified
      if (thisMonthBudget !== '') {
        const existing = await db.monthlyBudgets
          .where('categoryId').equals(editId)
          .and(b => b.month === currentMonthStr)
          .first();
        if (existing) {
          await db.monthlyBudgets.update(existing.id, { budget: Number(thisMonthBudget) });
        } else {
          await db.monthlyBudgets.add({ categoryId: editId, month: currentMonthStr, budget: Number(thisMonthBudget) });
        }
      } else {
        // Clear if empty
        const existing = await db.monthlyBudgets
          .where('categoryId').equals(editId)
          .and(b => b.month === currentMonthStr)
          .first();
        if (existing) await db.monthlyBudgets.delete(existing.id);
      }
    } else {
      const newId = `cat_custom_${Date.now()}`;
      catData.id = newId;
      await db.categories.add(catData);
      
      if (thisMonthBudget !== '') {
        await db.monthlyBudgets.add({ categoryId: newId, month: currentMonthStr, budget: Number(thisMonthBudget) });
      }
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
            <div className="flex flex-col">
              <span className="font-semibold">{cat.name}</span>
              {cat.description && <span className="text-xs text-secondary">{cat.description}</span>}
            </div>
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
        <button className="btn-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
          <span>戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>カテゴリ管理</div>
      </div>

      {isEditing && (
        <div className="card" style={{ 
          backgroundColor: 'var(--primary-color)', 
          color: 'white', 
          padding: '12px', 
          textAlign: 'center', 
          marginBottom: '16px',
          fontWeight: 'bold',
          borderRadius: '12px',
          animation: 'pulse 2s infinite'
        }}>
          💡 カテゴリ編集モード：上のフォームの内容を修正してください
        </div>
      )}

      <div className="card mb-lg" ref={formRef}>
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
          
          <div className="form-group mb-md">
            <label className="form-label">説明 (任意)</label>
            <textarea 
              className="form-control" 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="カテゴリの詳細やメモを入力" 
              rows="2"
              style={{ resize: 'none' }}
            />
          </div>

          {type === 'expense' && (
            <>
              <div className="form-group mb-md">
                <label className="form-label">基本の月額予算 (円)</label>
                <input type="number" inputMode="numeric" className="form-control" value={monthlyLimit} onChange={e => setMonthlyLimit(e.target.value)} placeholder="0 (無制限)" />
              </div>

              <div 
                className="form-group flex-between mb-md p-md" 
                style={{ 
                  backgroundColor: isCarryover ? 'rgba(79, 70, 229, 0.1)' : 'rgba(0,0,0,0.03)', 
                  borderRadius: '16px', 
                  cursor: 'pointer',
                  border: isCarryover ? '1px solid var(--primary-color-light)' : '1px solid transparent',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }} 
                onClick={() => setIsCarryover(!isCarryover)}
              >
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: isCarryover ? 'var(--primary-color)' : 'var(--text-primary)' }}>
                    予算を翌月に繰り越す（積立型）
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    使わなかった分が翌月に加算されます
                  </div>
                </div>
                <div style={{ 
                  width: '44px', 
                  height: '24px', 
                  backgroundColor: isCarryover ? 'var(--primary-color)' : '#cbd5e1', 
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
                    left: isCarryover ? '23px' : '3px',
                    transition: 'left 0.2s'
                  }}></div>
                </div>
              </div>

              <div className="form-group mb-md" style={{ backgroundColor: 'var(--bg-color)', padding: '12px', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
                <label className="form-label" style={{ color: 'var(--primary-color)' }}>
                  ✨ {currentMonthStr} {isCarryover ? '限定の積立額' : '限定の予算'} (任意)
                </label>
                <input type="number" inputMode="numeric" className="form-control" value={thisMonthBudget} onChange={e => setThisMonthBudget(e.target.value)} placeholder={isCarryover ? "今月だけ積立額を変える場合" : "今月だけ予算を変える場合"} style={{ borderColor: 'var(--primary-color-light)' }} />
                <p className="text-xs text-secondary mt-xs">
                  {isCarryover 
                    ? "※未入力の場合は基本の積立額が適用されます。0を入力すると今月は積み立てません。" 
                    : "※未入力の場合は基本の予算が適用されます。0を入力すると「予算なし」になります。"}
                </p>
              </div>
            </>
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
