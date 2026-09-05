import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { calculateCarryoverBalance } from '../utils/budgetUtils';
import { getLocalDateString, getBudgetMonth } from '../utils/dateUtils';

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
    const todayStr = getLocalDateString();

    // 2. 資産計算（本日時点の実残高）
    const assetBalances = {};
    assets.forEach(a => assetBalances[a.id] = a.initialBalance || 0);

    allTx.forEach(t => {
      // 本日以前（当日含む）の確定済み取引のみを資産残高に反映
      if (t.date && t.date <= todayStr) {
        if (t.type === 'income') {
          if (assetBalances[t.assetId] !== undefined) assetBalances[t.assetId] += t.amount;
        } else if (t.type === 'expense') {
          if (assetBalances[t.assetId] !== undefined) assetBalances[t.assetId] -= t.amount;
        } else if (t.type === 'transfer') {
          if (assetBalances[t.fromAssetId] !== undefined) assetBalances[t.fromAssetId] -= t.amount;
          if (assetBalances[t.toAssetId] !== undefined) assetBalances[t.toAssetId] += t.amount;
        }
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
    
    const dbDepletions = savingsRecords
      .filter(r => r.type === 'depletion' && r.month <= currentMonth)
      .reduce((sum, r) => sum + (r.amount || 0), 0);
    const txDepletions = allTx
      .filter(t => t.type === 'expense' && t.isSavingsDepletion && getBudgetMonth(t.date) <= currentMonth)
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    const totalDepletions = dbDepletions + txDepletions;
    
    const extraAdditions = savingsRecords
      .filter(r => r.type === 'addition' && r.month <= currentMonth)
      .reduce((sum, r) => sum + (r.amount || 0), 0);

    // 貯金原資の総額（切り崩し前）
    const totalSavingsBeforeDepletions = initialSavings + monthlyAdditions + extraAdditions;
    const rawTotalSavings = totalSavingsBeforeDepletions - totalDepletions;
    const totalSavings = Math.max(0, rawTotalSavings);
    
    // 貯金残高を超過して支払われた金額（貯金で賄えなかった不足分）
    const savingsOverflow = rawTotalSavings < 0 ? Math.abs(rawTotalSavings) : 0;

    // 当月の動きの計算
    const currentMonthTargetSavings = allMonthlySettings.find(s => s.month === currentMonth)?.targetSavings || 0;
    
    const dbCurrentMonthDepletions = savingsRecords
      .filter(r => r.type === 'depletion' && r.month === currentMonth)
      .reduce((sum, r) => sum + (r.amount || 0), 0);
    const txCurrentMonthDepletions = allTx
      .filter(t => t.type === 'expense' && t.isSavingsDepletion && getBudgetMonth(t.date) === currentMonth)
      .reduce((sum, t) => sum + (t.amount || 0), 0);
    const currentMonthDepletions = dbCurrentMonthDepletions + txCurrentMonthDepletions;

    const currentMonthExtraAdditions = savingsRecords
      .filter(r => r.type === 'addition' && r.month === currentMonth)
      .reduce((sum, r) => sum + (r.amount || 0), 0);

    // 4. 今月の収支計算
    let income = 0;
    let expense = 0;
    let normalExpense = 0;
    let emergencyExpense = 0;
    const expenseByCategory = {};

    // 貯金超過分があれば、それはフリー資金からの持ち出し＝緊急支出として計上
    if (savingsOverflow > 0) {
      emergencyExpense += savingsOverflow;
      expense += savingsOverflow;
    }

    const emergencyCatIds = new Set(
      categories
        .filter(c => c.isEmergency || c.isFixed || c.name === '緊急支出')
        .map(c => c.id)
    );
    emergencyCatIds.add('cat_special_emergency');
    
    currentMonthTx.forEach(t => {
      if (t.type === 'income') income += t.amount;
      if (t.type === 'expense') {
        if (!t.isSavingsDepletion) {
          expense += t.amount;
          const catId = t.categoryId || 'uncategorized';
          expenseByCategory[catId] = (expenseByCategory[catId] || 0) + t.amount;

          if (emergencyCatIds.has(catId)) {
            emergencyExpense += t.amount;
          } else {
            normalExpense += t.amount;
          }
        }
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
      const isEmergency = emergencyCatIds.has(cat.id) || cat.isEmergency || cat.name === '緊急支出';
      const spent = expenseByCategory[cat.id] || 0;
      const catTxs = txByCategory[cat.id] || [];
      const catBudgets = budgetsByCat[cat.id] || [];

      let limit = 0;
      if (isEmergency) {
        limit = 0; // 緊急支出は上限なし（総予算対象外）
      } else if (cat.isCarryover) {
        limit = calculateCarryoverBalance(cat, currentMonth, catTxs, catBudgets) + spent;
      } else {
        limit = budgetMap[cat.id] !== undefined ? budgetMap[cat.id] : (cat.monthlyLimit || 0);
      }
      
      // 緊急支出は今月の総予算に含めない
      if (!isEmergency) {
        totalBudget += limit;

        if (!cat.isCarryover) {
          totalNormalBudget += limit;
          totalNormalExpense += spent;
        } else {
          const monthlyAddition = catBudgets.find(b => b.month === currentMonth)?.budget ?? (cat.monthlyLimit || 0);
          totalNormalBudget += monthlyAddition;
          totalNormalExpense += monthlyAddition;
        }
      }

      return {
        ...cat,
        isEmergency,
        spent,
        limit
      };
    });

    totalNormalExpense += (expenseByCategory['uncategorized'] || 0);
    const recentTransactions = currentMonthTx.slice(0, 5);
    const uncategorizedExpense = expenseByCategory['uncategorized'] || 0;

    // 1. 実質残高（現在のフリー資金：手元資金 - カード未払総額 - 貯金総額）
    const realNetBalance = realBalance + creditBalance - totalSavings;

    // 2. 残り予算の計算（緊急支出は総予算外のため、通常支出ベースで残り予算を算出）
    const remainingBudget = totalBudget - normalExpense;
    const effectiveRemainingBudget = Math.max(0, remainingBudget);

    // 3. 今月末での予測金
    // A. 緊急支出差引後の予測金（実質残高 - 残り通常予算）
    const projectedMonthEndBalanceWithEmergency = realNetBalance - effectiveRemainingBudget;

    // B. 通常予算ベースの予測金（緊急支出がなかった場合の着地予測）
    const projectedMonthEndBalance = projectedMonthEndBalanceWithEmergency + emergencyExpense;

    // 後方互換性のための netWorth
    const netWorth = realNetBalance;

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
      realNetBalance,
      projectedMonthEndBalance,
      projectedMonthEndBalanceWithEmergency,
      netWorth,
      income,
      expense,
      normalExpense,
      emergencyExpense,
      totalBudget,
      recentTransactions,
      categoryStats,
      uncategorizedExpense
    };
  }, [currentMonth, startDate, endDate]);
}
