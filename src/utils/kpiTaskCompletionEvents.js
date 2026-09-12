/**
 * 태스크 완료형 KPI — 체크 시점 완료 이벤트
 * (이번 주 처리 수: 그 주 완료 기록. 할일을 지워도 기록은 남음)
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
 * 이번 주 처리 수 — 그 주 완료 기록을 센다. activeTodoIds가 있으면 그 id만.
 * @param {object[]} events
 * @param {string} kpiId
 * @param {Date} [refDate]
 * @param {Iterable<string>|Set<string>|string[]|null} [activeTodoIds] 있으면 이 id만 포함
 */
export function countKpiTaskCompletionsThisWeek(
  events,
  kpiId,
  refDate = new Date(),
  activeTodoIds = null,
) {
  const kid = String(kpiId || "").trim();
  if (!kid) return 0;
  const todayYmd = toLocalDateKey(refDate);
  const weekStart = weekStartYmdMonday(todayYmd);
  const weekEnd = weekEndYmdSunday(weekStart);
  if (!weekStart || !weekEnd) return 0;
  const active =
    activeTodoIds == null
      ? null
      : new Set(
          [...activeTodoIds].map((x) => String(x || "").trim()).filter(Boolean),
        );
  return normalizeKpiTaskCompletionEvents(events).filter((e) => {
    if (String(e.kpiId) !== kid) return false;
    const tid = String(e.todoId || "").trim();
    if (active && (!tid || !active.has(tid))) return false;
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

export function applyKpiTodoCompletedStamp(todo, completed) {
  if (!todo || typeof todo !== "object") return todo;
  todo.completed = !!completed;
  if (todo.completed) {
    todo.completedAt =
      String(todo.completedAt || "").trim() || new Date().toISOString();
  } else {
    delete todo.completedAt;
  }
  return todo;
}

function completionDayYmd(at) {
  const raw = String(at || "").trim();
  if (!raw) return "";
  const dayYmd = raw.length >= 10 ? raw.slice(0, 10) : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayYmd)) return dayYmd;
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return "";
  return toLocalDateKey(new Date(parsed));
}

/**
 * 이번 주 처리 수 — 그 주 완료 기록 ∪ 아직 목록에 남은 완료 할일.
 * 목록에서 지워도 기록은 남기고, 체크를 끈 것만 빠진다.
 */
export function countKpiTodosCompletedThisWeek(
  todos,
  events,
  kpiId,
  refDate = new Date(),
) {
  const kid = String(kpiId || "").trim();
  if (!kid) return 0;
  const todayYmd = toLocalDateKey(refDate);
  const weekStart = weekStartYmdMonday(todayYmd);
  const weekEnd = weekEndYmdSunday(weekStart);
  if (!weekStart || !weekEnd) return 0;
  const inWeek = (dayYmd) =>
    !!dayYmd && dayYmd >= weekStart && dayYmd <= weekEnd;
  const ids = new Set();
  for (const e of normalizeKpiTaskCompletionEvents(events)) {
    if (String(e.kpiId) !== kid) continue;
    if (!inWeek(completionDayYmd(e.completedAt))) continue;
    const tid = String(e.todoId || "").trim() || String(e.id || "").trim();
    if (tid) ids.add(tid);
  }
  for (const t of Array.isArray(todos) ? todos : []) {
    if (!t?.completed) continue;
    if (String(t.text || "").trim() === "") continue;
    const tid = String(t.id || "").trim();
    if (!tid) continue;
    if (inWeek(completionDayYmd(t.completedAt))) ids.add(tid);
  }
  return ids.size;
}

/** 기간 안에 완료된 할일 개수(할일 완료 날짜 ∪ 완료 기록). */
export function countCompletedTodosInDateRange(
  todos,
  events,
  startYmd,
  endYmd,
) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(String(startYmd || "")) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(endYmd || ""))
  ) {
    return 0;
  }
  const ids = new Set();
  for (const e of normalizeKpiTaskCompletionEvents(events)) {
    const dayYmd = completionDayYmd(e.completedAt);
    if (!dayYmd || dayYmd < startYmd || dayYmd > endYmd) continue;
    const tid = String(e.todoId || "").trim() || String(e.id || "").trim();
    if (tid) ids.add(tid);
  }
  for (const t of Array.isArray(todos) ? todos : []) {
    if (!t?.completed) continue;
    if (String(t.text || "").trim() === "") continue;
    const tid = String(t.id || "").trim();
    const dayYmd = completionDayYmd(t.completedAt);
    if (tid && dayYmd && dayYmd >= startYmd && dayYmd <= endYmd) ids.add(tid);
  }
  return ids.size;
}

