export const isReimbursementTransaction = (transaction) => (
  transaction?.type === 'reimbursement' || transaction?.isReimbursement === true
);

export const isSettledReimbursement = (transaction) => (
  transaction?.type === 'reimbursement' || (
    transaction?.isReimbursement === true && transaction?.reimbursementStatus === 'settled'
  )
);