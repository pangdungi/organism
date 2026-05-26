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
  KPI_MAP_STORAGE_KEYS.forEach((key) => {
    try {
      const raw = readKpiMapScopedStorageRaw(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const sync = parsed?.kpiTaskSync || {};
      const kpis = parsed?.kpis || [];
      const byId = new Map(
        kpis.map((k) => [String(k?.id || "").trim(), k]).filter(([id]) => id),
      );
      Object.keys(sync).forEach((kid) => {
        const id = String(kid || "").trim();
        if (!id) return;
        const row = byId.get(id);
        const n =
          (row && String(row.name || "").trim()) ||
          String(sync[kid] || "").trim();
        if (n) names.add(n);
      });
    } catch (_) {}
  });
  return names;
}

/** kpiTaskSync 키(kpiId) 집합 */
export function getKpiSyncActiveKpiIds() {
  const ids = new Set();
  KPI_MAP_STORAGE_KEYS.forEach((key) => {
    try {
      const raw = readKpiMapScopedStorageRaw(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const sync = parsed?.kpiTaskSync || {};
      Object.keys(sync).forEach((kid) => {
        if (kid && String(kid).trim()) ids.add(String(kid).trim());
      });
    } catch (_) {}
  });
  return ids;
}

const KPI_MAP_KEY_TO_LEDGER_CATEGORY = {
  "kpi-dream-map": "dream",
  "kpi-sideincome-paths": "sideincome",
  "kpi-happiness-map": "happiness",
  "kpi-health-map": "health",
};

/** 활성 KPI id → 현재 표시명·시간가계부 category (이름 변경·중복 정리용) */
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
      const kpis = parsed?.kpis || [];
      const byId = new Map(
        kpis.map((k) => [String(k?.id || "").trim(), k]).filter(([id]) => id),
      );
      Object.keys(sync).forEach((kid) => {
        const id = String(kid || "").trim();
        if (!id) return;
        const row = byId.get(id);
        const name =
          (row && String(row.name || "").trim()) ||
          String(sync[kid] || "").trim();
        if (!name) return;
        out.set(id, { name, category: ledgerCat });
      });
    } catch (_) {}
  });
  return out;
}
