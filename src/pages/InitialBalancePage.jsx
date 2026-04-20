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

  const handleUpdateTargetSavings = async (value) => {
    if (settings) {
      await db.settings.update('master', { targetSavings: Number(value) || 0 });
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex gap-sm items-center mb-lg">
        <button className="btn-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
          <span>戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>初期残高・貯金設定</div>
      </div>

      <div className="card">
        <h3 className="font-bold mb-md">初期貯金の設定</h3>
        <p className="text-sm text-secondary mb-lg">
          アプリ開始時に既に持っている「貯蓄用のお金」を入力してください。
        </p>

        <div className="form-group mb-xl">
          <label className="form-label text-sm text-secondary font-bold">🐷 初期貯金額</label>
          <div className="flex-center">
            <input 
              type="number" 
              inputMode="numeric" 
              className="form-control" 
              value={settings?.targetSavings || ''} 
              onChange={(e) => handleUpdateTargetSavings(e.target.value)} 
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
