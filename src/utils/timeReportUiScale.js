/**
 * 시간 레포트 차트(SVG) 글자 — 레포트 칸(.lp-tr2-root) 너비 기준.
 * 뷰포트가 넓어도 홈 3분할처럼 칸이 좁으면 키우지 않음.
 * @param {number} base
 * @returns {number}
 */
export function tr2SvgFontSize(base) {
  const n = Number(base);
  if (!Number.isFinite(n) || n <= 0) return 11;
  let w = 0;
  if (typeof document !== "undefined") {
    const el = document.querySelector(".lp-tr2-root");
    w = el?.clientWidth || 0;
  }
  if (!(w > 0) && typeof window !== "undefined") {
    w = window.innerWidth || 0;
  }
  /* 화면 본문 스케일에 맞춰 SVG 글자도 한 단계 키움 */
  if (w >= 1100) return Math.round(n * 1.55 * 10) / 10;
  if (w >= 768) return Math.round(n * 1.35 * 10) / 10;
  return Math.round(n * 1.08 * 10) / 10;
}
