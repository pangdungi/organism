/**
 * 시간가계부 기록 행 — localStorage + Supabase (time_ledger_entries)
 */

import { isUuid } from "./timeTaskOptionsModel.js";

export const TIME_LEDGER_ENTRIES_KEY = "time_task_log_rows";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Time.js parseFocusEvents 와 동일 (순환 import 방지) */
export function parseFocusEventsForStorage(raw, defaultTime = "") {
  const s = String(raw || "").trim();
  if (!s) return [];
  if (s.includes(";")) {
    return s.split(";").map((seg) => {
      const [t, type] = seg.split("|");
      return { time: (t || "").trim(), type: (type || "").trim() };
    });
  }
  const [a, b] = s.split("|");
  if (/^\d{1,2}:\d{2}$/.test(String(a || "").trim())) {
    return [{ time: (a || "").trim(), type: (b || "").trim() }];
  }
  const cnt = parseInt(String(a || "0").replace(/\D/g, ""), 10) || 0;
  const type = (b || "").trim();
  if (cnt <= 0 || !type) return [];
  return Array.from({ length: cnt }, () => ({ time: defaultTime, type }));
}

export function focusEventsToRaw(events) {
  if (!Array.isArray(events) || events.length === 0) return "";
  return events
    .map((e) => {
      const t = String(e?.time ?? "").trim();
      const ty = String(e?.type ?? "").trim();
      return `${t}|${ty}`;
    })
    .filter((s) => s !== "|")
    .join(";");
}

function newRowId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function ensureTimeLedgerEntryIds(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  let dirty = false;
  const out = arr.map((r) => {
    if (!r || typeof r !== "object") return r;
    const id = String(r.id || "").trim();
    if (isUuid(id)) return { ...r, id };
    dirty = true;
    return { ...r, id: newRowId() };
  });
  return { rows: out, dirty };
}

