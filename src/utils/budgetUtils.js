import { getPrevMonth, getBudgetMonth } from './dateUtils';

/**
 * Calculates the cumulative balance for a carryover category.
 * @param {Object} category - The category object.
 * @param {string} currentMonth - The current budget month (YYYY-MM).
 * @param {Array} allTransactions - All transactions in the database.
 * @param {Array} allMonthlyBudgets - All monthly budget overrides.
 * @returns {number} The available balance.
 */
export const calculateCarryoverBalance = (category, currentMonth, allTransactions, allMonthlyBudgets) => {
  if (!category.isCarryover) return 0;

  // 1. Find the earliest month related to this category (or use a reasonable default)
  // To be safe, we calculate from the earliest transaction or budget setting in the entire system.
  const categoryTransactions = allTransactions.filter(t => t.categoryId === category.id);
  const categoryBudgets = allMonthlyBudgets.filter(b => b.categoryId === category.id);

  if (categoryTransactions.length === 0 && categoryBudgets.length === 0) {
    // If no data yet, just return the current month's budget
    return categoryBudgets.find(b => b.month === currentMonth)?.budget ?? (category.monthlyLimit || 0);
  }

  // Find start month
  let months = [];
  categoryTransactions.forEach(t => months.push(getBudgetMonth(t.date)));
  categoryBudgets.forEach(b => months.push(b.month));
  months.sort();
  
  let startMonth = months[0];
  
  // 2. Sum up all budgets from startMonth to currentMonth
  let totalAllocated = 0;
  let tempMonth = startMonth;
  
  // Safety break to prevent infinite loops if something is wrong
  let safety = 0;
  while (tempMonth <= currentMonth && safety < 120) { // Max 10 years
    const override = categoryBudgets.find(b => b.month === tempMonth);
    totalAllocated += override ? override.budget : (category.monthlyLimit || 0);
    
    // Increment month
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
