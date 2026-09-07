/**
 * 월간 시간 레포트 — 조회 기간 KPI별 진행
 * (꿈·시급·행복·건강 맵 + 시간기록·할일 완료)
 */

import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { DEFAULT_CHORE_TASK_KPI_ID } from "./defaultKpiIconIds.js";
import {
  KPI_PROGRESS_STATUS,
  getKpiProgressStatus,
  resolveKpiProgressStatus,
} from "./kpiProgressStatus.js";
import {
  computeKpiProgress,
  enrichKpiProgressWithHabitStreak,
  resolveKpiGoalMode,
} from "./kpiTimeUnitKpi.js";
import { normalizeKpiTaskCompletionEvents } from "./kpiTaskCompletionEvents.js";
import { isHabitScheduledOnYmd } from "./kpiHabitWeekdays.js";
import { getKpiHabitTrackerStartYmd } from "./kpiHabitTrackerStartDate.js";
import {
  beginKpiTimeLedgerReportCache,
  countCalendarDaysInInclusiveRange,
  endKpiTimeLedgerReportCache,
  getAccumulatedMinutesForKpiIdInDateRange,
  getKpiDailyLedgerSummaries,
  getKpiTargetDateRange,
  parseKpiTargetTimeRequiredToMinutes,
} from "./timeKpiSync.js";

const DOMAINS = [
  { storageKey: "kpi-dream-map", category: "꿈", categoryId: "dream" },
  { storageKey: "kpi-sideincome-paths", category: "시급", categoryId: "sideincome" },
  { storageKey: "kpi-happiness-map", category: "행복", categoryId: "happiness" },
  { storageKey: "kpi-health-map", category: "건강", categoryId: "health" },
];

const MODE_LABEL = {
  time: "시간",
  habit: "습관",
  task: "할일",
  manual: "수치",
};

