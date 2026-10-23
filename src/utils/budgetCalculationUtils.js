import { getPrevMonth, getBudgetMonth } from './dateUtils.js';
import { isCountedExpense } from './transactionUtils.js';

const getNextMonth = (month) => {
  const [yearValue, monthValue] = month.split('-').map(Number);
  const nextMonth = monthValue === 12 ? 1 : monthValue + 1;
  const nextYear = monthValue === 12 ? yearValue + 1 : yearValue;
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
};

export const calculateCarryoverOpeningBalance = (category, currentMonth, categoryTransactions, categoryBudgets) => {
  if (!category.isCarryover) return 0;

  const countedTransactions = categoryTransactions.filter(isCountedExpense);
  const previousBudgets = categoryBudgets.filter(budget => budget.month < currentMonth);
  const months = [
    ...countedTransactions.map(transaction => getBudgetMonth(transaction.date)),
    ...previousBudgets.map(budget => budget.month)
  ].sort();

  if (months.length === 0) return 0;

  let balance = 0;
  let month = months[0];
  const previousMonth = getPrevMonth(currentMonth);
  let safety = 0;

  while (month <= previousMonth && safety < 120) {
    const budget = previousBudgets.find(item => item.month === month);
    balance += budget ? budget.budget : (category.monthlyLimit || 0);
    balance -= countedTransactions
      .filter(transaction => getBudgetMonth(transaction.date) === month)
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    month = getNextMonth(month);
    safety += 1;
  }

  return balance;
};

export const calculateCarryoverAvailable = (category, currentMonth, currentBudget, categoryTransactions, categoryBudgets) => {
  if (!category.isCarryover) return currentBudget;

  const currentMonthSpent = categoryTransactions
    .filter(transaction => isCountedExpense(transaction) && getBudgetMonth(transaction.date) === currentMonth)
    .reduce((sum, transaction) => sum + transaction.amount, 0);

  return calculateCarryoverOpeningBalance(category, currentMonth, categoryTransactions, categoryBudgets)
    + currentBudget
    - currentMonthSpent;
};