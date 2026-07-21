import { resolveKpiCardIconSrc } from "./kpiCardIcon.js";
import {
  filterKpisByProgressStatus,
  resolveKpiProgressStatus,
} from "./kpiProgressStatus.js";

/**
 * KPI 목록 카드 — 화면에 보이는 내용 지문.
 * 저장소 원문과 달리 습관 연동 메타만 바뀌면 동일 → pull 후 불필요한 카드 재그림·아이콘 깜빡임 방지.
 *
 * @param {object[]} kpis
 * @param {"pending"|"active"|"completed"|string} kpiFilter
 * @param {(kpi: object) => object} progressFor
 * @param {"dream"|"sideincome"|"happiness"|"health"} ledgerCategory
 */
export function buildKpiListPaintSignature(kpis, kpiFilter, progressFor, ledgerCategory) {
  const listToShow = filterKpisByProgressStatus(kpis, kpiFilter, progressFor);
  const parts = [`filter:${kpiFilter}`, `count:${listToShow.length}`];
  for (const kpi of listToShow) {
    const p = progressFor(kpi);
    const icon = resolveKpiCardIconSrc(kpi, ledgerCategory);
    parts.push(
      [
        kpi.id,
        String(kpi.name || ""),
        icon,
        resolveKpiProgressStatus(kpi, p),
        p.isCompleted ? "1" : "0",
        String(Math.round(Number(p.displayProgress) || 0)),
        String(p.progressText || ""),
      ].join("|"),
    );
  }
  return parts.join("\n");
}
