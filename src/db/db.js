import Dexie from 'dexie';

export const db = new Dexie('kakeiboDB');

// version 3: assets type, subscriptions, targetSavings, cardStatus
db.version(3).stores({
  transactions: 'id, type, categoryId, assetId, fromAssetId, toAssetId, amount, content, memo, date, createdAt, cardStatus',
  categories: 'id, type',
  settings: 'id',
  assets: 'id, name, type, initialBalance',
  subscriptions: 'id, dayOfMonth, type, categoryId, assetId, amount, content, memo, lastProcessedMonth'
});

// version 4: monthly budgets and monthly settings
db.version(4).stores({
  monthlyBudgets: '++id, categoryId, month',
  monthlySettings: 'month'
});

// version 5: isCarryover for categories
db.version(5).stores({
  categories: 'id, type, isCarryover'
});

// version 6: savings records
db.version(6).stores({
  savingsRecords: '++id, month, type'
});

// version 8: notifications
db.version(8).stores({
  categories: 'id, type, isCarryover, description',
  notifications: '++id, day, message, lastProcessedMonth'
});

export const EMERGENCY_CATEGORY_ID = 'cat_special_emergency';

export const EMERGENCY_CATEGORY = {
  id: EMERGENCY_CATEGORY_ID,
  name: '緊急支出',
  type: 'expense',
  color: '#ef4444',
  monthlyLimit: 0,
  isCarryover: false,
  isEmergency: true,
  isFixed: true,
  description: '総予算外の緊急枠（医療費・緊急修繕など突発的な出費）',
  sortOrder: 9999
};

const DEFAULT_CATEGORIES = [
  EMERGENCY_CATEGORY
];

const DEFAULT_ASSETS = [
  { id: 'asset_bank_1', name: '銀行', type: 'bank', initialBalance: 0 },
  { id: 'asset_cash_1', name: '現金', type: 'cash', initialBalance: 0 },
  { id: 'asset_credit_1', name: 'クレジットカード', type: 'credit', initialBalance: 0 }
];

const DEFAULT_SETTINGS = {
  id: 'master',
  currency: 'JPY',
  targetSavings: 0,
  lastReconciliationDate: ''
};

export const initDB = async () => {
  const categoriesCount = await db.categories.count();
  if (categoriesCount === 0 && DEFAULT_CATEGORIES.length > 0) {
    await db.categories.bulkAdd(DEFAULT_CATEGORIES);
  }

  // 緊急支出カテゴリの存在保証（既存DBへのマイグレーション）
  try {
    const allCategories = await db.categories.toArray();
    const emergencyCat = allCategories.find(c => c.id === EMERGENCY_CATEGORY_ID || c.isEmergency || c.name === '緊急支出');
    if (!emergencyCat) {
      await db.categories.add(EMERGENCY_CATEGORY);
    } else {
      await db.categories.update(emergencyCat.id, {
        name: '緊急支出',
        isEmergency: true,
        isFixed: true,
        monthlyLimit: 0
      });
    }
  } catch (e) {
    console.error('Failed to ensure emergency category:', e);
  }

  const assetsCount = await db.assets.count();
  if (assetsCount === 0) {
    await db.assets.bulkAdd(DEFAULT_ASSETS);
  }

  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await db.settings.add(DEFAULT_SETTINGS);
  }
};

export const resetDB = async () => {
  await db.transactions.clear();
  await db.categories.clear();
  await db.assets.clear();
  await db.settings.clear();
  await db.subscriptions.clear();
  await db.monthlyBudgets.clear();
  await db.monthlySettings.clear();
  await initDB();
};
