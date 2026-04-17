/**
 * 할 일 섹션 — Supabase `calendar_section_tasks` CRUD (디버그 로그 비활성)
 */

const LS_KEY = "debug_todo_server_crud";

export function todoServerCrudDebugEnabled() {
  try {
    if (typeof window !== "undefined" && window.__TODO_SERVER_CRUD_DEBUG__ === true) return true;
    if (typeof localStorage !== "undefined" && localStorage.getItem(LS_KEY) === "1") return true;
  } catch (_) {}
  return false;
}

/** @param {"UPSERT"|"DELETE"|"SKIP"|"PULL"} _op */
export function logTodoServerCrud(_op, _detail = {}) {}
