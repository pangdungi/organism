/**
 * 오늘의 행동 — 할일이 있는 행동을 눌러 목록을 보고,
 * 「오늘 할 일」로 고른 항목을 행동 아래 작게 보여 줌.
 * 체크는 기존 KPI·시간기록 연동을 그대로 씀.
 */

import {
  getScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";
import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { sortNormalizedKpiTodoRows } from "./kpiMapTodoListOrder.js";
import { showKpiTodoAddModal } from "./kpiTodoAddModal.js";
import { addKpiTodo, syncKpiTodoCompleted } from "./kpiTodoSync.js";
import { resolveKpiGoalMode } from "./kpiTimeUnitKpi.js";
import { LP_MODAL_HTML_OPEN_CLASS } from "./lpModalKeyboard.js";
import { supabase } from "../supabase.js";
import { getSupabaseSession } from "./supabaseSession.js";
import { readTimeLedgerEntriesRaw } from "./timeLedgerEntriesModel.js";
import { timeLedgerLocalTodayYmd } from "./timeLedgerEntriesSupabase.js";

function ledgerCheckedTodoIds() {
  const ids = new Set();
  try {
    for (const r of readTimeLedgerEntriesRaw()) {
      for (const x of Array.isArray(r?.habitDailyCompleted)
        ? r.habitDailyCompleted
        : []) {
        const id = String(x?.id || "").trim();
        if (id) ids.add(id);
      }
    }
  } catch (_) {}
  return ids;
}

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
  return { ymd: String(ymd || "").slice(0, 10), picks: {} };
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
  return { ymd, picks: clean };
}

function writePickStoreLocal(store) {
  try {
    setScopedLocalStorageItem(
      TODAY_ACTION_TODO_PICKS_KEY,
      JSON.stringify({
        ymd: String(store?.ymd || "").slice(0, 10),
        picks: store?.picks && typeof store.picks === "object" ? store.picks : {},
      }),
    );
  } catch (_) {}
}

