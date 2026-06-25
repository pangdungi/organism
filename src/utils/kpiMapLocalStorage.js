/**
 * 꿈/부수입/행복/건강 KPI 맵 localStorage — 계정별 스코프
 * (timeTaskOptionsModel ↔ timeKpiSync 순환 import 방지)
 */

import {
  getScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";

export const KPI_MAP_STORAGE_KEYS = [
  "kpi-dream-map",
  "kpi-sideincome-paths",
  "kpi-happiness-map",
  "kpi-health-map",
];

export function readKpiMapScopedStorageRaw(storageKey) {
  return getScopedLocalStorageItem(storageKey);
}

export function writeKpiMapScopedStorageRaw(storageKey, raw) {
  setScopedLocalStorageItem(storageKey, raw);
}

/** KPI id가 현재 맵 kpis 배열에 있는지 */
export function isActiveKpiId(kpiId) {
  const id = String(kpiId || "").trim();
  if (!id) return false;
  return getActiveKpiTaskKeepersById().has(id);
}

/** KPI 맵 pull·소프트 갱신 — localStorage 원문 지문(변경 없으면 카드 재그림 생략) */
export function readKpiMapLocalStorageSignature(storageKey) {
  try {
    return readKpiMapScopedStorageRaw(storageKey) || "";
  } catch (_) {
    return "";
  }
}

/**
 * KPI에서 추가된 과제명 집합 (꿈/부수입/행복/건강)
 */
export function getKpiSyncedTaskNames() {
  const names = new Set();
  for (const { name } of getActiveKpiTaskKeepersById().values()) {
    if (name) names.add(name);
  }
  return names;
}

/** kpiTaskSync 키(kpiId) — 현재 kpis 배열에 있는 id만 */
export function getKpiSyncActiveKpiIds() {
  return new Set(getActiveKpiTaskKeepersById().keys());
}

const KPI_MAP_KEY_TO_LEDGER_CATEGORY = {
  "kpi-dream-map": "dream",
  "kpi-sideincome-paths": "sideincome",
  "kpi-happiness-map": "happiness",
  "kpi-health-map": "health",
};

/** 활성 KPI id → 현재 표시명·시간가계부 category (kpis 배열 기준 — 삭제된 id 제외) */
export function getActiveKpiTaskKeepersById() {
  /** @type {Map<string, { name: string, category: string }>} */
  const out = new Map();
  KPI_MAP_STORAGE_KEYS.forEach((key) => {
    const ledgerCat = KPI_MAP_KEY_TO_LEDGER_CATEGORY[key] || "";
    try {
      const raw = readKpiMapScopedStorageRaw(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const sync = parsed?.kpiTaskSync || {};
      for (const k of parsed?.kpis || []) {
        const id = String(k?.id || "").trim();
        if (!id) continue;
        const name =
          String(k?.name || "").trim() || String(sync[id] || "").trim();
        if (!name) continue;
        out.set(id, { name, category: ledgerCat });
      }
    } catch (_) {}
  });
  return out;
}
