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

const DEFAULT_CATEGORIES = [];

const DEFAULT_ASSETS = [
  { id: 'asset_bank_1', name: '銀行', type: 'bank', initialBalance: 0 },
  { id: 'asset_cash_1', name: '現金', type: 'cash', initialBalance: 0 },
  { id: 'asset_credit_1', name: 'クレジットカード', type: 'credit', initialBalance: 0 }
];

const DEFAULT_SETTINGS = {
  id: 'master',
  currency: 'JPY',
  targetSavings: 0
};

export const initDB = async () => {
  const categoriesCount = await db.categories.count();
  if (categoriesCount === 0 && DEFAULT_CATEGORIES.length > 0) {
    await db.categories.bulkAdd(DEFAULT_CATEGORIES);
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
