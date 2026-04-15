/**
 * 할일/일정 섹션 할 일 ↔ Supabase (calendar_section_tasks). KPI JSON 미포함.
 */

import { supabase } from "../supabase.js";
import {
  flattenCalendarTasksForSync,
  mergeAdditiveServerRowsIntoLocal,
  ensureCalendarSectionTaskIds,
  snapshotSectionTasksSemanticForCompare,
  replaceSectionTasksFromServerRows,
  writeSectionTasksObject,
  writeCustomSectionTasksObject,
} from "./todoSectionTasksModel.js";
import { runTodoSectionTasksSerialized } from "./todoSectionTasksServerSyncSerial.js";
import { logLpRender } from "./lpRenderDebugLog.js";
import { lpPullDebug } from "./lpPullDebug.js";
import { todoSchedulePullTrace } from "./todoSchedulePullTrace.js";
import { patchAllTodoDomTaskIdsFromStorage } from "./todoDomTaskIdPatch.js";
import { todoSectionSyncLog, todoSectionSyncLogWithStack } from "./todoSectionSyncDebug.js";

const TABLE = "calendar_section_tasks";

const SECTION_TASK_ROW_SELECT =
  "id, section_key, is_custom_section, sort_order, name, start_date, due_date, start_time, end_time, reminder_date, reminder_time, eisenhower, done, item_type, updated_at";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export function persistSectionTasksAndSchedule(obj) {
  todoSectionSyncLogWithStack("persist:고정섹션_메모리저장_후_sync예약", {
    섹션키개수: obj && typeof obj === "object" ? Object.keys(obj).length : 0,
  });
  writeSectionTasksObject(obj);
  scheduleTodoSectionTasksSyncPush();
}

export function persistCustomSectionTasksAndSchedule(obj) {
  todoSectionSyncLogWithStack("persist:커스텀섹션_메모리저장_후_sync예약", {
    섹션키개수: obj && typeof obj === "object" ? Object.keys(obj).length : 0,
  });
  writeCustomSectionTasksObject(obj);
  scheduleTodoSectionTasksSyncPush();
}

/** 완료 항목 일괄 제거 시: 서버에 남아 있는 done=true 행을 직접 삭제(upsert만으로는 로컬에 id가 남으면 계속 재업로드될 수 있음) */
export async function deleteCompletedCalendarSectionTasksFromSupabase() {
  return runTodoSectionTasksSerialized(async () => {
    const userId = await getSessionUserId();
    if (!userId || !supabase) return;
    const { error } = await supabase.from(TABLE).delete().eq("user_id", userId).eq("done", true);
    if (error) console.warn("[calendar-section-tasks] delete completed rows", error.message);
  });
}

