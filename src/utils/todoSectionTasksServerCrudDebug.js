/**
 * 할 일 섹션 — Supabase `calendar_section_tasks` 실제 CRUD 만 콘솔에 표시.
 * 세션 메모리·DOM 저장과 구분하려면 이 로그만 보면 됨.
 *
 * 켜기: localStorage.setItem('debug_todo_server_crud','1') 후 새로고침
 * 또는: window.__TODO_SERVER_CRUD_DEBUG__ = true
 * 끄기: localStorage.removeItem('debug_todo_server_crud')
 *
 * 콘솔 필터: [할일·서버CRUD]
 */

const LS_KEY = "debug_todo_server_crud";

export function todoServerCrudDebugEnabled() {
  try {
    if (typeof window !== "undefined" && window.__TODO_SERVER_CRUD_DEBUG__ === true) return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY) === "1") return true;
  } catch (_) {}
  return false;
}

/**
 * @param {"UPSERT"|"DELETE"|"SKIP"|"PULL"} op
 * @param {Record<string, unknown>} detail
 */
export function logTodoServerCrud(op, detail = {}) {
  if (!todoServerCrudDebugEnabled()) return;
  try {
    console.info("[할일·서버CRUD]", op, {
      테이블: "calendar_section_tasks",
      ...detail,
      t: Date.now(),
    });
  } catch (_) {
    console.info("[할일·서버CRUD]", op);
  }
}
