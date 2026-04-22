import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { formatCurrency, formatDate } from '../utils/format';
import { Check, Clock } from 'lucide-react';

const SwipeableItem = ({ transaction, onConfirm, onUnconfirm, categoryName }) => {
  const [tx, setTx] = useState(0);
  const startX = useRef(null);
  const startY = useRef(null);
  const isScrolling = useRef(false);
  const isSwiping = useRef(false);

  const handleTouchStart = (e) => { 
    startX.current = e.touches[0].clientX; 
    startY.current = e.touches[0].clientY;
    isScrolling.current = false;
    isSwiping.current = false;
  };
  
  const handleTouchMove = (e) => {
    if (startX.current === null || isScrolling.current) return;
    
    const diffX = e.touches[0].clientX - startX.current;
    const diffY = e.touches[0].clientY - startY.current;
    
    // 最初にどちらの動きが強いかでスクロールかスワイプかを決定
    if (!isSwiping.current && !isScrolling.current) {
      if (Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 5) {
        isScrolling.current = true;
        return;
      }
      if (Math.abs(diffX) > 5) {
        isSwiping.current = true;
      }
    }

    if (isScrolling.current) return;
    
    e.preventDefault(); // スワイプ中はスクロールを止める
    if (diffX > 120) setTx(120);
    else if (diffX < -120) setTx(-120);
    else setTx(diffX);
  };
  
  const handleTouchEnd = () => {
    if (tx > 80) onConfirm();
    if (tx < -80) onUnconfirm();
    setTx(0);
    startX.current = null;
    isScrolling.current = false;
  };

  const isConfirmed = transaction.cardStatus === 'confirmed';

  return (
    <div style={{ position: 'relative', overflow: 'hidden', marginBottom: '12px', borderRadius: '16px', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'pan-y' }}>
      {/* Background Actions */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', backgroundColor: tx > 0 ? 'var(--income-color)' : tx < 0 ? 'var(--text-secondary)' : 'transparent', color: 'white', borderRadius: '16px' }}>
        <div style={{ opacity: tx > 0 ? Math.min(tx / 80, 1) : 0, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}><Check /> 今月確定</div>
        <div style={{ opacity: tx < 0 ? Math.min(-tx / 80, 1) : 0, display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>未確定へ <Clock /></div>
      </div>
      
      {/* Front Card */}
      <div 
        onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
        style={{ 
          transform: `translateX(${tx}px)`, 
          transition: startX.current ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
          backgroundColor: 'var(--surface-color)', 
          padding: '16px 20px', 
          borderRadius: '16px', 
          borderLeft: isConfirmed ? '4px solid var(--income-color)' : '4px solid var(--warning-color)', 
          boxShadow: tx !== 0 ? 'var(--shadow-md)' : 'var(--shadow-sm)', 
          position: 'relative', 
          zIndex: 1,
          border: '1px solid rgba(0,0,0,0.02)'
        }}
      >
        <div className="flex-between" style={{ alignItems: 'center' }}>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-secondary mb-xs">{formatDate(transaction.date)}</div>
            <div className="font-bold truncate" style={{ fontSize: '1.1rem', lineHeight: '1.2' }}>{transaction.content || '名称未設定'}</div>
            <div className="text-xs text-secondary mt-xs">{categoryName}</div>
          </div>
          <div className="text-right ml-md flex-shrink-0">
            <div className="font-bold text-expense" style={{ fontSize: '1.2rem', lineHeight: '1.2' }}>¥{transaction.amount.toLocaleString()}</div>
            <div className="text-xs font-semibold mt-1" style={{ color: isConfirmed ? 'var(--income-color)' : 'var(--warning-color)' }}>
              {isConfirmed ? '今月支払い分' : '未確定'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default function CardPage() {
  const navigate = useNavigate();
  const transactions = useLiveQuery(() => db.transactions.toArray()) || [];
  const categories = useLiveQuery(() => db.categories.toArray()) || [];
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState('');

  const unconfirmedAndConfirmed = transactions.filter(t => t.cardStatus === 'unconfirmed' || t.cardStatus === 'confirmed')
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const confirmedSum = unconfirmedAndConfirmed.filter(t => t.cardStatus === 'confirmed').reduce((sum, t) => sum + t.amount, 0);

  const handleConfirm = async (id) => { await db.transactions.update(id, { cardStatus: 'confirmed' }); };
  const handleUnconfirm = async (id) => { await db.transactions.update(id, { cardStatus: 'unconfirmed' }); };

  const openPayModal = () => {
    const bankAssets = assets.filter(a => a.type === 'bank' || a.type === 'cash');
    if (bankAssets.length === 0) return alert('引き落とし元の銀行口座が登録されていません。');
    setSelectedBankId(bankAssets[0].id);
    setShowPayModal(true);
  };

  const handlePayExecute = async () => {
    const creditAssets = assets.filter(a => a.type === 'credit');
    const creditAssetId = creditAssets[0]?.id;
    if (!creditAssetId) return alert('エラー：クレジットカードが見つかりません');

    // 1. 振替記録を作成
    await db.transactions.add({
      id: crypto.randomUUID(),
      type: 'transfer',
      fromAssetId: selectedBankId,
      toAssetId: creditAssetId,
      amount: confirmedSum,
      content: 'カード引き落とし精算',
      date: new Date().toISOString().split('T')[0],
      createdAt: new Date().toISOString()
    });

    // 2. 確定済みのカード利用を 'paid' に変更
    const confirmedTxs = unconfirmedAndConfirmed.filter(t => t.cardStatus === 'confirmed');
    const updatePromises = confirmedTxs.map(t => db.transactions.update(t.id, { cardStatus: 'paid' }));
    await Promise.all(updatePromises);
    
    setShowPayModal(false);
    alert('精算が完了しました！');
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex-between mb-lg">
        <div className="page-title" style={{ marginBottom: 0 }}>💳 カード支払い管理</div>
        <button 
          className="btn btn-primary" 
          onClick={() => navigate('/settings/ai-import')}
          style={{ width: 'auto', padding: '8px 16px', fontSize: '0.875rem', background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}
        >
          ✨ AIインポート
        </button>
      </div>

      <div className="card mb-lg" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white' }}>
        <h3 className="text-sm opacity-90 mb-sm">次回（今月）引き落とし確定額</h3>
        <div className="text-4xl font-bold text-center mb-md">
          {formatCurrency(confirmedSum)}
        </div>
        <button 
          className="btn w-full font-bold shadow-sm" 
          onClick={openPayModal}
          style={{ backgroundColor: 'white', color: '#059669' }}
          disabled={confirmedSum === 0}
        >
          {confirmedSum > 0 ? '今月分を引き落とし完了にする' : '確定分がありません'}
        </button>
      </div>

      {showPayModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowPayModal(false)}>
          <div style={{ backgroundColor: 'white', width: '100%', maxWidth: '480px', margin: '0 auto', borderRadius: '24px 24px 0 0', padding: '24px', animation: 'fadeIn 0.3s' }} onClick={e => e.stopPropagation()}>
            <h3 className="font-bold mb-md text-lg">カード支払いの精算</h3>
            <p className="text-sm text-secondary mb-lg">今月確定分（{formatCurrency(confirmedSum)}）をどの口座から引き落としますか？</p>
            
            <div className="form-group mb-xl">
              <label className="form-label">引き落とし元口座</label>
              {assets.filter(a => a.type === 'bank' || a.type === 'cash').map(a => (
                <div 
                  key={a.id} 
                  className={`card mb-sm flex-between ${selectedBankId === a.id ? 'active' : ''}`}
                  style={{ padding: '12px 16px', border: selectedBankId === a.id ? '2px solid var(--primary-color)' : '1px solid var(--border-color)', cursor: 'pointer' }}
                  onClick={() => setSelectedBankId(a.id)}
                >
                  <span className="font-semibold">{a.name}</span>
                  <span className="text-sm text-secondary">{formatCurrency(a.initialBalance)} 〜</span>
                </div>
              ))}
            </div>

            <div className="flex gap-md">
              <button className="btn btn-outline flex-1" onClick={() => setShowPayModal(false)}>キャンセル</button>
              <button className="btn btn-primary flex-1" onClick={handlePayExecute}>精算を実行する</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-md">
        <p className="text-sm font-bold text-secondary mb-xs">👉 スワイプ操作で振り分け</p>
        <p className="text-xs text-secondary mb-md">右スワイプ：次回の支払いで確定 / 左スワイプ：未確定に戻す</p>
      </div>

      <div>
        {unconfirmedAndConfirmed.map(tx => (
          <SwipeableItem 
            key={tx.id} 
            transaction={tx} 
            categoryName={categories.find(c => c.id === tx.categoryId)?.name || ''}
            onConfirm={() => handleConfirm(tx.id)}
            onUnconfirm={() => handleUnconfirm(tx.id)}
          />
        ))}

        {unconfirmedAndConfirmed.length === 0 && (
          <p className="text-secondary text-sm text-center py-xl">
            現在、精算待ちの決済はありません✨
          </p>
        )}
      </div>
    </div>
  );
}
