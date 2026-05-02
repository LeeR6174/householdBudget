import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Bell } from 'lucide-react';
import * as XLSX from 'xlsx';
import { db, resetDB } from '../db/db';
import { getCurrentBudgetMonth } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';

export default function SettingsPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);
  const [activeTab, setActiveTab] = useState('data'); // 'data' or 'notifications'
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Notification form state
  const [notifyDay, setNotifyDay] = useState(1);
  const [notifyMessage, setNotifyMessage] = useState('');

  const settings = useLiveQuery(() => db.settings.get('master'));
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  const notifications = useLiveQuery(() => db.notifications.toArray()) || [];
  const currentMonthStr = getCurrentBudgetMonth();
  
  const handleAddNotification = async (e) => {
    e.preventDefault();
    if (!notifyMessage.trim()) return;
    await db.notifications.add({
      day: Number(notifyDay),
      message: notifyMessage.trim(),
      lastProcessedMonth: ''
    });
    setNotifyMessage('');
  };

  const handleDeleteNotification = async (id) => {
    if (window.confirm('この通知を削除しますか？')) {
      await db.notifications.delete(id);
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Rate limit check: 1 minute
    const lastSubmit = localStorage.getItem('lastFeedbackTimestamp');
    const now = Date.now();
    if (lastSubmit && now - Number(lastSubmit) < 60 * 1000) {
      alert('連続での送信は控え、少し時間を置いてから再度お試しください。');
      setIsSubmitting(false);
      return;
    }

    const form = e.target;
    const formData = new FormData(form);
    
    try {
      await fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(formData).toString(),
      });
      localStorage.setItem('lastFeedbackTimestamp', Date.now().toString());
      alert('フィードバックを送信しました。ありがとうございます！');
      form.reset();
    } catch (error) {
      console.error(error);
      alert('送信に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    if (window.confirm('すべての記録と設定が削除されます。本当に初期化しますか？')) {
      await resetDB();
      alert('初期化が完了しました。');
      navigate('/');
      window.location.reload();
    }
  };

  const parseExcelValue = (val) => val === undefined || val === null ? '' : String(val).trim();

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm('Excelデータを取り込みますか？')) {
      fileInputRef.current.value = null;
      return;
    }

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { raw: false });

      const existingCats = await db.categories.toArray();
      const existingAssets = await db.assets.toArray();
      
      const newTransactions = [];
      const catMap = new Map(existingCats.map(c => [c.name, c.id]));
      const assetMap = new Map(existingAssets.map(a => [a.name, a.id]));

      const getOrCreateAsset = (nameStr) => {
        if (!nameStr) return null;
        if (assetMap.has(nameStr)) return assetMap.get(nameStr);
        const newId = `asset_a${Date.now()}_${Math.floor(Math.random()*1000)}`;
        assetMap.set(nameStr, newId);
        return newId;
      };

      const getOrCreateCategory = (nameStr, type) => {
        if (!nameStr) return null;
        if (catMap.has(nameStr)) return catMap.get(nameStr);
        const newId = `cat_a${Date.now()}_${Math.floor(Math.random()*1000)}`;
        catMap.set(nameStr, newId);
        return newId;
      };

      for (let row of json) {
        const dateRaw = parseExcelValue(row['期間']);
        const assetNameRaw = parseExcelValue(row['資産'] || row['資産 '] || ''); 
        const categoryRaw = parseExcelValue(row['分類']);
        const contentRaw = parseExcelValue(row['内容']);
        const inOutRaw = parseExcelValue(row['収入/支出']);
        const memoRaw = parseExcelValue(row['メモ']);
        const amountRaw = parseExcelValue(row['JPY'] || row['金額']);
        
        const amount = Number(String(amountRaw).replace(/[^0-9.-]+/g, ''));
        if (isNaN(amount) || amount === 0 || !dateRaw) continue;
        
        const dateMatch = dateRaw.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
        let formattedDate = dateRaw;
        if (dateMatch) {
          formattedDate = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}`;
        }

        const assetId = getOrCreateAsset(assetNameRaw);
        let txType = 'expense';
        let categoryId = null;

        if (inOutRaw === '支出') txType = 'expense';
        else if (inOutRaw === '収入') txType = 'income';
        else txType = amount < 0 ? 'expense' : 'income';

        categoryId = getOrCreateCategory(categoryRaw, txType);

        newTransactions.push({
          id: crypto.randomUUID(),
          type: txType,
          amount: Math.abs(amount),
          categoryId,
          assetId,
          fromAssetId: null,
          toAssetId: null,
          content: contentRaw,
          memo: memoRaw,
          date: formattedDate,
          createdAt: new Date().toISOString(),
          cardStatus: 'unconfirmed'
        });
      }

      const catsToAdd = [];
      catMap.forEach((id, name) => {
        if (!existingCats.find(c => c.id === id)) catsToAdd.push({ id, name, type: name.includes('入') ? 'income' : 'expense', color: '#9ca3af' });
      });
      if (catsToAdd.length > 0) await db.categories.bulkAdd(catsToAdd);

      const assetsToAdd = [];
      assetMap.forEach((id, name) => {
        if (!existingAssets.find(a => a.id === id)) assetsToAdd.push({ id, name, type: 'bank', initialBalance: 0 });
      });
      if (assetsToAdd.length > 0) await db.assets.bulkAdd(assetsToAdd);

      if (newTransactions.length > 0) {
        await db.transactions.bulkAdd(newTransactions);
        alert(`${newTransactions.length} 件のデータを取り込みました！`);
        navigate('/');
      }
    } catch (err) {
      console.error(err);
      alert('Excelの読み込みに失敗しました。');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = null;
    }
  };

  const handleExportFullBackup = async () => {
    try {
      const [transactions, categories, assets, settings, monthlySettings, monthlyBudgets, notifications] = await Promise.all([
        db.transactions.toArray(),
        db.categories.toArray(),
        db.assets.toArray(),
        db.settings.toArray(),
        db.monthlySettings.toArray(),
        db.monthlyBudgets.toArray(),
        db.notifications.toArray()
      ]);

      const backupData = {
        version: 2,
        timestamp: new Date().toISOString(),
        transactions,
        categories,
        assets,
        settings,
        monthlySettings,
        monthlyBudgets,
        notifications
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kakeibo_full_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('バックアップの作成に失敗しました。');
    }
  };

  const handleImportFullBackup = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!window.confirm('【警告】バックアップを復元すると、現在のデータはすべて上書き（削除）されます。よろしいですか？')) {
      backupInputRef.current.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.transactions || !data.categories || !data.assets) throw new Error('無効な形式');

        await db.transaction('rw', [db.transactions, db.categories, db.assets, db.settings, db.monthlySettings, db.monthlyBudgets, db.notifications], async () => {
          await Promise.all([
            db.transactions.clear(),
            db.categories.clear(),
            db.assets.clear(),
            db.settings.clear(),
            db.monthlySettings.clear(),
            db.monthlyBudgets.clear(),
            db.notifications.clear()
          ]);

          await Promise.all([
            db.transactions.bulkAdd(data.transactions),
            db.categories.bulkAdd(data.categories),
            db.assets.bulkAdd(data.assets),
            db.settings.bulkAdd(data.settings),
            db.monthlySettings.bulkAdd(data.monthlySettings),
            db.monthlyBudgets.bulkAdd(data.monthlyBudgets),
            db.notifications.bulkAdd(data.notifications || [])
          ]);
        });

        alert('復元完了！');
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert('復元失敗');
      } finally {
        backupInputRef.current.value = null;
      }
    };
    reader.readAsText(file);
  };

  const handleTestNotification = async () => {
    if (!('Notification' in window)) return alert('未対応ブラウザ');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const registration = await navigator.serviceWorker.ready;
      registration.showNotification('格が違う家計簿', {
        body: 'テスト通知成功！✨',
        icon: '/favicon.png',
        badge: '/pwa-192x192.png',
        silent: true
      });
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="page-title">設定</div>

      {/* Tabs */}
      <div className="toggle-group mb-lg">
        <button 
          className={`toggle-btn ${activeTab === 'data' ? 'active expense' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          データ管理
        </button>
        <button 
          className={`toggle-btn ${activeTab === 'notifications' ? 'active expense' : ''}`}
          onClick={() => setActiveTab('notifications')}
        >
          通知設定
        </button>
      </div>

      {activeTab === 'data' ? (
        <>
          <div className="card mb-lg">
            <h3 className="font-bold mb-md">マスターデータ管理</h3>
            <div className="form-group mb-lg">
              <button className="btn btn-primary w-full" onClick={() => navigate('/settings/categories')}>カテゴリ管理</button>
            </div>
            <div className="form-group mb-lg">
              <button className="btn btn-outline w-full text-primary font-bold" onClick={() => navigate('/settings/savings')}>💰 貯金・切り崩し管理</button>
            </div>
            <div className="form-group mb-lg">
              <button className="btn btn-outline w-full text-primary font-bold" onClick={() => navigate('/settings/subscriptions')}>サブスク・固定費の自動入力</button>
            </div>
            <div className="form-group">
              <button className="btn btn-outline w-full font-bold" onClick={() => navigate('/settings/initial-balance')}>初期残高・貯金設定</button>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold mb-md">インポート / エクスポート</h3>
            <button className="btn btn-primary w-full mb-lg" onClick={() => navigate('/settings/ai-import')} style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}>✨ AI明細インポート</button>
            <button className="btn btn-outline mb-lg w-full" onClick={() => fileInputRef.current?.click()}>Excelを取り込む (.xlsx)</button>
            <input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />
            <div className="flex gap-md mb-lg">
              <button className="btn btn-primary w-full" onClick={handleExportFullBackup}>バックアップ</button>
              <button className="btn btn-outline w-full font-bold" onClick={() => backupInputRef.current?.click()}>復元</button>
              <input type="file" accept=".json" ref={backupInputRef} onChange={handleImportFullBackup} style={{ display: 'none' }} />
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />
            <h3 className="font-bold mb-md text-danger-color">危険な操作</h3>
            <button className="btn btn-danger w-full" onClick={handleReset}>データを初期化する</button>
          </div>
        </>
      ) : (
        <>
          <div className="card mb-lg">
            <h3 className="font-bold mb-md">毎月のリマインド設定</h3>
            <p className="text-sm text-secondary mb-md">指定した日にちに、アプリからリマインド通知を送ります。</p>
            
            <form onSubmit={handleAddNotification} className="mb-lg p-md" style={{ backgroundColor: 'var(--bg-color)', borderRadius: '16px' }}>
              <div className="form-group">
                <label className="form-label">通知する日 (毎月)</label>
                <div className="flex items-center gap-sm">
                  <input 
                    type="number" 
                    min="1" 
                    max="31" 
                    className="form-control" 
                    style={{ width: '80px' }} 
                    value={notifyDay} 
                    onChange={e => setNotifyDay(e.target.value)} 
                  />
                  <span>日</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">通知メッセージ</label>
                <textarea 
                  className="form-control" 
                  rows="2" 
                  value={notifyMessage} 
                  onChange={e => setNotifyMessage(e.target.value)} 
                  placeholder="例: クレジットカードの明細を確認しましょう！"
                />
              </div>
              <button type="submit" className="btn btn-primary w-full">通知を追加</button>
            </form>

            <div className="mt-md">
              <h4 className="font-bold text-sm text-secondary mb-sm">設定済みの通知</h4>
              {notifications.map(n => (
                <div key={n.id} className="list-item">
                  <div className="flex-1">
                    <div className="font-bold text-primary">毎月 {n.day} 日</div>
                    <div className="text-sm">{n.message}</div>
                  </div>
                  <button className="btn-icon text-danger" onClick={() => handleDeleteNotification(n.id)}>
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              {notifications.length === 0 && <p className="text-sm text-secondary text-center py-lg">通知設定はありません</p>}
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold mb-md">動作確認</h3>
            <button className="btn btn-outline w-full mb-lg font-bold" onClick={handleTestNotification}>
              🔔 今すぐ通知テストを実行
            </button>
            <p className="text-xs text-secondary text-center">※通知が届かない場合は、端末の設定で通知が許可されているか確認してください。</p>
          </div>
        </>
      )}

      <div className="card mt-lg">
        <h3 className="font-bold mb-md">お問い合わせ・フィードバック</h3>
        <p className="text-sm text-secondary mb-md">改善の要望や不具合報告など、お気軽にお寄せください。</p>
        
        <form 
          name="feedback" 
          method="POST" 
          data-netlify="true" 
          onSubmit={handleFeedbackSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <input type="hidden" name="form-name" value="feedback" />
          <div className="form-group mb-0">
            <label className="form-label text-xs">お名前 (任意)</label>
            <input type="text" name="name" className="form-control" style={{ padding: '10px' }} />
          </div>
          <div className="form-group mb-0">
            <label className="form-label text-xs">メールアドレス (任意)</label>
            <input type="email" name="email" className="form-control" style={{ padding: '10px' }} />
          </div>
          <div className="form-group mb-0">
            <label className="form-label text-xs">種類</label>
            <select name="type" className="form-control" style={{ padding: '10px' }}>
              <option value="bug">不具合報告</option>
              <option value="request">要望</option>
              <option value="other">その他</option>
            </select>
          </div>
          <div className="form-group mb-0">
            <label className="form-label text-xs">内容</label>
            <textarea name="message" className="form-control" rows="4" required style={{ padding: '10px' }}></textarea>
          </div>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? '送信中...' : '📩 意見を送信する'}
          </button>
        </form>
      </div>

      <div className="card mt-lg" style={{ backgroundColor: 'rgba(0,0,0,0.02)' }}>
        <h3 className="font-bold mb-md">アップデート内容 (V1.3.0.0)</h3>
        <div className="text-sm text-secondary" style={{ lineHeight: '1.6' }}>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li>分析ページを刷新！貯蓄率、支払い方法、曜日別傾向など高度な分析に対応</li>
            <li>フィードバック機能をアプリ内に統合（Netlify Forms導入）</li>
            <li>カテゴリ表示を「4文字固定のカラーブロック」に刷新し、一覧性を向上</li>
            <li>「内容」入力時の履歴サジェストを廃止し、即座に入力できるよう改善</li>
            <li>履歴、分析、カード管理のデータ読み込み速度を大幅に高速化</li>
          </ul>
        </div>
      </div>

      <div className="text-center mt-xl mb-lg opacity-50">
        <div className="text-xs font-bold">格が違う家計簿</div>
        <div className="text-[10px]">Version 1.3.0.0</div>
      </div>
    </div>
  );
}
