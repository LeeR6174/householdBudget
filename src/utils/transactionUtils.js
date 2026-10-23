export const isReimbursementTransaction = (transaction) => (
  transaction?.type === 'reimbursement' || transaction?.isReimbursement === true
);

export const isSettledReimbursement = (transaction) => (
  transaction?.type === 'reimbursement' || (
    transaction?.isReimbursement === true && transaction?.reimbursementStatus === 'settled'
  )
);

export const isCountedExpense = (transaction) => (
  transaction?.type === 'expense' &&
  !transaction?.isSavingsDepletion &&
  !isSettledReimbursement(transaction)
);