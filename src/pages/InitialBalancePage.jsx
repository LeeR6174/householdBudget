import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft } from 'lucide-react';
import { db } from '../db/db';

export default function InitialBalancePage() {
  const navigate = useNavigate();
  const settings = useLiveQuery(() => db.settings.get('master'));
  const assets = useLiveQuery(() => db.assets.toArray()) || [];

  const handleUpdateAsset = async (id, value, type) => {
    let num = Number(value) || 0;
    if (type === 'credit' && num !== 0) {
      num = -Math.abs(num); // Credit initial balance is always negative (debt)
    }
    await db.assets.update(id, { initialBalance: num });
  };

  const handleUpdateSavings = async (value) => {
    if (settings) {
      await db.settings.update('master', { targetSavings: Number(value) || 0 });
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex gap-sm items-center mb-lg">
        <button className="btn btn-outline" style={{ border: 'none', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--primary-color)' }} onClick={() => navigate('/settings')}>
          <ChevronLeft size={20} />
          <span className="font-bold">戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>初期残高・貯金設定</div>
      </div>

      <div className="card mb-lg">
        <p className="text-sm text-secondary mb-md">
          ※ 実際の通帳残高や、家用のための「触らない貯金」を入力してください。<br/>
          （通常は使い始めた最初だけ設定し、運用中は変更しないことを推奨します）
        </p>

        <div className="form-group mb-lg">
          <label className="form-label text-sm text-secondary font-bold">🐷 貯金確保額（自由に使えないお金）</label>
          <div className="flex-center">
            <input 
              type="number" 
              inputMode="numeric"
              className="form-control" 
              value={settings?.targetSavings || ''} 
              onChange={(e) => handleUpdateSavings(e.target.value)} 
              placeholder="0" 
              style={{ fontWeight: 'bold' }}
            />
            <span className="ml-sm font-bold">円</span>
          </div>
        </div>

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px dashed var(--border-color)' }} />

        {assets.filter(a => a.type !== 'credit').map(asset => (
          <div key={asset.id} className="form-group mb-md">
            <label className="form-label text-sm text-secondary font-bold">
              {asset.type === 'cash' ? '💵 ' : '🏦 '} {asset.name} 
              {' の現在残高'}
            </label>
            <div className="flex-center">
              <input 
                type="number" 
                inputMode="numeric"
                className="form-control" 
                value={asset.initialBalance || ''} 
                onChange={(e) => handleUpdateAsset(asset.id, e.target.value, asset.type)} 
                placeholder="0"
              />
              <span className="ml-sm font-bold">円</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
