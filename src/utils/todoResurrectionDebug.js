/**
 * 할일 삭제 후 재등장 경로 (콘솔 비활성)
 */

const LS_KEY = "debug_todo_resurrection";

export function todoResurrectionDebugEnabled() {
  try {
    if (typeof window !== "undefined" && window.__TODO_RESURRECTION_DEBUG__ === true) return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY) === "1") return true;
  } catch (_) {}
  return false;
}

function shortStack(maxLines = 8) {
  try {
    const s = new Error().stack;
    if (!s) return "";
    return s
      .split("\n")
      .slice(2, 2 + maxLines)
      .map((l) => l.trim())
      .join(" → ");
  } catch (_) {
    return "";
  }
}

/** @param {string} _tag @param {Record<string, unknown>} [detail] */
export function logTodoResurrection(_tag, detail = {}) {
  if (!todoResurrectionDebugEnabled()) return;
  void detail;
}

export function logTodoResurrectionWithStack(tag, detail = {}, maxLines = 8) {
  if (!todoResurrectionDebugEnabled()) return;
  logTodoResurrection(tag, { ...detail, 호출스택요약: shortStack(maxLines) });
}
