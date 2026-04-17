/**
 * 할일/일정 상위 탭 — 추가·탐색 단계 표시(콘솔 비활성, 데이터는 mark/consume 만 유지)
 */

let _pendingAddServerLog = null;

export function logTodoScheduleAddStep1(_meta) {}

export function logTodoScheduleAddStep2(_meta) {}

export function markTodoAddPendingServerLog(meta) {
  _pendingAddServerLog = meta;
}

export function consumeTodoAddPendingServerLog() {
  const x = _pendingAddServerLog;
  _pendingAddServerLog = null;
  return x;
}

export function logTodoScheduleAddStep3(_meta) {}

export function logTodoScheduleTabOnNavigate(_tabId, _fromTab) {}
