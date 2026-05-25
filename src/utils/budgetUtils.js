import { db } from '../db/db';
import { getPrevMonth, getBudgetMonth } from './dateUtils';

/**
 * Calculates the cumulative balance for a carryover category.
 * @param {Object} category - The category object.
 * @param {string} currentMonth - The current budget month (YYYY-MM).
 * @param {Array} allTransactions - Transactions for THIS category only (optimization).
 * @param {Array} allMonthlyBudgets - Budgets for THIS category only.
 * @returns {number} The available balance.
 */
export const calculateCarryoverBalance = (category, currentMonth, categoryTransactions, categoryBudgets) => {
  if (!category.isCarryover) return 0;

  if (categoryTransactions.length === 0 && categoryBudgets.length === 0) {
    return categoryBudgets.find(b => b.month === currentMonth)?.budget ?? (category.monthlyLimit || 0);
  }

  // Find start month
  let months = [];
  categoryTransactions.forEach(t => months.push(getBudgetMonth(t.date)));
  categoryBudgets.forEach(b => months.push(b.month));
  months.sort();
  
  if (months.length === 0) return (category.monthlyLimit || 0);
  let startMonth = months[0];
  
  // 2. Sum up all budgets from startMonth to currentMonth
  let totalAllocated = 0;
  let tempMonth = startMonth;
  
  let safety = 0;
  while (tempMonth <= currentMonth && safety < 120) {
    const override = categoryBudgets.find(b => b.month === tempMonth);
    totalAllocated += override ? override.budget : (category.monthlyLimit || 0);
    
    const [y, m] = tempMonth.split('-');
    let year = parseInt(y, 10);
    let month = parseInt(m, 10) + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    tempMonth = `${year}-${String(month).padStart(2, '0')}`;
    safety++;
  }

  // 3. Subtract all expenses for this category up to the END of currentMonth
  const totalSpent = categoryTransactions
    .filter(t => getBudgetMonth(t.date) <= currentMonth)
    .reduce((sum, t) => sum + t.amount, 0);

  return totalAllocated - totalSpent;
};

/**
 * Ensures that all past months (since the category was first active up to the month before targetMonthStr)
 * have an explicit override entry in the database. This protects past budgets from changing when
 * the default monthlyLimit of the category is modified.
 */
export const ensurePastBudgets = async (categoryId, oldLimit, targetMonthStr) => {
  const categoryTransactions = await db.transactions.where('categoryId').equals(categoryId).toArray();
  const categoryBudgets = await db.monthlyBudgets.where('categoryId').equals(categoryId).toArray();

  let months = [];
  categoryTransactions.forEach(t => months.push(getBudgetMonth(t.date)));
  categoryBudgets.forEach(b => months.push(b.month));

  if (months.length === 0) {
    return;
  }

  months.sort();
  const startMonth = months[0];
  const endMonth = getPrevMonth(targetMonthStr);

  let tempMonth = startMonth;
  let safety = 0;
  while (tempMonth <= endMonth && safety < 120) {
    const existing = categoryBudgets.find(b => b.month === tempMonth);
    if (!existing) {
      await db.monthlyBudgets.add({
        categoryId,
        month: tempMonth,
        budget: Number(oldLimit) || 0
      });
    }

    const [y, m] = tempMonth.split('-');
    let year = parseInt(y, 10);
    let month = parseInt(m, 10) + 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    tempMonth = `${year}-${String(month).padStart(2, '0')}`;
    safety++;
  }
};

