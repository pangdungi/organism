/**
 * 할일 목록 — 일정(schedule) 표시·완료 규칙
 * - 과거 일정: 기본 목록에서 숨김, 검색 중에는 매칭 시 표시
 * - 일괄 완료 제거·서버 DELETE: schedule 행은 제외(수정 모달 삭제만)
 */

/** @param {string} ymd */
export function isYmdBeforeToday(ymd, todayYmd) {
  const d = String(ymd || "").trim().slice(0, 10);
  const t = String(todayYmd || "").trim().slice(0, 10);
  if (d.length < 10 || t.length < 10) return false;
  return d < t;
}

/** 일정의 목록 기준일 — 마감일 우선, 없으면 시작일 */
export function scheduleTaskListAnchorYmd(task) {
  const t = task && typeof task === "object" ? task : {};
  const due = String(t.dueDate || "").trim().slice(0, 10);
  if (due.length >= 10) return due;
  return String(t.startDate || "").trim().slice(0, 10);
}

/** @param {{ itemType?: string, dueDate?: string, startDate?: string }} task */
export function isPastScheduleTask(task, todayYmd) {
  if (String(task?.itemType || "todo").toLowerCase() !== "schedule") return false;
  const anchor = scheduleTaskListAnchorYmd(task);
  return isYmdBeforeToday(anchor, todayYmd);
}

/** @param {HTMLElement} card */
export function markTodoCardPastScheduleState(card, todayYmd) {
  if (!card) return;
  const isSched =
    String(card.dataset.itemType || "todo").toLowerCase() === "schedule";
  if (!isSched) {
    card.classList.remove("todo-card--past-schedule");
    return;
  }
  const anchor = scheduleTaskListAnchorYmd({
    itemType: "schedule",
    dueDate: card.dataset.dueDate,
    startDate: card.dataset.startDate,
  });
  card.classList.toggle(
    "todo-card--past-schedule",
    isYmdBeforeToday(anchor, todayYmd),
  );
}
