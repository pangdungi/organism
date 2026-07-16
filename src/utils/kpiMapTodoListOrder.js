/**
 * KPI 할일(kpiTodos[])·매일 반복 할일(kpiDailyRepeatTodos[]) — DB 조회 순서는 불안정하므로
 * sync 시 배열 인덱스를 extra.sortOrder로 저장하고 pull·화면 표시 시 이 값으로 복원한다.
 */

const DEFAULT_KPI_ID_PREFIX = "__lp_default_kpi_";

/** 할 일 id가 KPI id·기본 KPI id와 같으면 잘못된 저장(삭제 목록·PK 충돌) */
export function isInvalidKpiDailyTodoId(id, kpiId) {
  const sid = String(id ?? "").trim();
  const sk = String(kpiId ?? "").trim();
  if (!sid) return true;
  if (sk && sid === sk) return true;
  if (sid.startsWith(DEFAULT_KPI_ID_PREFIX) && sid.endsWith("__")) return true;
  return false;
}

/** 동일 KPI·문구면 pull·push마다 같은 id (잘못된 행 복구용) */
export function stableKpiDailyTodoId(kpiId, text) {
  const s = `${String(kpiId)}::${String(text).trim()}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return `daily_${(h >>> 0).toString(36)}`;
}

/** @param {object} todo */
export function normalizeKpiDailyTodoIdentity(todo) {
  const kpiId = String(todo?.kpiId ?? todo?.kpi_id ?? "").trim();
  const text = String(todo?.text ?? "").trim();
  let id = String(todo?.id ?? "").trim();
  if (isInvalidKpiDailyTodoId(id, kpiId)) {
    id = stableKpiDailyTodoId(kpiId, text);
  }
  return { ...todo, id, kpiId, text };
}

/**
 * 삭제 목록에 KPI id가 들어가면 해당 KPI 매일 할 일 전체가 pull 시 빠짐 — 제거
 * @param {object} deletedRefs
 * @param {Set<string>|string[]} kpiIds
 */
export function scrubKpiIdsFromDailyTodoDeletedRefs(deletedRefs, kpiIds) {
  if (!deletedRefs || typeof deletedRefs !== "object") return deletedRefs;
  const kpiSet = kpiIds instanceof Set ? kpiIds : new Set((kpiIds || []).map(String));
  const arr = Array.isArray(deletedRefs.kpiDailyRepeatTodos)
    ? deletedRefs.kpiDailyRepeatTodos
    : [];
  const next = arr.filter((id) => !kpiSet.has(String(id)));
  if (next.length === arr.length) return deletedRefs;
  return { ...deletedRefs, kpiDailyRepeatTodos: next };
}

/** @param {object} r DB row (id, kpi_id, text, completed, extra?, updated_at?) */
export function mapDbRowToKpiDailyTodo(r) {
  const ex =
    r.extra && typeof r.extra === "object" && !Array.isArray(r.extra) ? r.extra : {};
  const {
    id: _eid,
    kpiId: _ekpi,
    text: _etext,
    completed: _ecmp,
    sortOrder: sortFromExtra,
    ...exRest
  } = ex;
  const kpiId = String(r.kpi_id ?? "").trim();
  const text = String(r.text ?? "").trim();
  let id = String(r.id ?? "").trim();
  if (isInvalidKpiDailyTodoId(id, kpiId)) {
    id = stableKpiDailyTodoId(kpiId, text);
  }
  const sortOrder =
    typeof sortFromExtra === "number" && Number.isFinite(sortFromExtra)
      ? sortFromExtra
      : undefined;
  return {
    ...exRest,
    id,
    kpiId,
    text,
    completed: !!r.completed,
    ...(sortOrder !== undefined ? { sortOrder } : {}),
  };
}

function kpiTodoRowSortOrder(item) {
  if (!item || typeof item !== "object") return null;
  const ex =
    item.extra && typeof item.extra === "object" && !Array.isArray(item.extra)
      ? item.extra
      : {};
  if (typeof ex.sortOrder === "number" && Number.isFinite(ex.sortOrder)) {
    return ex.sortOrder;
  }
  if (typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)) {
    return item.sortOrder;
  }
  return null;
}

/**
 * @param {Array<{ id?: string, extra?: object, updated_at?: string }>} rows
 * @returns {Array}
 */
export function sortNormalizedKpiTodoRows(rows) {
  return [...(rows || [])].sort((ra, rb) => {
    const oa = kpiTodoRowSortOrder(ra);
    const ob = kpiTodoRowSortOrder(rb);
    if (oa !== null && ob !== null && oa !== ob) return oa - ob;
    if (oa !== null && ob === null) return -1;
    if (oa === null && ob !== null) return 1;
    const ta = ra.updated_at ? new Date(ra.updated_at).getTime() : 0;
    const tb = rb.updated_at ? new Date(rb.updated_at).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(ra.id || "").localeCompare(String(rb.id || ""));
  });
}

/**
 * 매일 반복 할 일 — 같은 KPI 안에서 맨 아래(sortOrder)에 추가
 * @param {Array<object>} todos
 * @param {object} entry
 */
export function appendKpiDailyRepeatTodoAtEnd(todos, entry) {
  const list = Array.isArray(todos) ? todos : [];
  const normalized = normalizeKpiDailyTodoIdentity(entry || {});
  const kid = String(normalized.kpiId ?? "").trim();
  let maxOrder = -1;
  for (const t of list) {
    if (String(t?.kpiId ?? "").trim() !== kid) continue;
    const o = kpiTodoRowSortOrder(t);
    if (o !== null && o > maxOrder) maxOrder = o;
  }
  list.push({ ...normalized, sortOrder: maxOrder + 1 });
  return list;
}

/**
 * @param {object} data KPI 맵 payload (mutate)
 * @param {string} kpiId
 * @param {string[]} orderedTodoIds 드래그 후 보이는 순서
 */
export function reorderKpiDailyRepeatTodosForKpi(data, kpiId, orderedTodoIds) {
  if (!data || typeof data !== "object") return data;
  const kid = String(kpiId ?? "").trim();
  const order = [...new Set((orderedTodoIds || []).map((id) => String(id)))];
  const indexById = new Map(order.map((id, i) => [id, i]));
  for (const t of data.kpiDailyRepeatTodos || []) {
    if (String(t?.kpiId ?? "").trim() !== kid) continue;
    const id = String(t.id ?? "");
    if (indexById.has(id)) {
      t.sortOrder = indexById.get(id);
    }
  }
  return data;
}
