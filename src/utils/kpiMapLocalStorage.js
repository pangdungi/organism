/**
 * 꿈/부수입/행복/건강 KPI 맵 localStorage 키 — timeKpiSync·과제 옵션 등에서 공통 사용
 * (timeTaskOptionsModel ↔ timeKpiSync 순환 import 방지)
 */

export const KPI_MAP_STORAGE_KEYS = [
  "kpi-dream-map",
  "kpi-sideincome-paths",
  "kpi-happiness-map",
  "kpi-health-map",
];

/**
 * KPI에서 추가된 과제명 집합 (꿈/부수입/행복/건강)
 */
export function getKpiSyncedTaskNames() {
  const names = new Set();
  KPI_MAP_STORAGE_KEYS.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
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
      const raw = localStorage.getItem(key);
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
