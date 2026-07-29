/**
 * 연간 시간 레포트 — KPI 목표 달성 요약
 * (꿈·시급·행복·건강 맵 localStorage 기준)
 */

import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { DEFAULT_CHORE_TASK_KPI_ID } from "./defaultKpiIconIds.js";
import {
  KPI_PROGRESS_STATUS,
  resolveKpiProgressStatus,
} from "./kpiProgressStatus.js";
import {
  computeKpiProgress,
  enrichKpiProgressWithHabitStreak,
  resolveKpiGoalMode,
} from "./kpiTimeUnitKpi.js";
import { normalizeKpiTaskCompletionEvents } from "./kpiTaskCompletionEvents.js";
import {
  beginKpiTimeLedgerReportCache,
  endKpiTimeLedgerReportCache,
  formatMinutesToKoreanHm,
} from "./timeKpiSync.js";

const DOMAINS = [
  {
    storageKey: "kpi-dream-map",
    category: "꿈",
    categoryId: "dream",
  },
  {
    storageKey: "kpi-sideincome-paths",
    category: "시급",
    categoryId: "sideincome",
  },
  {
    storageKey: "kpi-happiness-map",
    category: "행복",
    categoryId: "happiness",
  },
  {
    storageKey: "kpi-health-map",
    category: "건강",
    categoryId: "health",
  },
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
  if (at.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(at.slice(0, 10))) {
    return at.slice(0, 10);
  }
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return "";
  return toDateKey(new Date(parsed));
}

