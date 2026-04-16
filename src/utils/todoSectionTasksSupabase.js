/**
 * 할일/일정 섹션 할 일 ↔ Supabase (calendar_section_tasks). KPI JSON 미포함.
 *
 * 진실 원천: Supabase만. 이 기기 메모리는 표시용 버퍼이며, 서버 SELECT로 덮어쓴 뒤가 기준이다.
 * - 편집·저장 직후에만: 메모리 행 일괄 upsert → 서버 SELECT로 메모리 확정(디바운스·탭 숨김 flush 없음).
 * - pull(탭·hydrate): SELECT만 — 메모리 upsert 선행 없음.
 * - 카드 삭제: 로컬 저장 목록에서 해당 줄을 먼저 제거한 뒤 Supabase DELETE(순서 바꾸면 대기 중인 sync가 옛 목록으로 upsert 해 부활시킬 수 있음). 전체 맞춤은 탭 pull.
 */

import { supabase } from "../supabase.js";
import {
  flattenCalendarTasksForSync,
  ensureCalendarSectionTaskIds,
  snapshotSectionTasksSemanticForCompare,
  replaceSectionTasksFromServerRows,
  writeSectionTasksObject,
  writeCustomSectionTasksObject,
} from "./todoSectionTasksModel.js";
import { runTodoSectionTasksSerialized } from "./todoSectionTasksServerSyncSerial.js";
import { patchAllTodoDomTaskIdsFromStorage } from "./todoDomTaskIdPatch.js";
import { consumeTodoAddPendingServerLog, logTodoScheduleAddStep3 } from "./lpTabDataSourceLog.js";

const TABLE = "calendar_section_tasks";

/** 서버(calendar_section_tasks)에 행이 있을 수 있는 id — UUID만 */
const SERVER_TASK_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 사용자 삭제 시 1차로 호출: 해당 행을 Supabase에서 바로 제거한다.
 * - UUID가 아니면(아직 서버에 없는 임시 줄) 네트워크 호출 없이 성공으로 간주.
 * - 직렬 큐 안에서 실행되어 편집 upsert·sync와 순서가 꼬이지 않게 함.
 * @returns {Promise<{ ok: boolean, reason?: string, localOnlyId?: boolean, alreadyGone?: boolean, deleteRows?: number, serverVerify?: Record<string, unknown> }>}
 */
export async function deleteCalendarSectionTaskRowById(taskId) {
  const out = await runTodoSectionTasksSerialized(async () => {
    const id = String(taskId || "").trim();
    if (!id) return { ok: false, reason: "no_id", serverVerify: null };

    async function selectExists() {
      const { data: row, error: selErr } = await supabase
        .from(TABLE)
        .select("id")
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (selErr) return { error: selErr.message, 서버에행있음: null };
      return { error: null, 서버에행있음: !!row?.id };
    }

    if (!SERVER_TASK_UUID_RE.test(id)) {
      return {
        ok: true,
        localOnlyId: true,
        serverVerify: { 비UUID: true, note: "서버 calendar_section_tasks 조회 생략" },
      };
    }
    const userId = await getSessionUserId();
    if (!userId || !supabase) return { ok: false, reason: !supabase ? "no_supabase" : "no_session", serverVerify: null };

    const { error, count } = await supabase
      .from(TABLE)
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      return { ok: false, reason: error.message || "delete_failed", serverVerify: { 단계: "DELETE요청실패", message: error.message } };
    }
    const n = typeof count === "number" ? count : 0;

    let v = await selectExists();
    if (v.error) {
      return {
        ok: false,
        reason: "delete후_확인SELECT실패",
        serverVerify: { DELETE영향행수: n, 확인SELECT에러: v.error },
      };
    }

    if (n === 0) {
      if (v.서버에행있음) {
        return {
          ok: false,
          reason: "delete_affected_0_rows",
          serverVerify: { DELETE영향행수: 0, 서버확인: "행아직있음" },
        };
      }
      return {
        ok: true,
        alreadyGone: true,
        serverVerify: { DELETE영향행수: 0, 서버확인: "행없음_이미삭제됐거나없음" },
      };
    }

    /*
     * DELETE 영향 행이 있는데 곧바로 확인 SELECT에 행이 남아 보이는 경우:
     * - 읽기 경로 지연(복제 지연 등)으로 삭제 직후 스냅샷이 잠깐 옛 상태일 수 있음
     * → 짧은 간격으로 확인 SELECT만 몇 번 더 함
     */
    let verifyRetries = 0;
    const maxVerifyRetries = 8;
    const verifyDelayMs = 75;
    while (v.서버에행있음 && verifyRetries < maxVerifyRetries) {
      verifyRetries += 1;
      await new Promise((resolve) => setTimeout(resolve, verifyDelayMs));
      v = await selectExists();
      if (v.error) {
        return {
          ok: false,
          reason: "delete후_확인SELECT실패",
          serverVerify: { DELETE영향행수: n, 확인SELECT에러: v.error, 확인재시도횟수: verifyRetries },
        };
      }
    }

    if (v.서버에행있음) {
      return {
        ok: false,
        reason: "delete후_서버에행남음",
        serverVerify: {
          DELETE영향행수: n,
          서버확인: "삭제했는데SELECT에남음",
          확인재시도횟수: verifyRetries,
        },
      };
    }
    return {
      ok: true,
      deleteRows: n,
      serverVerify: {
        DELETE영향행수: n,
        서버확인: "삭제후SELECT로없음",
        확인재시도횟수: verifyRetries,
      },
    };
  });
  return out;
}