async function syncTodoSectionTasksToSupabaseImpl() {
  todoSectionSyncLogWithStack("syncImpl:시작(서버와맞춤)");
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    todoSectionSyncLog("syncImpl:중단", { 이유: !supabase ? "supabase없음" : "로그인없음" });
    return;
  }

  const ensured = ensureCalendarSectionTaskIds();

  /* 다른 기기에서 추가된 행 id를 로컬에 먼저 합친 뒤 wantIds를 계산 — 고아 삭제가 타 기기 신규 행을 지우지 않게 함 */
  const { data: serverSnapshot, error: snapErr } = await supabase
    .from(TABLE)
    .select(SECTION_TASK_ROW_SELECT)
    .eq("user_id", userId)
    .order("section_key", { ascending: true })
    .order("is_custom_section", { ascending: true })
    .order("sort_order", { ascending: true });
  if (!snapErr && Array.isArray(serverSnapshot) && serverSnapshot.length > 0) {
    mergeAdditiveServerRowsIntoLocal(serverSnapshot);
  }

  const payloads = flattenCalendarTasksForSync(userId);
  const wantIds = new Set(payloads.map((p) => p.id));

  if (payloads.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(payloads, { onConflict: "id" });
    if (error) {
      console.warn("[calendar-section-tasks] upsert", error.message);
      todoSectionSyncLog("syncImpl:upsert실패", { message: error.message });
      return;
    }
  }

  /*
   * 스냅샷 조회 실패 시 mergeAdditive가 생략되고 payloads가 비면 wantIds가 비어,
   * 아래 고아 삭제에서 서버 행이 전부 지워질 수 있음(빈 로컬로 원격 삭제 금지).
   * upsert만 반영하고 다음 성공 스냅샷까지 고아 삭제는 하지 않음.
   */
  if (snapErr) {
    todoSectionSyncLog("syncImpl:중단", { 이유: "서버스냅샷조회실패_고아삭제생략" });
    return;
  }

  const { data: remote, error: listErr } = await supabase.from(TABLE).select("id").eq("user_id", userId);
  if (listErr || !remote) {
    todoSectionSyncLog("syncImpl:중단", { 이유: "원격id목록실패" });
    return;
  }

  for (const r of remote) {
    const id = String(r.id || "").trim();
    if (id && !wantIds.has(id)) {
      const { error: dErr } = await supabase.from(TABLE).delete().eq("id", id).eq("user_id", userId);
      if (dErr) console.warn("[calendar-section-tasks] delete", dErr.message);
    }
  }

  const { data: canonicalRows, error: canErr } = await supabase
    .from(TABLE)
    .select(SECTION_TASK_ROW_SELECT)
    .eq("user_id", userId)
    .order("section_key", { ascending: true })
    .order("is_custom_section", { ascending: true })
    .order("sort_order", { ascending: true });
  let replacedFromServer = false;
  if (!canErr && Array.isArray(canonicalRows)) {
    /* 의미 있는 필드만 비교 — updated_at 메타만 바뀐 경우 전체 리렌더하지 않음 */
    const beforeSnap = snapshotSectionTasksSemanticForCompare();
    replaceSectionTasksFromServerRows(canonicalRows);
    const afterSnap = snapshotSectionTasksSemanticForCompare();
    replacedFromServer = beforeSnap !== afterSnap;
  }

  /* 서버 스냅샷으로 로컬 문자열이 바뀐 경우만 전체 탭 리렌더. UUID만 맞춘 경우는 DOM data-task-id 만 패치(스크롤 유지). */
  if (replacedFromServer) {
    todoSectionSyncLog("syncImpl:끝→전체화면갱신", {
      ensuredDirty: ensured.dirty,
      replacedFromServer,
      payload수: payloads.length,
    });
    logLpRender("todo:syncTodoSectionTasksToSupabase 완료 → __lpRenderMain", {
      ensuredDirty: ensured.dirty,
      replacedFromServer,
    });
    try {
      window.__lpRenderMain?.({ skipTodoSaveBeforeUnmount: true });
    } catch (_) {}
  } else if (ensured.dirty) {
    todoSectionSyncLog("syncImpl:끝→DOM_taskId만패치", { ensuredDirty: true, replacedFromServer });
    patchAllTodoDomTaskIdsFromStorage();
  } else {
    todoSectionSyncLog("syncImpl:끝(리렌더없음)", {
      ensuredDirty: ensured.dirty,
      replacedFromServer,
      payload수: payloads.length,
    });
  }
}

export async function syncTodoSectionTasksToSupabase() {
  return runTodoSectionTasksSerialized(() => syncTodoSectionTasksToSupabaseImpl());
}

async function pullTodoSectionTasksFromSupabaseImpl(reason = "pull") {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    todoSchedulePullTrace("pull:스킵", { reason, why: !supabase ? "no_supabase" : "no_session" });
    return false;
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select(SECTION_TASK_ROW_SELECT)
    .eq("user_id", userId)
    .order("section_key", { ascending: true })
    .order("is_custom_section", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[calendar-section-tasks] pull", error.message);
    todoSchedulePullTrace("pull:에러", { reason, message: error.message });
    return false;
  }

  const rows = Array.isArray(data) ? data : [];

  /* 서버 스냅샷으로만 덮어씀 — 메타만 다른 경우 needRefresh·연쇄 hydrate 방지 */
  const beforeSnap = snapshotSectionTasksSemanticForCompare();
  replaceSectionTasksFromServerRows(rows);
  const afterSnap = snapshotSectionTasksSemanticForCompare();
  const localChanged = beforeSnap !== afterSnap;
  todoSchedulePullTrace("pull:서버스냅샷반영", {
    reason,
    서버행수: rows.length,
    로컬내용변경: localChanged,
  });
  return localChanged;
}

