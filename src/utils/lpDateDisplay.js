/**
 * 날짜 표시 전용 — 월 약어(MMM) 등
 */

export const LP_MONTH_ABBR_EN = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/** 0-based month index → JAN … DEC */
export function formatMonthAbbrEn(monthIndex) {
  const m = Number(monthIndex);
  if (!Number.isFinite(m) || m < 0 || m > 11) return "";
  return LP_MONTH_ABBR_EN[m];
}

/** 1-based month number → JAN … DEC */
export function formatMonthAbbrEnFrom1(monthNum) {
  const n = Number(monthNum);
  if (!Number.isFinite(n) || n < 1 || n > 12) return "";
  return LP_MONTH_ABBR_EN[n - 1];
}
