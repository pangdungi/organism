/**
 * 시간가계부 과제 마스터 ↔ Supabase (time_ledger_tasks)
 *
 * - pull: 시간가계부 탭 진입·과제설정·기록·수정·예상 일정 모달 열 때 (서버 행 자동 삭제 없음)
 * - push: 과제설정 모달 저장·KPI 연동·사용자 명시 삭제만 (행 단위 upsert/delete)
 */

import { supabase } from "../supabase.js";
import {
  applyTimeLedgerTasksFromServer,
  buildMissingBuiltinUpsertPayloads,
  buildTimeLedgerTasksUpsertPayloads,
  findMissingBuiltinTasksOnServer,
  getFullTaskOptions,
  isUuid,
  migrateTimeLogRowsTaskIds,
  readTaskOptionsMemRows,
} from "./timeTaskOptionsModel.js";
import { lpPullDebug } from "./lpPullDebug.js";
import {
  timeLedgerSyncDebugEnabled,
  timeLedgerSyncLog,
} from "./timeLedgerSyncDebug.js";
import { coalesceInFlightPull } from "./timeLedgerPullCoalesce.js";
import { probeTimeLedgerTasksServerWatermarkMs } from "./kpiMapServerWatermark.js";
import { getActiveKpiTaskKeepersById } from "./kpiMapLocalStorage.js";

const TABLE = "time_ledger_tasks";

const SELECT_TASKS_WITH_KPI =
  "id, name, productivity, category, memo, sort_order, is_system, kpi_id, icon_key";
const SELECT_TASKS_BASE =
  "id, name, productivity, category, memo, sort_order, is_system";

