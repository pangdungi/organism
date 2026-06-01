/**
 * 시간가계부 과제 마스터 ↔ Supabase (time_ledger_tasks)
 */

import { supabase } from "../supabase.js";
import {
  applyTimeLedgerTasksFromServer,
  buildTimeLedgerTasksUpsertPayloads,
  getFullTaskOptions,
  isUuid,
  migrateTimeLogRowsTaskIds,
} from "./timeTaskOptionsModel.js";
import { lpPullDebug } from "./lpPullDebug.js";
import {
  timeLedgerSyncDebugEnabled,
  timeLedgerSyncLog,
} from "./timeLedgerSyncDebug.js";

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
  const map = new Map();
  if (!supabase || !userId) return map;
  await Promise.all(
    KPI_LINK_SOURCE_TABLES.map(async ({ table, taskCategory }) => {
      try {
        const { data, error } = await supabase
          .from(table)
          .select("id,name")
          .eq("user_id", userId);
        if (error || !Array.isArray(data)) return;
        for (const row of data) {
          const id = String(row.id || "").trim();
          const name = String(row.name || "").trim();
          if (id && name) map.set(id, { name, taskCategory });
        }
      } catch (_) {}
    }),
  );
  return map;
}

/**
 * 로컬 과제 저장 후 잠깐: tasks pull이 서버 옛 목록(예: 71행)으로 덮어 새 과제를 지우는 레이스 방지.
 * upsert 성공 시 즉시 해제해 다른 기기 변경 반영 가능.
 */
let _tasksPullSkipUntil = 0;
const TASKS_PULL_SKIP_AFTER_LOCAL_MS = 2800;

function bumpTasksPullSkipAfterLocalChange() {
  _tasksPullSkipUntil = Date.now() + TASKS_PULL_SKIP_AFTER_LOCAL_MS;
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * 과제설정에서 삭제한 행을 서버에서도 제거 (upsert만으로는 서버 행이 남아 pull·Realtime 시 부활함)
 */
export async function deleteTimeLedgerTaskRowForCurrentUser(taskId) {
  const id = String(taskId || "").trim();
  if (!supabase || !isUuid(id)) {
    return;
  }
  const userId = await getSessionUserId();
  if (!userId) {
    return;
  }
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) {
    try {
      console.warn("[lp-time-ledger-tasks] time_ledger_tasks delete 실패", {
        id,
        message: error.message,
        code: error.code,
      });
    } catch (_) {}
    return;
  }
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
  await pullTimeLedgerTasksFromSupabase({ ignoreSkip: true });
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
  const rows = Array.isArray(data) ? data : [];
  const applied = applyTimeLedgerTasksFromServer(rows, kpiLinkMetaById);
  if (applied) migrateTimeLogRowsTaskIds();
  return applied;
}

export async function pushTimeLedgerTasksIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return;
  if (count != null && count > 0) return;

  getFullTaskOptions();
  await syncTimeLedgerTasksToSupabase();
}

/** @deprecated 행 단위 `upsertTimeLedgerTaskRowsFromLocalByIds` 를 쓰세요. */
export function scheduleTimeLedgerTasksSyncPush() {
  /* 과제 목록은 전체 upsert 하지 않음 */
}

let _listenerAttached = false;

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
  await pushTimeLedgerTasksIfServerEmpty();
  const pulled = await pullTimeLedgerTasksFromSupabase();
  if (!pulled) {
    getFullTaskOptions();
    migrateTimeLogRowsTaskIds();
  }
}
