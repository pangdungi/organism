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
      "다음: 약 300ms 뒤 이 화면의 카드들을 읽어 이 기기 저장 목록에 반영하고, 서버에도 올립니다.",
    );
  } catch (_) {}
}

export function logTodoScheduleAddStep2(meta) {
  try {
    if (typeof console === "undefined" || !console.info) return;
    console.info(
      "[할일일정·추가]",
      "② 화면에 보이는 카드들을 읽어 이 기기에 있는 할 일 목록 파일을 갱신함",
      meta,
      "다음: 같은 내용을 서버에도 올린 뒤, 서버에서 한 번 더 받아와 전체 목록을 맞춥니다.",
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
    console.info(
      "[할일일정·추가]",
      "③ 서버에 올리고 다시 받아오는 단계까지 끝남(이제 서버와 이 기기 목록이 같은 기준으로 맞춰짐)",
      meta,
    );
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
      "① 화면 먼저 그림: renderMain — 이 폰에 이미 있는 메모리·저장값으로.",
      "② 할 일 목록 맞춤: hydrateTodoSectionTasksFromCloud — Supabase public.calendar_section_tasks 에서 SELECT 해 온 줄로 표시용 목록 갱신.",
    );
  } catch (_) {}
}
