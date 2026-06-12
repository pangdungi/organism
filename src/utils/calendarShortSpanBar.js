/**
 * 캘린더·할일 목록: 며칠에 걸친 기간(s≠d)이 아닐 때 표시할 짧은 기간 막대/컬러바 색(#cfcfcf).
 * - 마감일만 있음
 * - 시작·마감이 같은 날
 * (여러 날에 걸친 기간은 기존 multi-day 처리와 별개)
 */

export const CALENDAR_SHORT_SPAN_BAR_HEX = "#cfcfcf";

/** @param {string} [startYmd]
 * @param {string} [dueYmd] */
export function todoQualifiesCalendarShortSpanBarAccent(startYmd, dueYmd) {
  const s = String(startYmd || "")
    .trim()
    .slice(0, 10);
  const d = String(dueYmd || "")
    .trim()
    .slice(0, 10);
  if (!d && !s) return false;
  if (!s && d) return true;
  if (s && d && s === d) return true;
  return false;
}
