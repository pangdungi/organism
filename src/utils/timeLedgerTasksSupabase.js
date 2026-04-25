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
const LP_TL = "[lp-time-ledger-tasks]";

/**
 * 과제 Supabase upsert·pull 디버그 (콘솔). 추가 버튼 경로는 Time.js·addTaskOptionFull·여기가 한 줄.
 */
function logTl(phase, detail) {
  try {
    if (typeof console !== "undefined" && console.log) {
      console.log(`${LP_TL} ${phase}`, detail);
    }
  } catch (_) {}
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
  if (!supabase || !isUuid(id)) return;
  const userId = await getSessionUserId();
  if (!userId) return;
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) return;
}

export async function syncTimeLedgerTasksToSupabase() {
  const userId = await getSessionUserId();
  if (!supabase) {
    logTl("sync:skip (Supabase 클라이언트 없음)", {
      table: `public.${TABLE}`,
      path: "src/supabase.js — VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY",
    });
    if (timeLedgerSyncDebugEnabled()) {
      timeLedgerSyncLog("syncTimeLedgerTasksToSupabase:skip", {
        reason: "no_supabase_client",
      });
    }
    return;
  }
  if (!userId) {
    logTl("sync:skip (로그인 세션 없음)", {
      table: `public.${TABLE}`,
      op: "from(table).upsert(…, { onConflict: 'id' })",
    });
    if (timeLedgerSyncDebugEnabled()) {
      timeLedgerSyncLog("syncTimeLedgerTasksToSupabase:skip", {
        reason: "not_logged_in",
      });
    }
    return;
  }

  const list = getFullTaskOptions();
  const droppedNonUuid = list
    .map((t) => ({ name: (t.name || "").trim(), id: (t.id || "").trim() }))
    .filter((r) => !r.id || !isUuid(r.id));
  const payloads = buildTimeLedgerTasksUpsertPayloads(userId);
  logTl("sync:준비", {
    table: `public.${TABLE}`,
    op: "upsert",
    onConflict: "id",
    userIdPrefix: `${String(userId).slice(0, 8)}…`,
    로컬_과제_행수: list.length,
    upsert_대상_행수: payloads.length,
    uuid_아닌_id_로_빠진_행: droppedNonUuid.length
      ? droppedNonUuid.slice(0, 6)
      : "없음",
  });
  if (timeLedgerSyncDebugEnabled()) {
    timeLedgerSyncLog("syncTimeLedgerTasksToSupabase:upsert", {
      rowCount: payloads.length,
    });
  }

  if (payloads.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(payloads, {
      onConflict: "id",
    });
    if (error) {
      logTl("sync:upsert 실패", {
        table: `public.${TABLE}`,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      timeLedgerSyncLog("syncTimeLedgerTasksToSupabase:upsert_error", {
        message: error.message,
        code: error.code,
      });
    } else {
      _tasksPullSkipUntil = 0;
      logTl("sync:upsert 성공", { table: `public.${TABLE}`, rows: payloads.length });
    }
  } else {
    logTl("sync:upsert 생략 (upsert payload 0 — uuid 유효한 행이 없음)", {
      table: `public.${TABLE}`,
    });
  }

  /*
   * 로컬에서 지운 과제는 removeTaskOption → deleteTimeLedgerTaskRowForCurrentUser 로 서버 행 삭제.
   * 여기 upsert만으로는 삭제 반영이 안 되므로, 동기화 배치에서 고아 행을 일괄 삭제하지 않음
   * (다른 기기에서 추가만 하고 아직 이 기기에 pull 안 된 id를 잘못 지우는 것 방지).
   */
}

/** 서버에 행이 있으면 로컬 과제 목록 병합 반영 */
export async function pullTimeLedgerTasksFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  if (Date.now() < _tasksPullSkipUntil) {
    return false;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "id, name, productivity, category, memo, sort_order, is_system",
    )
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) return false;
  const n = Array.isArray(data) ? data.length : 0;
  if (!n) return false;

  const applied = applyTimeLedgerTasksFromServer(data);
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

export function scheduleTimeLedgerTasksSyncPush() {
  if (!supabase) return;
  void syncTimeLedgerTasksToSupabase().catch((err) => {
    try {
      console.error(
        "[lp-time-ledger-tasks] schedule:sync 실패",
        err && (err.message || err),
        err,
      );
    } catch (_) {}
  });
}

let _listenerAttached = false;

export function attachTimeLedgerTasksSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("time-ledger-tasks-saved", (e) => {
    const d = e.detail || {};
    if (d.bumpPullSkip) bumpTasksPullSkipAfterLocalChange();
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
