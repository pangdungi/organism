/**
 * 시간 단위 KPI — 가계부(taskId↔kpiId) 실제 기록을 로그 목록·표시값으로 노출
 */

import {
  KPI_LOG_SOURCE_TIME_LEDGER,
  kpiLogIsTimeLinked,
} from "./kpiLogFields.js";
import { pullTimeLedgerForKpi } from "./kpiTabCloudRefresh.js";
import { patchKpiLinkedTasksFromKpiMaps } from "./timeTaskOptionsModel.js";
import {
  getKpiDailyLedgerSummaries,
  getKpiTargetDateRange,
  normalizeKpiLogDateYmd,
  syncHabitTrackerLogs,
  kpiShouldUseTimeLedgerLogs,
} from "./timeKpiSync.js";

/**
 * KPI 상세 로그 탭 — 시간 단위면 **가계부(taskId 연동) 일별**만 표시
 * @param {object} kpi
 * @param {object[]} storedLogs
 */
export function resolveKpiDetailLogEntries(kpi, storedLogs = []) {
  syncHabitTrackerLogs();
  const logs = Array.isArray(storedLogs) ? storedLogs : [];
  const useLedger = kpiShouldUseTimeLedgerLogs(kpi);
  const hasTimeLinkedStored = logs.some((l) => kpiLogIsTimeLinked(l));
  if (!useLedger && !hasTimeLinkedStored) return logs;

  patchKpiLinkedTasksFromKpiMaps();

  const { start, end } = getKpiTargetDateRange(kpi);
  const daily = getKpiDailyLedgerSummaries(kpi.id, kpi.name, {
    startYmd: start,
    endYmd: end,
  });

  /** @type {Map<string, object>} */
  const storedByDate = new Map();
  for (const log of logs) {
    const d = normalizeKpiLogDateYmd(log?.dateRaw || log?.date || "");
    if (!d) continue;
    if (start && d < start) continue;
    if (end && d > end) continue;
    storedByDate.set(d, log);
  }

  /** @type {object[]} */
  const out = [];

  for (const day of daily) {
    if (day.minutes <= 0) continue;
    const stored = storedByDate.get(day.dateRaw);
    storedByDate.delete(day.dateRaw);
    out.push({
      ...(stored || {}),
      id: stored?.id || `time-ledger-${kpi.id}-${day.dateRaw}`,
      kpiId: kpi.id,
      date: stored?.date || day.dateDisplay,
      dateRaw: day.dateRaw,
      timeLedgerEntryIds: day.entryIds,
      kpiLogSource: KPI_LOG_SOURCE_TIME_LEDGER,
      __ledgerMinutes: day.minutes,
    });
  }

  for (const log of storedByDate.values()) {
    if (kpiLogIsTimeLinked(log)) continue;
    const v = String(log?.value ?? "").trim();
    const memo = String(log?.memo ?? "").trim();
    const dailyDone = Array.isArray(log?.dailyCompleted)
      ? log.dailyCompleted.length
      : 0;
    if (v || memo || dailyDone > 0) out.push(log);
  }

  out.sort((a, b) => {
    const da = normalizeKpiLogDateYmd(a?.dateRaw || a?.date || "");
    const db = normalizeKpiLogDateYmd(b?.dateRaw || b?.date || "");
    return db.localeCompare(da);
  });

  return out;
}

/**
 * 서버에서 KPI 목표 구간 가계부 pull 후 로그 목록 반환
 * @param {object} kpi
 * @param {object[]} storedLogs
 */
export async function resolveKpiDetailLogEntriesPrepared(kpi, storedLogs = []) {
  patchKpiLinkedTasksFromKpiMaps();
  const logs = Array.isArray(storedLogs) ? storedLogs : [];
  const needPull =
    kpiShouldUseTimeLedgerLogs(kpi) || logs.some((l) => kpiLogIsTimeLinked(l));
  if (needPull) {
    await pullTimeLedgerForKpi(kpi);
    patchKpiLinkedTasksFromKpiMaps();
  }
  return resolveKpiDetailLogEntries(kpi, storedLogs);
}