function isMissingOptionalTaskColumnError(error, column) {
  if (!error || !column) return false;
  const blob = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`.toLowerCase();
  if (!blob.includes(String(column).toLowerCase())) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    blob.includes("column") ||
    blob.includes("schema")
  );
}

/** DB에 kpi_id 컬럼이 아직 없을 때(마이그레이션 미적용) SELECT/upsert 폴백 */
function isMissingKpiIdColumnError(error) {
  return isMissingOptionalTaskColumnError(error, "kpi_id");
}

function isMissingIconKeyColumnError(error) {
  return isMissingOptionalTaskColumnError(error, "icon_key");
}

function payloadsWithoutKpiId(payloads) {
  return payloads.map((p) => {
    const { kpi_id: _drop, ...rest } = p;
    return rest;
  });
}

function payloadsWithoutIconKey(payloads) {
  return payloads.map((p) => {
    const { icon_key: _drop, ...rest } = p;
    return rest;
  });
}

function isOnConflictConstraintError(error) {
  return error && String(error.code || "") === "42P10";
}

/** KPI 과제: 서버 트리거가 만든 행 id 사용 (로컬 uuid 와 다를 수 있음) */
async function alignKpiTaskPayloadIdsWithServer(userId, payloads) {
  const kpiIds = [
    ...new Set(
      payloads
        .map((p) => String(p.kpi_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (!kpiIds.length || !supabase || !userId) return payloads;

  const { data, error } = await supabase
    .from(TABLE)
    .select("id,kpi_id")
    .eq("user_id", userId)
    .in("kpi_id", kpiIds);
  if (error || !Array.isArray(data)) return payloads;

  const serverIdByKpi = new Map();
  for (const row of data) {
    const k = String(row.kpi_id ?? "").trim();
    const id = String(row.id || "").trim();
    if (k && id) serverIdByKpi.set(k, id);
  }
  if (serverIdByKpi.size === 0) return payloads;

  return payloads.map((p) => {
    const kpiId = String(p.kpi_id ?? "").trim();
    const serverId = serverIdByKpi.get(kpiId);
    if (!serverId) return p;
    const localId = String(p.id || "").trim();
    if (localId === serverId) return p;
    return { ...p, id: serverId };
  });
}

async function upsertTaskPayloads(payloads) {
  if (!payloads.length) return null;
  const userId = String(payloads[0]?.user_id || "").trim();
  const aligned = userId
    ? await alignKpiTaskPayloadIdsWithServer(userId, payloads)
    : payloads;
  return upsertWithConflictFallback(aligned, ["user_id,id", "id"]);
}

async function upsertWithConflictFallback(payloads, conflictKeys) {
  let batch = payloads;
  let lastError = null;
  for (const onConflict of conflictKeys) {
    let { error } = await supabase.from(TABLE).upsert(batch, { onConflict });
    if (!error) return null;
    if (isMissingKpiIdColumnError(error)) {
      batch = payloadsWithoutKpiId(batch);
      ({ error } = await supabase.from(TABLE).upsert(batch, { onConflict }));
      if (!error) return null;
    }
    if (isMissingIconKeyColumnError(error)) {
      batch = payloadsWithoutIconKey(batch);
      ({ error } = await supabase.from(TABLE).upsert(batch, { onConflict }));
      if (!error) return null;
    }
    if (isOnConflictConstraintError(error)) {
      lastError = error;
      continue;
    }
    return error;
  }
  return lastError;
}

/** pull 시 KPI id → 표시명 + 시간가계부 과제설정 탭용 category(health 등) */
const KPI_LINK_SOURCE_TABLES = [
  { table: "dream_map_kpis", taskCategory: "dream" },
  { table: "health_map_kpis", taskCategory: "health" },
  { table: "happiness_map_kpis", taskCategory: "happiness" },
  { table: "sideincome_map_kpis", taskCategory: "sideincome" },
];

/**
 * 각 map_kpis 행 id → { name, taskCategory } (로컬 스토리지 미사용)
 * taskCategory 는 kpiTimeTaskAdd(kpi, …) 에 쓰는 값과 동일
 * @returns {Promise<Map<string, { name: string, taskCategory: string }>>}
 */
export async function fetchKpiTaskLinkMetaByIdFromSupabase(userId) {
  const uid = String(userId || "").trim();
  const map = new Map();
  if (!supabase || !uid) return map;
  return coalesceInFlightPull(`kpi-link-meta:${uid}`, async () => {
    const out = new Map();
    await Promise.all(
      KPI_LINK_SOURCE_TABLES.map(async ({ table, taskCategory }) => {
        try {
          const { data, error } = await supabase
            .from(table)
            .select("id,name")
            .eq("user_id", uid);
          if (error || !Array.isArray(data)) return;
          for (const row of data) {
            const id = String(row.id || "").trim();
            const name = String(row.name || "").trim();
            if (id && name) out.set(id, { name, taskCategory });
          }
        } catch (_) {}
      }),
    );
    return out;
  });
}

/**
 * 로컬 과제 저장 후 잠깐: tasks pull이 서버 옛 목록(예: 71행)으로 덮어 새 과제를 지우는 레이스 방지.
 * upsert 성공 시 즉시 해제해 다른 기기 변경 반영 가능.
 */
let _tasksPullSkipUntil = 0;
const TASKS_PULL_SKIP_AFTER_LOCAL_MS = 2800;
/** 마지막으로 서버 과제 목록을 반영한 시점의 서버 updated_at(ms) */
let _tasksServerWatermarkMs = 0;
const TASKS_WM_SESSION_PREFIX = "lp:time-ledger-tasks-server-wm:";

function tasksSessionWatermarkKey(userId) {
  const u = String(userId || "").trim();
  return u ? `${TASKS_WM_SESSION_PREFIX}${u}` : "";
}

function readTasksServerWatermarkFromSession(userId) {
  const key = tasksSessionWatermarkKey(userId);
  if (!key || typeof sessionStorage === "undefined") return 0;
  try {
    const n = Number(sessionStorage.getItem(key) || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (_) {
    return 0;
  }
}

function writeTasksServerWatermarkToSession(userId, ms) {
  const key = tasksSessionWatermarkKey(userId);
  const n = Number(ms);
  if (!key || !Number.isFinite(n) || n <= 0 || typeof sessionStorage === "undefined") {
    return;
  }
  try {
    const prev = Number(sessionStorage.getItem(key) || 0);
    if (n > prev) sessionStorage.setItem(key, String(n));
  } catch (_) {}
}

function rememberTasksServerWatermarkMs(userId, ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return;
  _tasksServerWatermarkMs = Math.max(_tasksServerWatermarkMs, n);
  writeTasksServerWatermarkToSession(userId, n);
}

function bumpTasksPullSkipAfterLocalChange() {
  _tasksPullSkipUntil = Date.now() + TASKS_PULL_SKIP_AFTER_LOCAL_MS;
}

/** 로컬 미러가 비었거나 KPI 연동 과제가 비면 — 워터마크와 관계없이 서버 pull */
function shouldForceTaskListPullFromServer() {
  const rows = readTaskOptionsMemRows();
  if (rows.length === 0) return true;
  const keepers = getActiveKpiTaskKeepersById();
  if (keepers.size === 0) return false;
  const presentKpiIds = new Set(
    rows.map((r) => String(r.kpiId || "").trim()).filter(Boolean),
  );
  for (const kid of keepers.keys()) {
    if (!presentKpiIds.has(kid)) return true;
  }
  return false;
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * 과제 삭제 전: 해당 과제를 가리키는 시간 기록의 task_id 해제 (과제명은 유지).
 * 복합 FK ON DELETE SET NULL 은 user_id 까지 null 로 만들어 23502 가 난다.
 */
async function clearTimeLedgerTaskIdFromEntriesForCurrentUser(taskId, userId) {
  const id = String(taskId || "").trim();
  if (!supabase || !userId || !isUuid(id)) {
    return null;
  }
  const { error } = await supabase
    .from("time_ledger_entries")
    .update({ task_id: null })
    .eq("user_id", userId)
    .eq("task_id", id);
  return error || null;
}

async function resolveTaskIdForDelete(userId, taskId, kpiId) {
  const id = String(taskId || "").trim();
  const kid = String(kpiId || "").trim();
  if (isUuid(id)) return id;
  if (!kid || !supabase || !userId) return "";
  const { data, error } = await supabase
    .from(TABLE)
    .select("id")
    .eq("user_id", userId)
    .eq("kpi_id", kid)
    .maybeSingle();
  if (error || !data?.id) return "";
  return String(data.id).trim();
}

/**
 * 과제설정·KPI 삭제 — task uuid 또는 kpi_id 로 서버 행 제거
 * @param {{ taskId?: string, kpiId?: string }} opts
 */
export async function deleteTimeLedgerTaskForCurrentUser(opts = {}) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const resolvedId = await resolveTaskIdForDelete(
    userId,
    opts.taskId,
    opts.kpiId,
  );
  if (!resolvedId || !isUuid(resolvedId)) return;

  const clearError = await clearTimeLedgerTaskIdFromEntriesForCurrentUser(
    resolvedId,
    userId,
  );
  if (clearError) {
    try {
      console.warn(
        "[lp-time-ledger-tasks] time_ledger_entries task_id 해제 실패(삭제 계속 시도)",
        {
          id: resolvedId,
          message: clearError.message,
          code: clearError.code,
        },
      );
    } catch (_) {}
  }

  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("id", resolvedId);
  if (error) {
    try {
      console.warn("[lp-time-ledger-tasks] time_ledger_tasks delete 실패", {
        id: resolvedId,
        kpiId: String(opts.kpiId || "").trim() || undefined,
        message: error.message,
        code: error.code,
      });
    } catch (_) {}
  }
}

/**
 * @deprecated deleteTimeLedgerTaskForCurrentUser 사용
 */
export async function deleteTimeLedgerTaskRowForCurrentUser(taskId) {
  await deleteTimeLedgerTaskForCurrentUser({ taskId });
}

/**
 * 로컬 목록에서 지정 id 행만 골라 sort_order 포함해 upsert (전체 목록 덮어쓰기 없음).
 * @param {string[]} taskIds
 */
export async function upsertTimeLedgerTaskRowsFromLocalByIds(taskIds) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;
  const idSet = new Set(
    (Array.isArray(taskIds) ? taskIds : [])
      .map((x) => String(x || "").trim())
      .filter((id) => id && isUuid(id)),
  );
  if (idSet.size === 0) return;
  const payloads = buildTimeLedgerTasksUpsertPayloads(userId).filter((p) =>
    idSet.has(p.id),
  );
  if (payloads.length === 0) return;
  const error = await upsertTaskPayloads(payloads);
  if (error) {
    try {
      console.warn("[lp-time-ledger-tasks] upsert(ids) 실패", {
        table: `public.${TABLE}`,
        code: error.code,
        message: error.message,
      });
    } catch (_) {}
    if (timeLedgerSyncDebugEnabled()) {
      timeLedgerSyncLog("upsertTimeLedgerTaskRowsFromLocalByIds:error", {
        message: error.message,
        code: error.code,
      });
    }
    return;
  }
  _tasksPullSkipUntil = 0;
}

/** @deprecated 전체 목록 upsert — 서버가 비어 있을 때 시드(pushTimeLedgerTasksIfServerEmpty)에서만 사용. */
export async function syncTimeLedgerTasksToSupabase() {
  const userId = await getSessionUserId();
  if (!supabase) {
    if (timeLedgerSyncDebugEnabled()) {
      timeLedgerSyncLog("syncTimeLedgerTasksToSupabase:skip", {
        reason: "no_supabase_client",
      });
    }
    return;
  }
  if (!userId) {
    if (timeLedgerSyncDebugEnabled()) {
      timeLedgerSyncLog("syncTimeLedgerTasksToSupabase:skip", {
        reason: "not_logged_in",
      });
    }
    return;
  }

  const payloads = buildTimeLedgerTasksUpsertPayloads(userId);
  if (timeLedgerSyncDebugEnabled()) {
    timeLedgerSyncLog("syncTimeLedgerTasksToSupabase:upsert", {
      rowCount: payloads.length,
    });
  }

  if (payloads.length > 0) {
    const error = await upsertTaskPayloads(payloads);
    if (error) {
      try {
        console.warn("[lp-time-ledger-tasks] sync upsert 실패", {
          table: `public.${TABLE}`,
          code: error.code,
          message: error.message,
        });
      } catch (_) {}
      timeLedgerSyncLog("syncTimeLedgerTasksToSupabase:upsert_error", {
        message: error.message,
        code: error.code,
      });
    } else {
      _tasksPullSkipUntil = 0;
    }
  }

  /*
   * 로컬에서 지운 과제는 removeTaskOption → deleteTimeLedgerTaskRowForCurrentUser 로 서버 행 삭제.
   * 여기 upsert만으로는 삭제 반영이 안 되므로, 동기화 배치에서 고아 행을 일괄 삭제하지 않음
   * (다른 기기에서 추가만 하고 아직 이 기기에 pull 안 된 id를 잘못 지우는 것 방지).
   */
}

/**
 * 서버에 행이 있으면 로컬 과제 목록 병합·반영
 * @param {{ ignoreSkip?: boolean }} [opts] — true일 때만 로컬 직후 스킵 윈도 무시(디버그·드문 강제 동기화). 일반 탭/모달에서는 사용하지 않음.
 */
export async function pullTimeLedgerTasksFromSupabase(opts = {}) {
  const now = Date.now();
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    return false;
  }

  if (!opts.ignoreSkip && now < _tasksPullSkipUntil) {
    return false;
  }

  return coalesceInFlightPull(`ledger-tasks:${userId}`, async () => {
  const kpiLinkPromise = fetchKpiTaskLinkMetaByIdFromSupabase(userId);
  let tasksRes = await supabase
    .from(TABLE)
    .select(SELECT_TASKS_WITH_KPI)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  let { data, error } = tasksRes;
  if (error && (isMissingKpiIdColumnError(error) || isMissingIconKeyColumnError(error))) {
    tasksRes = await supabase
      .from(TABLE)
      .select(SELECT_TASKS_BASE)
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    data = tasksRes.data;
    error = tasksRes.error;
  }

  if (error) {
    try {
      console.warn("[lp-time-ledger-tasks] pull SELECT 실패", {
        message: error.message,
        code: error.code,
      });
    } catch (_) {}
    return false;
  }
  const kpiLinkMetaById = await kpiLinkPromise;
  let rows = Array.isArray(data) ? data : [];
  const missingBuiltins = findMissingBuiltinTasksOnServer(rows);
  if (missingBuiltins.length > 0) {
    const maxSort = rows.reduce(
      (m, r) => Math.max(m, Number(r.sort_order ?? -1)),
      -1,
    );
    const payloads = buildMissingBuiltinUpsertPayloads(
      userId,
      missingBuiltins,
      maxSort + 1,
    );
    const upsertError = await upsertTaskPayloads(payloads);
    if (!upsertError) {
      rows = [
        ...rows,
        ...payloads.map((p) => ({
          id: p.id,
          name: p.name,
          productivity: p.productivity,
          category: p.category,
          memo: p.memo,
          sort_order: p.sort_order,
          is_system: true,
          kpi_id: p.kpi_id,
          icon_key: p.icon_key,
        })),
      ];
      _tasksPullSkipUntil = 0;
    }
  }
  const applied = applyTimeLedgerTasksFromServer(rows, kpiLinkMetaById);
  if (applied) {
    const wm = rows.reduce(
      (m, r) => Math.max(m, Date.parse(String(r?.updated_at || "")) || 0),
      0,
    );
    rememberTasksServerWatermarkMs(userId, wm);
    migrateTimeLogRowsTaskIds();
  }
  return applied;
  });
}

/** @deprecated 서버 비어 있을 때 로컬 통째 시드 금지 — 서버는 사용자 모달 저장만 */
export async function pushTimeLedgerTasksIfServerEmpty() {
  return false;
}

/** @deprecated 행 단위 `upsertTimeLedgerTaskRowsFromLocalByIds` 를 쓰세요. */
export function scheduleTimeLedgerTasksSyncPush() {
  /* 과제 목록은 전체 upsert 하지 않음 */
}

let _listenerAttached = false;

/**
 * 과제설정·과제 기록·수정·예상 일정 모달 — 서버 과제 목록 pull + KPI 맵 기준 행 정리.
 * (모달 확인을 늦추지 않고 비동기로 호출)
 */
/** @deprecated 과제 목록은 서버 pull·사용자 저장만 — 탭 진입 시 KPI→과제 자동 생성 안 함 */
export function scheduleKpiTaskListEnsureOnce() {}

/** 과제설정·기록 모달 — 서버에 변경 있을 때만 pull */
export async function syncTimeLedgerTaskListForModalOpen() {
  try {
    return !!(await pullTimeLedgerTasksIfStaleForModal());
  } catch (_) {
    return false;
  }
}

/** 탭·일간 진입 — 서버 과제목록을 아직 한 번도 받지 않았으면 true (pull 전에 호출) */
export async function isTaskListFirstPullNeeded() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  if (shouldForceTaskListPullFromServer()) return true;
  if (_tasksServerWatermarkMs <= 0) {
    _tasksServerWatermarkMs = readTasksServerWatermarkFromSession(userId);
  }
  return _tasksServerWatermarkMs <= 0;
}

/**
 * 시간기록 탭 진입 — 서버 과제 목록을 한 번도 반영한 적 없으면 무조건 pull, 이후 stale일 때만.
 * @returns {Promise<boolean>}
 */
export async function pullTimeLedgerTasksForTabEnter() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  if (shouldForceTaskListPullFromServer()) {
    return !!(await pullTimeLedgerTasksFromSupabase({ ignoreSkip: true }));
  }
  if (_tasksServerWatermarkMs <= 0) {
    _tasksServerWatermarkMs = readTasksServerWatermarkFromSession(userId);
  }
  if (_tasksServerWatermarkMs <= 0) {
    return !!(await pullTimeLedgerTasksFromSupabase({ ignoreSkip: true }));
  }
  return !!(await pullTimeLedgerTasksIfStaleForModal());
}

/**
 * 워터마크 비교 후 stale일 때만 pull. 로컬→서버 반영 대기 중이면 skip.
 * @returns {Promise<boolean>} 서버 스냅샷을 반영했으면 true
 */
export async function pullTimeLedgerTasksIfStaleForModal() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  if (shouldForceTaskListPullFromServer()) {
    return !!(await pullTimeLedgerTasksFromSupabase({ ignoreSkip: true }));
  }
  const now = Date.now();
  if (now < _tasksPullSkipUntil) return false;
  if (_tasksServerWatermarkMs <= 0) {
    _tasksServerWatermarkMs = readTasksServerWatermarkFromSession(userId);
  }
  const serverMs = await probeTimeLedgerTasksServerWatermarkMs(userId);
  if (serverMs > 0 && serverMs <= _tasksServerWatermarkMs) return false;
  if (
    serverMs === 0 &&
    _tasksServerWatermarkMs === 0 &&
    readTaskOptionsMemRows().length > 0
  ) {
    return false;
  }
  const pulled = !!(await pullTimeLedgerTasksFromSupabase({ ignoreSkip: false }));
  if (!pulled && serverMs > 0) {
    rememberTasksServerWatermarkMs(userId, serverMs);
  }
  return pulled;
}

export function attachTimeLedgerTasksSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("time-ledger-tasks-saved", (e) => {
    const d = e.detail || {};
    if (d.bumpPullSkip) {
      bumpTasksPullSkipAfterLocalChange();
    }
  });
}

export async function hydrateTimeLedgerTasksFromCloud() {
  lpPullDebug("hydrateTimeLedgerTasksFromCloud", {});
  if (!supabase) return;
  attachTimeLedgerTasksSaveListener();
  await pullTimeLedgerTasksFromSupabase();
  const seeded = await pushTimeLedgerTasksIfServerEmpty();
  if (seeded) {
    await pullTimeLedgerTasksFromSupabase();
  }
  migrateTimeLogRowsTaskIds();
}

/**
 * 콘솔 디버그 — 서버 time_ledger_tasks 원본(로컬 가공 없음).
 * @param {{ names?: string[] }} [opts] — names 있으면 해당 이름만 개수·id 로그
 */
export async function fetchServerTimeLedgerTasksForDebug(opts = {}) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    return { ok: false, error: "no_session", rows: [], count: 0 };
  }
  let tasksRes = await supabase
    .from(TABLE)
    .select(SELECT_TASKS_WITH_KPI)
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });
  let { data, error } = tasksRes;
  if (error && (isMissingKpiIdColumnError(error) || isMissingIconKeyColumnError(error))) {
    tasksRes = await supabase
      .from(TABLE)
      .select(SELECT_TASKS_BASE)
      .eq("user_id", userId)
      .order("sort_order", { ascending: true });
    data = tasksRes.data;
    error = tasksRes.error;
  }
  const rows = Array.isArray(data) ? data : [];
  const names = Array.isArray(opts.names) ? opts.names : [];
  if (timeLedgerSyncDebugEnabled()) {
    if (names.length) {
      for (const name of names) {
        const hits = rows.filter((r) => (r.name || "").trim() === name);
        console.log(
          "[서버 과제]",
          name,
          "→",
          hits.length,
          "개",
          hits.map((r) => r.id),
        );
      }
    } else {
      console.log("[서버 과제] 전체", rows.length, "개");
      console.table(
        rows.map((r) => ({
          id: r.id,
          name: r.name,
          kpi_id: r.kpi_id ?? "",
          category: r.category ?? "",
        })),
      );
    }
  }
  return {
    ok: !error,
    error: error ? error.message || String(error) : null,
    rows,
    count: rows.length,
  };
}

/** 서버 원본 조회 + 로컬 메모리·getFullTaskOptions 비교 */
export async function debugCompareServerAndLocalTasks(names = []) {
  const server = await fetchServerTimeLedgerTasksForDebug({ names });
  const m = await import("./timeTaskOptionsModel.js");
  const mem = m.readTaskOptionsMemRows();
  const full = m.getFullTaskOptions();
  const pick = (list) => {
    if (!names.length) return list;
    return list.filter((t) => names.includes((t.name || "").trim()));
  };
  if (timeLedgerSyncDebugEnabled()) {
    console.log("[로컬 mem]", pick(mem).length, pick(mem).map((t) => ({ name: t.name, id: t.id })));
    console.log("[getFullTaskOptions]", pick(full).length, pick(full).map((t) => ({ name: t.name, id: t.id })));
  }
  return { server, mem: pick(mem), full: pick(full) };
}
