/**
 * 시간 레포트 · 로그 탭 — 시간가계부 과제 메모(feedback)만 일·월별로 모음
 */

import {
  ledgerRowUserMemoFeedback,
  resolveLedgerRowMealDetail,
} from "./timeLedgerCardKpiMemo.js";
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

/** 편집 모달·카드와 동일: 식단 + 해시태그 제외 사용자 메모 */
function ledgerMemoDisplayText(row) {
  const parts = [];
  const mealDetail = resolveLedgerRowMealDetail(row);
  if (mealDetail) parts.push(`식단 ${mealDetail}`);
  const feedbackRaw = ledgerRowUserMemoFeedback(row);
  if (feedbackRaw) {
    const memoOnly = feedbackRaw.replace(/#[^\s#]+/g, "").trim();
    parts.push(memoOnly || feedbackRaw);
  }
  return parts.join("\n");
}

function ledgerRowHasMemo(row) {
  return !!resolveLedgerRowMealDetail(row) || !!ledgerRowUserMemoFeedback(row);
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

function formatDateSlashYmd(ymdTen) {
  const n = normYmd(ymdTen);
  if (!n || n.length < 10) return "";
  const [y, m, d] = n.split("-");
  return `${y}/${m}/${d}`;
}

/** @param {unknown[]} rows */
export function mapLedgerRowsToLogMemos(rows) {
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

/** @param {unknown} row */
export function ledgerRowHasDisplayableMemo(row) {
  return mapLedgerRowsToLogMemos([row]).length > 0;
}

/**
 * 시간 레포트·시간가계부 공통 — 과제 메모 미니멀 목록
 * @param {HTMLElement} parentEl
 * @param {TimeReportLogMemoRow[]} memoRows
 * @param {{ emptyMessage?: string, showDateInMeta?: boolean, ariaLabel?: string }} [opts]
 */
export function mountTimeReportLogMemoList(parentEl, memoRows, opts = {}) {
  const {
    emptyMessage = "남긴 과제 메모가 없습니다.",
    showDateInMeta = false,
    ariaLabel = "과제 메모",
  } = opts;

  const section = document.createElement("section");
  section.className = "diary-tr-log-memo-shell";
  section.setAttribute("aria-label", ariaLabel);

  if (!memoRows.length) {
    const empty = document.createElement("p");
    empty.className = "diary-tr-log-memo-empty";
    empty.textContent = emptyMessage;
    section.appendChild(empty);
    parentEl.appendChild(section);
    return section;
  }

  const list = document.createElement("ul");
  list.className = "diary-tr-log-memo-list";

  memoRows.forEach((row) => {
    const item = document.createElement("li");
    item.className = "diary-tr-log-memo-item";

    const meta = document.createElement("p");
    meta.className = "diary-tr-log-memo-meta";
    const metaParts = [];
    if (showDateInMeta) metaParts.push(formatDateSlashYmd(row.dateYmd));
    if (row.timeLabel) metaParts.push(row.timeLabel);
    metaParts.push(row.taskName);
    meta.textContent = metaParts.join(" · ");

    const body = document.createElement("p");
    body.className = "diary-tr-log-memo-body";
    body.textContent = row.memoText;

    item.appendChild(meta);
    item.appendChild(body);
    list.appendChild(item);
  });

  section.appendChild(list);
  parentEl.appendChild(section);
  return section;
}
