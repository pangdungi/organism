/**
 * 할일 섹션 할 일 ↔ Supabase `calendar_section_tasks`
 *
 * 단일 저장 원본은 서버(Supabase)이다. 로컬·세션 메모리·DOM 스냅샷·캐시는
 * 서버에 일괄 반영하지 않는다.
 *
 * - Supabase INSERT/UPDATE/DELETE: 모달 저장·삭제 확정, 우클릭 리스트 이동, … 완료 일괄 제거 시 done=true 행 DELETE.
 * - 할일/일정 탭·캘린더 진입: `pullCalendarSectionTasksFromSupabase` — 스탬프 동일 시 생략,
 *   아니면 미완료 전체 + 보는 구간의 완료 할일만 SELECT 후 병합(할일 목록 탭은 forceFull).
 * - persist*ToSessionMemOnly: 앱 안 임시 목록만 갱신 — 서버 호출 없음.
 */

import { supabase } from "../supabase.js";
import { getCustomSections } from "./todoSettings.js";
import {
  writeSectionTasksObject,
  writeCustomSectionTasksObject,
  localTaskToDbPayload,
  applyCalendarSectionTasksServerSnapshot,
  mergeCalendarSectionTasksServerSnapshot,
  readSectionTasksObject,
  readCustomSectionTasksObject,
  CALENDAR_FIXED_SECTION_IDS,
} from "./todoSectionTasksModel.js";
import { runTodoSectionTasksSerialized } from "./todoSectionTasksServerSyncSerial.js";
import {
  trackPendingCalendarSectionTaskUpsert,
  clearPendingCalendarSectionTaskUpsert,
  mergePendingCalendarSectionTasksIntoSessionMemory,
  shouldRetryCalendarSectionTaskUpsert,
  schedulePendingCalendarSectionTaskUpsertRetry,
  getPendingCalendarSectionTaskUpsertParams,
} from "./todoSectionTasksPendingUpsert.js";
import { consumeTodoAddPendingServerLog, logTodoScheduleAddStep3 } from "./lpTabDataSourceLog.js";
import { logTodoServerCrud } from "./todoSectionTasksServerCrudDebug.js";
import {
  computeCalendarSectionTasksStampFromRows,
  fetchCalendarSectionTasksServerStamp,
  probeCalendarSectionTasksPullSkip,
  rememberCalendarSectionTasksPullStamp,
} from "./calendarSectionTasksPullStamp.js";
import { calendarPullRangeYmdForMonth } from "./calendarSectionTasksPullRange.js";

const TABLE = "calendar_section_tasks";
const UPSERT_CONFLICT_ROW = "user_id,id";

const SERVER_TASK_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * @param {{ task: object, sectionKey: string, isCustom: boolean, sortOrder: number }} params
 */
async function performCalendarSectionTaskUpsertOnce(params) {
  const { task, sectionKey, isCustom, sortOrder } = params;
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    logTodoServerCrud("SKIP", {
      이유: !supabase ? "no_supabase" : "no_session",
      안내: "Supabase 요청 없음(세션/클라이언트 없음)",
    });
    return { ok: false, reason: !supabase ? "no_supabase" : "no_session" };
  }
  const sk = String(sectionKey || "").trim();
  const so = typeof sortOrder === "number" && sortOrder >= 0 ? sortOrder : 0;
  const p = localTaskToDbPayload(userId, sk, !!isCustom, so, task);
  if (!p) {
    logTodoServerCrud("SKIP", {
      이유: "payload_null",
      안내: "UUID 아닌 taskId 등으로 Supabase upsert 안 함",
      section_key: sk,
    });
    return { ok: false, reason: "payload_null" };
  }
  logTodoServerCrud("UPSERT", {
    id: p.id,
    section_key: p.section_key,
    제목일부: String(p.name || "").slice(0, 40),
    sort_order: p.sort_order,
    안내: "지금부터 supabase.from(...).upsert — 세션 메모리 경유 아님",
  });
  const { error } = await supabase.from(TABLE).upsert([p], { onConflict: UPSERT_CONFLICT_ROW });
  if (error) {
    logTodoServerCrud("UPSERT", { id: p.id, 결과: "실패", message: error.message || "upsert_failed" });
    return { ok: false, reason: error.message || "upsert_failed" };
  }
  logTodoServerCrud("UPSERT", { id: p.id, 결과: "성공", section_key: p.section_key });
  const addMeta = consumeTodoAddPendingServerLog();
  if (addMeta) logTodoScheduleAddStep3(addMeta);
  return { ok: true };
}