const SECTION_TASK_ROW_SELECT =
  "id, section_key, is_custom_section, sort_order, name, start_date, due_date, start_time, end_time, reminder_date, reminder_time, eisenhower, done, item_type, updated_at";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * 메모리에 있는 실질 행을 서버에 반영(localModifiedAt·tombstone 없이 일괄 upsert).
 * @returns {Promise<{ upserted: number }>}
 */
async function upsertCalendarSectionTaskRowsFromMemory() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    return { upserted: 0 };
  }

  ensureCalendarSectionTaskIds();

  const payloads = flattenCalendarTasksForSync(userId).filter((p) => !!p);
  if (payloads.length === 0) {
    return { upserted: 0 };
  }

  const { error } = await supabase.from(TABLE).upsert(payloads, { onConflict: "id" });
  if (error) {
    return { upserted: 0 };
  }
  return { upserted: payloads.length };
}

export function persistSectionTasksAndSchedule(obj) {
  writeSectionTasksObject(obj);
  void syncTodoSectionTasksToSupabase().catch(() => {});
}

export function persistCustomSectionTasksAndSchedule(obj) {
  writeCustomSectionTasksObject(obj);
  void syncTodoSectionTasksToSupabase().catch(() => {});
}

/** 완료 항목 일괄 제거 시: 서버에 남아 있는 done=true 행을 직접 삭제(upsert만으로는 로컬에 id가 남으면 계속 재업로드될 수 있음) */
export async function deleteCompletedCalendarSectionTasksFromSupabase() {
  return runTodoSectionTasksSerialized(async () => {
    const userId = await getSessionUserId();
    if (!userId || !supabase) {
      return;
    }
    await supabase.from(TABLE).delete().eq("user_id", userId).eq("done", true);
  });
}

async function syncTodoSectionTasksToSupabaseImpl(replaceLabel = "sync") {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    return;
  }

  const ensured = ensureCalendarSectionTaskIds();

  const { data: canonicalRows, error: canErr } = await supabase
    .from(TABLE)
    .select(SECTION_TASK_ROW_SELECT)
    .eq("user_id", userId)
    .order("section_key", { ascending: true })
    .order("is_custom_section", { ascending: true })
    .order("sort_order", { ascending: true });
  let replacedFromServer = false;
  if (!canErr && Array.isArray(canonicalRows)) {
    const beforeSnap = snapshotSectionTasksSemanticForCompare();
    replaceSectionTasksFromServerRows(canonicalRows, replaceLabel);
    const afterSnap = snapshotSectionTasksSemanticForCompare();
    replacedFromServer = beforeSnap !== afterSnap;
  }

  if (replacedFromServer) {
    try {
      window.__lpRenderMain?.({ skipTodoSaveBeforeUnmount: true });
    } catch (_) {}
  } else if (ensured.dirty) {
    patchAllTodoDomTaskIdsFromStorage();
  }
}

export async function syncTodoSectionTasksToSupabase() {
  return runTodoSectionTasksSerialized(async () => {
    await upsertCalendarSectionTaskRowsFromMemory();
    await syncTodoSectionTasksToSupabaseImpl("sync");
    const addMeta = consumeTodoAddPendingServerLog();
    if (addMeta) logTodoScheduleAddStep3(addMeta);
  });
}

/**
 * (선택) 삭제 직후 서버 SELECT로 메모리 통째 교체 — TodoList 카드 삭제 경로에서는 호출하지 않음(탭 pull로 맞춤).
 * 행 삭제(DELETE) 직후: 메모리→서버 upsert 없이 SELECT만.
 */
export async function replaceTodoSectionTasksFromServerAfterDelete(reason = "delete") {
  cancelTodoSectionTasksSyncPushSchedule();
  return runTodoSectionTasksSerialized(async () => {
    await syncTodoSectionTasksToSupabaseImpl("delete-refresh");
  });
}

async function pullTodoSectionTasksFromSupabaseImpl(reason = "pull") {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    return false;
  }

  cancelTodoSectionTasksSyncPushSchedule();

  const { data, error } = await supabase
    .from(TABLE)
    .select(SECTION_TASK_ROW_SELECT)
    .eq("user_id", userId)
    .order("section_key", { ascending: true })
    .order("is_custom_section", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    return false;
  }

  const rows = Array.isArray(data) ? data : [];

  const beforeSnap = snapshotSectionTasksSemanticForCompare();
  replaceSectionTasksFromServerRows(rows, "pull");
  const afterSnap = snapshotSectionTasksSemanticForCompare();
  const changed = beforeSnap !== afterSnap;
  return changed;
}

