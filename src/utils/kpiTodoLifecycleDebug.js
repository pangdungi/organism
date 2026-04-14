/**
 * KPI 할일 삭제·완료·동기화 불일치 원인 추적용 콘솔 로그
 *
 * 켜기(택1):
 * - localStorage.setItem('debug_kpi_todo_lifecycle', '1') 후 새로고침
 * - 개발자도구 콘솔에서: window.__KPI_TODO_DEBUG__ = true  (새로고침 없이 다음 클릭부터 적용)
 * 끄기: localStorage.removeItem('debug_kpi_todo_lifecycle') · window.__KPI_TODO_DEBUG__ = false
 *
 * 필터: [KPI할일추적]
 */

const KEY = "debug_kpi_todo_lifecycle";

let _seq = 0;

export function kpiTodoLifecycleOn() {
  try {
    if (typeof window !== "undefined" && window.__KPI_TODO_DEBUG__) return true;
    return typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1";
  } catch (_) {
    return false;
  }
}

/** @param {unknown} payload normalizePayload 결과 또는 동일 형태 */
export function kpiTodoSnapshotBrief(payload) {
  try {
    const arr = payload?.kpiTodos;
    if (!Array.isArray(arr)) return { n: 0, ids: [] };
    return {
      n: arr.length,
      ids: arr.slice(0, 25).map((t) => String(t?.id ?? "")),
    };
  } catch (_) {
    return { n: 0, ids: [] };
  }
}

/** 할일 id별 완료 여부 (pull·sync 시 서버와 로컬 불일치 추적) */
export function kpiTodosCompletionBrief(payload, maxRows = 50) {
  try {
    const arr = payload?.kpiTodos;
    if (!Array.isArray(arr)) return { n: 0, rows: [] };
    return {
      n: arr.length,
      rows: arr.slice(0, maxRows).map((t) => ({
        id: String(t?.id ?? ""),
        c: !!t?.completed,
      })),
    };
  } catch (_) {
    return { n: 0, rows: [] };
  }
}

/**
 * 같은 id가 양쪽에 있을 때 completed 불일치 목록 (pull로 완료가 풀리는지 확인)
 * @returns {Array<{ id: string, localCompleted?: boolean, serverCompleted?: boolean }>}
 */
export function compareKpiTodoCompletedMismatch(localPayload, serverSnapshot) {
  try {
    const L = new Map(
      (localPayload?.kpiTodos || []).map((t) => [String(t?.id ?? "").trim(), !!t?.completed]),
    );
    const S = new Map(
      (serverSnapshot?.kpiTodos || []).map((t) => [String(t?.id ?? "").trim(), !!t?.completed]),
    );
    const out = [];
    const ids = new Set([...L.keys(), ...S.keys()].filter(Boolean));
    for (const id of ids) {
      const a = L.has(id) ? L.get(id) : undefined;
      const b = S.has(id) ? S.get(id) : undefined;
      if (a !== undefined && b !== undefined && a !== b) {
        out.push({ id, localCompleted: a, serverCompleted: b });
      }
    }
    return out.slice(0, 40);
  } catch (_) {
    return [];
  }
}

export function deletedRefsKpiTodosLen(payload) {
  try {
    const dr = payload?.deletedRefs?.kpiTodos;
    return Array.isArray(dr) ? dr.length : 0;
  } catch (_) {
    return 0;
  }
}

/** localStorage JSON의 kpiTodos 개수 (플래그 켜진 경우에만 의미 있음) */
export function kpiTodoCountInStorage(storageKey) {
  if (!kpiTodoLifecycleOn()) return null;
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (!raw) return 0;
    const p = JSON.parse(raw);
    return Array.isArray(p?.kpiTodos) ? p.kpiTodos.length : 0;
  } catch (_) {
    return -1;
  }
}

/**
 * @param {string} tag
 * @param {Record<string, unknown>} [detail]
 */
export function kpiTodoLifecycleLog(tag, detail) {
  if (!kpiTodoLifecycleOn()) return;
  try {
    const n = ++_seq;
    if (detail != null && typeof detail === "object") {
      console.info("[KPI할일추적]", `#${n}`, tag, detail);
    } else {
      console.info("[KPI할일추적]", `#${n}`, tag);
    }
  } catch (_) {}
}

export function printKpiTodoLifecycleHelp() {
  console.info(
    `[KPI할일추적] 켜기: localStorage.setItem('${KEY}','1') 후 새로고침  |  또는 window.__KPI_TODO_DEBUG__=true  |  콘솔 필터에 [KPI할일추적] 입력`,
  );
}

/**
 * pull 직전 로컬 vs 적용 직후 서버 스냅샷 — 서버에만 있으면 pull로 "부활" 가능
 */
export function compareKpiTodoIdSets(localPayload, serverSnapshot) {
  try {
    const L = new Set(
      (localPayload?.kpiTodos || []).map((t) => String(t?.id ?? "").trim()).filter(Boolean),
    );
    const S = new Set(
      (serverSnapshot?.kpiTodos || []).map((t) => String(t?.id ?? "").trim()).filter(Boolean),
    );
    const onlyInLocal = [...L].filter((id) => !S.has(id));
    const onlyInServer = [...S].filter((id) => !L.has(id));
    return { onlyInLocal, onlyInServer };
  } catch (_) {
    return { onlyInLocal: [], onlyInServer: [] };
  }
}

/**
 * @param {string} domain dream|happiness|health|sideincome
 * @param {string} storageKey
 * @param {string} phase 짧은 설명
 */
export function kpiTodoLifecyclePullCompare(domain, storageKey, localBefore, serverSnapshot, phase, extra) {
  if (!kpiTodoLifecycleOn()) return;
  const lb = kpiTodoSnapshotBrief(localBefore);
  const ss = kpiTodoSnapshotBrief(serverSnapshot);
  const { onlyInLocal, onlyInServer } = compareKpiTodoIdSets(localBefore, serverSnapshot);
  const completionMismatch = compareKpiTodoCompletedMismatch(localBefore, serverSnapshot);
  kpiTodoLifecycleLog(`pull_${domain}_${phase}`, {
    storageKey,
    phase,
    localTodos: lb,
    serverTodos: ss,
    localCompletionSample: kpiTodosCompletionBrief(localBefore, 20),
    serverCompletionSample: kpiTodosCompletionBrief(serverSnapshot, 20),
    completionMismatch,
    completionNote:
      completionMismatch.length > 0
        ? "같은 id인데 완료여부 다름 → pull 직후 로컬은 서버 스냅샷으로 덮임(완료가 풀릴 수 있음)"
        : "",
    localDeletedRefsKpi: deletedRefsKpiTodosLen(localBefore),
    serverDeletedRefsKpi: deletedRefsKpiTodosLen(serverSnapshot),
    idDiff: {
      onlyInLocal,
      onlyInServer,
      note: "onlyInServer=서버에만 있음 → pull 시 로컬에 다시 생김(부활 후보)",
    },
    ...(extra && typeof extra === "object" ? extra : {}),
  });
}
