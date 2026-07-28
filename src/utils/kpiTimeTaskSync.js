/**
 * 꿈·부수입·행복·건강 KPI → 시간가계부 과제목록 동기화
 * (진행중 KPI만 — 진행전·완료 제외. 기본 KPI 포함)
 */

import {
  HEALTH_KPI_MAP_STORAGE_KEY,
  ensureDefaultHealthMapDefaults,
} from "./healthKpiMapSupabase.js";
import {
  HAPPINESS_KPI_MAP_STORAGE_KEY,
  ensureDefaultHappinessKpis,
  flattenHappinessMapForKpiOnlyTab,
} from "./happinessKpiMapSupabase.js";
import { DREAM_KPI_MAP_STORAGE_KEY } from "./dreamKpiMapSupabase.js";
import { SIDEINCOME_KPI_MAP_STORAGE_KEY } from "./sideincomeKpiMapSupabase.js";
import {
  readKpiMapScopedStorageRaw,
  writeKpiMapScopedStorageRaw,
} from "./kpiMapLocalStorage.js";
import {
  kpiTimeTaskEnsure,
  kpiTimeTaskRemove,
  patchKpiLinkedTasksFromKpiMaps,
} from "./timeTaskOptionsModel.js";
import { isKpiEligibleForTimeTaskList } from "./kpiProgressStatus.js";

/** @returns {boolean} kpiTaskSync 저장이 필요하면 true */
export function ensureHealthKpiTimeTasksForData(data) {
  return ensureKpiTimeTasksForData(data, "health");
}

/** @returns {boolean} kpiTaskSync 저장이 필요하면 true */
export function ensureHappinessKpiTimeTasksForData(data) {
  return ensureKpiTimeTasksForData(data, "happiness");
}

function pruneStaleKpiTaskSyncEntries(data) {
  if (!data || typeof data !== "object") return false;
  data.kpiTaskSync = data.kpiTaskSync || {};
  const active = new Set(
    (data.kpis || [])
      .map((k) => String(k?.id || "").trim())
      .filter(Boolean),
  );
  let changed = false;
  for (const kid of Object.keys(data.kpiTaskSync)) {
    if (!active.has(String(kid || "").trim())) {
      delete data.kpiTaskSync[kid];
      changed = true;
    }
  }
  return changed;
}

function ensureKpiTimeTasksForData(data, category) {
  if (!data || typeof data !== "object") return false;
  let syncChanged = pruneStaleKpiTaskSyncEntries(data);
  for (const kpi of data.kpis || []) {
    const id = String(kpi?.id || "").trim();
    const name = String(kpi?.name || "").trim();
    if (!id || !name) continue;
    /* 진행전·완료는 과제목록에서 제외 */
    if (!isKpiEligibleForTimeTaskList(kpi)) {
      if (data.kpiTaskSync?.[id]) {
        delete data.kpiTaskSync[id];
        syncChanged = true;
      }
      kpiTimeTaskRemove(kpi);
      continue;
    }
    if (!data.kpiTaskSync[id]) {
      data.kpiTaskSync[id] = name;
      syncChanged = true;
    }
    kpiTimeTaskEnsure(kpi, category);
  }
  return syncChanged;
}

function loadMapAndEnsureTasks(storageKey, category, normalize) {
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    const data = normalize(parsed);
    const syncChanged = ensureKpiTimeTasksForData(data, category);
    const defaultsChanged =
      JSON.stringify(data.kpis?.map((k) => k.id) || []) !==
      JSON.stringify(parsed.kpis?.map((k) => k.id) || []);
    if (syncChanged || defaultsChanged) {
      writeKpiMapScopedStorageRaw(storageKey, JSON.stringify(data));
    }
  } catch (_) {}
}

/** localStorage·기본 KPI 기준으로 모든 KPI 과제를 과제목록에 반영 */
export function ensureAllKpiTimeTasksFromStorage() {
  loadMapAndEnsureTasks(
    HEALTH_KPI_MAP_STORAGE_KEY,
    "health",
    (p) =>
      ensureDefaultHealthMapDefaults({
        healths: p.healths || [],
        healthGoalLogs: p.healthGoalLogs || [],
        kpis: p.kpis || [],
        kpiLogs: p.kpiLogs || [],
        kpiTodos: p.kpiTodos || [],
        kpiDailyRepeatTodos: p.kpiDailyRepeatTodos || [],
        kpiOrder: p.kpiOrder || {},
        kpiTaskSync: p.kpiTaskSync || {},
        deletedRefs: p.deletedRefs,
      }),
  );
  loadMapAndEnsureTasks(
    HAPPINESS_KPI_MAP_STORAGE_KEY,
    "happiness",
    (p) => ensureDefaultHappinessKpis(flattenHappinessMapForKpiOnlyTab(p)),
  );
  loadMapAndEnsureTasks(DREAM_KPI_MAP_STORAGE_KEY, "dream", (p) => ({
    ...p,
    kpis: Array.isArray(p.kpis) ? p.kpis : [],
    kpiTaskSync: p.kpiTaskSync || {},
  }));
  loadMapAndEnsureTasks(SIDEINCOME_KPI_MAP_STORAGE_KEY, "sideincome", (p) => ({
    ...p,
    kpis: Array.isArray(p.kpis) ? p.kpis : [],
    kpiTaskSync: p.kpiTaskSync || {},
  }));
  patchKpiLinkedTasksFromKpiMaps();
}

/** @deprecated ensureAllKpiTimeTasksFromStorage */
export function ensureHealthKpiTimeTasksFromStorage() {
  ensureAllKpiTimeTasksFromStorage();
}
