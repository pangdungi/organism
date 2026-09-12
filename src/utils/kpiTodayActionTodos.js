/**
 * 오늘의 행동 — 할일이 있는 행동을 눌러 목록을 보고,
 * 「오늘 할 일」로 고른 항목을 행동 아래 작게 보여 줌.
 * 체크는 할일 완료 값만 본다. 사용자가 칸을 누를 때만 바뀐다.
 */

import {
  getScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";
import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { sortNormalizedKpiTodoRows } from "./kpiMapTodoListOrder.js";
import { showKpiTodoAddModal } from "./kpiTodoAddModal.js";
import { addKpiTodo, syncKpiTodoCompleted } from "./kpiTodoSync.js";
import {
  ALL_TODOS_BUILTIN_STORAGE_KEY,
  ALL_TODOS_BUILTIN_LISTS,
  builtinListKeyFromTaskName,
  getBuiltinTaskCompletionTodoInfo,
  resolveBuiltinListKeyFromActionId,
} from "./allTodosBuiltinLists.js";
import { stripKpiTodoFromTimeLedgerIfUncompleted } from "./kpiTodoStripFromTimeLedger.js";
import {
  DEFAULT_CHECKUP_KPI_ID,
  DEFAULT_READING_KPI_ID,
  DEFAULT_SUPPLEMENT_KPI_ID,
} from "./defaultKpiIconIds.js";
import { DEFAULT_READING_KPI_TODO_LIST_LABEL } from "./happinessKpiMapSupabase.js";
import { resolveKpiGoalMode } from "./kpiTimeUnitKpi.js";
import { getFullTaskOptions, isDreamKpiLedgerTask } from "./timeTaskOptionsModel.js";
import { LP_MODAL_HTML_OPEN_CLASS } from "./lpModalKeyboard.js";
import { supabase } from "../supabase.js";
import { getSupabaseSession } from "./supabaseSession.js";
import { timeLedgerLocalTodayYmd } from "./timeLedgerEntriesSupabase.js";
import { collectBudgetPlannedTodoIdsForKpiOnDate } from "./expectedScheduleDetail.js";
import { pullKpiTodosDomainFromCloudIfStale } from "./kpiTabCloudRefresh.js";

export const TODAY_ACTION_TODO_PICKS_KEY = "lp_today_action_todo_picks";

const STORAGE_DOMAINS = [
  "kpi-sideincome-paths",
  "kpi-health-map",
  "kpi-happiness-map",
];

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadMap(storageKey) {
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function todayYmdOr(fallback) {
  return timeLedgerLocalTodayYmd() || String(fallback || "").slice(0, 10);
}

function emptyPicks(ymd) {
  return {
    ymd: String(ymd || "").slice(0, 10),
    picks: {},
    hidden: [],
    extra: [],
  };
}

function cleanIdList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const x of raw) {
    const id = String(x || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function readPickStore(todayYmd) {
  const ymd = todayYmdOr(todayYmd);
  try {
    const raw = getScopedLocalStorageItem(TODAY_ACTION_TODO_PICKS_KEY);
    if (!raw) return emptyPicks(ymd);
    return normalizePickStore(JSON.parse(raw), ymd);
  } catch (_) {
    return emptyPicks(ymd);
  }
}

function normalizePickStore(raw, todayYmd) {
  const ymd = todayYmdOr(todayYmd);
  const parsed =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  const srcYmd = String(parsed?.ymd || "").slice(0, 10);
  if (srcYmd !== ymd) return emptyPicks(ymd);
  const picks =
    parsed?.picks && typeof parsed.picks === "object" ? parsed.picks : {};
  /** @type {Record<string, string[]>} */
  const clean = {};
  for (const [kid, ids] of Object.entries(picks)) {
    const k = String(kid || "").trim();
    if (!k || !Array.isArray(ids)) continue;
    clean[k] = ids.map((x) => String(x || "").trim()).filter(Boolean);
  }
  return {
    ymd,
    picks: clean,
    hidden: cleanIdList(parsed.hidden),
    extra: cleanIdList(parsed.extra),
  };
}

function writePickStoreLocal(store) {
  try {
    setScopedLocalStorageItem(
      TODAY_ACTION_TODO_PICKS_KEY,
      JSON.stringify({
        ymd: String(store?.ymd || "").slice(0, 10),
        picks: store?.picks && typeof store.picks === "object" ? store.picks : {},
        hidden: cleanIdList(store?.hidden),
        extra: cleanIdList(store?.extra),
      }),
    );
  } catch (_) {}
}

function pickStoreHasAny(store) {
  const picks = store?.picks && typeof store.picks === "object" ? store.picks : {};
  if (cleanIdList(store?.hidden).length || cleanIdList(store?.extra).length) {
    return true;
  }
  return Object.values(picks).some(
    (ids) => Array.isArray(ids) && ids.some((x) => String(x || "").trim()),
  );
}

export function readTodayActionTodoPicksHasAnyToday() {
  return pickStoreHasAny(readPickStore());
}

/** 서버에서 받은 오늘 고른 할일 — 오늘 날짜일 때만 반영 */
export function applyTodayActionTodoPicksFromServer(raw) {
  const today = todayYmdOr();
  const parsed =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  const srcYmd = String(parsed?.ymd || "").slice(0, 10);
  if (srcYmd !== today) return false;
  writePickStoreLocal(normalizePickStore(parsed, today));
  return true;
}

export async function pushTodayActionTodoPicksToSupabase() {
  if (!supabase) return;
  try {
    const { data: { session } = {} } = await getSupabaseSession();
    if (!session?.user?.id) return;
    const store = readPickStore();
    await supabase.rpc("set_my_today_action_todo_picks", { p_picks: store });
  } catch (_) {}
}

/** 오늘의 행동 화면 진입 때 — 행동 목록 pull과 같이 고른 할일을 받음 */
export async function pullTodayActionTodoPicksFromSupabase() {
  if (!supabase) return false;
  try {
    const { data: { session } = {} } = await getSupabaseSession();
    if (!session?.user?.id) return false;
    const { data, error } = await supabase
      .from("user_subscriptions")
      .select("today_action_todo_picks")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error || !data) return false;
    const applied = applyTodayActionTodoPicksFromServer(
      data.today_action_todo_picks,
    );
    if (!applied && readTodayActionTodoPicksHasAnyToday()) {
      void pushTodayActionTodoPicksToSupabase();
    }
    return true;
  } catch (_) {
    return false;
  }
}

function writePickStore(store) {
  writePickStoreLocal(store);
  void pushTodayActionTodoPicksToSupabase();
}

/** @param {string} kpiId */
export function readTodayActionTodoPickIds(kpiId, todayYmd) {
  const kid = String(kpiId || "").trim();
  if (!kid) return [];
  const ids = readPickStore(todayYmd).picks[kid];
  return Array.isArray(ids)
    ? ids.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
}

/** 보는 날이 오늘일 때만. 다음 날이면 빈 목록. */
export function readTodayActionTodoPickIdsIfViewingToday(kpiId, viewedYmd) {
  const today = todayYmdOr();
  const view = String(viewedYmd || today).slice(0, 10);
  if (!view || view !== today) return [];
  return readTodayActionTodoPickIds(kpiId, today);
}

export function isTodayActionTodoPicked(kpiId, todoId, todayYmd) {
  const tid = String(todoId || "").trim();
  return tid ? readTodayActionTodoPickIds(kpiId, todayYmd).includes(tid) : false;
}

export function toggleTodayActionTodoPick(kpiId, todoId, todayYmd) {
  const kid = String(kpiId || "").trim();
  const tid = String(todoId || "").trim();
  if (!kid || !tid) return false;
  const ymd = todayYmdOr(todayYmd);
  const store = readPickStore(ymd);
  const prev = Array.isArray(store.picks[kid]) ? store.picks[kid] : [];
  const set = new Set(prev.map((x) => String(x || "").trim()).filter(Boolean));
  if (set.has(tid)) set.delete(tid);
  else set.add(tid);
  store.picks[kid] = [...set];
  writePickStore(store);
  return set.has(tid);
}

/** 오늘 고른 할일 — 저장 버튼에서 한 번에 반영 */
export function setTodayActionTodoPickIds(kpiId, todoIds, todayYmd) {
  const kid = String(kpiId || "").trim();
  if (!kid) return;
  const ymd = todayYmdOr(todayYmd);
  const store = readPickStore(ymd);
  store.picks[kid] = cleanIdList(todoIds);
  writePickStore(store);
}

/**
 * 예상일정 슬롯에서 뺀 할일 — 다른 오늘 슬롯에도 없으면 오늘의 할일에서 제거
 * @param {string} kpiId
 * @param {string[]} removedTodoIds
 * @param {string} [ymd]
 */
export function pruneTodayActionPicksRemovedFromSchedule(
  kpiId,
  removedTodoIds,
  todayYmd,
) {
  const kid = String(kpiId || "").trim();
  if (!kid) return;
  const ymd = todayYmdOr(todayYmd);
  const today = timeLedgerLocalTodayYmd();
  if (!ymd || !today || ymd !== today) return;
  const removed = cleanIdList(removedTodoIds);
  if (!removed.length) return;
  const stillOn = new Set(collectBudgetPlannedTodoIdsForKpiOnDate(ymd, kid));
  const picks = readTodayActionTodoPickIds(kid, ymd);
  const next = picks.filter((id) => stillOn.has(id) || !removed.includes(id));
  if (next.length === picks.length) return;
  setTodayActionTodoPickIds(kid, next, ymd);
}

/** 오늘 목록에서 뺀 행동 */
export function readTodayActionHiddenIds(todayYmd) {
  return cleanIdList(readPickStore(todayYmd).hidden);
}

/** 오늘 목록에 직접 넣은 행동 */
export function readTodayActionExtraIds(todayYmd) {
  return cleanIdList(readPickStore(todayYmd).extra);
}

/** 오늘만 목록에서 빼기 */
export function hideTodayActionKpi(kpiId, todayYmd) {
  const kid = String(kpiId || "").trim();
  if (!kid) return;
  const store = readPickStore(todayYmd);
  store.hidden = cleanIdList([...(store.hidden || []), kid]);
  store.extra = cleanIdList(store.extra).filter((id) => id !== kid);
  writePickStore(store);
}

/** 오늘 목록에 넣기(뺀 것 되돌리거나, 기본에 없던 것 추가) */
export function addTodayActionKpi(kpiId, todayYmd) {
  addTodayActionKpis([kpiId], todayYmd);
}

/** 오늘 목록에 여러 행동 한 번에 넣기 — 서버에도 한 번만 올림 */
export function addTodayActionKpis(kpiIds, todayYmd) {
  const ids = cleanIdList(kpiIds);
  if (!ids.length) return;
  const store = readPickStore(todayYmd);
  let hidden = cleanIdList(store.hidden);
  let extra = cleanIdList(store.extra);
  for (const kid of ids) {
    if (hidden.includes(kid)) {
      hidden = hidden.filter((id) => id !== kid);
    } else if (!extra.includes(kid)) {
      extra.push(kid);
    }
  }
  store.hidden = hidden;
  store.extra = extra;
  writePickStore(store);
}

function categoryLabelForTask(opt) {
  const c = String(opt?.category || "").trim().toLowerCase();
  if (c === "sideincome") return "시급";
  if (c === "health") return "건강";
  if (c === "happiness") return "행복";
  return "";
}

/**
 * 과제목록에서, 이미 오늘의 행동에 있는 것을 뺀 목록
 * @param {{ excludeIds?: Iterable<string>, excludeNames?: Iterable<string> }} [opts]
 * @returns {Array<{ id: string, name: string, category: string }>}
 */
export function listAddableTodayActionKpis(opts = {}) {
  const takenIds = new Set(
    [...(opts.excludeIds || [])].map((x) => String(x || "").trim()).filter(Boolean),
  );
  takenIds.add(DEFAULT_CHECKUP_KPI_ID);
  const takenNames = new Set(
    [...(opts.excludeNames || [])]
      .map((x) => String(x || "").trim())
      .filter(Boolean),
  );
  const out = [];
  const seen = new Set();
  for (const opt of getFullTaskOptions()) {
    if (isDreamKpiLedgerTask(opt)) continue;
    const name = String(opt?.name || "").trim();
    if (!name || takenNames.has(name) || seen.has(name)) continue;
    const kid = String(opt?.kpiId || "").trim();
    if (kid && (takenIds.has(kid) || kid === DEFAULT_CHECKUP_KPI_ID)) continue;
    const builtinKey = builtinListKeyFromTaskName(name);
    const id = kid || builtinKey || `schedule:${name}`;
    if (takenIds.has(id) || seen.has(id)) continue;
    seen.add(id);
    seen.add(name);
    out.push({
      id,
      name,
      category: categoryLabelForTask(opt),
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  return out;
}

/**
 * @param {{
 *   excludeIds?: Iterable<string>,
 *   excludeNames?: Iterable<string>,
 *   todayYmd?: string,
 *   onAdded?: () => void,
 * }} [opts]
 */
export function showTodayActionAddKpiModal(opts = {}) {
  const todayYmd = todayYmdOr(opts.todayYmd);
  document.querySelector(".lp-today-action-add-modal")?.remove();
  const rows = listAddableTodayActionKpis({
    excludeIds: opts.excludeIds,
    excludeNames: opts.excludeNames,
  });

  const modal = document.createElement("div");
  modal.className =
    "time-task-setup-modal lp-today-action-todos-modal lp-today-action-add-modal lp-modal-compact";
  modal.innerHTML = `
    <div data-legacy="time-task-setup-backdrop"></div>
    <div data-legacy="time-task-setup-panel">
      <div data-legacy="time-task-setup-header">
        <h3 data-legacy="time-task-setup-title">오늘의 행동 추가</h3>
        <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
      </div>
      <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
        <div data-legacy="time-task-log-kpi-todos-section">
          ${
            rows.length
              ? `<p data-legacy="time-task-log-kpi-todos-hint">넣을 행동을 고른 뒤 추가를 누르세요</p>`
              : ""
          }
          <p data-legacy="time-task-log-kpi-todos-status" ${rows.length ? "hidden" : ""}>${
            rows.length ? "" : "더 넣을 진행중 행동이 없습니다."
          }</p>
          <div data-legacy="time-task-log-kpi-todos-scroll" ${rows.length ? "" : "hidden"}>
            <div data-legacy="time-task-log-kpi-todos-list"></div>
          </div>
        </div>
      </div>
      ${
        rows.length
          ? `<div data-legacy="time-task-log-footer">
        <button type="button" data-legacy="time-task-log-submit" disabled>추가</button>
      </div>`
          : ""
      }
    </div>
  `;

  const listEl = modal.querySelector(
    '[data-legacy~="time-task-log-kpi-todos-list"]',
  );
  const submitBtn = modal.querySelector(
    '[data-legacy~="time-task-log-submit"]',
  );
  const prevOverflow = document.body.style.overflow;
  const draft = new Set();

  function close() {
    try {
      document.documentElement.classList.remove(LP_MODAL_HTML_OPEN_CLASS);
    } catch (_) {}
    modal.remove();
    document.body.style.overflow = prevOverflow;
  }

  function syncSubmit() {
    if (submitBtn instanceof HTMLButtonElement) {
      submitBtn.disabled = draft.size === 0;
    }
  }

  if (listEl instanceof HTMLElement) {
    for (const row of rows) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "time-task-log-kpi-todo-row time-task-log-chore-todo-row time-task-log-kpi-todo-row--pick-memo";
      btn.setAttribute("aria-label", `${row.name} 고르기`);
      const span = document.createElement("span");
      span.className = "time-task-log-kpi-todo-text";
      span.textContent = row.name;
      btn.appendChild(span);
      btn.addEventListener("click", () => {
        if (draft.has(row.id)) draft.delete(row.id);
        else draft.add(row.id);
        btn.classList.toggle("is-planned", draft.has(row.id));
        syncSubmit();
      });
      listEl.appendChild(btn);
    }
  }

  modal
    .querySelector('[data-legacy~="time-task-setup-close"]')
    ?.addEventListener("click", close);
  modal
    .querySelector('[data-legacy~="time-task-setup-backdrop"]')
    ?.addEventListener("click", close);
  submitBtn?.addEventListener("click", () => {
    if (!draft.size) return;
    addTodayActionKpis([...draft], todayYmd);
    close();
    try {
      opts.onAdded?.();
    } catch (_) {}
  });
  syncSubmit();

  document.body.style.overflow = "hidden";
  try {
    document.documentElement.classList.add(LP_MODAL_HTML_OPEN_CLASS);
  } catch (_) {}
  document.body.appendChild(modal);
}

function findKpiBundle(kpiId) {
  const kid = String(kpiId || "").trim();
  if (!kid) return null;
  for (const storageKey of STORAGE_DOMAINS) {
    const data = loadMap(storageKey);
    const kpi = (Array.isArray(data.kpis) ? data.kpis : []).find(
      (k) => String(k?.id || "").trim() === kid,
    );
    if (kpi) return { storageKey, kpi, data };
  }
  return null;
}

/**
 * 태스크완료·잡무·목표도달형만. 매일하기는 제외.
 * @param {string} kpiId
 * @param {{ includeCompleted?: boolean }} [opts]
 *   includeCompleted — 행동 아래 오늘 고른 목록용. 완료분도 체크된 채로 남김.
 *   고르는 창은 기본 미완료만. 독서하기는 읽을 예정 전체를 보여 준다.
 * @returns {{
 *   kind: "task",
 *   storageKey: string,
 *   kpi: object,
 *   todos: Array<{ id: string, text: string, checked: boolean }>
 * } | null}
 */
export function collectTodayActionTodos(kpiId, opts = {}) {
  const builtinKey = resolveBuiltinListKeyFromActionId(kpiId);
  if (builtinKey) {
    const list = ALL_TODOS_BUILTIN_LISTS.find((x) => x.key === builtinKey);
    const includeCompleted = !!opts.includeCompleted;
    const info = getBuiltinTaskCompletionTodoInfo(builtinKey, {
      includeCompleted,
    });
    const todos = (info?.todos || []).map((t) => ({
      id: t.id,
      text: t.text,
      checked: !!t.completed,
    }));
    return {
      kind: "task",
      storageKey: ALL_TODOS_BUILTIN_STORAGE_KEY,
      kpi: { id: builtinKey, name: list?.name || "" },
      todos,
    };
  }
  const bundle = findKpiBundle(kpiId);
  if (!bundle) return null;
  const { storageKey, kpi, data } = bundle;
  const kid = String(kpi?.id || "").trim();
  if (!kid) return null;
  const mode = resolveKpiGoalMode(kpi);
  const isReading = String(kpi?.id || "").trim() === DEFAULT_READING_KPI_ID;
  if (!isReading && mode !== "task" && mode !== "manual") return null;
  const includeCompleted = !!opts.includeCompleted || isReading;

  const todos = sortNormalizedKpiTodoRows(
    (data.kpiTodos || []).filter((t) => {
      if (String(t?.kpiId || "").trim() !== kid) return false;
      const text = String(t?.text || "").trim();
      const id = String(t?.id || "").trim();
      if (!text || !id) return false;
      if (!includeCompleted && !!t.completed) return false;
      return true;
    }),
  ).map((t) => {
    const id = String(t.id || "").trim();
    return {
      id,
      text: String(t.text || "").trim(),
      checked: !!t.completed,
    };
  });
  if (!todos.length) return null;
  return { kind: "task", storageKey, kpi, todos };
}

export function todayActionHasTodos(kpiId) {
  return !!collectTodayActionTodos(kpiId, { includeCompleted: true });
}

function isHabitTodayActionKpi(kpi) {
  return resolveKpiGoalMode(kpi) === "habit" || !!kpi?.needHabitTracker;
}

function isReadingTodayActionKpi(kpi) {
  return String(kpi?.id || "").trim() === DEFAULT_READING_KPI_ID;
}

function isSupplementTodayActionKpi(kpi) {
  return String(kpi?.id || "").trim() === DEFAULT_SUPPLEMENT_KPI_ID;
}

/** @returns {"task"|"habit"|"supplement"|"reading"} */
function resolveTodayActionModalKind(kpiId) {
  const bundle = findKpiBundle(kpiId);
  if (!bundle) return "task";
  if (isReadingTodayActionKpi(bundle.kpi)) return "reading";
  if (isSupplementTodayActionKpi(bundle.kpi)) return "supplement";
  if (isHabitTodayActionKpi(bundle.kpi)) return "habit";
  return "task";
}

function listTodayActionDailyItems(kpiId) {
  const bundle = findKpiBundle(kpiId);
  if (!bundle) return [];
  const kid = String(bundle.kpi?.id || "").trim();
  if (!kid) return [];
  return sortNormalizedKpiTodoRows(
    (bundle.data.kpiDailyRepeatTodos || []).filter((t) => {
      if (String(t?.kpiId || "").trim() !== kid) return false;
      return !!(String(t?.text || "").trim() && String(t?.id || "").trim());
    }),
  ).map((t) => ({
    id: String(t.id || "").trim(),
    text: String(t.text || "").trim(),
  }));
}

export function setTodayActionTodoChecked(kpiId, todoId, checked) {
  const collected = collectTodayActionTodos(kpiId, { includeCompleted: true });
  if (!collected) return false;
  const todo = collected.todos.find(
    (t) => String(t.id || "").trim() === String(todoId || "").trim(),
  );
  if (!todo) return false;
  syncKpiTodoCompleted(todo.id, collected.storageKey, !!checked);
  stripKpiTodoFromTimeLedgerIfUncompleted(!!checked, todo.id, todo.text);
  return true;
}

/**
 * @param {{
 *   kpiId: string,
 *   name: string,
 *   todayYmd?: string,
 *   onChange?: () => void,
 * }} opts
 */
export function showTodayActionTodosModal(opts = {}) {
  const kpiId =
    resolveBuiltinListKeyFromActionId(opts.kpiId, opts.name) ||
    String(opts.kpiId || "").trim();
  const name = String(opts.name || "").trim() || "행동";
  const todayYmd = todayYmdOr(opts.todayYmd);
  if (!kpiId) return;

  const kind = resolveTodayActionModalKind(kpiId);
  const canPickTodos = kind === "task" || kind === "reading";
  const showDailyList = kind === "habit" || kind === "supplement";
  const existing = document.querySelector(".lp-today-action-todos-modal");
  existing?.remove();

  const listTitle =
    kind === "supplement"
      ? "보충제 목록"
      : kind === "habit"
        ? "매일 할 일 목록"
        : kind === "reading"
          ? DEFAULT_READING_KPI_TODO_LIST_LABEL
          : "오늘 행동 할 일 목록";
  const listHint = canPickTodos
    ? kind === "reading"
      ? "오늘 읽을 책을 고른 뒤 저장을 누르세요"
      : "오늘 할 항목을 고른 뒤 저장을 누르세요"
    : "";

  const modal = document.createElement("div");
  modal.className =
    "time-task-setup-modal lp-today-action-todos-modal lp-modal-compact";
  modal.setAttribute("data-today-action-kind", kind);
  modal.innerHTML = `
    <div data-legacy="time-task-setup-backdrop"></div>
    <div data-legacy="time-task-setup-panel">
      <div data-legacy="time-task-setup-header">
        <h3 data-legacy="time-task-setup-title">${escapeHtml(name)}</h3>
        <button type="button" data-legacy="time-task-setup-close" title="닫기" aria-label="닫기">&times;</button>
      </div>
      <div class="dream-kpi-form-body" data-legacy="time-task-setup-body">
        <div data-legacy="time-task-log-kpi-todos-section">
          <div data-legacy="time-task-log-kpi-todos-title-row">
            <h4 data-legacy="time-task-log-kpi-todos-title">${escapeHtml(listTitle)}</h4>
            ${
              canPickTodos
                ? `<button type="button" data-legacy="lp-expected-kpi-todo-add-btn" aria-label="${
                    kind === "reading" ? "읽을 예정 추가" : "할 일 추가"
                  }">+</button>`
                : ""
            }
          </div>
          ${
            listHint
              ? `<p data-legacy="time-task-log-kpi-todos-hint">${escapeHtml(listHint)}</p>`
              : ""
          }
          <p data-legacy="time-task-log-kpi-todos-status" hidden></p>
          <div data-legacy="time-task-log-kpi-todos-scroll">
            <div data-legacy="time-task-log-kpi-todos-list"></div>
          </div>
        </div>
      </div>
      <div data-legacy="time-task-log-footer">
        <button type="button" class="habit-tracker-today-goals-remove-today">오늘 행동에서 제거하기</button>
        ${
          canPickTodos
            ? `<button type="button" data-legacy="time-task-log-submit">저장</button>`
            : ""
        }
      </div>
    </div>
  `;

  const listEl = modal.querySelector(
    '[data-legacy~="time-task-log-kpi-todos-list"]',
  );
  const scrollEl = modal.querySelector(
    '[data-legacy~="time-task-log-kpi-todos-scroll"]',
  );
  const statusEl = modal.querySelector(
    '[data-legacy~="time-task-log-kpi-todos-status"]',
  );
  const prevOverflow = document.body.style.overflow;
  const draftPicks = new Set(readTodayActionTodoPickIds(kpiId, todayYmd));

  function close() {
    try {
      document.documentElement.classList.remove(LP_MODAL_HTML_OPEN_CLASS);
    } catch (_) {}
    modal.remove();
    document.body.style.overflow = prevOverflow;
  }

  function paintList() {
    if (!(listEl instanceof HTMLElement)) return;
    listEl.replaceChildren();
    const todos = showDailyList
      ? listTodayActionDailyItems(kpiId)
      : collectTodayActionTodos(kpiId, {
          includeCompleted: false,
        })?.todos || [];
    if (!todos.length) {
      if (scrollEl instanceof HTMLElement) scrollEl.hidden = true;
      if (statusEl instanceof HTMLElement) {
        statusEl.hidden = false;
        statusEl.textContent =
          kind === "supplement"
            ? "등록된 보충제가 없습니다."
            : kind === "habit"
              ? "등록된 매일 할 일이 없습니다."
              : kind === "reading"
                ? "등록된 읽을 예정이 없습니다."
                : "등록된 할 일이 없습니다.";
      }
      return;
    }
    if (scrollEl instanceof HTMLElement) scrollEl.hidden = false;
    if (statusEl instanceof HTMLElement) {
      statusEl.hidden = true;
      statusEl.textContent = "";
    }
    for (const todo of todos) {
      if (showDailyList) {
        const row = document.createElement("div");
        row.className =
          "time-task-log-kpi-todo-row time-task-log-chore-todo-row habit-tracker-today-action-daily-row";
        row.setAttribute("data-legacy", "time-task-log-chore-todo-row");
        const span = document.createElement("span");
        span.className = "time-task-log-kpi-todo-text";
        span.setAttribute("data-legacy", "time-task-log-kpi-todo-text");
        span.textContent = todo.text;
        row.appendChild(span);
        listEl.appendChild(row);
        continue;
      }
      const row = document.createElement("button");
      row.type = "button";
      row.className =
        "time-task-log-kpi-todo-row time-task-log-chore-todo-row time-task-log-kpi-todo-row--pick-memo";
      row.setAttribute("data-legacy", "time-task-log-chore-todo-row");
      row.setAttribute("data-todo-id", todo.id);
      row.setAttribute(
        "aria-label",
        kind === "reading"
          ? `오늘 읽을 책으로 고르기: ${todo.text}`
          : `오늘 할 일로 고르기: ${todo.text}`,
      );
      row.classList.toggle("is-planned", draftPicks.has(todo.id));
      const span = document.createElement("span");
      span.className = "time-task-log-kpi-todo-text";
      span.setAttribute("data-legacy", "time-task-log-kpi-todo-text");
      span.textContent = todo.text;
      row.appendChild(span);
      row.addEventListener("click", () => {
        if (draftPicks.has(todo.id)) draftPicks.delete(todo.id);
        else draftPicks.add(todo.id);
        paintList();
      });
      listEl.appendChild(row);
    }
  }

  modal
    .querySelector('[data-legacy~="time-task-setup-close"]')
    ?.addEventListener("click", close);
  modal
    .querySelector('[data-legacy~="time-task-setup-backdrop"]')
    ?.addEventListener("click", close);
  modal
    .querySelector('[data-legacy~="time-task-log-submit"]')
    ?.addEventListener("click", () => {
      setTodayActionTodoPickIds(kpiId, [...draftPicks], todayYmd);
      close();
      try {
        opts.onChange?.();
      } catch (_) {}
    });
  modal
    .querySelector(".habit-tracker-today-goals-remove-today")
    ?.addEventListener("click", () => {
      hideTodayActionKpi(kpiId, todayYmd);
      close();
      try {
        opts.onChange?.();
      } catch (_) {}
    });

  if (canPickTodos) {
    modal
      .querySelector('[data-legacy~="lp-expected-kpi-todo-add-btn"]')
      ?.addEventListener("click", async () => {
        const collected = collectTodayActionTodos(kpiId, {
          includeCompleted: kind === "reading",
        });
        const text = await showKpiTodoAddModal({
          kpiName: name,
          title: kind === "reading" ? "독서 추가" : "할 일 추가",
          placeholder: kind === "reading" ? "독서 입력" : "할 일 입력",
          inputLabel:
            kind === "reading" ? DEFAULT_READING_KPI_TODO_LIST_LABEL : undefined,
        });
        if (!text || !modal.isConnected) return;
        const storageKey =
          collected?.storageKey || findKpiBundle(kpiId)?.storageKey || "";
        const added = addKpiTodo(kpiId, storageKey, text, { pushServer: true });
        if (!added?.success) return;
        const newId = String(added.kpiTodoId || "").trim();
        if (newId) {
          draftPicks.add(newId);
          const saved = readTodayActionTodoPickIds(kpiId, todayYmd);
          setTodayActionTodoPickIds(
            kpiId,
            [...saved, newId],
            todayYmd,
          );
        }
        paintList();
        try {
          opts.onChange?.();
        } catch (_) {}
      });
  }

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  try {
    document.documentElement.classList.add(LP_MODAL_HTML_OPEN_CLASS);
  } catch (_) {}
  paintList();
  void (async () => {
    try {
      await pullKpiTodosDomainFromCloudIfStale(kpiId);
    } catch (_) {}
    if (!modal.isConnected) return;
    paintList();
  })();
}

/**
 * @param {HTMLElement} host
 * @param {{ id: string, name?: string }} item
 * @param {{ todayYmd?: string, onChange?: () => void }} [opts]
 */
export function appendTodayActionPinnedTodos(host, item, opts = {}) {
  if (!(host instanceof HTMLElement)) return;
  const kpiId =
    resolveBuiltinListKeyFromActionId(item?.id, item?.name) ||
    String(item?.id || "").trim();
  const today = todayYmdOr();
  const viewed = String(opts.todayYmd || today).slice(0, 10);
  if (viewed && today && viewed !== today) return;
  const pickIds = cleanIdList([
    ...collectBudgetPlannedTodoIdsForKpiOnDate(today, kpiId),
    ...readTodayActionTodoPickIds(kpiId, today),
  ]);
  if (!pickIds.length) return;
  const collected = collectTodayActionTodos(kpiId, { includeCompleted: true });
  if (!collected) return;
  const byId = new Map(collected.todos.map((t) => [t.id, t]));
  const pinned = pickIds.map((id) => byId.get(id)).filter(Boolean);
  if (!pinned.length) return;

  const ul = document.createElement("ul");
  ul.className = "habit-tracker-today-action-todos";
  ul.setAttribute(
    "aria-label",
    String(item?.id || "").trim() === DEFAULT_READING_KPI_ID
      ? `${item?.name || "독서하기"} 오늘 읽을 책`
      : `${item?.name || "행동"} 오늘 할일`,
  );
  for (const todo of pinned) {
    const li = document.createElement("li");
    li.className = `habit-tracker-today-action-todo${
      todo.checked ? " is-checked" : ""
    }`;
    const label = document.createElement("label");
    label.className = "habit-tracker-today-action-todo-wrap";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "habit-tracker-today-action-todo-check";
    check.checked = !!todo.checked;
    check.setAttribute("aria-label", `${todo.text} 완료`);
    check.addEventListener("click", (e) => e.stopPropagation());
    check.addEventListener("change", (e) => {
      e.stopPropagation();
      const ok = setTodayActionTodoChecked(kpiId, todo.id, !!check.checked);
      if (!ok) {
        check.checked = !check.checked;
        return;
      }
      try {
        opts.onChange?.();
      } catch (_) {}
    });
    const text = document.createElement("span");
    text.className = "habit-tracker-today-action-todo-text";
    text.textContent = todo.text;
    label.append(check, text);
    li.appendChild(label);
    ul.appendChild(li);
  }
  host.appendChild(ul);
}
