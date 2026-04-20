import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Copy, Check, Info } from 'lucide-react';
import { db } from '../db/db';

export default function AIImportPage() {
  const navigate = useNavigate();
  const [jsonText, setJsonText] = useState('');
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [copied, setCopied] = useState(false);

  const assets = useLiveQuery(() => db.assets.where('type').equals('credit').toArray()) || [];

  React.useEffect(() => {
    if (assets.length > 0 && !selectedAssetId) {
      setSelectedAssetId(assets[0].id);
    }
  }, [assets, selectedAssetId]);

  const promptText = `以下のクレジットカード利用明細のスクリーンショット画像を読み取り、内容を抽出して、以下の純粋なJSON形式（配列）のみを出力してください。余計な説明文は一切含めないでください。

【出力形式】
[
  {
    "date": "YYYY-MM-DD",
    "content": "利用店名・内容",
    "amount": 数値
  }
]

【ルール】
- 日付は YYYY-MM-DD 形式に変換してください。
- 金額はカンマを除いた数値のみにしてください。
- 複数の明細がある場合はすべて配列に含めてください。`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImport = async () => {
    if (!selectedAssetId) {
      alert('インポート先のカードを選択してください');
      return;
    }
    if (!jsonText.trim()) {
      alert('JSONを貼り付けてください');
      return;
    }

    try {
      const data = JSON.parse(jsonText);
      if (!Array.isArray(data)) {
        throw new Error('JSONは配列形式である必要があります');
      }

      const transactions = data.map(item => ({
        id: crypto.randomUUID(),
        type: 'expense',
        amount: Number(item.amount),
        content: item.content,
        date: item.date,
        assetId: selectedAssetId,
        categoryId: null, // カテゴリは後で設定
        memo: 'AIインポート',
        createdAt: new Date().toISOString(),
        cardStatus: 'unconfirmed'
      }));

      await db.transactions.bulkAdd(transactions);
      alert(`${transactions.length} 件の明細を取り込みました！\n「カード」タブまたは「ホーム」からカテゴリを設定してください。`);
      navigate('/');
    } catch (err) {
      console.error(err);
      alert('JSONの形式が正しくありません。AIの出力をそのまま貼り付けてください。');
    }
  };

  return (
    <div className="page-container" style={{ paddingBottom: '100px' }}>
      <div className="flex gap-sm items-center mb-lg">
        <button className="btn-back" onClick={() => navigate(-1)}>
          <ChevronLeft size={24} />
          <span>戻る</span>
        </button>
        <div className="page-title" style={{ marginBottom: 0 }}>AI明細インポート</div>
      </div>

      <div className="card mb-lg">
        <h3 className="font-bold mb-sm flex items-center gap-sm">
          <Info size={18} className="text-primary" />
          使いかた
        </h3>
        <ol className="text-sm text-secondary" style={{ paddingLeft: '20px', lineHeight: '1.6' }}>
          <li>下のボタンでプロンプトをコピーします。</li>
          <li>AI（ChatGPT等）にプロンプトと<b>スクショ画像</b>を渡します。</li>
          <li>AIが出力したJSONをコピーして、下の枠に貼り付けます。</li>
          <li>「インポート」を押すと、未確定明細として追加されます。</li>
        </ol>
      </div>

      <div className="card mb-lg">
        <button 
          className={`btn w-full ${copied ? 'btn-income' : 'btn-primary'} mb-md`} 
          onClick={handleCopyPrompt}
        >
          {copied ? <Check size={20} /> : <Copy size={20} />}
          {copied ? 'コピーしました！' : 'AI用プロンプトをコピー'}
        </button>
        
        {assets.length > 1 ? (
          <div className="form-group">
            <label className="form-label">インポート先のカード</label>
            <select 
              className="form-control" 
              value={selectedAssetId} 
              onChange={(e) => setSelectedAssetId(e.target.value)}
            >
              <option value="">選択してください</option>
              {assets.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        ) : assets.length === 1 ? (
          <div className="form-group">
            <label className="form-label">インポート先のカード</label>
            <div className="form-control" style={{ backgroundColor: '#f1f5f9', color: 'var(--text-secondary)' }}>
              {assets[0].name}
            </div>
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">インポート先のカード</label>
            <div className="form-control text-danger" style={{ fontSize: '0.875rem' }}>
              クレジットカードが登録されていません。設定から追加してください。
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label">AIの出力(JSON)を貼り付け</label>
          <textarea 
            className="form-control" 
            rows={8} 
            placeholder='[ { "date": "2026-04-20", ... } ]'
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            style={{ fontFamily: 'monospace', fontSize: '12px' }}
          ></textarea>
        </div>

        <button className="btn btn-primary w-full shadow-lg" onClick={handleImport}>
          インポートを実行
        </button>
      </div>
    </div>
  );
}
