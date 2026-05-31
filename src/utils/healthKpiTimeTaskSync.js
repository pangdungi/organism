/**
 * 건강 KPI → 시간가계부 과제설정 동기화
 * (기본 KPI 자동 추가 시 kpiTaskSync·과제 행이 비는 경우 보정)
 */

import {
  HEALTH_KPI_MAP_STORAGE_KEY,
  ensureDefaultHealthMapDefaults,
} from "./healthKpiMapSupabase.js";
import {
  readKpiMapScopedStorageRaw,
  writeKpiMapScopedStorageRaw,
} from "./kpiMapLocalStorage.js";
import {
  kpiTimeTaskEnsure,
  patchKpiLinkedTasksFromKpiMaps,
} from "./timeTaskOptionsModel.js";

/** @returns {boolean} kpiTaskSync 저장이 필요하면 true */
export function ensureHealthKpiTimeTasksForData(data) {
  if (!data || typeof data !== "object") return false;
  let syncChanged = false;
  data.kpiTaskSync = data.kpiTaskSync || {};
  for (const kpi of data.kpis || []) {
    const id = String(kpi?.id || "").trim();
    const name = String(kpi?.name || "").trim();
    if (!id || !name) continue;
    if (!data.kpiTaskSync[id]) {
      data.kpiTaskSync[id] = name;
      syncChanged = true;
    }
    kpiTimeTaskEnsure(kpi, "health");
  }
  return syncChanged;
}

/** localStorage 기준으로 건강 KPI 과제 연동 보정 (과제설정·클라우드 pull 직후 등) */
export function ensureHealthKpiTimeTasksFromStorage() {
  try {
    const raw = readKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const data = ensureDefaultHealthMapDefaults({
      healths: parsed.healths || [],
      healthGoalLogs: parsed.healthGoalLogs || [],
      kpis: parsed.kpis || [],
      kpiLogs: parsed.kpiLogs || [],
      kpiTodos: parsed.kpiTodos || [],
      kpiDailyRepeatTodos: parsed.kpiDailyRepeatTodos || [],
      kpiOrder: parsed.kpiOrder || {},
      kpiTaskSync: parsed.kpiTaskSync || {},
      deletedRefs: parsed.deletedRefs,
    });
    const syncChanged = ensureHealthKpiTimeTasksForData(data);
    const defaultsChanged =
      JSON.stringify(data.kpis?.map((k) => k.id) || []) !==
      JSON.stringify(parsed.kpis?.map((k) => k.id) || []);
    if (syncChanged || defaultsChanged) {
      writeKpiMapScopedStorageRaw(
        HEALTH_KPI_MAP_STORAGE_KEY,
        JSON.stringify(data),
      );
    }
    patchKpiLinkedTasksFromKpiMaps();
  } catch (_) {}
}
