import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCarryoverAvailable, calculateCarryoverOpeningBalance } from './budgetCalculationUtils.js';
import { getBudgetMonth, getMonthRange } from './dateUtils.js';
import { isCountedExpense } from './transactionUtils.js';

const category = { isCarryover: true, monthlyLimit: 10000 };
const budget = (month, amount) => ({ month, budget: amount });
const transaction = (overrides = {}) => ({
  type: 'expense',
  amount: 1000,
  date: '2026-10-10',
  ...overrides
});

test('積立予算は過去の未使用分と今月の積立額を使える予算として返す', () => {
  const available = calculateCarryoverAvailable(
    category,
    '2026-10',
    5000,
    [transaction({ date: '2026-09-10', amount: 2000 })],
    [budget('2026-09', 10000)]
  );

  assert.equal(available, 13000);
});

test('立替中は通常支出として残高から差し引くが、精算済みは差し引かない', () => {
  const transactions = [
    transaction({ amount: 2000, isReimbursement: true, reimbursementStatus: 'pending' }),
    transaction({ amount: 3000, isReimbursement: true, reimbursementStatus: 'settled' })
  ];

  assert.equal(calculateCarryoverOpeningBalance(category, '2026-10', transactions, [budget('2026-10', 10000)]), 0);
  assert.equal(calculateCarryoverAvailable(category, '2026-10', 10000, transactions, [budget('2026-10', 10000)]), 8000);
});

test('振替と貯金切り崩しは積立予算の支出に含めない', () => {
  const transactions = [
    transaction({ amount: 2000, type: 'transfer' }),
    transaction({ amount: 3000, isSavingsDepletion: true })
  ];

  assert.equal(calculateCarryoverAvailable(category, '2026-10', 10000, transactions, [budget('2026-10', 10000)]), 10000);
});

test('家計簿月は25日を境に正しく切り替わる', () => {
  assert.equal(getBudgetMonth('2026-09-24'), '2026-09');
  assert.equal(getBudgetMonth('2026-09-25'), '2026-10');
  assert.deepEqual(getMonthRange('2026-10'), {
    startDate: '2026-09-25',
    endDate: '2026-10-24'
  });
});

test('当月25日開始の支出と精算状態を積立可能額へ正しく反映する', () => {
  const transactions = [
    transaction({ date: '2026-09-25', amount: 2500 }),
    transaction({ date: '2026-10-24', amount: 1500, isReimbursement: true, reimbursementStatus: 'pending' }),
    transaction({ date: '2026-10-24', amount: 4000, isReimbursement: true, reimbursementStatus: 'settled' })
  ];

  assert.equal(transactions.filter(isCountedExpense).length, 2);
  assert.equal(calculateCarryoverAvailable(category, '2026-10', 10000, transactions, []), 6000);
});