/** 시간 레포트 세로 스크롤 — remount 후 위치 복원 */

/**
 * @param {HTMLElement | null | undefined} el
 * @param {number} top
 */
export function restoreTimeReportScrollTop(el, top) {
  if (!(el instanceof HTMLElement)) return;
  const t = Math.max(0, Math.round(Number(top) || 0));
  if (t <= 0) return;
  /* 한 번만 복원 — 연속 rAF로 다시 맞추면 스크롤 중 위로 튕김 */
  el.scrollTop = t;
  requestAnimationFrame(() => {
    if (!(el instanceof HTMLElement) || !el.isConnected) return;
    /* 사용자가 이미 더 내린 경우 덮지 않음 */
    if (el.scrollTop + 2 < t) el.scrollTop = t;
  });
}

/** 가로 차트·스와이프 제스처와 겹치지 않게 판별용 */
export const TIME_REPORT_HORIZONTAL_SCROLL_SELECTOR =
  ".lp-tr2-media-compare-cols--scroll, .lp-tr2-sleep-chart-canvas--scroll, .lp-tr2-sleep-quality-trend-canvas--scroll, .lp-tr2-intake-panels--scroll, .lp-tr2-rating-hour-chart-cols";