/**
 * 누적 완료 수 — todoId 기준 고유 (완료 목록 삭제 후에도 이벤트면 유지)
 * ※ 잡무 처리하기 카드는 쓰지 않음(이번 주·현재 목록만)
 * @param {object[]} events
 * @param {string} kpiId
 */
export function countKpiTaskCompletionsAll(events, kpiId) {
  const kid = String(kpiId || "").trim();
  if (!kid) return 0;
  const ids = new Set();
  for (const e of normalizeKpiTaskCompletionEvents(events)) {
    if (String(e.kpiId) !== kid) continue;
    const tid = String(e.todoId || "").trim();
    if (tid) ids.add(tid);
    else if (e.id) ids.add(e.id);
  }
  return ids.size;
}

/**
 * 전체 과제 수 = 현재 할 일 ∪ 완료 이벤트 todoId
 * (잡무 외 태스크완료형 — 완료분만 지워도 분모·분자에 이력 유지)
 * @param {object[]} todos
 * @param {object[]} events
 * @param {string} kpiId
 */
export function resolveKpiTaskCompletionCounts(todos, events, kpiId) {
  const kid = String(kpiId || "").trim();
  const list = (Array.isArray(todos) ? todos : []).filter(
    (t) =>
      String(t?.kpiId ?? kid) === kid && String(t?.text || "").trim() !== "",
  );
  const currentIds = new Set(
    list.map((t) => String(t?.id || "").trim()).filter(Boolean),
  );
  const eventTodoIds = new Set();
  for (const e of normalizeKpiTaskCompletionEvents(events)) {
    if (String(e.kpiId) !== kid) continue;
    const tid = String(e.todoId || "").trim();
    if (tid) eventTodoIds.add(tid);
  }
  const liveDone = list.filter((t) => !!t.completed).length;
  const doneFromEvents = eventTodoIds.size;
  const done = Math.max(doneFromEvents, liveDone);
  const totalIds = new Set([...currentIds, ...eventTodoIds]);
  const total = Math.max(totalIds.size, done);
  const remaining = list.filter((t) => !t.completed).length;
  return { done, total, remaining, liveDone, doneFromEvents };
}

/**
 * @param {object} data KPI 맵 payload (mutate)
 * @param {string|string[]} todoIds
 */
/**
 * 완료한 할일을 목록에서 지울 때 — 그 주 완료 기록은 남긴다.
 * @param {object} data KPI 맵 payload (mutate)
 * @param {object | null | undefined} todo
 */
export function retainKpiTaskCompletionEventOnTodoDelete(data, todo) {
  if (!data || !todo || typeof todo !== "object") return;
  if (!todo.completed) return;
  const kid = String(todo.kpiId || "").trim();
  const tid = String(todo.id || "").trim();
  const at = String(todo.completedAt || "").trim();
  if (!kid || !tid || !at) return;
  const list = normalizeKpiTaskCompletionEvents(data.kpiTaskCompletionEvents);
  if (
    list.some(
      (e) =>
        String(e.kpiId) === kid && String(e.todoId || "").trim() === tid,
    )
  ) {
    return;
  }
  data.kpiTaskCompletionEvents = [
    ...list,
    {
      id: newCompletionEventId(),
      kpiId: kid,
      todoId: tid,
      completedAt: at,
    },
  ];
}

export function removeKpiTaskCompletionEventsForTodos(data, todoIds) {
  if (!data || typeof data !== "object") return;
  const ids = new Set(
    (Array.isArray(todoIds) ? todoIds : [todoIds])
      .map((x) => String(x || "").trim())
      .filter(Boolean),
  );
  if (!ids.size) return;
  const list = normalizeKpiTaskCompletionEvents(data.kpiTaskCompletionEvents);
  data.kpiTaskCompletionEvents = list.filter(
    (e) => !ids.has(String(e.todoId || "").trim()),
  );
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
  if (!data || typeof data !== "object") return;
  const kid = String(kpi?.id || "").trim();
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
