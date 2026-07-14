/**
 * 태스크 완료형 KPI — 체크 시점 완료 이벤트(휴지통 삭제 후에도 이번 주 처리 수 유지)
 */

/** @param {Date} d */
export function toLocalDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** @param {string} ymd */
export function weekStartYmdMonday(ymd) {
  const m = String(ymd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dow = dt.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diff);
  return toLocalDateKey(dt);
}

/** @param {string} weekStartYmd */
export function weekEndYmdSunday(weekStartYmd) {
  const m = String(weekStartYmd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  dt.setDate(dt.getDate() + 6);
  return toLocalDateKey(dt);
}

/** @param {unknown} raw */
export function normalizeKpiTaskCompletionEvent(raw) {
  return {
    id: String(raw?.id || "").trim(),
    kpiId: String(raw?.kpiId || "").trim(),
    todoId: String(raw?.todoId || "").trim(),
    completedAt: String(raw?.completedAt || "").trim(),
  };
}

/** @param {unknown} arr */
export function normalizeKpiTaskCompletionEvents(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map(normalizeKpiTaskCompletionEvent)
    .filter((e) => e.id && e.kpiId && e.completedAt);
}

/**
 * @param {object[]} events
 * @param {string} kpiId
 * @param {Date} [refDate]
 */
export function countKpiTaskCompletionsThisWeek(events, kpiId, refDate = new Date()) {
  const kid = String(kpiId || "").trim();
  if (!kid) return 0;
  const todayYmd = toLocalDateKey(refDate);
  const weekStart = weekStartYmdMonday(todayYmd);
  const weekEnd = weekEndYmdSunday(weekStart);
  if (!weekStart || !weekEnd) return 0;
  return normalizeKpiTaskCompletionEvents(events).filter((e) => {
    if (String(e.kpiId) !== kid) return false;
    const at = e.completedAt;
    const dayYmd = at.length >= 10 ? at.slice(0, 10) : toLocalDateKey(new Date(at));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) {
      const parsed = Date.parse(at);
      if (!Number.isFinite(parsed)) return false;
      const localDay = toLocalDateKey(new Date(parsed));
      return localDay >= weekStart && localDay <= weekEnd;
    }
    return dayYmd >= weekStart && dayYmd <= weekEnd;
  }).length;
}

function newCompletionEventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * @param {object} data KPI 맵 payload (mutate)
 * @param {object | null | undefined} kpi
 * @param {string} todoId
 * @param {boolean} nowCompleted
 * @param {boolean} wasCompleted
 */
export function syncKpiTaskCompletionEventOnTodoToggle(
  data,
  kpi,
  todoId,
  nowCompleted,
  wasCompleted,
) {
  if (!kpi?.useTaskCompletionGoal) return;
  if (!data || typeof data !== "object") return;
  const kid = String(kpi.id || "").trim();
  const tid = String(todoId || "").trim();
  if (!kid || !tid) return;

  const list = normalizeKpiTaskCompletionEvents(data.kpiTaskCompletionEvents);
  const matchTodo = (e) =>
    String(e.kpiId) === kid && String(e.todoId) === tid;

  if (nowCompleted && !wasCompleted) {
    data.kpiTaskCompletionEvents = [
      ...list.filter((e) => !matchTodo(e)),
      {
        id: newCompletionEventId(),
        kpiId: kid,
        todoId: tid,
        completedAt: new Date().toISOString(),
      },
    ];
    return;
  }

  if (!nowCompleted && wasCompleted) {
    data.kpiTaskCompletionEvents = list.filter((e) => !matchTodo(e));
  }
}
