/**
 * 할일/일정(캘린더 섹션 태스크) Supabase pull·hydrate 추적 — 동작 변경 없음.
 * 콘솔 필터: [할일일정-pull]
 *
 * 켜짐(하나만 만족):
 * - Vite 개발 모드(import.meta.env.DEV)
 * - localStorage.setItem('debug_todo_schedule_pull','1') 후 새로고침
 * - window.__TODO_SCHEDULE_PULL_TRACE__ = true
 */

const LS_KEY = "debug_todo_schedule_pull";

let _seq = 0;

export function todoSchedulePullTraceEnabled() {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) return true;
    if (typeof window !== "undefined" && window.__TODO_SCHEDULE_PULL_TRACE__ === true) return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY) === "1") return true;
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
 * @param {string} step
 * @param {Record<string, unknown>} [detail]
 */
export function todoSchedulePullTrace(step, detail) {
  if (!todoSchedulePullTraceEnabled()) return;
  try {
    const n = ++_seq;
    const label = `[할일일정-pull #${n}]`;
    if (detail === undefined) {
      console.info(label, step);
      return;
    }
    const d =
      detail != null && typeof detail === "object" && !Array.isArray(detail)
        ? compact(detail)
        : detail;
    console.info(label, step, d);
  } catch (_) {
    console.info("[할일일정-pull]", step, "(detail 실패)");
  }
}
