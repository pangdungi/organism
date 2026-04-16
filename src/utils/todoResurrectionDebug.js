/**
 * 할일이 삭제 후 다시 늘어나는(서버 pull·sync) 경로 추적용 로그.
 * 기본 비활성 — 켜기:
 *   localStorage.setItem('debug_todo_resurrection', '1')
 *   또는 window.__TODO_RESURRECTION_DEBUG__ = true
 * 끄기: localStorage.removeItem('debug_todo_resurrection') 후 새로고침
 *
 * 콘솔 필터: [할일부활추적]
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

/**
 * @param {string} tag
 * @param {Record<string, unknown>} [detail]
 */
export function logTodoResurrection(tag, detail = {}) {
  if (!todoResurrectionDebugEnabled()) return;
  try {
    console.info("[할일부활추적]", tag, { t: Date.now(), ...detail });
  } catch (_) {
    console.info("[할일부활추적]", tag);
  }
}

/** sync·schedule·flush 등 ‘누가 불렀는지’ 볼 때 */
export function logTodoResurrectionWithStack(tag, detail = {}, maxLines = 8) {
  if (!todoResurrectionDebugEnabled()) return;
  logTodoResurrection(tag, { ...detail, 호출스택요약: shortStack(maxLines) });
}
