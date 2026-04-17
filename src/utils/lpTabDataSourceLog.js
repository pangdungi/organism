/**
 * 할일/일정 상위 탭(calendar · schedulecalendar)만 — 클릭 시 화면 데이터가 어디서 오는지.
 * 콘솔 필터: [할일일정·출처]
 *
 * 할 일 「+」추가 버튼 → 모달 저장 후 흐름.
 * 콘솔 필터: [할일일정·추가]
 */

let _pendingAddServerLog = null;

export function logTodoScheduleAddStep1({ taskId, sectionId, title }) {
  try {
    if (typeof console === "undefined" || !console.info) return;
    const 제목 = String(title || "").trim().slice(0, 40) || "(제목 없음)";
    console.info(
      "[할일일정·추가]",
      "① 모달에서 저장 → 카드를 화면에 붙임",
      { taskId, section: sectionId, 제목 },
      "다음: 세션 메모리 반영 후 모달 전용으로 서버 upsert.",
    );
  } catch (_) {}
}

export function logTodoScheduleAddStep2(meta) {
  try {
    if (typeof console === "undefined" || !console.info) return;
    console.info(
      "[할일일정·추가]",
      "② DOM→세션 메모리 collect",
      meta,
    );
  } catch (_) {}
}

export function markTodoAddPendingServerLog(meta) {
  _pendingAddServerLog = meta;
}

export function consumeTodoAddPendingServerLog() {
  const x = _pendingAddServerLog;
  _pendingAddServerLog = null;
  return x;
}

export function logTodoScheduleAddStep3(meta) {
  try {
    if (typeof console === "undefined" || !console.info) return;
    console.info("[할일일정·추가]", "③ 모달 upsert 완료(calendar_section_tasks)", meta);
  } catch (_) {}
}

export function logTodoScheduleTabOnNavigate(tabId, fromTab) {
  if (tabId !== "calendar" && tabId !== "schedulecalendar") return;
  try {
    if (typeof console === "undefined" || !console.info) return;
    const prev =
      fromTab != null && String(fromTab).trim() !== ""
        ? ` (이전 탭: ${String(fromTab)})`
        : "";
    console.info(
      "[할일일정·출처]",
      `지금 탭: ${tabId}${prev}`,
      "① 상위 탭 클릭 시: 서버 calendar_section_tasks SELECT → 세션 메모리 반영 후 renderMain.",
      "② 할일/일정 화면 안 서브탭 클릭 시에도 동일하게 1회 SELECT.",
    );
  } catch (_) {}
}
