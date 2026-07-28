/**
 * 목표 트랙커 — 시급·건강·행복의 진행중 KPI 수집 + 진행률
 */

import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { filterKpisByProgressStatus } from "./kpiProgressStatus.js";
import {
  buildKpiCardTimePresentation,
  computeKpiProgress,
  enrichKpiProgressWithHabitStreak,
} from "./kpiTimeUnitKpi.js";
import { kpiGanttProgressPctFromPresentation } from "./kpiActiveGanttView.js";

const DOMAINS = [
  {
    storageKey: "kpi-sideincome-paths",
    category: "시급",
    categoryId: "sideincome",
  },
  {
    storageKey: "kpi-health-map",
    category: "건강",
    categoryId: "health",
  },
  {
    storageKey: "kpi-happiness-map",
    category: "행복",
    categoryId: "happiness",
  },
];

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

function progressDepsForMap(data) {
  const logs = data.kpiLogs || [];
  const todos = data.kpiTodos || [];
  const events = data.kpiTaskCompletionEvents || [];
  return {
    getAllKpiLogs: () => logs,
    getKpiTodos: (kpiId) =>
      todos.filter((t) => String(t?.kpiId || "") === String(kpiId || "")),
    getKpiTaskCompletionEvents: (kpiId) =>
      events.filter((e) => String(e?.kpiId || "") === String(kpiId || "")),
    parseNum,
    toDateKey,
  };
}

function progressForKpi(kpi, data) {
  const deps = progressDepsForMap(data);
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

/**
 * @returns {{ kpis: object[], getProgressPct: (kpi: object) => number }}
 */
export function collectGoalTrackerActiveKpis() {
  const kpis = [];
  const dataById = new Map();

  for (const domain of DOMAINS) {
    const data = loadMap(domain.storageKey);
    const list = Array.isArray(data.kpis) ? data.kpis : [];
    const active = filterKpisByProgressStatus(list, "active", (kpi) =>
      progressForKpi(kpi, data),
    );
    for (const kpi of active) {
      const id = String(kpi?.id || "").trim();
      if (!id) continue;
      const row = {
        ...kpi,
        __goalTrackerCategory: domain.category,
        __goalTrackerCategoryId: domain.categoryId,
      };
      kpis.push(row);
      dataById.set(id, data);
    }
  }

  const formatNum = (n) =>
    n == null || Number.isNaN(n)
      ? "—"
      : String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  function getProgressPct(kpi) {
    const id = String(kpi?.id || "").trim();
    const data = dataById.get(id) || {};
    const progressResult = progressForKpi(kpi, data);
    const presentation = buildKpiCardTimePresentation(
      kpi,
      progressResult,
      formatNum,
    );
    return kpiGanttProgressPctFromPresentation(presentation, progressResult);
  }

  return { kpis, getProgressPct };
}
