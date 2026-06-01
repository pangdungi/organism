/**
 * 시간가계부 · 레포트 탭 — 조회 기간·데이터 기반 레포트 마운트
 */

import { mountUnifiedTimeReport } from "./timeUnifiedReportMount.js";

export const LP_TIME_REPORT_RANGE_START_KEY = "lp_time_report_range_start";
export const LP_TIME_REPORT_RANGE_END_KEY = "lp_time_report_range_end";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function normYmd(v) {
  return String(v || "")
    .replace(/\//g, "-")
    .slice(0, 10);
}

function localTodayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function readTimeLedgerReportRangeFromSession(fallbackToday) {
  const today = fallbackToday || localTodayYmd();
  try {
    if (typeof sessionStorage === "undefined") {
      return { start: today, end: today };
    }
    const rs = sessionStorage.getItem(LP_TIME_REPORT_RANGE_START_KEY);
    const re = sessionStorage.getItem(LP_TIME_REPORT_RANGE_END_KEY);
    if (!rs || !YMD_RE.test(rs)) return { start: today, end: today };
    let start = rs;
    let end = re && YMD_RE.test(re) ? re : rs;
    if (start > end) {
      const x = start;
      start = end;
      end = x;
    }
    return { start, end };
  } catch (_) {
    return { start: today, end: today };
  }
}

export function persistTimeLedgerReportRangeToSession(startYmd, endYmd) {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(LP_TIME_REPORT_RANGE_START_KEY, startYmd);
    sessionStorage.setItem(LP_TIME_REPORT_RANGE_END_KEY, endYmd);
  } catch (_) {}
}

export function resetTimeLedgerReportRangeToToday(todayYmd) {
  const t = todayYmd || localTodayYmd();
  persistTimeLedgerReportRangeToSession(t, t);
}

/**
 * @param {HTMLElement} scrollWrap
 * @param {{ rangeStart: string, rangeEnd: string }} opts
 */
export function mountTimeLedgerReport(scrollWrap, opts = {}) {
  const rangeStart = normYmd(opts.rangeStart);
  const rangeEnd = normYmd(opts.rangeEnd || opts.rangeStart);
  mountUnifiedTimeReport(scrollWrap, { rangeStart, rangeEnd });
}

/** @deprecated AI 레포트 제거 — mountTimeLedgerReport 사용 */
export function mountTimeLedgerAiReport(scrollWrap, opts) {
  mountTimeLedgerReport(scrollWrap, opts);
}
