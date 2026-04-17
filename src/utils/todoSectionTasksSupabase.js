/**
 * 할일 섹션 할 일 ↔ Supabase `calendar_section_tasks`
 *
 * 단일 저장 원본은 서버(Supabase)이다. 로컬·세션 메모리·DOM 스냅샷·캐시는
 * 서버에 일괄 반영하지 않는다.
 *
 * - Supabase INSERT/UPDATE/DELETE: 사용자가 모달에서 저장·삭제를 확정한 경우에만.
 * - 할일/일정 상위 탭·내부 서브탭 클릭 시: `pullCalendarSectionTasksFromSupabase` 한 번으로
 *   해당 사용자의 `calendar_section_tasks` 전체를 SELECT 해 세션 메모리를 교체(그 시점 서버 스냅샷).
 * - persist*ToSessionMemOnly: 앱 안 임시 목록만 갱신 — 서버 호출 없음.
 */

import { supabase } from "../supabase.js";
import { getCustomSections } from "./todoSettings.js";
import {
  writeSectionTasksObject,
  writeCustomSectionTasksObject,
  localTaskToDbPayload,
  applyCalendarSectionTasksServerSnapshot,
} from "./todoSectionTasksModel.js";
import { runTodoSectionTasksSerialized } from "./todoSectionTasksServerSyncSerial.js";
import { consumeTodoAddPendingServerLog, logTodoScheduleAddStep3 } from "./lpTabDataSourceLog.js";
import { logTodoServerCrud } from "./todoSectionTasksServerCrudDebug.js";

const TABLE = "calendar_section_tasks";

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
 * 모달에서 넘긴 task 객체로 곧바로 Supabase upsert — 세션 메모리·DOM collect 경유 없음.
 * (+)모달·카드 편집 모달 저장에서만 호출.
 */
export async function upsertCalendarSectionTaskDirectFromModal({ task, sectionKey, isCustom, sortOrder }) {
  return runTodoSectionTasksSerialized(async () => {
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
    const { error } = await supabase.from(TABLE).upsert([p], { onConflict: "id" });
    if (error) {
      logTodoServerCrud("UPSERT", { id: p.id, 결과: "실패", message: error.message || "upsert_failed" });
      return { ok: false, reason: error.message || "upsert_failed" };
    }
    logTodoServerCrud("UPSERT", { id: p.id, 결과: "성공", section_key: p.section_key });
    const addMeta = consumeTodoAddPendingServerLog();
    if (addMeta) logTodoScheduleAddStep3(addMeta);
    return { ok: true };
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
}

/** 세션 메모리만 — 서버 쓰기 없음 */
export function persistCustomSectionTasksAndSchedule(obj) {
  writeCustomSectionTasksObject(obj);
}

/** 완료 일괄 제거 등 — 서버 일괄 삭제는 모달 전용 정책과 충돌할 수 있어 비활성 */
export async function deleteCompletedCalendarSectionTasksFromSupabase() {}

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

/**
 * 할일/일정: 탭 클릭 시 1회 — `calendar_section_tasks` 서버 행만 SELECT 해 세션 메모리를 덮어씀.
 * @param {{ reason?: string, subView?: string }} [opts] subView는 로그·추후 필터 확장용(현재는 동일 SELECT).
 */
export async function pullCalendarSectionTasksFromSupabase(opts = {}) {
  const { reason = "pull", subView } = opts;
  return runTodoSectionTasksSerialized(async () => {
    const userId = await getSessionUserId();
    if (!userId || !supabase) {
      try {
        console.info("[할일·pull]", "건너뜀", {
          출처: "Supabase 테이블 없음 또는 로그인 없음",
          이유: !supabase ? "no_supabase" : "no_session",
          reason: String(reason || ""),
          subView: subView != null ? String(subView) : "",
        });
      } catch (_) {}
      return { ok: false, reason: !supabase ? "no_supabase" : "no_session", rowCount: 0 };
    }

    const query = supabase.from(TABLE).select("*").eq("user_id", userId);

    const { data, error } = await query
      .order("section_key", { ascending: true })
      .order("sort_order", { ascending: true });

    if (error) {
      try {
        console.info("[할일·pull]", "실패", {
          출처: `Supabase public.${TABLE} (SELECT)`,
          message: error.message || "select_failed",
          reason: String(reason || ""),
          subView: subView != null ? String(subView) : "",
        });
      } catch (_) {}
      return { ok: false, reason: error.message || "select_failed", rowCount: 0 };
    }

    const rows = Array.isArray(data) ? data : [];
    const knownCustomSectionIds = getCustomSections().map((s) => s.id).filter(Boolean);
    applyCalendarSectionTasksServerSnapshot(rows, knownCustomSectionIds);

    try {
      console.info("[할일·pull]", "불러옴", {
        출처: `Supabase public.${TABLE} (SELECT, user_id 일치 행만)`,
        할일개수: rows.length,
        reason: String(reason || ""),
        subView: subView != null ? String(subView) : "",
      });
    } catch (_) {}

    logTodoServerCrud("PULL", {
      reason: String(reason || ""),
      subView: subView != null ? String(subView) : "",
      rowCount: rows.length,
      안내: "서버 SELECT → 세션 메모리 전체 교체",
    });

    return { ok: true, rowCount: rows.length };
  });
}
