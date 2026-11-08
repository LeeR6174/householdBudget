export const getSavingsBreakdown = ({
  settings,
  monthlySettings = [],
  savingsRecords = [],
  transactions = [],
  currentMonth
}) => {
  const initialSavings = settings?.targetSavings || 0;
  const monthlyAdditions = monthlySettings
    .filter(setting => setting.month <= currentMonth)
    .reduce((sum, setting) => sum + (setting.targetSavings || 0), 0);
  const extraAdditions = savingsRecords
    .filter(record => record.type === 'addition' && record.month <= currentMonth)
    .reduce((sum, record) => sum + (record.amount || 0), 0);
  const recordDepletions = savingsRecords
    .filter(record => record.type === 'depletion' && record.month <= currentMonth)
    .reduce((sum, record) => sum + (record.amount || 0), 0);
  const transactionDepletions = transactions
    .filter(transaction =>
      transaction.type === 'expense' &&
      transaction.isSavingsDepletion &&
      transaction.date &&
      transaction.date <= `${currentMonth}-24`
    )
    .reduce((sum, transaction) => sum + (transaction.amount || 0), 0);
  const totalDepletions = recordDepletions + transactionDepletions;
  const adjustment = settings?.savingsAdjustment || 0;
  const rawBeforeAdjustment = initialSavings + monthlyAdditions + extraAdditions - totalDepletions;
  const rawTotal = rawBeforeAdjustment + adjustment;

  return {
    initialSavings,
    monthlyAdditions,
    extraAdditions,
    totalDepletions,
    adjustment,
    rawBeforeAdjustment,
    totalSavings: Math.max(0, rawTotal)
  };
};