function normalizeEntryDate(d) {
  if (d == null) return "";
  const s = String(d).replace(/\//g, "-").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

export function timeLedgerRowIsSyncable(r) {
  if (!r || typeof r !== "object") return false;
  const id = String(r.id || "").trim();
  if (!UUID_RE.test(id)) return false;
  if (!normalizeEntryDate(r.date)) return false;
  const taskName = (r.taskName || "").trim();
  const timeTracked = (r.timeTracked || "").trim();
  const feedback = (r.feedback || "").trim();
  const start = (r.startTime || "").trim();
  return !!(taskName || timeTracked || feedback || start);
}

export function localTimeLedgerRowToDbPayload(userId, row) {
  const entry_date = normalizeEntryDate(row.date);
  if (!entry_date) return null;
  const events = parseFocusEventsForStorage(row.focus, "");
  const focus_events = events.map((e) => ({
    time: e.time || "",
    type: e.type || "",
  }));
  const memoTags = Array.isArray(row.memoTags) ? row.memoTags : [];
  const tid = String(row.taskId || "").trim();
  return {
    id: String(row.id || "").trim(),
    user_id: userId,
    entry_date,
    task_id: UUID_RE.test(tid) ? tid : null,
    task_name: String(row.taskName || "").trim(),
    start_time: String(row.startTime || "").trim(),
    end_time: String(row.endTime || "").trim(),
    productivity: String(row.productivity || "").trim(),
    category: String(row.category || "").trim(),
    time_tracked: String(row.timeTracked || "").trim(),
    focus_events,
    memo: String(row.feedback || "").trim(),
    memo_tags: memoTags,
  };
}

export function dbRowToLocalTimeLedgerRow(db) {
  const focus = focusEventsToRaw(
    Array.isArray(db.focus_events) ? db.focus_events : [],
  );
  const memo_tags = Array.isArray(db.memo_tags) ? db.memo_tags : [];
  return {
    id: String(db.id || "").trim(),
    date: normalizeEntryDate(db.entry_date) || String(db.entry_date || "").slice(0, 10),
    taskName: String(db.task_name || "").trim(),
    taskId: db.task_id ? String(db.task_id).trim() : "",
    startTime: String(db.start_time || "").trim(),
    endTime: String(db.end_time || "").trim(),
    productivity: String(db.productivity || "").trim(),
    category: String(db.category || "").trim(),
    timeTracked: String(db.time_tracked || "").trim(),
    focus,
    feedback: String(db.memo || "").trim(),
    memoTags: memo_tags,
  };
}

/**
 * 서버에서 받은 행으로 로컬 배열 병합: 서버 id 목록은 서버 스냅샷으로 대체,
 * 서버에 없는 로컬 전용 id(오프라인 추가 등)는 유지.
 */
/** 서버에 없는 로컬 행을 유지할지: syncable UUID는 서버에 없으면 삭제된 것으로 간주(동기화 후 pull 전제). */
function keepLocalRowNotOnServer(r, serverIds) {
  const id = String(r?.id || "").trim();
  if (!id) return false;
  if (serverIds.has(id)) return false;
  if (!UUID_RE.test(id)) return true;
  if (!timeLedgerRowIsSyncable(r)) return true;
  return false;
}

export function mergeTimeLedgerEntriesFromServer(dbRows) {
  if (!Array.isArray(dbRows) || dbRows.length === 0) return;
  let local = [];
  try {
    const raw = localStorage.getItem(TIME_LEDGER_ENTRIES_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) local = p;
    }
  } catch (_) {}

  const { rows: localWithIds } = ensureTimeLedgerEntryIds(local);
  const serverLocals = dbRows.map((r) => dbRowToLocalTimeLedgerRow(r));
  const serverIds = new Set(serverLocals.map((r) => String(r.id || "").trim()));
  const keptLocal = localWithIds.filter((r) => keepLocalRowNotOnServer(r, serverIds));
  const merged = [...serverLocals, ...keptLocal];
  try {
    localStorage.setItem(TIME_LEDGER_ENTRIES_KEY, JSON.stringify(merged));
  } catch (_) {}
}

function rowEntryDateInInclusiveRange(row, startYmd, endYmd) {
  const d = normalizeEntryDate(row.date);
  if (!d) return false;
  return d >= startYmd && d <= endYmd;
}

/** 연·월(1–12) → 해당 달 entry_date 범위 YYYY-MM-DD (포함) */
export function timeLedgerMonthRangeYmd(year, month) {
  const y = Number(year);
  const m = Number(month);
  const pad2 = (n) => String(n).padStart(2, "0");
  const rangeStart = `${y}-${pad2(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const rangeEnd = `${y}-${pad2(m)}-${pad2(lastDay)}`;
  return { rangeStart, rangeEnd };
}

/**
 * [rangeStart, rangeEnd] 안의 행은 서버 스냅샷으로 맞추고, 그 밖은 유지.
 * 그 달에 서버에 없는 syncable UUID는 삭제(다른 기기에서 삭제 반영).
 */
export function mergeTimeLedgerEntriesFromServerForDateRange(dbRows, rangeStart, rangeEnd) {
  if (!rangeStart || !rangeEnd) return;
  const serverRows = Array.isArray(dbRows) ? dbRows : [];
  let local = [];
  try {
    const raw = localStorage.getItem(TIME_LEDGER_ENTRIES_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) local = p;
    }
  } catch (_) {}

  const { rows: localWithIds } = ensureTimeLedgerEntryIds(local);
  const serverLocals = serverRows.map((r) => dbRowToLocalTimeLedgerRow(r));
  const serverIds = new Set(serverLocals.map((r) => String(r.id || "").trim()));

  const outside = localWithIds.filter((r) => !rowEntryDateInInclusiveRange(r, rangeStart, rangeEnd));
  const insideKeep = localWithIds.filter((r) => {
    if (!rowEntryDateInInclusiveRange(r, rangeStart, rangeEnd)) return false;
    return keepLocalRowNotOnServer(r, serverIds);
  });

  const merged = [...outside, ...serverLocals, ...insideKeep];
  try {
    localStorage.setItem(TIME_LEDGER_ENTRIES_KEY, JSON.stringify(merged));
  } catch (_) {}
}

export function readTimeLedgerEntriesRaw() {
  try {
    const raw = localStorage.getItem(TIME_LEDGER_ENTRIES_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (_) {
    return [];
  }
}

export function writeTimeLedgerEntriesRaw(rows) {
  try {
    localStorage.setItem(TIME_LEDGER_ENTRIES_KEY, JSON.stringify(rows));
  } catch (_) {}
}

/**
 * 시간기록 행의 메모(feedback)만 갱신. 행 삭제 없음. Supabase 동기는 time-ledger-entries-saved 로 트리거.
 * @returns {{ ok: boolean, msg?: string }}
 */
export function updateTimeLedgerEntryFeedbackById(entryId, feedbackText) {
  const id = String(entryId || "").trim();
  if (!id) return { ok: false, msg: "기록 id가 없어요." };
  const rows = readTimeLedgerEntriesRaw();
  let found = false;
  const next = rows.map((r) => {
    if (!r || String(r.id || "").trim() !== id) return r;
    found = true;
    return { ...r, feedback: String(feedbackText ?? "").trim() };
  });
  if (!found) return { ok: false, msg: "해당 기록을 찾을 수 없어요." };
  writeTimeLedgerEntriesRaw(next);
  try {
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("calendar-time-rows-updated", { detail: {} }));
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("time-ledger-entries-saved"));
    }
  } catch (_) {}
  return { ok: true };
}
