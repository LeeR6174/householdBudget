import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { calculateCarryoverBalance } from '../utils/budgetUtils';

export function useDashboardStats(currentMonth, startDate, endDate) {
  return useLiveQuery(async () => {
    // 1. Fetch data
    const categories = await db.categories.toArray();
    categories.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    
    const assets = await db.assets.toArray();
    const settings = await db.settings.get('master');
    const monthlyBudgets = await db.monthlyBudgets.where('month').equals(currentMonth).toArray();
    const allMonthlyBudgets = await db.monthlyBudgets.toArray();
    const allMonthlySettings = await db.monthlySettings.toArray();
    const savingsRecords = await db.savingsRecords.toArray();

    const currentMonthTx = await db.transactions
      .where('date').between(startDate, endDate, true, true)
      .toArray();
      
    currentMonthTx.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    const allTx = await db.transactions.toArray();

    // 2. 資産計算
    const assetBalances = {};
    assets.forEach(a => assetBalances[a.id] = a.initialBalance || 0);

    allTx.forEach(t => {
      if (t.type === 'income') {
        if (assetBalances[t.assetId] !== undefined) assetBalances[t.assetId] += t.amount;
      } else if (t.type === 'expense') {
        if (assetBalances[t.assetId] !== undefined) assetBalances[t.assetId] -= t.amount;
      } else if (t.type === 'transfer') {
        if (assetBalances[t.fromAssetId] !== undefined) assetBalances[t.fromAssetId] -= t.amount;
        if (assetBalances[t.toAssetId] !== undefined) assetBalances[t.toAssetId] += t.amount;
      }
    });

    const bankBalance = assets.filter(a => a.type === 'bank').reduce((sum, a) => sum + (assetBalances[a.id] || 0), 0);
    const cashBalance = assets.filter(a => a.type === 'cash').reduce((sum, a) => sum + (assetBalances[a.id] || 0), 0);
    const realBalance = bankBalance + cashBalance;
    const creditBalance = assets.filter(a => a.type === 'credit').reduce((sum, a) => sum + (assetBalances[a.id] || 0), 0);
    const unpaidTotal = creditBalance < 0 ? Math.abs(creditBalance) : 0;

    // 3. 貯金計算
    const initialSavings = settings?.targetSavings || 0;
    const monthlyAdditions = allMonthlySettings
      .filter(s => s.month <= currentMonth)
      .reduce((sum, s) => sum + (s.targetSavings || 0), 0);
    
    const totalDepletions = savingsRecords
      .filter(r => r.type === 'depletion' && r.month <= currentMonth)
      .reduce((sum, r) => sum + (r.amount || 0), 0);
    
    const extraAdditions = savingsRecords
      .filter(r => r.type === 'addition' && r.month <= currentMonth)
      .reduce((sum, r) => sum + (r.amount || 0), 0);

    const totalSavings = initialSavings + monthlyAdditions + extraAdditions - totalDepletions;

    // 当月の動きの計算
    const currentMonthTargetSavings = allMonthlySettings.find(s => s.month === currentMonth)?.targetSavings || 0;
    const currentMonthDepletions = savingsRecords
      .filter(r => r.type === 'depletion' && r.month === currentMonth)
      .reduce((sum, r) => sum + (r.amount || 0), 0);
    const currentMonthExtraAdditions = savingsRecords
      .filter(r => r.type === 'addition' && r.month === currentMonth)
      .reduce((sum, r) => sum + (r.amount || 0), 0);

    // 4. 今月の収支計算
    let income = 0;
    let expense = 0;
    const expenseByCategory = {};
    
    currentMonthTx.forEach(t => {
      if (t.type === 'income') income += t.amount;
      if (t.type === 'expense') {
        expense += t.amount;
        expenseByCategory[t.categoryId || 'uncategorized'] = (expenseByCategory[t.categoryId || 'uncategorized'] || 0) + t.amount;
      }
    });

    // 5. 予算計算
    const budgetMap = {};
    monthlyBudgets.forEach(b => budgetMap[b.categoryId] = b.budget);

    const txByCategory = {};
    allTx.forEach(t => {
      if (!txByCategory[t.categoryId]) txByCategory[t.categoryId] = [];
      txByCategory[t.categoryId].push(t);
    });
    
    const budgetsByCat = {};
    allMonthlyBudgets.forEach(b => {
      if (!budgetsByCat[b.categoryId]) budgetsByCat[b.categoryId] = [];
      budgetsByCat[b.categoryId].push(b);
    });

    let totalBudget = 0;
    let totalNormalBudget = 0;
    let totalNormalExpense = 0;

    const categoryStats = categories.filter(c => c.type === 'expense').map(cat => {
      const spent = expenseByCategory[cat.id] || 0;
      const catTxs = txByCategory[cat.id] || [];
      const catBudgets = budgetsByCat[cat.id] || [];

      const limit = cat.isCarryover 
        ? calculateCarryoverBalance(cat, currentMonth, catTxs, catBudgets) + spent
        : (budgetMap[cat.id] !== undefined ? budgetMap[cat.id] : (cat.monthlyLimit || 0));
      
      totalBudget += limit;

      if (!cat.isCarryover) {
        totalNormalBudget += limit;
        totalNormalExpense += spent;
      } else {
        const monthlyAddition = catBudgets.find(b => b.month === currentMonth)?.budget ?? (cat.monthlyLimit || 0);
        totalNormalBudget += monthlyAddition;
        totalNormalExpense += monthlyAddition;
      }

      return {
        ...cat,
        spent,
        limit
      };
    });

    totalNormalExpense += (expenseByCategory['uncategorized'] || 0);
    const recentTransactions = currentMonthTx.slice(0, 5);
    const uncategorizedExpense = expenseByCategory['uncategorized'] || 0;

    // 残り予算の計算
    const remainingBudget = Math.max(0, totalBudget - expense);

    // 実質残高（使えるお金）の計算
    const netWorth = realBalance + creditBalance - totalSavings - remainingBudget;

    // アセットに現在の計算残高をマッピング
    const assetsWithBalances = assets.map(a => ({
      ...a,
      balance: assetBalances[a.id] || 0
    }));

    // Return aggregated results without holding allTx
    return {
      isLoaded: true,
      assets: assetsWithBalances,
      categories,
      realBalance,
      bankBalance,
      cashBalance,
      unpaidTotal,
      totalSavings,
      currentMonthTargetSavings,
      currentMonthDepletions,
      currentMonthExtraAdditions,
      remainingBudget,
      netWorth,
      income,
      expense,
      totalBudget,
      recentTransactions,
      categoryStats,
      uncategorizedExpense
    };
  }, [currentMonth, startDate, endDate]);
}