function finishCalendarSectionTaskUpsertAttempt(taskId, params, result) {
  const id = String(taskId || "").trim();
  if (!id) return result;
  if (result?.ok) {
    clearPendingCalendarSectionTaskUpsert(id);
    return result;
  }
  if (!shouldRetryCalendarSectionTaskUpsert(result?.reason)) {
    clearPendingCalendarSectionTaskUpsert(id);
    return result;
  }
  schedulePendingCalendarSectionTaskUpsertRetry(id, () =>
    runTodoSectionTasksSerialized(async () => {
      const latest = getPendingCalendarSectionTaskUpsertParams(id);
      if (!latest) return { ok: false, reason: "pending_cleared" };
      const retryResult = await performCalendarSectionTaskUpsertOnce(latest);
      return finishCalendarSectionTaskUpsertAttempt(id, latest, retryResult);
    }),
  );
  return result;
}

/**
 * 모달에서 넘긴 task 객체로 곧바로 Supabase upsert — 세션 메모리·DOM collect 경유 없음.
 * 실패 시 알림 없이 백그라운드 재시도. (+)모달·카드 편집 모달 저장에서만 호출.
 */
export async function upsertCalendarSectionTaskDirectFromModal({ task, sectionKey, isCustom, sortOrder }) {
  const params = { task, sectionKey, isCustom, sortOrder };
  const taskId = String(task?.taskId || "").trim();
  trackPendingCalendarSectionTaskUpsert(params);
  return runTodoSectionTasksSerialized(async () => {
    const result = await performCalendarSectionTaskUpsertOnce(params);
    return finishCalendarSectionTaskUpsertAttempt(taskId, params, result);
  });
}

/**
 * persist* 직후 세션 메모리의 한 행을 서버에 맞춤 — 할일 체크·캘린더 편집 등 공통.
 * @param {HTMLElement | null} [listRootEl] `.todo-sections-wrap` 등, DOM에서 sort_order 추정용
 */
export function upsertCalendarSectionTaskRowFromSessionMemory(
  sectionId,
  taskId,
  listRootEl,
) {
  const sid = String(sectionId || "").trim();
  const tid = String(taskId || "").trim();
  if (!sid || !tid || sid === "overdue") return;
  const isCustom = sid.startsWith("custom-");
  if (!isCustom && !CALENDAR_FIXED_SECTION_IDS.includes(sid)) return;

  const obj = isCustom ? readCustomSectionTasksObject() : readSectionTasksObject();
  const arr = obj[sid];
  const t = Array.isArray(arr) ? arr.find((x) => String(x.taskId || "") === tid) : null;
  if (!t || !String(t.name || "").trim()) return;

  let sortOrder = 0;
  let domIdx = -1;
  const secEl = listRootEl?.querySelector?.(`.todo-section[data-section="${sid}"]`);
  if (secEl) {
    const cardsWrap = secEl.querySelector(".todo-cards-wrap");
    if (cardsWrap) {
      const cards = Array.from(cardsWrap.querySelectorAll(".todo-card"));
      const idx = cards.findIndex((c) => (c.dataset.taskId || "") === tid);
      if (idx >= 0) domIdx = idx;
    } else {
      const tbody = secEl.querySelector("tbody");
      if (tbody) {
        const rows = Array.from(
          tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)"),
        );
        const idx = rows.findIndex((r) => (r.dataset.taskId || "") === tid);
        if (idx >= 0) domIdx = idx;
      }
    }
  }
  if (domIdx >= 0) sortOrder = domIdx;
  else if (Array.isArray(arr)) {
    const idxFromStorage = arr.findIndex((x) => String(x.taskId || "") === tid);
    if (idxFromStorage >= 0) sortOrder = idxFromStorage;
  }

  void upsertCalendarSectionTaskDirectFromModal({
    task: {
      taskId: tid,
      name: String(t.name || "").trim(),
      startDate: (t.startDate || "").slice(0, 10) || "",
      dueDate: (t.dueDate || "").slice(0, 10) || "",
      startTime: String(t.startTime || "").trim(),
      endTime: String(t.endTime || "").trim(),
      eisenhower: String(t.eisenhower || "").trim(),
      done: !!t.done,
      itemType: String(t.itemType || "todo").trim() || "todo",
      reminderDate: (t.reminderDate || "").slice(0, 10) || "",
      reminderTime: String(t.reminderTime || "").trim(),
    },
    sectionKey: sid,
    isCustom,
    sortOrder,
  });
}

