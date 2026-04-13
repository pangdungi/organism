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

const TABLE = "time_ledger_tasks";

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
  if (!userId || !supabase) return;

  const payloads = buildTimeLedgerTasksUpsertPayloads(userId);

  if (payloads.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(payloads, {
      onConflict: "id",
    });
    if (!error) _tasksPullSkipUntil = 0;
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

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

export function scheduleTimeLedgerTasksSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncTimeLedgerTasksToSupabase().catch(() => {});
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachTimeLedgerTasksSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("time-ledger-tasks-saved", (e) => {
    const d = e.detail || {};
    if (d.bumpPullSkip !== false) bumpTasksPullSkipAfterLocalChange();
    if (d.scheduleSyncPush !== false) scheduleTimeLedgerTasksSyncPush();
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
