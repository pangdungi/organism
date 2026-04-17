/**
 * 할일 섹션 저장·서버 동기화 (콘솔 비활성)
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

/** @param {string} _tag @param {Record<string, unknown>} [detail] */
export function todoSectionSyncLog(_tag, detail = {}) {
  if (!todoSectionSyncDebugEnabled()) return;
  void ++_seq;
  void detail;
}

/** persist / schedule 등 호출 스택 포함 */
export function todoSectionSyncLogWithStack(tag, detail = {}) {
  if (!todoSectionSyncDebugEnabled()) return;
  todoSectionSyncLog(tag, { ...detail, 호출스택요약: shortStack(6) });
}
