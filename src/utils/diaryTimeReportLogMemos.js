/**
 * 시간 레포트 · 로그 탭 — 시간가계부 과제 메모(feedback)만 일·월별로 모음
 */

import { splitUnhealthyMealMemoFromDb } from "./timeLedgerEntriesModel.js";
import * as TTC from "./timeTaskOptionsConstants.js";
import {
  formatIntegerMinutesDurationKo,
  getRowEndInstantForMobileCard,
  getRowStartInstantForMobileCard,
  getTimeReportMonthInclusiveRange,
  loadTimeRows,
  parseTimeToHours,
} from "../views/Time.js";

function normYmd(s) {
  return String(s || "").replace(/\//g, "-").slice(0, 10);
}

function formatClockHHmm(date) {
  if (!date || !(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** 편집 모달과 동일: 해시태그 제외 본문, 없으면 원문 */
function ledgerMemoDisplayText(row) {
  let feedbackRaw = String(row?.feedback || "").trim();
  if (!feedbackRaw) return "";
  const taskName = String(row?.taskName || "").trim();
  if (TTC.isMealDetailTaskName(taskName) && feedbackRaw.startsWith("[식단] ")) {
    const sp = splitUnhealthyMealMemoFromDb(feedbackRaw);
    feedbackRaw = sp.feedback;
  }
  const memoOnly = feedbackRaw.replace(/#[^\s#]+/g, "").trim();
  return memoOnly || feedbackRaw;
}

function ledgerRowHasMemo(row) {
  return !!String(row?.feedback || "").trim();
}

function buildLogMemoTimeLabel(row) {
  const start = getRowStartInstantForMobileCard(row);
  const end = getRowEndInstantForMobileCard(row);
  if (start && end) return `${formatClockHHmm(start)}–${formatClockHHmm(end)}`;
  if (start) return `${formatClockHHmm(start)}~`;
  const hrs = parseTimeToHours(row?.timeTracked);
  if (hrs > 0 && Number.isFinite(hrs)) {
    return formatIntegerMinutesDurationKo(Math.round(hrs * 60));
  }
  return "";
}

function rowSortInstantMs(row) {
  const start = getRowStartInstantForMobileCard(row);
  if (start && !Number.isNaN(start.getTime())) return start.getTime();
  const ymd = normYmd(row?.date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const [y, m, d] = ymd.split("-").map((x) => parseInt(x, 10));
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
  }
  return 0;
}

/**
 * @typedef {{ dateYmd: string, taskName: string, memoText: string, timeLabel: string, sortMs: number }} TimeReportLogMemoRow
 */

/** @param {unknown[]} rows */
function mapLedgerRowsToLogMemos(rows) {
  /** @type {TimeReportLogMemoRow[]} */
  const out = [];
  for (const row of rows) {
    if (!row || !ledgerRowHasMemo(row)) continue;
    const memoText = ledgerMemoDisplayText(row);
    if (!memoText) continue;
    const dateYmd = normYmd(row.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) continue;
    out.push({
      dateYmd,
      taskName: String(row.taskName || "").trim() || "과제",
      memoText,
      timeLabel: buildLogMemoTimeLabel(row),
      sortMs: rowSortInstantMs(row),
    });
  }
  out.sort((a, b) => b.sortMs - a.sortMs || b.dateYmd.localeCompare(a.dateYmd));
  return out;
}

/** @returns {TimeReportLogMemoRow[]} */
export function getDailyTimeReportLogMemos(ymdTen) {
  const key = normYmd(ymdTen);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return [];
  const rows = loadTimeRows().filter((r) => normYmd(r?.date) === key);
  return mapLedgerRowsToLogMemos(rows);
}

/** @returns {TimeReportLogMemoRow[]} */
export function getMonthlyTimeReportLogMemos(ymdTen) {
  const range = getTimeReportMonthInclusiveRange(ymdTen);
  if (!range) return [];
  const rows = loadTimeRows().filter((r) => {
    const d = normYmd(r?.date);
    return d >= range.start && d <= range.end;
  });
  return mapLedgerRowsToLogMemos(rows);
}
