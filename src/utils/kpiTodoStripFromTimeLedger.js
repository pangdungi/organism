/**
 * KPI에서 완료 체크를 끈 경우에만 시간기록에서 그 할일을 뺀다.
 * 완료목록 삭제·할일 삭제는 호출하지 않는다.
 * 서버에 올린 뒤 그 구간을 다시 받아 시간기록 화면에 반영한다.
 */

import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import {
  ledgerRowEntryDateYmd,
  readTimeLedgerEntriesRaw,
  writeTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";
import {
  pullTimeLedgerEntriesForDateRange,
  pushDirtyTimeLedgerEntriesToSupabase,
} from "./timeLedgerEntriesSupabase.js";
import { isReadingDetailTaskName } from "./timeTaskOptionsConstants.js";
import {
  omitReadingBookTitle,
  readingBookTitleKey,
} from "./readingBookTitles.js";

export const KPI_TODO_UNCOMPLETED_LEDGER_EVENT =
  "lp-kpi-todo-uncompleted-ledger";

const KPI_MAP_KEYS = [
  "kpi-sideincome-paths",
  "kpi-health-map",
  "kpi-happiness-map",
  "kpi-dream-map",
];

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function todoIdOf(item) {
  return String(item?.id || item?.kpiTodoId || "").trim();
}

function findKpiTodoMeta(todoId) {
  const tid = String(todoId || "").trim();
  if (!tid) return { text: "", kpiId: "" };
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
      };
    } catch (_) {}
  }
  return { text: "", kpiId: "" };
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

function applyStripToRows(rows, todoId, dropTexts) {
  const tid = String(todoId || "").trim();
  const dropKeys = new Set(
    (dropTexts || []).map((t) => readingBookTitleKey(t)).filter(Boolean),
  );
  const changed = [];
  const next = (rows || []).map((row) => {
    const habit = Array.isArray(row?.habitDailyCompleted)
      ? row.habitDailyCompleted
      : [];
    const nextHabit = habit.filter(
      (item) => !habitItemShouldDrop(item, tid, dropKeys),
    );
    let mealDetail = String(row?.mealDetail || "").trim();
    if (isReadingDetailTaskName(row?.taskName) && dropKeys.size) {
      let stripped = mealDetail;
      for (const text of dropTexts) {
        stripped = omitReadingBookTitle(stripped, text);
      }
      mealDetail = stripped;
    }
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

function dispatchLedgerTodoStripped(todoId, changedRows) {
  if (typeof document === "undefined") return;
  try {
    document.dispatchEvent(
      new CustomEvent(KPI_TODO_UNCOMPLETED_LEDGER_EVENT, {
        detail: {
          todoId: String(todoId || "").trim(),
          rows: changedRows || [],
        },
      }),
    );
  } catch (_) {}
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
  dispatchLedgerTodoStripped(tid, applied.changed);
  return entryIds;
}

function changedIds(changed) {
  return (changed || [])
    .map((r) => String(r?.id || "").trim())
    .filter(Boolean);
}

export function stripKpiTodoFromTimeLedgerIfUncompleted(
  completed,
  todoId,
  todoText,
) {
  if (completed) return;
  void stripKpiTodoFromTimeLedgerRows(todoId, todoText);
}
