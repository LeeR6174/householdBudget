export const isEmergencyCategory = (category) => (
  Boolean(category) && (
    category.id === 'cat_special_emergency' ||
    category.isEmergency === true ||
    category.isFixed === true ||
    category.name === '緊急支出'
  )
);

export const isBudgetCategory = (category) => !isEmergencyCategory(category);