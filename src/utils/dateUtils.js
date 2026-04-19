/**
 * 指定した日付（Dateまたは文字列）が、
 * 家計簿上の何月分（25日〜翌24日）に該当するかを返す。
 * 返り値例: "2026-04"
 */
export const getBudgetMonth = (dateParam) => {
  const d = new Date(dateParam);
  let year = d.getFullYear();
  let month = d.getMonth() + 1; // 1-12
  const day = d.getDate();

  // 25日以降なら、内部的には「翌月扱い」となる
  if (day >= 25) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return `${year}-${String(month).padStart(2, '0')}`;
};

/**
 * "YYYY-MM" を受け取り、その「前月」の "YYYY-MM" を返す
 */
export const getPrevMonth = (monthStr) => {
  const [y, m] = monthStr.split('-');
  let year = parseInt(y, 10);
  let month = parseInt(m, 10);

  month -= 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

/**
 * "YYYY-MM" を受け取り、その「翌月」の "YYYY-MM" を返す
 */
export const getNextMonth = (monthStr) => {
  const [y, m] = monthStr.split('-');
  let year = parseInt(y, 10);
  let month = parseInt(m, 10);

  month += 1;
  if (month > 12) {
    month = 1;
    year += 1;
  }
  return `${year}-${String(month).padStart(2, '0')}`;
};

/**
 * 指定された月（例 "2026-04"）に対応する
 * 開始日・終了日（YYYY-MM-DD形）を返す
 * 4月分なら -> 3/25 〜 4/24
 */
export const getMonthRange = (monthStr) => {
  const [y, m] = monthStr.split('-');
  let year = parseInt(y, 10);
  let month = parseInt(m, 10);

  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth === 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const startDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-25`;
  
  // End date is current month 24th
  // But watch out for valid lengths, 24th is always valid.
  const endDate = `${year}-${String(month).padStart(2, '0')}-24`;

  return { startDate, endDate };
};

export const getCurrentBudgetMonth = () => {
  return getBudgetMonth(new Date());
};