function loadMap(storageKey) {
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function parseNum(str) {
  const n = parseFloat(String(str || "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function toDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normYmd(s) {
  return String(s || "").replace(/\//g, "-").slice(0, 10);
}

function eventDayYmd(completedAt) {
  const at = String(completedAt || "").trim();
  if (!at) return "";
  const parsed = Date.parse(at);
  if (Number.isFinite(parsed)) return toDateKey(new Date(parsed));
  return todoDayYmd(at);
}

function logDayYmd(log) {
  const raw = String(log?.date || log?.dateRaw || "").trim();
  const ymd = normYmd(raw);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : "";
}

function isChoreKpi(kpi) {
  const id = String(kpi?.id || "").trim();
  if (id === DEFAULT_CHORE_TASK_KPI_ID) return true;
  return String(kpi?.name || "").trim() === "잡무 처리하기";
}

function indexByKpiId(list, pickId) {
  /** @type {Map<string, object[]>} */
  const map = new Map();
  for (const item of list || []) {
    const kid = String(pickId(item) || "").trim();
    if (!kid) continue;
    let arr = map.get(kid);
    if (!arr) {
      arr = [];
      map.set(kid, arr);
    }
    arr.push(item);
  }
  return map;
}

function progressDepsForMap(data) {
  const logs = data.kpiLogs || [];
  const todosByKpi = indexByKpiId(data.kpiTodos || [], (t) => t?.kpiId);
  const eventsByKpi = indexByKpiId(
    normalizeKpiTaskCompletionEvents(data.kpiTaskCompletionEvents || []),
    (e) => e?.kpiId,
  );
  return {
    getAllKpiLogs: () => logs,
    getKpiTodos: (kpiId) => todosByKpi.get(String(kpiId || "").trim()) || [],
    getKpiTaskCompletionEvents: (kpiId) =>
      eventsByKpi.get(String(kpiId || "").trim()) || [],
    parseNum,
    toDateKey,
  };
}

function progressForKpi(kpi, data, deps) {
  let result = computeKpiProgress(kpi, deps);
  if (kpi?.needHabitTracker) {
    result = enrichKpiProgressWithHabitStreak(
      kpi,
      result,
      data.kpiLogs || [],
      toDateKey(),
    );
  }
  return result;
}

function countLogsInRange(logsForKpi, startYmd, endYmd) {
  let n = 0;
  for (const log of logsForKpi || []) {
    const day = logDayYmd(log);
    if (!day || day < startYmd || day > endYmd) continue;
    n += 1;
  }
  return n;
}

function countHabitDaysInRange(progressResult, startYmd, endYmd) {
  const ymds = Array.isArray(progressResult?.habitSuccessYmds)
    ? progressResult.habitSuccessYmds
    : [];
  let n = 0;
  for (const raw of ymds) {
    const day = normYmd(raw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    if (day < startYmd || day > endYmd) continue;
    n += 1;
  }
  return n;
}

function eachYmd(startYmd, endYmd, fn) {
  const s = normYmd(startYmd);
  const e = normYmd(endYmd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || s > e) {
    return;
  }
  let cur = s;
  while (cur <= e) {
    fn(cur);
    const dt = new Date(`${cur}T12:00:00`);
    dt.setDate(dt.getDate() + 1);
    cur = toDateKey(dt);
  }
}

function countScheduledHabitDays(kpi, startYmd, endYmd) {
  const habitStart = getKpiHabitTrackerStartYmd(kpi);
  let n = 0;
  eachYmd(startYmd, endYmd, (ymd) => {
    if (habitStart && ymd < habitStart) return;
    if (isHabitScheduledOnYmd(kpi, ymd)) n += 1;
  });
  return n;
}

function sumMeasureInRange(kpi, logsForKpi, startYmd, endYmd) {
  const byDay = new Map();
  for (const log of logsForKpi || []) {
    const day = logDayYmd(log);
    if (!day || day < startYmd || day > endYmd) continue;
    const v = parseNum(log?.value);
    if (!(v > 0)) continue;
    byDay.set(day, Math.max(byDay.get(day) || 0, v));
  }
  let sum = 0;
  for (const v of byDay.values()) sum += v;
  return sum;
}

function kpiOverlapsRange(kpi, startYmd, endYmd) {
  const start = normYmd(kpi?.targetStartDate);
  const end = normYmd(kpi?.targetDeadline);
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && start > endYmd) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(end) && end < startYmd) return false;
  return true;
}

function clampPct(n) {
  if (n == null || Number.isNaN(Number(n))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(n))));
}

function todoDayYmd(raw) {
  const ymd = normYmd(raw);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : "";
}

function ymdInRange(ymd, startYmd, endYmd) {
  return !!(ymd && ymd >= startYmd && ymd <= endYmd);
}

function collectLedgerMonthTaskHits(kpiId, startYmd, endYmd) {
  const days = getKpiDailyLedgerSummaries(kpiId, "", {
    startYmd,
    endYmd,
  });
  const ids = new Set();
  let sessionCount = 0;
  for (const day of days || []) {
    sessionCount += Array.isArray(day.entryIds) ? day.entryIds.length : 0;
    for (const item of day.habitDailyCompleted || []) {
      const id = String(item?.id || "").trim();
      if (id) ids.add(id);
    }
  }
  return { ids, sessionCount };
}

/**
 * 그달 할당·이행
 * - 할당: 아직 남은 할일 + 그달 마감·시작 + 그달 이행
 * - 이행: 완료 이벤트 + 시간기록에 체크된 할일
 * - 퍼센트: 남은 할일이 있을 때만 (이행만 세면 무조건 100%)
 */
function countTaskMonthStats(kpiId, todos, events, startYmd, endYmd) {
  const openIds = new Set();
  const datedIds = new Set();
  for (const t of todos || []) {
    const id = String(t?.id || "").trim();
    if (!id || !String(t?.text || "").trim()) continue;
    if (!t.completed) openIds.add(id);
    if (
      ymdInRange(todoDayYmd(t.dueDate), startYmd, endYmd) ||
      ymdInRange(todoDayYmd(t.startDate), startYmd, endYmd)
    ) {
      datedIds.add(id);
    }
  }
  const doneIds = new Set();
  for (const e of events || []) {
    const day = eventDayYmd(e.completedAt);
    if (!ymdInRange(day, startYmd, endYmd)) continue;
    const tid = String(e.todoId || "").trim() || String(e.id || "").trim();
    if (!tid || doneIds.has(tid)) continue;
    doneIds.add(tid);
  }
  const ledger = collectLedgerMonthTaskHits(kpiId, startYmd, endYmd);
  for (const id of ledger.ids) doneIds.add(id);

  const assignedIds = new Set([...datedIds, ...openIds, ...doneIds]);
  const hasDenom = openIds.size > 0 || datedIds.size > 0;
  return {
    assigned: assignedIds.size,
    done: doneIds.size,
    open: openIds.size,
    sessionCount: ledger.sessionCount,
    showPct: hasDenom && assignedIds.size > 0,
  };
}

/** 전체 시간 목표를 목표 기간 일수로 나눠, 조회한 달이 가져갈 몫 */
function monthShareOfTotal(kpi, startYmd, endYmd, total) {
  if (!(total > 0)) return 0;
  const { start, end } = getKpiTargetDateRange(kpi);
  if (!start || !end) return total;
  const goalDays = countCalendarDaysInInclusiveRange(start, end);
  if (!(goalDays > 0)) return total;
  const overlapStart = startYmd > start ? startYmd : start;
  const overlapEnd = endYmd < end ? endYmd : end;
  if (overlapStart > overlapEnd) return 0;
  const overlapDays = countCalendarDaysInInclusiveRange(overlapStart, overlapEnd);
  if (!(overlapDays > 0)) return 0;
  return (total * overlapDays) / goalDays;
}

function monthShareTargetMins(kpi, startYmd, endYmd) {
  const targetMins = parseKpiTargetTimeRequiredToMinutes(kpi?.targetTimeRequired);
  return Math.round(monthShareOfTotal(kpi, startYmd, endYmd, targetMins));
}

function latestMeasureInRange(logsForKpi, startYmd, endYmd) {
  let best = null;
  let bestDay = "";
  for (const log of logsForKpi || []) {
    const day = logDayYmd(log);
    if (!ymdInRange(day, startYmd, endYmd)) continue;
    const v = parseNum(log?.value);
    if (!Number.isFinite(v)) continue;
    if (day >= bestDay) {
      bestDay = day;
      best = v;
    }
  }
  return best;
}

function emptySnapshot(startYmd, endYmd) {
  return {
    hasData: false,
    startYmd,
    endYmd,
    summary: {
      totalKpis: 0,
      taskCompletions: 0,
      periodMinutes: 0,
      avgDisplayPct: 0,
    },
    items: [],
  };
}

/**
 * @param {{ start: string, end: string }} range
 * @param {object[]} [ledgerRows]
 */
export function buildMonthKpiProgressSnapshot(range, ledgerRows) {
  const startYmd = normYmd(range?.start);
  const endYmd = normYmd(range?.end || range?.start);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startYmd) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)
  ) {
    return emptySnapshot(startYmd, endYmd);
  }

  const todayYmd = toDateKey();
  const habitCapYmd = todayYmd < endYmd ? todayYmd : endYmd;
  /** @type {object[]} */
  const items = [];
  let taskCompletions = 0;
  let periodMinutesTotal = 0;

  beginKpiTimeLedgerReportCache(ledgerRows);
  try {
    for (const domain of DOMAINS) {
      const data = loadMap(domain.storageKey);
      const list = Array.isArray(data.kpis) ? data.kpis : [];
      const deps = progressDepsForMap(data);
      const eventsByKpi = indexByKpiId(
        normalizeKpiTaskCompletionEvents(data.kpiTaskCompletionEvents || []),
        (e) => e?.kpiId,
      );
      const logsByKpi = indexByKpiId(data.kpiLogs || [], (l) => l?.kpiId);

      for (const kpi of list) {
        const id = String(kpi?.id || "").trim();
        const name = String(kpi?.name || "").trim();
        if (!id || !name) continue;
        if (!kpiOverlapsRange(kpi, startYmd, endYmd)) continue;

        const progress = progressForKpi(kpi, data, deps);
        if (getKpiProgressStatus(kpi) === KPI_PROGRESS_STATUS.PENDING) {
          continue;
        }
        if (
          resolveKpiProgressStatus(kpi, progress) !== KPI_PROGRESS_STATUS.ACTIVE
        ) {
          continue;
        }
        const habitStart = getKpiHabitTrackerStartYmd(kpi);
        if (
          /^\d{4}-\d{2}-\d{2}$/.test(habitStart) &&
          habitStart > endYmd
        ) {
          continue;
        }
        const mode = resolveKpiGoalMode(kpi);
        const chore = isChoreKpi(kpi);
        const taskMonth = countTaskMonthStats(
          id,
          deps.getKpiTodos(id),
          eventsByKpi.get(id) || [],
          startYmd,
          endYmd,
        );
        const habitDays = countHabitDaysInRange(progress, startYmd, habitCapYmd);
        const logsInRange = countLogsInRange(
          logsByKpi.get(id) || [],
          startYmd,
          endYmd,
        );
        const periodMins = getAccumulatedMinutesForKpiIdInDateRange(
          id,
          startYmd,
          endYmd,
        );
        const periodMeasure = sumMeasureInRange(
          kpi,
          logsByKpi.get(id) || [],
          startYmd,
          endYmd,
        );
        const hasPeriodActivity =
          taskMonth.assigned > 0 ||
          taskMonth.done > 0 ||
          habitDays > 0 ||
          logsInRange > 0 ||
          periodMins > 0 ||
          periodMeasure > 0;
        if (!hasPeriodActivity) continue;

        const scheduledDays =
          mode === "habit" ? countScheduledHabitDays(kpi, startYmd, habitCapYmd) : 0;
        let paceMins =
          mode === "time" ? monthShareTargetMins(kpi, startYmd, endYmd) : 0;
        const unit = String(kpi.unit || "").trim();
        const lowerBetter = !!progress.lowerBetter;
        let measureNow = periodMeasure;
        let measureTarget = 0;
        if (mode === "manual") {
          const fullTarget = Number(progress.targetVal) || 0;
          measureTarget = monthShareOfTotal(kpi, startYmd, endYmd, fullTarget);
          if (lowerBetter) {
            const latest = latestMeasureInRange(
              logsByKpi.get(id) || [],
              startYmd,
              endYmd,
            );
            if (latest != null) measureNow = latest;
          }
        }

        let displayPct = null;
        let remainPct = null;
        if (chore) {
          displayPct = null;
        } else if (mode === "time") {
          if (paceMins > 0) {
            displayPct = clampPct((periodMins / paceMins) * 100);
            remainPct = clampPct(100 - displayPct);
          }
        } else if (mode === "manual") {
          if (lowerBetter && measureNow != null && measureTarget >= 0) {
            displayPct =
              measureTarget === 0
                ? measureNow <= 0
                  ? 100
                  : 0
                : clampPct((measureTarget / Math.max(measureNow, 1e-9)) * 100);
            remainPct = clampPct(100 - displayPct);
          } else if (measureTarget > 0) {
            displayPct = clampPct((measureNow / measureTarget) * 100);
            remainPct = clampPct(100 - displayPct);
          }
        } else if (mode === "habit") {
          displayPct =
            scheduledDays > 0 ? clampPct((habitDays / scheduledDays) * 100) : null;
        } else if (mode === "task") {
          if (taskMonth.showPct) {
            displayPct = clampPct((taskMonth.done / taskMonth.assigned) * 100);
            remainPct = clampPct(100 - displayPct);
          }
        }

        if (mode === "task" || chore) taskCompletions += taskMonth.done;
        periodMinutesTotal += periodMins;

        items.push({
          id,
          name,
          category: domain.category,
          categoryId: domain.categoryId,
          mode,
          modeLabel: MODE_LABEL[mode] || mode,
          isChore: chore,
          displayPct,
          remainPct,
          periodMins,
          paceMins,
          taskAssigned: taskMonth.assigned,
          taskDone: taskMonth.done,
          taskCount: taskMonth.done,
          habitDays,
          scheduledDays,
          periodMeasure: measureNow,
          measureTarget,
          unit,
          lowerBetter,
        });
      }
    }
  } finally {
    endKpiTimeLedgerReportCache();
  }

  items.sort(
    (a, b) =>
      (b.displayPct ?? -1) - (a.displayPct ?? -1) ||
      b.periodMins - a.periodMins ||
      a.name.localeCompare(b.name, "ko"),
  );

  const scored = items.filter((x) => x.displayPct != null);
  const avgDisplayPct =
    scored.length > 0
      ? Math.round(
          scored.reduce((a, x) => a + (x.displayPct || 0), 0) / scored.length,
        )
      : 0;

  return {
    hasData: items.length > 0,
    startYmd,
    endYmd,
    summary: {
      totalKpis: items.length,
      taskCompletions,
      periodMinutes: periodMinutesTotal,
      avgDisplayPct,
    },
    items,
  };
}
