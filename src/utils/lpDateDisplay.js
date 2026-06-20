/**
 * 날짜 표시 전용 — 월 영문 전체 이름(June 등)
 */

export const LP_MONTH_NAME_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** @deprecated 3글자 약어 — 신규 UI는 formatMonthNameEn 사용 */
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

/** 0-based month index → January … December */
export function formatMonthNameEn(monthIndex) {
  const m = Number(monthIndex);
  if (!Number.isFinite(m) || m < 0 || m > 11) return "";
  return LP_MONTH_NAME_EN[m];
}

/** 1-based month number → January … December */
export function formatMonthNameEnFrom1(monthNum) {
  const n = Number(monthNum);
  if (!Number.isFinite(n) || n < 1 || n > 12) return "";
  return LP_MONTH_NAME_EN[n - 1];
}

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