function logDayYmd(log) {
  const raw = String(log?.date || log?.dateRaw || "").trim();
  const ymd = normYmd(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  return "";
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

function countEventsInRange(eventsForKpi, startYmd, endYmd) {
  let n = 0;
  for (const e of eventsForKpi || []) {
    const day = eventDayYmd(e.completedAt);
    if (!day || day < startYmd || day > endYmd) continue;
    n += 1;
  }
  return n;
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

function formatNum(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function buildMetaLine(kpi, progress, mode, yearCtx) {
  if (isChoreKpi(kpi)) {
    return `올해 ${formatNum(yearCtx.choreYearCount)}건 처리`;
  }
  if (mode === "task") {
    const done = Number(progress.taskDoneCount) || 0;
    const total = Number(progress.taskTotalCount) || 0;
    const yearDone = yearCtx.taskYearCount;
    if (yearDone > 0 && yearDone !== done) {
      return `올해 완료 ${formatNum(yearDone)} · 누적 ${formatNum(done)}/${formatNum(total)}`;
    }
    return total > 0
      ? `${formatNum(done)}/${formatNum(total)} 완료`
      : `완료 ${formatNum(done)}`;
  }
  if (mode === "time") {
    const cur = formatMinutesToKoreanHm(Number(progress.accumulatedMins) || 0);
    const tgt = formatMinutesToKoreanHm(Number(progress.targetMins) || 0);
    return `${cur} / ${tgt}`;
  }
  if (mode === "habit") {
    const kept = yearCtx.habitDaysInYear;
    const streak = Math.max(0, Number(progress.habitStreak) || 0);
    const parts = [`올해 ${formatNum(kept)}일 지킴`];
    if (streak > 0) parts.push(`연속 ${streak}일`);
    return parts.join(" · ");
  }
  const unit = String(kpi.unit || "").trim();
  const unitSuffix = unit ? ` ${unit}` : "";
  return `${formatNum(progress.currentVal)}${unitSuffix} / ${formatNum(progress.targetVal)}${unitSuffix}`;
}

function kpiOverlapsYear(kpi, yearCtx) {
  const start = normYmd(kpi?.targetStartDate);
  const end = normYmd(kpi?.targetDeadline);
  const y0 = yearCtx.startYmd;
  const y1 = yearCtx.endYmd;
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && start > y1) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(end) && end < y0) return false;
  return true;
}

/**
 * @param {{ start: string, end: string }} range
 * @param {object[]} [ledgerRows] 마운트에서 이미 읽은 가계부(있으면 재로드 생략)
 */
export function buildYearKpiGoalReportSnapshot(range, ledgerRows) {
  const startYmd = normYmd(range?.start);
  const endYmd = normYmd(range?.end || range?.start);
  const empty = {
    hasData: false,
    startYmd,
    endYmd,
    summary: {
      totalKpis: 0,
      completedCount: 0,
      activeCount: 0,
      pendingCount: 0,
      avgProgressPct: 0,
      choreYearCount: 0,
      taskCompletionsYear: 0,
      habitDaysTotal: 0,
      logCountYear: 0,
    },
    completedItems: [],
    progressItems: [],
    byCategory: [],
  };

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startYmd) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endYmd)
  ) {
    return empty;
  }

  /** @type {object[]} */
  const progressItems = [];
  let choreYearCount = 0;
  let taskCompletionsYear = 0;
  let habitDaysTotal = 0;
  let logCountYear = 0;
  /** @type {Map<string, { category: string, categoryId: string, total: number, completed: number, avgSum: number }>} */
  const catAgg = new Map();

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

      const yearCtxBase = { startYmd, endYmd };
      if (!kpiOverlapsYear(kpi, yearCtxBase)) continue;

      const progress = progressForKpi(kpi, data, deps);
      const status = resolveKpiProgressStatus(kpi, progress);
      const mode = resolveKpiGoalMode(kpi);
      const chore = isChoreKpi(kpi);
      const taskYearCount = countEventsInRange(
        eventsByKpi.get(id) || [],
        startYmd,
        endYmd,
      );
      const habitDaysInYear = countHabitDaysInRange(progress, startYmd, endYmd);
      const logsInYear = countLogsInRange(
        logsByKpi.get(id) || [],
        startYmd,
        endYmd,
      );

      if (chore) choreYearCount += taskYearCount;
      if (mode === "task") taskCompletionsYear += taskYearCount;
      habitDaysTotal += habitDaysInYear;
      logCountYear += logsInYear;

      const hasYearActivity =
        taskYearCount > 0 || habitDaysInYear > 0 || logsInYear > 0;
      if (
        status === KPI_PROGRESS_STATUS.PENDING &&
        !hasYearActivity &&
        !(Number(progress.progress) > 0)
      ) {
        continue;
      }

      const pct = Math.max(
        0,
        Math.min(100, Math.round(Number(progress.progress) || 0)),
      );
      const completed =
        status === KPI_PROGRESS_STATUS.COMPLETED ||
        (!chore && !!progress.isCompleted) ||
        (!chore && pct >= 100);

      const yearCtx = {
        choreYearCount: chore ? taskYearCount : 0,
        taskYearCount,
        habitDaysInYear,
      };

      progressItems.push({
        id,
        name,
        category: domain.category,
        categoryId: domain.categoryId,
        mode,
        modeLabel: MODE_LABEL[mode] || mode,
        status,
        progressPct: chore ? null : pct,
        completed,
        isChore: chore,
        meta: buildMetaLine(kpi, progress, mode, yearCtx),
        yearTaskCount: taskYearCount,
        habitDaysInYear,
      });

      const cat = catAgg.get(domain.categoryId) || {
        category: domain.category,
        categoryId: domain.categoryId,
        total: 0,
        completed: 0,
        avgSum: 0,
      };
      cat.total += 1;
      if (completed) cat.completed += 1;
      if (!chore) cat.avgSum += pct;
      catAgg.set(domain.categoryId, cat);
    }
  }

  progressItems.sort(
    (a, b) =>
      Number(b.completed) - Number(a.completed) ||
      (b.progressPct ?? -1) - (a.progressPct ?? -1) ||
      b.yearTaskCount - a.yearTaskCount ||
      a.name.localeCompare(b.name, "ko"),
  );

  const completedItems = progressItems.filter((x) => x.completed);
  const scored = progressItems.filter((x) => x.progressPct != null);
  const avgProgressPct =
    scored.length > 0
      ? Math.round(
          scored.reduce((a, x) => a + (x.progressPct || 0), 0) / scored.length,
        )
      : 0;

  const byCategory = [...catAgg.values()]
    .map((c) => ({
      category: c.category,
      categoryId: c.categoryId,
      total: c.total,
      completed: c.completed,
      avgProgressPct:
        c.total > 0 ? Math.round(c.avgSum / Math.max(1, c.total)) : 0,
    }))
    .sort((a, b) => b.completed - a.completed || a.category.localeCompare(b.category, "ko"));

  return {
    hasData: progressItems.length > 0 || choreYearCount > 0,
    startYmd,
    endYmd,
    summary: {
      totalKpis: progressItems.length,
      completedCount: completedItems.length,
      activeCount: progressItems.filter(
        (x) => x.status === KPI_PROGRESS_STATUS.ACTIVE && !x.completed,
      ).length,
      pendingCount: progressItems.filter(
        (x) => x.status === KPI_PROGRESS_STATUS.PENDING,
      ).length,
      avgProgressPct,
      choreYearCount,
      taskCompletionsYear,
      habitDaysTotal,
      logCountYear,
    },
    completedItems,
    progressItems,
    byCategory,
  };
  } finally {
    endKpiTimeLedgerReportCache();
  }
}
