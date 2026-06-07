/**
 * 마감 없이 진행 중인 시간기록 — 해당 기록 날짜가 지나면 그날 23:59로 자동 마감.
 */
import {
  normalizeLedgerRowDateYmdTen,
  parseYmdTenFromLedgerStartTimeStr,
} from "./timeLedgerEntriesModel.js";

function timeLedgerLocalTodayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 수동 사용시간·마감 있음 → 진행 중 아님 */
export function timeLedgerRowHasOpenEnd(row) {
  if (!row || typeof row !== "object") return false;
  if (String(row.timeTracked || "").trim()) return false;
  if (String(row.endTime || "").trim()) return false;
  return !!String(row.startTime || "").trim();
}

/** 행의 기록일 YYYY-MM-DD */
export function timeLedgerRowEntryYmd(row) {
  return (
    normalizeLedgerRowDateYmdTen(row?.date) ||
    parseYmdTenFromLedgerStartTimeStr(row?.startTime)
  );
}

/** 오늘 날짜 기준 아직 「진행 중」으로 취급할 행(실시간 경과 표시·홈 트래커용) */
export function timeLedgerRowIsActiveLiveInProgress(row, todayYmd) {
  if (!timeLedgerRowHasOpenEnd(row)) return false;
  const entryYmd = timeLedgerRowEntryYmd(row);
  const today = todayYmd || timeLedgerLocalTodayYmd();
  return !!entryYmd && entryYmd === today;
}

function buildEndTimeAtDayEnd2359(entryYmd, startTime) {
  if (!entryYmd || !/^\d{4}-\d{2}-\d{2}$/.test(entryYmd)) return "";
  const st = String(startTime || "").trim();
  const [y, mo, d] = entryYmd.split("-");
  if (st.includes("T")) {
    return `${entryYmd}T23:59`;
  }
  const datePart = st.includes("/") ? `${y}/${mo}/${d}` : `${y}-${mo}-${d}`;
  return `${datePart} 23:59`;
}

/**
 * @param {object[]} rows
 * @param {{ todayYmd?: string }} [opts]
 * @returns {{ rows: object[], changed: boolean, closedCount: number, closedEntryIds: string[] }}
 */
export function closeStaleInProgressTimeLedgerRows(rows, opts = {}) {
  const today = opts.todayYmd || timeLedgerLocalTodayYmd();
  let changed = false;
  let closedCount = 0;
  const closedEntryIds = [];
  const next = (Array.isArray(rows) ? rows : []).map((row) => {
    if (!timeLedgerRowHasOpenEnd(row)) return row;
    const entryYmd = timeLedgerRowEntryYmd(row);
    if (!entryYmd || entryYmd >= today) return row;
    const endTime = buildEndTimeAtDayEnd2359(entryYmd, row.startTime);
    if (!endTime) return row;
    changed = true;
    closedCount += 1;
    const id = String(row.id || "").trim();
    if (id) closedEntryIds.push(id);
    return {
      ...row,
      endTime,
      localModifiedAt: Date.now(),
    };
  });
  return { rows: next, changed, closedCount, closedEntryIds };
}
