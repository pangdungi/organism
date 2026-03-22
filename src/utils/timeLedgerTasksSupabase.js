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

const TABLE = "time_ledger_tasks";

/** 로컬·upsert·서버 행 수 비교 (누락·UUID 제외 진단용) */
async function logTimeLedgerTaskInventory(context) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const list = getFullTaskOptions();
  const payloads = buildTimeLedgerTasksUpsertPayloads(userId);
  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const remoteCount = error ? null : count;
  const skipped = list.filter((t) => !isUuid(String(t.id || "").trim()));
  const match =
    remoteCount != null &&
    skipped.length === 0 &&
    list.length === remoteCount &&
    remoteCount === payloads.length;

  console.info(`[time-ledger-tasks] ${context}`, {
    로컬_과제수: list.length,
    DB에_올릴_과제수_UUID만: payloads.length,
    서버_time_ledger_tasks_행수: remoteCount,
    로컬과_DB_일치: match,
    ...(skipped.length
      ? {
          UUID아님으로_DB제외: skipped.length,
          제외된_이름: skipped.map((t) => t.name),
        }
      : {}),
  });
  if (error) console.warn("[time-ledger-tasks] count 조회 실패", error.message);
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export async function syncTimeLedgerTasksToSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const payloads = buildTimeLedgerTasksUpsertPayloads(userId);
  const want = new Set(payloads.map((p) => p.id));

  if (payloads.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(payloads, {
      onConflict: "id",
    });
    if (error) console.warn("[time-ledger-tasks] upsert", error.message);
  }

  const { data: remote, error: listErr } = await supabase
    .from(TABLE)
    .select("id")
    .eq("user_id", userId);
  if (listErr || !remote) {
    console.warn(
      "[time-ledger-tasks] 원격 id 목록 조회 실패",
      listErr?.message || "no data",
    );
    await logTimeLedgerTaskInventory("동기화(고아삭제 단계 실패, 진단만)");
    return;
  }

  for (const r of remote) {
    const id = String(r.id || "").trim();
    if (id && !want.has(id)) {
      const { error: dErr } = await supabase.from(TABLE).delete().eq("id", id);
      if (dErr) console.warn("[time-ledger-tasks] delete", dErr.message);
    }
  }

  await logTimeLedgerTaskInventory("동기화 완료 후");
}

/** 서버에 행이 있으면 로컬 과제 목록 병합 반영 */
export async function pullTimeLedgerTasksFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "id, name, productivity, category, memo, sort_order, is_system",
    )
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[time-ledger-tasks] pull", error.message);
    return false;
  }
  if (!data?.length) return false;

  const ok = applyTimeLedgerTasksFromServer(data);
  if (ok) migrateTimeLogRowsTaskIds();
  return ok;
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
    syncTimeLedgerTasksToSupabase().catch((e) =>
      console.warn("[time-ledger-tasks]", e),
    );
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachTimeLedgerTasksSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("time-ledger-tasks-saved", () => {
    scheduleTimeLedgerTasksSyncPush();
  });
}

export async function hydrateTimeLedgerTasksFromCloud() {
  if (!supabase) return;
  attachTimeLedgerTasksSaveListener();
  await pushTimeLedgerTasksIfServerEmpty();
  const pulled = await pullTimeLedgerTasksFromSupabase();
  if (!pulled) {
    getFullTaskOptions();
    migrateTimeLogRowsTaskIds();
  }
  await logTimeLedgerTaskInventory("시간가계부 로드 후");
}
