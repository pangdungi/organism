/**
 * KPI에서 완료 체크를 끈 경우에만 시간기록에서 그 할일을 뺀다.
 * 다시 체크하면, 방금 빠졌던 그 기록에만 완료를 되돌린다.
 * 그 사이에 다른 시간기록에서 다시 완료하면 예전 기록에는 붙이지 않는다.
 * 새 기록은 만들지 않고, 이미 지운 기록에는 붙이지 않는다.
 */

import { persistKpiTodoRowOnly } from "./kpiTodoOneRowPersist.js";
import { stampAndPersistKpiMap } from "./kpiTodoSync.js";
import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import {
  ledgerRowEntryDateYmd,
  readTimeLedgerEntriesRaw,
  writeTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";
import {
  pullTimeLedgerEntriesByIds,
  pullTimeLedgerEntriesForDateRange,
  pushDirtyTimeLedgerEntriesToSupabase,
} from "./timeLedgerEntriesSupabase.js";
import { isReadingDetailTaskName } from "./timeTaskOptionsConstants.js";
import {
  lookupBuiltinTodoById,
  setBuiltinTodoLedgerRestore,
} from "./allTodosBuiltinLists.js";
import {
  omitReadingBookTitle,
  readingBookTitleKey,
} from "./readingBookTitles.js";

export const KPI_TODO_UNCOMPLETED_LEDGER_EVENT =
  "lp-kpi-todo-uncompleted-ledger";

const RESTORE_FIELD = "lpLedgerRestore";

const KPI_MAP_KEYS = [
  "kpi-sideincome-paths",
  "kpi-health-map",
  "kpi-happiness-map",
  "kpi-dream-map",
];

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @type {Map<string, Promise<unknown>>} */
const inflightByTodoId = new Map();

function todoIdOf(item) {
  return String(item?.id || item?.kpiTodoId || "").trim();
}

function findKpiTodoMeta(todoId) {
  const tid = String(todoId || "").trim();
  if (!tid) return { text: "", kpiId: "", storageKey: "" };
  for (const storageKey of KPI_MAP_KEYS) {
    try {
      const raw = readKpiMapScopedStorageRaw(storageKey);
      if (!raw) continue;
      const data = JSON.parse(raw);
      const todo = (data.kpiTodos || []).find(
        (t) => String(t?.id || "").trim() === tid,
      );
      if (!todo) continue;
      return {
        text: String(todo?.text || "").trim(),
        kpiId: String(todo?.kpiId || "").trim(),
        storageKey,
        todo,
        data,
        raw,
      };
    } catch (_) {}
  }
  const builtin = lookupBuiltinTodoById(tid);
  if (builtin) {
    return {
      text: String(builtin.todo?.text || "").trim(),
      kpiId: builtin.listKey,
      storageKey: "",
      todo: builtin.todo,
    };
  }
  return { text: "", kpiId: "", storageKey: "" };
}

function normalizeRestoreRefs(refs) {
  if (!Array.isArray(refs)) return [];
  const out = [];
  const seen = new Set();
  for (const ref of refs) {
    const entryId = String(ref?.entryId || "").trim();
    if (!entryId || seen.has(entryId)) continue;
    seen.add(entryId);
    const items = (Array.isArray(ref.items) ? ref.items : [])
      .map((item) => ({
        id: String(item?.id || "").trim(),
        text: String(item?.text || "").trim(),
      }))
      .filter((item) => item.id || item.text);
    out.push({
      entryId,
      items,
      mealDetailBefore: String(ref?.mealDetailBefore || "").trim(),
      mealDetailAfter: String(ref?.mealDetailAfter || "").trim(),
    });
  }
  return out;
}

function readRestoreFromTodo(todoId) {
  const meta = findKpiTodoMeta(todoId);
  return normalizeRestoreRefs(meta.todo?.[RESTORE_FIELD]);
}

function writeRestoreOnTodo(todoId, refs) {
  const tid = String(todoId || "").trim();
  if (!tid) return;
  const nextRefs = normalizeRestoreRefs(refs);
  if (setBuiltinTodoLedgerRestore(tid, nextRefs)) return;
  const meta = findKpiTodoMeta(tid);
  if (!meta.storageKey || !meta.todo || !meta.raw) return;
  let prevSnapshot;
  try {
    prevSnapshot = JSON.parse(meta.raw);
  } catch (_) {
    return;
  }
  const data = JSON.parse(meta.raw);
  data.kpiTodos = Array.isArray(data.kpiTodos) ? data.kpiTodos : [];
  const todo = data.kpiTodos.find(
    (t) => String(t?.id || "").trim() === tid,
  );
  if (!todo) return;
  if (nextRefs.length) todo[RESTORE_FIELD] = nextRefs;
  else delete todo[RESTORE_FIELD];
  todo.localModifiedAt = Date.now();
  stampAndPersistKpiMap(meta.storageKey, prevSnapshot, data, {
    pushServer: false,
  });
  void persistKpiTodoRowOnly(meta.storageKey, todo);
}

export function clearKpiTodoLedgerRestore(todoId) {
  const tid = String(todoId || "").trim();
  if (!tid) return;
  if (!readRestoreFromTodo(tid).length) return;
  writeRestoreOnTodo(tid, []);
}

function collectDropTexts(rows, todoId, knownText) {
  const texts = new Set();
  const known = String(knownText || "").trim();
  if (known) texts.add(known);
  const looked = findKpiTodoMeta(todoId).text;
  if (looked) texts.add(looked);
  for (const row of rows || []) {
    for (const item of Array.isArray(row?.habitDailyCompleted)
      ? row.habitDailyCompleted
      : []) {
      if (todoIdOf(item) !== todoId) continue;
      const text = String(item?.text || "").trim();
      if (text) texts.add(text);
    }
  }
  return [...texts];
}

function habitItemShouldDrop(item, todoId, dropKeys) {
  if (todoIdOf(item) === todoId) return true;
  const key = readingBookTitleKey(item?.text);
  return !!(key && dropKeys.has(key));
}

function dropKeysOf(dropTexts) {
  return new Set(
    (dropTexts || []).map((t) => readingBookTitleKey(t)).filter(Boolean),
  );
}

function strippedMealDetail(row, dropTexts, dropKeys) {
  const mealDetail = String(row?.mealDetail || "").trim();
  if (!isReadingDetailTaskName(row?.taskName) || !dropKeys.size) {
    return mealDetail;
  }
  let stripped = mealDetail;
  for (const text of dropTexts || []) {
    stripped = omitReadingBookTitle(stripped, text);
  }
  return stripped;
}

function applyStripToRows(rows, todoId, dropTexts) {
  const tid = String(todoId || "").trim();
  const dropKeys = dropKeysOf(dropTexts);
  const changed = [];
  const next = (rows || []).map((row) => {
    const habit = Array.isArray(row?.habitDailyCompleted)
      ? row.habitDailyCompleted
      : [];
    const nextHabit = habit.filter(
      (item) => !habitItemShouldDrop(item, tid, dropKeys),
    );
    const mealDetail = strippedMealDetail(row, dropTexts, dropKeys);
    const habitChanged = nextHabit.length !== habit.length;
    const mealChanged = mealDetail !== String(row?.mealDetail || "").trim();
    if (!habitChanged && !mealChanged) return row;
    const updated = {
      ...row,
      habitDailyCompleted: nextHabit,
      mealDetail,
      localModifiedAt: Date.now(),
    };
    const id = String(row?.id || "").trim();
    if (id) changed.push(updated);
    return updated;
  });
  return { next, changed };
}

function collectRestoreRefs(rows, todoId, dropTexts) {
  const tid = String(todoId || "").trim();
  const dropKeys = dropKeysOf(dropTexts);
  const refs = [];
  for (const row of rows || []) {
    const entryId = String(row?.id || "").trim();
    if (!entryId) continue;
    const habit = Array.isArray(row?.habitDailyCompleted)
      ? row.habitDailyCompleted
      : [];
    const items = habit
      .filter((item) => habitItemShouldDrop(item, tid, dropKeys))
      .map((item) => ({
        id: todoIdOf(item) || tid,
        text: String(item?.text || "").trim(),
      }))
      .filter((item) => item.id || item.text);
    const mealDetailBefore = String(row?.mealDetail || "").trim();
    const mealDetailAfter = strippedMealDetail(row, dropTexts, dropKeys);
    if (!items.length && mealDetailAfter === mealDetailBefore) continue;
    refs.push({
      entryId,
      items,
      mealDetailBefore,
      mealDetailAfter,
    });
  }
  return refs;
}

function applyRestoreToRows(rows, todoId, todoText, refs) {
  const tid = String(todoId || "").trim();
  const knownText = String(todoText || "").trim();
  const byEntry = new Map();
  for (const ref of refs || []) {
    const entryId = String(ref?.entryId || "").trim();
    if (entryId) byEntry.set(entryId, ref);
  }
  const changed = [];
  const next = (rows || []).map((row) => {
    const entryId = String(row?.id || "").trim();
    const ref = byEntry.get(entryId);
    if (!ref) return row;
    const habit = Array.isArray(row?.habitDailyCompleted)
      ? [...row.habitDailyCompleted]
      : [];
    const seen = new Set();
    for (const item of habit) {
      const id = todoIdOf(item);
      if (id) seen.add(id);
      const text = String(item?.text || "").trim();
      if (text) seen.add(`text:${text}`);
    }
    let habitChanged = false;
    for (const item of Array.isArray(ref.items) ? ref.items : []) {
      const id = String(item?.id || tid).trim();
      const text = String(item?.text || knownText).trim();
      if (!id && !text) continue;
      if (id && seen.has(id)) continue;
      if (text && seen.has(`text:${text}`)) continue;
      const nextId = id || `text:${text}`;
      habit.push({ id: nextId, text: text || id });
      if (id) seen.add(id);
      if (text) seen.add(`text:${text}`);
      habitChanged = true;
    }
    let mealDetail = String(row?.mealDetail || "").trim();
    const before = String(ref.mealDetailBefore || "").trim();
    const after = String(ref.mealDetailAfter || "").trim();
    const mealChanged =
      !!before &&
      isReadingDetailTaskName(row?.taskName) &&
      mealDetail === after &&
      mealDetail !== before;
    if (mealChanged) mealDetail = before;
    if (!habitChanged && !mealChanged) return row;
    const updated = {
      ...row,
      habitDailyCompleted: habit,
      mealDetail,
      localModifiedAt: Date.now(),
    };
    changed.push(updated);
    return updated;
  });
  return { next, changed };
}

function rememberRestoreFromLedgerNow(todoId, todoText) {
  const tid = String(todoId || "").trim();
  if (!tid) return;
  const rows = readTimeLedgerEntriesRaw();
  if (!Array.isArray(rows) || !rows.length) return;
  const refs = collectRestoreRefs(
    rows,
    tid,
    collectDropTexts(rows, tid, todoText),
  );
  if (!refs.length) return;
  writeRestoreOnTodo(tid, refs);
}

function ymdRangeOfRows(rows) {
  const ymds = [];
  for (const row of rows || []) {
    const ymd = String(
      ledgerRowEntryDateYmd(row) || row?.date || "",
    ).slice(0, 10);
    if (YMD_RE.test(ymd)) ymds.push(ymd);
  }
  if (!ymds.length) return null;
  ymds.sort();
  return { rs: ymds[0], re: ymds[ymds.length - 1] };
}

function dispatchLedgerTodoStripped(todoId, changedRows, restore) {
  if (typeof document === "undefined") return;
  try {
    document.dispatchEvent(
      new CustomEvent(KPI_TODO_UNCOMPLETED_LEDGER_EVENT, {
        detail: {
          todoId: String(todoId || "").trim(),
          rows: changedRows || [],
          restore: !!restore,
        },
      }),
    );
  } catch (_) {}
}

function changedIds(changed) {
  return (changed || [])
    .map((r) => String(r?.id || "").trim())
    .filter(Boolean);
}

function enqueueLedgerTodoSync(todoId, job) {
  const tid = String(todoId || "").trim();
  const prev = inflightByTodoId.get(tid) || Promise.resolve();
  const next = prev.then(job, job).finally(() => {
    if (inflightByTodoId.get(tid) === next) inflightByTodoId.delete(tid);
  });
  inflightByTodoId.set(tid, next);
  return next;
}

export async function stripKpiTodoFromTimeLedgerRows(todoId, todoText) {
  const tid = String(todoId || "").trim();
  if (!tid) return [];
  const knownText = String(todoText || "").trim();
  const rows = readTimeLedgerEntriesRaw();
  if (!Array.isArray(rows) || !rows.length) return [];
  const dropTexts = collectDropTexts(rows, tid, knownText);
  const applied = applyStripToRows(rows, tid, dropTexts);
  if (!applied.changed.length) return [];
  writeTimeLedgerEntriesRaw(applied.next);
  const entryIds = changedIds(applied.changed);
  try {
    await pushDirtyTimeLedgerEntriesToSupabase({
      entryIds,
      forceRows: applied.changed,
      skipPull: true,
    });
  } catch (_) {}
  const range = ymdRangeOfRows(applied.changed);
  if (range) {
    try {
      await pullTimeLedgerEntriesForDateRange(range.rs, range.re, {
        force: true,
        trigger: "kpi-todo-uncomplete",
      });
    } catch (_) {}
  }
  dispatchLedgerTodoStripped(tid, applied.changed, false);
  return entryIds;
}

export async function restoreKpiTodoToRememberedLedgerRows(todoId, todoText) {
  const tid = String(todoId || "").trim();
  if (!tid) return [];
  const refs = readRestoreFromTodo(tid);
  if (!refs.length) return [];
  const missing = refs
    .map((r) => r.entryId)
    .filter((id) => {
      return !readTimeLedgerEntriesRaw().some(
        (row) => String(row?.id || "").trim() === id,
      );
    });
  if (missing.length) {
    try {
      await pullTimeLedgerEntriesByIds(missing);
    } catch (_) {}
  }
  const rows = readTimeLedgerEntriesRaw();
  if (!Array.isArray(rows) || !rows.length) return [];
  const applied = applyRestoreToRows(rows, tid, todoText, refs);
  writeRestoreOnTodo(tid, []);
  if (!applied.changed.length) return [];
  writeTimeLedgerEntriesRaw(applied.next);
  const entryIds = changedIds(applied.changed);
  try {
    await pushDirtyTimeLedgerEntriesToSupabase({
      entryIds,
      forceRows: applied.changed,
      skipPull: true,
    });
  } catch (_) {}
  dispatchLedgerTodoStripped(tid, applied.changed, true);
  return entryIds;
}

export function stripKpiTodoFromTimeLedgerIfUncompleted(
  completed,
  todoId,
  todoText,
) {
  const tid = String(todoId || "").trim();
  if (!tid) return;
  if (completed) {
    void enqueueLedgerTodoSync(tid, () =>
      restoreKpiTodoToRememberedLedgerRows(tid, todoText),
    );
    return;
  }
  rememberRestoreFromLedgerNow(tid, todoText);
  void enqueueLedgerTodoSync(tid, () =>
    stripKpiTodoFromTimeLedgerRows(tid, todoText),
  );
}
