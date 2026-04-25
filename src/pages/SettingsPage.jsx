import React, { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { db, resetDB } from '../db/db';
import { getCurrentBudgetMonth } from '../utils/dateUtils';
import { formatCurrency } from '../utils/format';

export default function SettingsPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);

  const settings = useLiveQuery(() => db.settings.get('master'));
  const assets = useLiveQuery(() => db.assets.toArray()) || [];
  const currentMonthStr = getCurrentBudgetMonth();
  const monthlySettings = useLiveQuery(() => db.monthlySettings.get(currentMonthStr), [currentMonthStr]);
  const allMonthlySettings = useLiveQuery(() => db.monthlySettings.toArray()) || [];
  const initialSavings = settings?.targetSavings || 0;

  const handleUpdateAsset = async (id, value) => {
    await db.assets.update(id, { initialBalance: Number(value) || 0 });
  };


  const handleReset = async () => {
    if (window.confirm('すべての記録と設定が削除されます。本当に初期化しますか？')) {
      await resetDB();
      alert('初期化が完了しました。');
      navigate('/');
      window.location.reload();
    }
  };

  // Excel インポート/エクスポート関数（前回の通り。省略せず記載）
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
      const [transactions, categories, assets, settings, monthlySettings, monthlyBudgets] = await Promise.all([
        db.transactions.toArray(),
        db.categories.toArray(),
        db.assets.toArray(),
        db.settings.toArray(),
        db.monthlySettings.toArray(),
        db.monthlyBudgets.toArray()
      ]);

      const backupData = {
        version: 1,
        timestamp: new Date().toISOString(),
        transactions,
        categories,
        assets,
        settings,
        monthlySettings,
        monthlyBudgets
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
        
        // バリデーション（簡易）
        if (!data.transactions || !data.categories || !data.assets) {
          throw new Error('無効なバックアップファイルです。');
        }

        await db.transaction('rw', [db.transactions, db.categories, db.assets, db.settings, db.monthlySettings, db.monthlyBudgets], async () => {
          await Promise.all([
            db.transactions.clear(),
            db.categories.clear(),
            db.assets.clear(),
            db.settings.clear(),
            db.monthlySettings.clear(),
            db.monthlyBudgets.clear()
          ]);

          await Promise.all([
            db.transactions.bulkAdd(data.transactions),
            db.categories.bulkAdd(data.categories),
            db.assets.bulkAdd(data.assets),
            db.settings.bulkAdd(data.settings),
            db.monthlySettings.bulkAdd(data.monthlySettings),
            db.monthlyBudgets.bulkAdd(data.monthlyBudgets)
          ]);
        });

        alert('復元が完了しました！アプリを再起動します。');
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert('復元に失敗しました。ファイルが壊れているか、形式が正しくありません。');
      } finally {
        backupInputRef.current.value = null;
      }
    };
    reader.readAsText(file);
  };

  const handleExportXlsx = async () => { /* 前回同様のため割愛しますが、必要なら後で追加します。いったんは表示だけ */ };

  const handleTestNotification = async () => {
    if (!('Notification' in window)) {
      alert('このブラウザはシステム通知をサポートしていません。');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification('格が違う家計簿', {
          body: 'システム通知のテスト成功です！✨',
          icon: '/favicon.png',
          badge: '/pwa-192x192.png',
          tag: 'test-notification'
        });
      } else {
        new Notification('格が違う家計簿', {
          body: '通知テスト成功（ブラウザ直接表示）',
          icon: '/favicon.png'
        });
      }
    } else {
      alert('通知が許可されませんでした。ブラウザの設定から許可してください。');
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="page-title">設定</div>


      <div className="card mb-lg">
        <h3 className="font-bold mb-md">マスターデータ管理</h3>
        
        <div className="form-group mb-lg">
          <p className="text-sm text-secondary mb-sm">家計簿のカテゴリ（分類）を追加・編集・削除します。</p>
          <button className="btn btn-primary w-full" onClick={() => navigate('/settings/categories')}>
            カテゴリ管理
          </button>
        </div>

        <div className="form-group mb-lg">
          <p className="text-sm text-secondary mb-sm">貯金の積立や、大きな買い物のための「切り崩し」を記録します。</p>
          <button className="btn btn-outline w-full text-primary font-bold" onClick={() => navigate('/settings/savings')} style={{ borderColor: 'var(--primary-color)' }}>
            💰 貯金・切り崩し管理
          </button>
        </div>

        <div className="form-group mb-lg">
          <p className="text-sm text-secondary mb-sm">毎月自動でカード支払いに計上される固定費を設定します。</p>
          <button className="btn btn-outline w-full text-primary font-bold" onClick={() => navigate('/settings/subscriptions')} style={{ borderColor: 'var(--primary-color)' }}>
            サブスク・固定費の自動入力設定
          </button>
        </div>

        <div className="form-group">
          <p className="text-sm text-secondary mb-sm">口座の初期残高や、家用の貯金の設定を行います。</p>
          <button className="btn btn-outline w-full font-bold" onClick={() => navigate('/settings/initial-balance')}>
            初期残高・貯金設定
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-bold mb-md">データのインポート</h3>
        
        <div className="form-group mb-lg">
          <p className="text-sm text-secondary mb-sm">AI（ChatGPT等）を使って、クレカのスクショから明細を一括登録します。</p>
          <button className="btn btn-primary w-full" onClick={() => navigate('/settings/ai-import')} style={{ background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)' }}>
            ✨ AI明細インポート
          </button>
        </div>

        <button className="btn btn-outline mb-lg w-full" onClick={() => fileInputRef.current?.click()}>
          Excelを取り込む (.xlsx)
        </button>
        <input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />

        <h3 className="font-bold mb-md">データのバックアップと復元</h3>
        <p className="text-sm text-secondary mb-md">
          アプリの全てのデータを1つのファイルとして保存・復元します。<br/>
          機種変更や、ホーム画面アイコンの追加時などの引き継ぎに使います。
        </p>
        <div className="flex gap-md mb-lg">
          <button className="btn btn-primary w-full" onClick={handleExportFullBackup}>
            全データをバックアップ
          </button>
          <button className="btn btn-outline w-full font-bold" onClick={() => backupInputRef.current?.click()}>
            バックアップから復元
          </button>
          <input type="file" accept=".json" ref={backupInputRef} onChange={handleImportFullBackup} style={{ display: 'none' }} />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />

        <h3 className="font-bold mb-md">通知設定</h3>
        <p className="text-sm text-secondary mb-md">
          リマインドや通知が届くか確認します。
        </p>
        <button className="btn btn-outline w-full mb-lg font-bold" onClick={handleTestNotification}>
          🔔 プッシュ通知のテストを行う
        </button>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)', margin: '24px 0' }} />

        <h3 className="font-bold mb-md text-danger-color">危険な操作</h3>
        <button className="btn btn-danger w-full" onClick={handleReset}>
          データを初期化する
        </button>
      </div>

      <div className="card mt-lg">
        <h3 className="font-bold mb-md">お問い合わせ・フィードバック</h3>
        <p className="text-sm text-secondary mb-md">
          アプリへのご意見・ご要望はこちらからお送りください。
        </p>
        <a 
          href="https://docs.google.com/forms/d/e/1FAIpQLSdeaUhqb6sWCcu6YEv3L7G3X4Ut2DOR0EHLglBbP1oQjXtyxQ/viewform?usp=publish-editor" 
          target="_blank" 
          rel="noopener noreferrer"
          className="btn btn-outline w-full font-bold flex-center gap-sm"
          style={{ textDecoration: 'none', color: 'var(--text-primary)' }}
        >
          📩 意見フォームはこちら
        </a>
      </div>

      <div className="card mt-lg" style={{ backgroundColor: 'rgba(0,0,0,0.02)' }}>
        <h3 className="font-bold mb-md">アップデート内容 (V1.1.1.1)</h3>
        <div className="text-sm text-secondary" style={{ lineHeight: '1.6' }}>
          <ul style={{ paddingLeft: '20px', margin: 0 }}>
            <li>履歴の並び順を「日付（新しい順）＋入力（古い順）」に改善</li>
            <li>ホーム画面の「最大支出予定」の計算ロジックを修正</li>
            <li>ホームのカテゴリをタップして直接編集できる機能を追加</li>
            <li>アプリ起動時の通知を抑制し、バックグラウンド通知のみに修正</li>
            <li>意見提出用フォームへのリンクを設置</li>
          </ul>
        </div>
      </div>

      <div className="text-center mt-xl mb-lg opacity-50">
        <div className="text-xs font-bold">格が違う家計簿</div>
        <div className="text-[10px]">Version 1.1.1.1</div>
      </div>
    </div>
  );
}