function pickStoreHasAny(store) {
  const picks = store?.picks && typeof store.picks === "object" ? store.picks : {};
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
 * @returns {{
 *   kind: "task",
 *   storageKey: string,
 *   kpi: object,
 *   todos: Array<{ id: string, text: string, checked: boolean }>
 * } | null}
 */
export function collectTodayActionTodos(kpiId) {
  const bundle = findKpiBundle(kpiId);
  if (!bundle) return null;
  const { storageKey, kpi, data } = bundle;
  const kid = String(kpi?.id || "").trim();
  if (!kid) return null;
  const mode = resolveKpiGoalMode(kpi);
  if (mode !== "task" && mode !== "manual") return null;

  const doneByEvent = new Set();
  for (const e of data.kpiTaskCompletionEvents || []) {
    if (String(e?.kpiId || "").trim() !== kid) continue;
    const tid = String(e?.todoId || "").trim();
    if (tid) doneByEvent.add(tid);
  }
  const doneOnLedger = ledgerCheckedTodoIds();

  const todos = sortNormalizedKpiTodoRows(
    (data.kpiTodos || []).filter((t) => {
      if (String(t?.kpiId || "").trim() !== kid) return false;
      const text = String(t?.text || "").trim();
      const id = String(t?.id || "").trim();
      if (!text || !id) return false;
      if (t.completed) return false;
      if (doneByEvent.has(id)) return false;
      if (doneOnLedger.has(id)) return false;
      return true;
    }),
  ).map((t) => ({
    id: String(t.id || "").trim(),
    text: String(t.text || "").trim(),
    checked: false,
  }));
  if (!todos.length) return null;
  return { kind: "task", storageKey, kpi, todos };
}

export function todayActionHasTodos(kpiId) {
  return !!collectTodayActionTodos(kpiId);
}

export function setTodayActionTodoChecked(kpiId, todoId, checked) {
  const collected = collectTodayActionTodos(kpiId);
  if (!collected) return false;
  const todo = collected.todos.find(
    (t) => String(t.id || "").trim() === String(todoId || "").trim(),
  );
  if (!todo) return false;
  syncKpiTodoCompleted(todo.id, collected.storageKey, !!checked);
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
  const kpiId = String(opts.kpiId || "").trim();
  const name = String(opts.name || "").trim() || "행동";
  const todayYmd = todayYmdOr(opts.todayYmd);
  if (!kpiId) return;

  const existing = document.querySelector(".lp-today-action-todos-modal");
  existing?.remove();

  const modal = document.createElement("div");
  modal.className =
    "time-task-setup-modal lp-today-action-todos-modal lp-modal-compact";
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
            <h4 data-legacy="time-task-log-kpi-todos-title">할 일 목록</h4>
            <button type="button" data-legacy="lp-expected-kpi-todo-add-btn" aria-label="할 일 추가">+</button>
          </div>
          <p data-legacy="time-task-log-kpi-todos-hint">오늘 할 항목을 누르면 골라집니다</p>
          <p data-legacy="time-task-log-kpi-todos-status" hidden></p>
          <div data-legacy="time-task-log-kpi-todos-scroll">
            <div data-legacy="time-task-log-kpi-todos-list"></div>
          </div>
        </div>
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

  function close() {
    try {
      document.documentElement.classList.remove(LP_MODAL_HTML_OPEN_CLASS);
    } catch (_) {}
    modal.remove();
    document.body.style.overflow = prevOverflow;
  }

  function paintList() {
    const collected = collectTodayActionTodos(kpiId);
    if (!(listEl instanceof HTMLElement)) return;
    listEl.replaceChildren();
    const todos = collected?.todos || [];
    if (!todos.length) {
      if (scrollEl instanceof HTMLElement) scrollEl.hidden = true;
      if (statusEl instanceof HTMLElement) {
        statusEl.hidden = false;
        statusEl.textContent = "등록된 할 일이 없습니다.";
      }
      return;
    }
    if (scrollEl instanceof HTMLElement) scrollEl.hidden = false;
    if (statusEl instanceof HTMLElement) {
      statusEl.hidden = true;
      statusEl.textContent = "";
    }
    const pickIds = new Set(readTodayActionTodoPickIds(kpiId, todayYmd));
    for (const todo of todos) {
      const row = document.createElement("button");
      row.type = "button";
      row.className =
        "time-task-log-kpi-todo-row time-task-log-chore-todo-row time-task-log-kpi-todo-row--pick-memo";
      row.setAttribute("data-legacy", "time-task-log-chore-todo-row");
      row.setAttribute("data-todo-id", todo.id);
      row.setAttribute("aria-label", `오늘 할 일로 고르기: ${todo.text}`);
      row.classList.toggle("is-planned", pickIds.has(todo.id));
      const span = document.createElement("span");
      span.className = "time-task-log-kpi-todo-text";
      span.setAttribute("data-legacy", "time-task-log-kpi-todo-text");
      span.textContent = todo.text;
      row.appendChild(span);
      row.addEventListener("click", () => {
        toggleTodayActionTodoPick(kpiId, todo.id, todayYmd);
        paintList();
        try {
          opts.onChange?.();
        } catch (_) {}
      });
      listEl.appendChild(row);
    }
  }

  modal
    .querySelector('[data-legacy~="time-task-setup-close"]')
    ?.addEventListener("click", close);

  modal
    .querySelector('[data-legacy~="lp-expected-kpi-todo-add-btn"]')
    ?.addEventListener("click", async () => {
      const collected = collectTodayActionTodos(kpiId);
      const text = await showKpiTodoAddModal({
        kpiName: name,
        title: "할 일 추가",
        placeholder: "할 일 입력",
      });
      if (!text || !modal.isConnected) return;
      const storageKey =
        collected?.storageKey || findKpiBundle(kpiId)?.storageKey || "";
      const ok = !!addKpiTodo(kpiId, storageKey, text, { pushServer: true })
        ?.success;
      if (!ok) return;
      paintList();
      try {
        opts.onChange?.();
      } catch (_) {}
    });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  try {
    document.documentElement.classList.add(LP_MODAL_HTML_OPEN_CLASS);
  } catch (_) {}
  paintList();
}

/**
 * @param {HTMLElement} host
 * @param {{ id: string, name?: string }} item
 * @param {{ todayYmd?: string, onChange?: () => void }} [opts]
 */
export function appendTodayActionPinnedTodos(host, item, opts = {}) {
  if (!(host instanceof HTMLElement)) return;
  const kpiId = String(item?.id || "").trim();
  const pickIds = readTodayActionTodoPickIds(kpiId, opts.todayYmd);
  if (!pickIds.length) return;
  const collected = collectTodayActionTodos(kpiId);
  if (!collected) return;
  const byId = new Map(collected.todos.map((t) => [t.id, t]));
  const pinned = pickIds.map((id) => byId.get(id)).filter(Boolean);
  if (!pinned.length) return;

  const ul = document.createElement("ul");
  ul.className = "habit-tracker-today-action-todos";
  ul.setAttribute("aria-label", `${item?.name || "행동"} 오늘 할일`);
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
