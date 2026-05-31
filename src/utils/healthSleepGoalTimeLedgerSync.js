/**
 * 건강 목표 「수면 시간」— 시간가계부 「수면하기」 일별 소요 합계 → healthGoalLogs 자동 기록
 */

import { readTimeLedgerEntriesRaw } from "./timeLedgerEntriesModel.js";
import {
  ledgerRowDateYmd,
  normalizeKpiLogDateYmd,
} from "./timeKpiSync.js";
import { isUuid } from "./idUtils.js";
import {
  HEALTH_KPI_MAP_STORAGE_KEY,
  DEFAULT_SLEEP_HEALTH_GOAL_ID,
} from "./healthKpiMapSupabase.js";
import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { stampAndPersistKpiMap } from "./kpiTodoSync.js";

export const HEALTH_GOAL_LOG_SOURCE_TIME_LEDGER = "time_ledger";
export const HEALTH_GOAL_LOG_SOURCE_MANUAL = "manual";

const SLEEP_TASK_NAME = "수면하기";
const SLEEP_LEDGER_LOG_ID_PREFIX = "__lp_sleep_ledger__";

function parseTimeToHours(str) {
  if (!str || typeof str !== "string") return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h + m / 60;
}

function toDisplayDate(dateRaw) {
  const parts = String(dateRaw || "").split("-");
  if (parts.length < 3) return dateRaw || "";
  return `${parts[0]}. ${parts[1]}. ${parts[2]}.`;
}

function sleepLedgerLogId(dateRaw) {
  return `${SLEEP_LEDGER_LOG_ID_PREFIX}${dateRaw}`;
}

function minutesToSleepGoalValueHours(minutes) {
  const h = Math.round(Number(minutes) || 0) / 60;
  const n = Number(h.toFixed(2));
  return String(n);
}

function isSleepLedgerSyncedGoalLog(log, healthId) {
  if (String(log?.healthId ?? "") !== healthId) return false;
  const id = String(log?.id ?? "");
  if (id.startsWith(SLEEP_LEDGER_LOG_ID_PREFIX)) return true;
  return log?.healthGoalLogSource === HEALTH_GOAL_LOG_SOURCE_TIME_LEDGER;
}

/** @returns {Map<string, { minutes: number, entryIds: string[] }>} */
function collectSleepMinutesByDay() {
  const rows = readTimeLedgerEntriesRaw();
  /** @type {Map<string, { minutes: number, entryIds: string[] }>} */
  const byDay = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if ((r.taskName || "").trim() !== SLEEP_TASK_NAME) continue;
    if (!(r.timeTracked || "").trim()) continue;
    const dateRaw = ledgerRowDateYmd(r);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) continue;
    if (!byDay.has(dateRaw)) {
      byDay.set(dateRaw, { minutes: 0, entryIds: [] });
    }
    const bucket = byDay.get(dateRaw);
    bucket.minutes += Math.round(parseTimeToHours(r.timeTracked) * 60);
    const eid = String(r.id || "").trim();
    if (isUuid(eid) && !bucket.entryIds.includes(eid)) {
      bucket.entryIds.push(eid);
    }
  }
  return byDay;
}

/**
 * 수면하기 과제 시간 합계 → 기본 수면 목표 일별 로그 반영 (로컬 저장, KPI 동기화와 동일 타이밍)
 */
export function syncSleepHealthGoalLogsFromTimeLedger() {
  let raw;
  try {
    raw = readKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY);
  } catch (_) {
    return;
  }
  if (!raw) return;

  let prev;
  let data;
  try {
    prev = JSON.parse(raw);
    data = JSON.parse(raw);
  } catch (_) {
    return;
  }

  const healthId = DEFAULT_SLEEP_HEALTH_GOAL_ID;
  const hasSleepGoal = (data.healths || []).some(
    (h) => String(h?.id ?? "") === healthId,
  );
  if (!hasSleepGoal) return;

  const byDay = collectSleepMinutesByDay();
  const activeDates = new Set(byDay.keys());
  const logs = Array.isArray(data.healthGoalLogs) ? [...data.healthGoalLogs] : [];
  let changed = false;

  const kept = [];
  for (const log of logs) {
    const dr = normalizeKpiLogDateYmd(log?.dateRaw || log?.date || "");
    if (
      isSleepLedgerSyncedGoalLog(log, healthId) &&
      dr &&
      !activeDates.has(dr)
    ) {
      changed = true;
      continue;
    }
    kept.push(log);
  }
  const nextLogs = kept;

  for (const [dateRaw, bucket] of byDay) {
    const minutes = bucket.minutes;
    if (!(minutes > 0)) continue;

    const value = minutesToSleepGoalValueHours(minutes);
    const dateDisplay = toDisplayDate(dateRaw);
    const entryIds = bucket.entryIds;

    const idx = nextLogs.findIndex((l) => {
      if (String(l?.healthId ?? "") !== healthId) return false;
      return normalizeKpiLogDateYmd(l?.dateRaw || l?.date || "") === dateRaw;
    });

    if (idx >= 0) {
      const log = nextLogs[idx];
      const before = JSON.stringify({
        v: log.value,
        s: log.healthGoalLogSource,
        e: (log.timeLedgerEntryIds || []).slice().sort(),
        id: log.id,
      });
      log.value = value;
      log.date = dateDisplay;
      log.dateRaw = dateRaw;
      log.healthGoalLogSource = HEALTH_GOAL_LOG_SOURCE_TIME_LEDGER;
      log.timeLedgerEntryIds = entryIds;
      if (!String(log.id || "").startsWith(SLEEP_LEDGER_LOG_ID_PREFIX)) {
        log.id = sleepLedgerLogId(dateRaw);
      }
      const after = JSON.stringify({
        v: log.value,
        s: log.healthGoalLogSource,
        e: (log.timeLedgerEntryIds || []).slice().sort(),
        id: log.id,
      });
      if (before !== after) changed = true;
    } else {
      nextLogs.push({
        id: sleepLedgerLogId(dateRaw),
        healthId,
        date: dateDisplay,
        dateRaw,
        value,
        memo: "",
        healthGoalLogSource: HEALTH_GOAL_LOG_SOURCE_TIME_LEDGER,
        timeLedgerEntryIds: entryIds,
      });
      changed = true;
    }
  }

  if (!changed) return;
  data.healthGoalLogs = nextLogs;
  stampAndPersistKpiMap(HEALTH_KPI_MAP_STORAGE_KEY, prev, data);
}
