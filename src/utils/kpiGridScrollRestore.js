/**
 * KPI 카드 가로 스크롤(.dream-kpi-grid) 유지 — renderKpiList가 contentWrap을 비울 때 스크롤이 0으로 초기화되는 것 방지
 */

export function readKpiGridScrollToRestore(
  contentWrap,
  kpiFilter,
  scopeId,
  prevFilter,
  prevScopeId,
) {
  const g = contentWrap.querySelector(".dream-kpi-grid");
  if (
    g == null ||
    prevFilter !== kpiFilter ||
    prevScopeId !== scopeId ||
    scopeId == null
  ) {
    return null;
  }
  return g.scrollLeft;
}

export function applyKpiGridScrollRestore(contentWrap, savedLeft) {
  if (savedLeft == null || savedLeft <= 0) return;
  const g = contentWrap.querySelector(".dream-kpi-grid");
  if (!g) return;
  const max = Math.max(0, g.scrollWidth - g.clientWidth);
  const t = Math.min(savedLeft, max);
  g.scrollLeft = t;
  requestAnimationFrame(() => {
    g.scrollLeft = t;
  });
}
