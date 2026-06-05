/**
 * 날짜 표시 전용 — 월 약어(MMM) · PizzaClub 폰트 대상(.lp-date-font)과 함께 사용
 * 앱 글꼴(--lp-app-font-family) 변경과 무관하게 유지
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