export async function pullTodoSectionTasksFromSupabase(reason = "pull") {
  return runTodoSectionTasksSerialized(() => pullTodoSectionTasksFromSupabaseImpl(reason));
}

async function pushAllLocalTodoSectionTasksIfServerEmptyImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return;
  if (count != null && count > 0) return;

  ensureCalendarSectionTaskIds();
  const payloads = flattenCalendarTasksForSync(userId);
  if (payloads.length === 0) return;

  const { error: upErr } = await supabase.from(TABLE).upsert(payloads, { onConflict: "id" });
  if (upErr) {
    console.warn("[calendar-section-tasks] push empty server", upErr.message);
    return;
  }
  const { data: rows, error: pullErr } = await supabase
    .from(TABLE)
    .select(SECTION_TASK_ROW_SELECT)
    .eq("user_id", userId)
    .order("section_key", { ascending: true })
    .order("is_custom_section", { ascending: true })
    .order("sort_order", { ascending: true });
  if (!pullErr && Array.isArray(rows)) {
    replaceSectionTasksFromServerRows(rows);
  }
}

export async function pushAllLocalTodoSectionTasksIfServerEmpty() {
  return runTodoSectionTasksSerialized(() => pushAllLocalTodoSectionTasksIfServerEmptyImpl());
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

/** 디바운스 생략 — 탭 전환·백그라운드 직전 삭제·편집이 서버에 반영되도록 */
export function flushTodoSectionTasksSyncPush() {
  todoSectionSyncLogWithStack("flush:디바운스취소_즉시sync");
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  return syncTodoSectionTasksToSupabase();
}

let _flushOnHideAttached = false;
export function attachTodoSectionTasksPushFlushOnHideOnce() {
  if (_flushOnHideAttached || typeof document === "undefined") return;
  _flushOnHideAttached = true;
  const run = () => {
    if (!supabase) return;
    todoSectionSyncLog("탭숨김·나가기:대기중_sync_즉시전송시도");
    void flushTodoSectionTasksSyncPush().catch((e) =>
      console.warn("[calendar-section-tasks] flush", e),
    );
  };
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") run();
    },
    { passive: true },
  );
  window.addEventListener("pagehide", run, { passive: true });
}

export function scheduleTodoSectionTasksSyncPush() {
  if (!supabase) {
    todoSectionSyncLog("schedule:스킵", { 이유: "supabase없음" });
    return;
  }
  attachTodoSectionTasksPushFlushOnHideOnce();
  const hadTimer = !!_pushTimer;
  if (_pushTimer) clearTimeout(_pushTimer);
  todoSectionSyncLog("schedule:약0.9초뒤_sync예약", {
    debounceMs: PUSH_DEBOUNCE_MS,
    이전타이머취소: hadTimer,
  });
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    todoSectionSyncLog("schedule:타이머만료→sync실행");
    syncTodoSectionTasksToSupabase().catch((e) => console.warn("[calendar-section-tasks]", e));
  }, PUSH_DEBOUNCE_MS);
}

/**
 * @param {string} [reason] 호출 지점 구분(콘솔 [할일일정-pull] 필터용)
 * @returns {Promise<boolean>} 서버 데이터로 로컬을 덮어썼거나 id 보정 등으로 화면 갱신이 필요하면 true
 */
export async function hydrateTodoSectionTasksFromCloud(reason = "unknown") {
  lpPullDebug("hydrateTodoSectionTasksFromCloud", { reason });
  todoSectionSyncLog("hydrate:시작(서버에서받기)", { reason, t: Date.now() });
  todoSchedulePullTrace("hydrate:시작", { reason, t: Date.now() });
  if (!supabase) {
    todoSchedulePullTrace("hydrate:끝", { reason, needRefresh: false, why: "no_supabase" });
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
  todoSchedulePullTrace("hydrate:끝", {
    reason,
    needRefresh,
    pull로로컬변경: pulled,
    id보정1: e1.dirty,
    id보정2: e2.dirty,
  });
  todoSectionSyncLog("hydrate:끝(앱다시그릴지)", {
    reason,
    needRefresh,
    pull로로컬변경: pulled,
    id보정만: e1.dirty || e2.dirty,
  });
  return needRefresh;
}