export async function pullTodoSectionTasksFromSupabase(_reason = "pull") {
  const reason = String(_reason || "pull");
  /* pull 직전 flush(메모리→서버 upsert) 금지 — 탭에서 받아오기는 SELECT만 */
  cancelTodoSectionTasksSyncPushSchedule();
  return runTodoSectionTasksSerialized(() => pullTodoSectionTasksFromSupabaseImpl(reason));
}

async function pushAllLocalTodoSectionTasksIfServerEmptyImpl() {
  /* 예전: 서버 행 0일 때 통째 캐시 upsert — 폐기. */
}

export async function pushAllLocalTodoSectionTasksIfServerEmpty() {
  return runTodoSectionTasksSerialized(() => pushAllLocalTodoSectionTasksIfServerEmptyImpl());
}

/** 예전 디바운스 예약 취소용 — 호환만 유지(예약 없음) */
export function cancelTodoSectionTasksSyncPushSchedule() {}

export function flushTodoSectionTasksSyncPush() {
  return syncTodoSectionTasksToSupabase();
}

/** 삭제·즉시 반영: 디바운스 없이 sync(끝에서 서버 SELECT로 로컬 확정) */
export function persistFixedSectionTasksAndSyncNow(obj) {
  writeSectionTasksObject(obj);
  return flushTodoSectionTasksSyncPush();
}

export function persistCustomSectionTasksAndSyncNow(obj) {
  writeCustomSectionTasksObject(obj);
  return flushTodoSectionTasksSyncPush();
}

/**
 * 할일/일정 상위 탭 + 서브탭이 같은 순간에 각각 hydrate를 호출하면 pull이 연달아 돌고
 * 서버 스냅샷으로 로컬이 두 번 덮이며(sync·다른 기기 상태와 레이스) 개수가 되살아나는 문제가 있음 → 한 묶음으로만 pull.
 */
function shouldCoalesceCalendarTodoHydrate(reason) {
  const r = String(reason || "");
  return (
    r.startsWith("app_setActiveTab_calendar") ||
    r.startsWith("app_setActiveTab_schedulecalendar") ||
    r.startsWith("calendar_subtab_") ||
    r.includes("calendar_mobile_schedule")
  );
}

let _calendarTodoHydrateCoalesceTimer = null;
let _calendarTodoHydrateCoalesceLastReason = "unknown";
let _calendarTodoHydrateCoalesceWaiters = [];

/**
 * @returns {Promise<boolean>} 서버 데이터로 로컬을 덮어썼거나 id 보정 등으로 화면 갱신이 필요하면 true
 */
async function hydrateTodoSectionTasksFromCloudImpl(reason = "unknown") {
  if (!supabase) {
    return false;
  }
  let needRefresh = false;
  const e1 = ensureCalendarSectionTaskIds();
  if (e1.dirty) patchAllTodoDomTaskIdsFromStorage();
  const pulled = await pullTodoSectionTasksFromSupabase(`hydrate←${reason}`);
  if (pulled) needRefresh = true;
  await pushAllLocalTodoSectionTasksIfServerEmpty();
  const e2 = ensureCalendarSectionTaskIds();
  if (e2.dirty) patchAllTodoDomTaskIdsFromStorage();
  return needRefresh;
}

const CALENDAR_HYDRATE_COALESCE_MS = 150;

export async function hydrateTodoSectionTasksFromCloud(reason = "unknown") {
  if (!shouldCoalesceCalendarTodoHydrate(reason)) {
    if (_calendarTodoHydrateCoalesceTimer) {
      clearTimeout(_calendarTodoHydrateCoalesceTimer);
      _calendarTodoHydrateCoalesceTimer = null;
    }
    return hydrateTodoSectionTasksFromCloudImpl(reason);
  }
  _calendarTodoHydrateCoalesceLastReason = reason;
  return new Promise((resolve, reject) => {
    _calendarTodoHydrateCoalesceWaiters.push({ resolve, reject });
    if (_calendarTodoHydrateCoalesceTimer) clearTimeout(_calendarTodoHydrateCoalesceTimer);
    _calendarTodoHydrateCoalesceTimer = setTimeout(() => {
      _calendarTodoHydrateCoalesceTimer = null;
      const merged = _calendarTodoHydrateCoalesceLastReason;
      const coalescedReason = `calendar_coalesced←${merged}`;
      const waiters = _calendarTodoHydrateCoalesceWaiters;
      _calendarTodoHydrateCoalesceWaiters = [];
      hydrateTodoSectionTasksFromCloudImpl(coalescedReason)
        .then((out) => {
          waiters.forEach((w) => w.resolve(out));
        })
        .catch((err) => {
          waiters.forEach((w) => w.reject(err));
        });
    }, CALENDAR_HYDRATE_COALESCE_MS);
  });
}
