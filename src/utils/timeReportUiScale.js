/**
 * 시간 레포트 차트(SVG) 글자 — 레포트 칸(.lp-tr2-root) 너비 기준.
 * 뷰포트가 넓어도 홈 3분할처럼 칸이 좁으면 키우지 않음.
 * @param {number} base
 * @returns {number}
 */
export function tr2SvgFontSize(base) {
  const n = Number(base);
  if (!Number.isFinite(n) || n <= 0) return 10;
  let w = 0;
  if (typeof document !== "undefined") {
    const el = document.querySelector(".lp-tr2-root");
    w = el?.clientWidth || 0;
  }
  if (!(w > 0) && typeof window !== "undefined") {
    w = window.innerWidth || 0;
  }
  if (w >= 1100) return Math.round(n * 1.5 * 10) / 10;
  if (w >= 768) return Math.round(n * 1.3 * 10) / 10;
  return n;
}
