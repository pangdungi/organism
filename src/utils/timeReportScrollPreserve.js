/** 시간 레포트 세로 스크롤 — remount 후 위치 복원 */

/**
 * @param {HTMLElement | null | undefined} el
 * @param {number} top
 */
export function restoreTimeReportScrollTop(el, top) {
  if (!(el instanceof HTMLElement)) return;
  const t = Math.max(0, Math.round(Number(top) || 0));
  if (t <= 0) return;
  const apply = () => {
    el.scrollTop = t;
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

/** 가로 차트·스와이프 제스처와 겹치지 않게 판별용 */
export const TIME_REPORT_HORIZONTAL_SCROLL_SELECTOR =
  ".lp-tr2-media-compare-cols--scroll, .lp-tr2-sleep-chart-canvas--scroll, .lp-tr2-sleep-quality-trend-canvas--scroll, .lp-tr2-intake-panels--scroll, .lp-tr2-rating-hour-chart-cols";
