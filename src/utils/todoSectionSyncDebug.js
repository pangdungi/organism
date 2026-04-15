/**
 * 할일 섹션 저장·서버 동기화 호출 추적 — 동작 변경 없음.
 * 콘솔 필터: [할일동기]
 *
 * 켜짐: localStorage.setItem('debug_todo_section_sync','1') | window.__TODO_SECTION_SYNC_DEBUG__ = true
 */

const LS_KEY = "debug_todo_section_sync";

export function todoSectionSyncDebugEnabled() {
  try {
    if (typeof window !== "undefined" && window.__TODO_SECTION_SYNC_DEBUG__ === true) return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY) === "1") return true;
  } catch (_) {}
  return false;
}

let _seq = 0;

function shortStack(maxLines = 5) {
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
export function todoSectionSyncLog(tag, detail = {}) {
  if (!todoSectionSyncDebugEnabled()) return;
  try {
    const n = ++_seq;
    console.info(`[할일동기 #${n}]`, tag, { t: Date.now(), ...detail });
  } catch (_) {
    console.info("[할일동기]", tag);
  }
}

/** persist / schedule 등 ‘누가 불렀는지’ 볼 때만 — 스택 포함 */
export function todoSectionSyncLogWithStack(tag, detail = {}) {
  if (!todoSectionSyncDebugEnabled()) return;
  todoSectionSyncLog(tag, { ...detail, 호출스택요약: shortStack(6) });
}
