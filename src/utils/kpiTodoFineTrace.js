/**
 * KPI 할일 미세 단계 추적 — 동작/로직 변경 없음.
 * 브라우저가 노란색·「이 경고 이해하기」로 보이게 할 수 있는데, 오류가 아니라 추적용 로그입니다.
 *
 * 켜짐(하나만 만족):
 * - `npm run dev`(Vite 개발 모드)에서는 기본 켜짐
 * - 배포: 콘솔에서 `localStorage.setItem('kpi_todo_fine','1')` 후 새로고침
 * - 또는 `window.__KPI_TODO_FINE__ = true` (새로고침 없이 다음 동작부터)
 *
 * 콘솔 필터에 `KPI-TODO-STEP` 입력하면 걸러 보기 쉬움.
 */

const LS_KEY = "kpi_todo_fine";

let _seq = 0;

export function kpiTodoFineTraceEnabled() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) return true;
    if (typeof window !== "undefined" && window.__KPI_TODO_FINE__ === true) return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY) === "1")
      return true;
  } catch (_) {}
  return false;
}

function compact(x, maxDepth = 2, depth = 0) {
  if (depth > maxDepth) return "[…]";
  if (x == null) return x;
  if (typeof x !== "object") return x;
  if (Array.isArray(x)) {
    if (x.length > 25) return x.slice(0, 25).map((y) => compact(y, maxDepth, depth + 1)).concat(`…+${x.length - 25}`);
    return x.map((y) => compact(y, maxDepth, depth + 1));
  }
  const out = {};
  let n = 0;
  for (const k of Object.keys(x)) {
    if (n++ > 40) {
      out["…"] = `+${Object.keys(x).length - 40} keys`;
      break;
    }
    try {
      out[k] = compact(x[k], maxDepth, depth + 1);
    } catch (_) {
      out[k] = "[unserializable]";
    }
  }
  return out;
}

/**
 * @param {string} step 짧은 단계 이름
 * @param {Record<string, unknown>} [detail]
 */
export function kpiTodoFineTrace(step, detail) {
  if (!kpiTodoFineTraceEnabled()) return;
  try {
    const n = ++_seq;
    const label = `[KPI-TODO-STEP #${n}]`;
    if (detail === undefined) {
      console.warn(label, step);
      return;
    }
    const d =
      detail != null && typeof detail === "object" && !Array.isArray(detail)
        ? compact(detail)
        : detail;
    console.warn(label, step, d);
  } catch (_) {
    console.warn("[KPI-TODO-STEP]", step, "(detail stringify 실패)");
  }
}
