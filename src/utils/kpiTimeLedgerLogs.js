/**
 * 시간 단위 KPI — 가계부(taskId↔kpiId) 실제 기록을 로그 목록·표시값으로 노출
 */

import {
  KPI_LOG_SOURCE_TIME_LEDGER,
  KPI_LOG_SOURCE_MANUAL,
  kpiLogIsTimeLinked,
} from "./kpiLogFields.js";
import { pullTimeLedgerForKpi } from "./kpiTabCloudRefresh.js";
import { patchKpiLinkedTasksFromKpiMaps } from "./timeTaskOptionsModel.js";
import {
  getKpiDailyLedgerSummaries,
  getKpiTargetDateRange,
  normalizeKpiLogDateYmd,
  kpiShouldUseTimeLedgerLogs,
  mergeDailyCompletedLists,
} from "./timeKpiSync.js";

function mergeLogDailyCompleted(storedLog, ledgerHabitCompleted = []) {
  return mergeDailyCompletedLists(
    storedLog?.dailyCompleted || [],
    ledgerHabitCompleted || [],
  );
}

/**
 * KPI 상세 로그 탭 — 시간 단위·매일 반복이면 **가계부(taskId 연동) 일별** + 체크 항목 표시
 * @param {object} kpi
 * @param {object[]} storedLogs
 */
export function resolveKpiDetailLogEntries(kpi, storedLogs = []) {
  const logs = Array.isArray(storedLogs) ? storedLogs : [];
  const useLedger = kpiShouldUseTimeLedgerLogs(kpi);
  const hasTimeLinkedStored = logs.some((l) => kpiLogIsTimeLinked(l));
  if (!useLedger && !hasTimeLinkedStored) return logs;

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
    const stored = storedByDate.get(day.dateRaw);
    if (stored) storedByDate.delete(day.dateRaw);

    const dailyCompleted = mergeLogDailyCompleted(stored, day.habitDailyCompleted);
    const hasTime = day.minutes > 0;
    const hasChecks = dailyCompleted.length > 0;
    if (!hasTime && !hasChecks) continue;

    const entryIds =
      Array.isArray(day.entryIds) && day.entryIds.length > 0
        ? day.entryIds
        : stored?.timeLedgerEntryIds || [];

    out.push({
      ...(stored || {}),
      id: stored?.id || `time-ledger-${kpi.id}-${day.dateRaw}`,
      kpiId: kpi.id,
      date: stored?.date || day.dateDisplay,
      dateRaw: day.dateRaw,
      timeLedgerEntryIds: entryIds,
      kpiLogSource: hasTime
        ? KPI_LOG_SOURCE_TIME_LEDGER
        : stored?.kpiLogSource || KPI_LOG_SOURCE_MANUAL,
      __ledgerMinutes: day.minutes,
      dailyCompleted,
    });
  }

  for (const log of storedByDate.values()) {
    const dailyCompleted = mergeLogDailyCompleted(log, []);
    const v = String(log?.value ?? "").trim();
    const memo = String(log?.memo ?? "").trim();
    const hasChecks = dailyCompleted.length > 0;

    if (kpiLogIsTimeLinked(log)) {
      if (!hasChecks) continue;
      out.push({ ...log, dailyCompleted });
      continue;
    }

    if (v || memo || hasChecks) {
      out.push(hasChecks ? { ...log, dailyCompleted } : log);
    }
  }

  out.sort((a, b) => {
    const da = normalizeKpiLogDateYmd(a?.dateRaw || a?.date || "");
    const db = normalizeKpiLogDateYmd(b?.dateRaw || b?.date || "");
    return db.localeCompare(da);
  });

  return out;
}

/** 로그 탭 — 서버 pull 없이 로컬만 (할일 추가 등 UI 즉시 갱신용) */
export function resolveKpiDetailLogEntriesLocal(kpi, storedLogs = []) {
  return resolveKpiDetailLogEntries(kpi, storedLogs);
}

/** 시간가계부 pull 이 필요한 KPI 인지 */
export function kpiDetailLogsNeedCloudPull(kpi, storedLogs = []) {
  const logs = Array.isArray(storedLogs) ? storedLogs : [];
  return kpiShouldUseTimeLedgerLogs(kpi) || logs.some((l) => kpiLogIsTimeLinked(l));
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
