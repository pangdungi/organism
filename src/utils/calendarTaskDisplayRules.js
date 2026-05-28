/**
 * 캘린더 할일/일정 표시 — 과거·완료 규칙
 */

/** @param {{ dueDate?: string, startDate?: string }} task */
export function calendarTaskAnchorYmd(task) {
  const t = task && typeof task === "object" ? task : {};
  const due = String(t.dueDate || "").trim().slice(0, 10);
  if (due.length >= 10) return due;
  return String(t.startDate || "").trim().slice(0, 10);
}

/** @param {{ dueDate?: string, startDate?: string }} task @param {string} todayYmd */
export function isPastCalendarTask(task, todayYmd) {
  const anchor = calendarTaskAnchorYmd(task);
  const today = String(todayYmd || "").trim().slice(0, 10);
  if (anchor.length < 10 || today.length < 10) return false;
  return anchor < today;
}