/**
 * 사용자가 카드 삭제를 확정했을 때만 호출 — 서버에서 해당 행 DELETE.
 */
export async function deleteCalendarSectionTaskRowById(taskId) {
  const out = await runTodoSectionTasksSerialized(async () => {
    const id = String(taskId || "").trim();
    if (!id) {
      logTodoServerCrud("SKIP", { 이유: "no_id", 안내: "Supabase DELETE 없음" });
      return { ok: false, reason: "no_id", serverVerify: null };
    }

    async function selectExists(userId) {
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
      logTodoServerCrud("SKIP", {
        id,
        이유: "비UUID_id",
        안내: "서버 calendar_section_tasks DELETE 안 함(로컬 전용 id)",
      });
      clearPendingCalendarSectionTaskUpsert(id);
      return {
        ok: true,
        localOnlyId: true,
        serverVerify: { 비UUID: true, note: "서버 calendar_section_tasks 조회 생략" },
      };
    }
    const userId = await getSessionUserId();
    if (!userId || !supabase) {
      logTodoServerCrud("SKIP", {
        id,
        이유: !supabase ? "no_supabase" : "no_session",
        안내: "Supabase DELETE 요청 없음",
      });
      return { ok: false, reason: !supabase ? "no_supabase" : "no_session", serverVerify: null };
    }

    logTodoServerCrud("DELETE", {
      id,
      안내: "지금부터 supabase.from(...).delete — 세션 메모리 경유 아님",
    });
    const { error, count } = await supabase
      .from(TABLE)
      .delete({ count: "exact" })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) {
      logTodoServerCrud("DELETE", { id, 결과: "실패", message: error.message || "delete_failed" });
      return { ok: false, reason: error.message || "delete_failed", serverVerify: { 단계: "DELETE요청실패", message: error.message } };
    }
    const n = typeof count === "number" ? count : 0;

    let v = await selectExists(userId);
    if (v.error) {
      logTodoServerCrud("DELETE", { id, 결과: "실패", 이유: "delete후_확인SELECT실패", message: v.error });
      return {
        ok: false,
        reason: "delete후_확인SELECT실패",
        serverVerify: { DELETE영향행수: n, 확인SELECT에러: v.error },
      };
    }

    if (n === 0) {
      if (v.서버에행있음) {
        logTodoServerCrud("DELETE", { id, 결과: "실패", 이유: "delete_affected_0_rows", DELETE영향행수: 0 });
        return {
          ok: false,
          reason: "delete_affected_0_rows",
          serverVerify: { DELETE영향행수: 0, 서버확인: "행아직있음" },
        };
      }
      logTodoServerCrud("DELETE", {
        id,
        결과: "완료",
        안내: "DELETE 영향 0행·서버에 원래 없음(이미 삭제됨)",
      });
      clearPendingCalendarSectionTaskUpsert(id);
      return {
        ok: true,
        alreadyGone: true,
        serverVerify: { DELETE영향행수: 0, 서버확인: "행없음_이미삭제됐거나없음" },
      };
    }

    let verifyRetries = 0;
    const maxVerifyRetries = 8;
    const verifyDelayMs = 75;
    while (v.서버에행있음 && verifyRetries < maxVerifyRetries) {
      verifyRetries += 1;
      await new Promise((resolve) => setTimeout(resolve, verifyDelayMs));
      v = await selectExists(userId);
      if (v.error) {
        logTodoServerCrud("DELETE", {
          id,
          결과: "실패",
          이유: "delete후_확인SELECT실패",
          message: v.error,
          확인재시도횟수: verifyRetries,
        });
        return {
          ok: false,
          reason: "delete후_확인SELECT실패",
          serverVerify: { DELETE영향행수: n, 확인SELECT에러: v.error, 확인재시도횟수: verifyRetries },
        };
      }
    }

    if (v.서버에행있음) {
      logTodoServerCrud("DELETE", { id, 결과: "실패", 이유: "delete후_서버에행남음", DELETE영향행수: n });
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
    logTodoServerCrud("DELETE", {
      id,
      결과: "성공",
      DELETE영향행수: n,
      안내: "서버에서 해당 id 행 삭제됨(확인 SELECT로 없음)",
    });
    clearPendingCalendarSectionTaskUpsert(id);
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

/** 세션 메모리만 — 서버 쓰기 없음 */
export function persistSectionTasksAndSchedule(obj) {
  writeSectionTasksObject(obj);
  return Promise.resolve();
}

/** 세션 메모리만 — 서버 쓰기 없음 */
export function persistCustomSectionTasksAndSchedule(obj) {
  writeCustomSectionTasksObject(obj);
  return Promise.resolve();
}

/** 완료 일괄 제거(할일 설정 모달) — 서버에서 done=true 행만 삭제 후 pull 권장 */
export async function deleteCompletedCalendarSectionTasksFromSupabase() {
  return runTodoSectionTasksSerialized(async () => {
    const userId = await getSessionUserId();
    if (!userId || !supabase) {
      logTodoServerCrud("SKIP", {
        이유: !supabase ? "no_supabase" : "no_session",
        안내: "완료 일괄 DELETE 생략",
      });
      return {
        ok: false,
        reason: !supabase ? "no_supabase" : "no_session",
        deleted: 0,
      };
    }
    logTodoServerCrud("DELETE", {
      일괄: "done_true",
      안내: "calendar_section_tasks done=true & item_type≠schedule DELETE",
    });
    const { error, count } = await supabase
      .from(TABLE)
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("done", true)
      .neq("item_type", "schedule");
    if (error) {
      logTodoServerCrud("DELETE", {
        결과: "실패",
        message: error.message || "delete_failed",
      });
      return { ok: false, reason: error.message || "delete_failed", deleted: 0 };
    }
    logTodoServerCrud("DELETE", {
      결과: "성공",
      DELETE행수: count,
    });
    return { ok: true, deleted: typeof count === "number" ? count : -1 };
  });
}

/** 일괄 sync 없음 */
export async function syncTodoSectionTasksToSupabase() {
  consumeTodoAddPendingServerLog();
}

export async function replaceTodoSectionTasksFromServerAfterDelete(_reason = "delete") {
  return runTodoSectionTasksSerialized(async () => {});
}

export async function pushAllLocalTodoSectionTasksIfServerEmpty() {}

export function cancelTodoSectionTasksSyncPushSchedule() {}

export function flushTodoSectionTasksSyncPush() {
  return Promise.resolve();
}

/** 이름에 Sync 가 들어가면 서버 동기로 오해됨 — 세션 메모리만 씀 */
export function persistFixedSectionTasksToSessionMemOnly(obj) {
  writeSectionTasksObject(obj);
  return Promise.resolve();
}

export function persistCustomSectionTasksToSessionMemOnly(obj) {
  writeCustomSectionTasksObject(obj);
  return Promise.resolve();
}

async function fetchCalendarSectionTasksRowsForPull(userId, opts = {}) {
  const rs = String(opts.rangeStart || "").trim().slice(0, 10);
  const re = String(opts.rangeEnd || "").trim().slice(0, 10);
  const useRange = !opts.forceFull && rs && re;

  if (!useRange) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("section_key", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) return { ok: false, error, rows: [] };
    return { ok: true, rows: Array.isArray(data) ? data : [], mode: "full" };
  }

  const undoneRes = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("done", false)
    .order("section_key", { ascending: true })
    .order("sort_order", { ascending: true });
  if (undoneRes.error) {
    return { ok: false, error: undoneRes.error, rows: [] };
  }

  const doneRes = await supabase
    .from(TABLE)
    .select("*")
    .eq("user_id", userId)
    .eq("done", true)
    .or(
      `and(start_date.lte.${re},due_date.gte.${rs}),and(start_date.is.null,due_date.gte.${rs},due_date.lte.${re})`,
    )
    .order("section_key", { ascending: true })
    .order("sort_order", { ascending: true });

  if (doneRes.error) {
    logTodoServerCrud("PULL", {
      mode: "range_fallback_full",
      message: doneRes.error.message || "range_done_query_failed",
    });
    const full = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("section_key", { ascending: true })
      .order("sort_order", { ascending: true });
    if (full.error) return { ok: false, error: full.error, rows: [] };
    return { ok: true, rows: Array.isArray(full.data) ? full.data : [], mode: "full_fallback" };
  }

  const byId = new Map();
  for (const row of [...(undoneRes.data || []), ...(doneRes.data || [])]) {
    const id = String(row?.id || "").trim();
    if (id) byId.set(id, row);
  }
  return { ok: true, rows: [...byId.values()], mode: "range" };
}

/**
 * 할일/일정: 탭 클릭 시 — 서버 스탬프가 같으면 SELECT 생략, 아니면 pull(기간 또는 전체).
 * @param {{ reason?: string, subView?: string, force?: boolean, rangeStart?: string, rangeEnd?: string, forceFull?: boolean }} [opts]
 */
export async function pullCalendarSectionTasksFromSupabase(opts = {}) {
  const {
    reason = "pull",
    subView,
    force = false,
    rangeStart,
    rangeEnd,
    forceFull = false,
  } = opts;
  return runTodoSectionTasksSerialized(async () => {
    const userId = await getSessionUserId();
    if (!userId || !supabase) {
      return { ok: false, reason: !supabase ? "no_supabase" : "no_session", rowCount: 0 };
    }

    const probe = await probeCalendarSectionTasksPullSkip({
      force,
      rangeStart,
      rangeEnd,
    });
    if (probe.skip) {
      mergePendingCalendarSectionTasksIntoSessionMemory();
      logTodoServerCrud("PULL", {
        reason: String(reason || ""),
        subView: subView != null ? String(subView) : "",
        rowCount: probe.serverStamp?.rowCount ?? 0,
        skipped: true,
        skipReason: probe.reason,
        안내: "서버 스탬프 동일 — SELECT 생략",
      });
      return {
        ok: true,
        rowCount: probe.serverStamp?.rowCount ?? 0,
        skipped: true,
      };
    }

    let rs = String(rangeStart || "").trim().slice(0, 10);
    let re = String(rangeEnd || "").trim().slice(0, 10);
    if (!forceFull && !rs && !re && subView === "calendar") {
      const now = new Date();
      const auto = calendarPullRangeYmdForMonth(
        now.getFullYear(),
        now.getMonth(),
        21,
      );
      rs = auto.rangeStart;
      re = auto.rangeEnd;
    }

    const fetched = await fetchCalendarSectionTasksRowsForPull(userId, {
      rangeStart: forceFull ? "" : rs,
      rangeEnd: forceFull ? "" : re,
      forceFull,
    });

    if (!fetched.ok) {
      return {
        ok: false,
        reason: fetched.error?.message || "select_failed",
        rowCount: 0,
      };
    }

    const rows = fetched.rows;
    const knownCustomSectionIds = getCustomSections().map((s) => s.id).filter(Boolean);
    const useRangeMerge =
      !forceFull &&
      fetched.mode === "range" &&
      rs &&
      re &&
      fetched.mode !== "full_fallback";

    if (useRangeMerge) {
      mergeCalendarSectionTasksServerSnapshot(rows, knownCustomSectionIds, {
        rangeStart: rs,
        rangeEnd: re,
      });
    } else {
      applyCalendarSectionTasksServerSnapshot(rows, knownCustomSectionIds);
    }
    mergePendingCalendarSectionTasksIntoSessionMemory();

    const serverStamp =
      (await fetchCalendarSectionTasksServerStamp(userId)) ||
      computeCalendarSectionTasksStampFromRows(rows);
    rememberCalendarSectionTasksPullStamp(serverStamp);

    logTodoServerCrud("PULL", {
      reason: String(reason || ""),
      subView: subView != null ? String(subView) : "",
      rowCount: rows.length,
      skipped: false,
      skipReason: probe.reason,
      pullMode: fetched.mode,
      rangeStart: useRangeMerge ? rs : "",
      rangeEnd: useRangeMerge ? re : "",
      안내: useRangeMerge
        ? "기간 pull → 세션 메모리 병합"
        : "서버 SELECT → 세션 메모리 전체 교체",
    });

    return { ok: true, rowCount: rows.length, skipped: false, mode: fetched.mode };
  });
}
