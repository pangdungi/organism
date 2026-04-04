/**
 * 시간가계부 기록 행 — IndexedDB(주) + localStorage(미러·마이그레이션) + Supabase
 */

import { isUuid, UUID_RE } from "./idUtils.js";
import {
  migrateFromLocalStorageIfNeeded,
  readAllRowsFromIdb,
  tryMirrorTimeLedgerToLocalStorage,
  writeAllRowsToIdb,
  TIME_LEDGER_STORAGE_KEY,
} from "./timeLedgerEntriesStore.js";

export const TIME_LEDGER_ENTRIES_KEY = TIME_LEDGER_STORAGE_KEY;

/** 메모리 캐시 — readTimeLedgerEntriesRaw / writeTimeLedgerEntriesRaw 가 사용 (앱 시작 시 IDB로 채움) */
let _ledgerRowsMem = null;

/** @type {Promise<void> | null} */
let _storageReadyPromise = null;

/** IndexedDB 실패 시 true — 이후 쓰기는 localStorage 미러만 */
let _idbDisabled = false;

/**
 * 앱 본 화면(mountApp) 전에 반드시 await. 미호출 시 read는 [].
 */
export function ensureTimeLedgerStorageReady() {
  if (!_storageReadyPromise) {
    _storageReadyPromise = (async () => {
      try {
        await migrateFromLocalStorageIfNeeded();
        let rows = await readAllRowsFromIdb();
        const { rows: fixed, dirty } = ensureTimeLedgerEntryIds(rows);
        _ledgerRowsMem = fixed;
        if (dirty) {
          await writeAllRowsToIdb(fixed);
          tryMirrorTimeLedgerToLocalStorage(fixed);
        }
      } catch (e) {
        console.warn("[time-ledger-model] IndexedDB 사용 불가, localStorage로 폴백:", e);
        _idbDisabled = true;
        let rows = [];
        try {
          const raw = localStorage.getItem(TIME_LEDGER_ENTRIES_KEY);
          if (raw) {
            const p = JSON.parse(raw);
            if (Array.isArray(p)) rows = p;
          }
        } catch (_) {}
        const { rows: fixed, dirty } = ensureTimeLedgerEntryIds(rows);
        _ledgerRowsMem = fixed;
        if (dirty) {
          try {
            localStorage.setItem(TIME_LEDGER_ENTRIES_KEY, JSON.stringify(fixed));
          } catch (_) {}
        }
      }
    })();
  }
  return _storageReadyPromise;
}

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
    /** Supabase updated_at — 병합 시 last-write-wins */
    serverUpdatedAt:
      db.updated_at != null && db.updated_at !== ""
        ? String(db.updated_at)
        : "",
  };
}

/** 동기화 메타 제외 후 JSON 비교용 (저장 시 내용 변경 여부) */
export function stripTimeLedgerSyncMetaForCompare(row) {
  if (!row || typeof row !== "object") return "";
  const { localModifiedAt, serverUpdatedAt, ...rest } = row;
  try {
    return JSON.stringify(rest);
  } catch (_) {
    return "";
  }
}

function parseIsoMs(iso) {
  if (iso == null || iso === "") return 0;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : 0;
}

/**
 * 같은 id: 서버 updated_at vs 로컬 편집 시각(localModifiedAt, ms).
 * localModifiedAt > server updated_at 이면 로컬(아직 push 반영 전 편집) 우선.
 */
function pickRowByLastWrite(localRow, serverRow) {
  const serverT = parseIsoMs(serverRow.serverUpdatedAt);
  const localMod =
    typeof localRow.localModifiedAt === "number" &&
    Number.isFinite(localRow.localModifiedAt)
      ? localRow.localModifiedAt
      : 0;
  if (localMod > serverT) {
    return { ...localRow };
  }
  return { ...serverRow };
}

/**
 * 서버 스냅샷 + 로컬 전체 병합 (동일 id는 last-write-wins).
 */
function mergeLocalAndServerRows(localWithIds, serverLocals) {
  const serverIds = new Set(
    serverLocals.map((r) => String(r.id || "").trim()).filter(Boolean),
  );
  const localById = new Map(
    localWithIds.map((r) => [String(r.id || "").trim(), r]).filter(([id]) => id),
  );
  const mergedById = new Map();

  for (const srv of serverLocals) {
    const id = String(srv.id || "").trim();
    if (!id) continue;
    const loc = localById.get(id);
    if (!loc) {
      mergedById.set(id, srv);
      continue;
    }
    mergedById.set(id, pickRowByLastWrite(loc, srv));
  }

  for (const loc of localWithIds) {
    const id = String(loc?.id || "").trim();
    if (!id || mergedById.has(id)) continue;
    if (!keepLocalRowNotOnServer(loc, serverIds)) continue;
    mergedById.set(id, loc);
  }

  return [...mergedById.values()];
}

/**
 * 서버에 없는 로컬 행을 유지할지.
 * syncable UUID인데 서버 스냅샷에 id가 없으면, (1) 아직 push 전인 새 행 (2) 타 기기에서 삭제됨 — 구분 불가.
 * 예전에는 (1)을 삭제로 처리해 pull 직후 로컬만 유실되는 버그가 있었음 → 서버에 없는 UUID는 로컬 유지(업로드 대기).
 * 삭제 반영은 서버에 행이 없어진 뒤 push·pull·Realtime 병합으로 점진 정리(유령 행은 수동 삭제 가능).
 */
function keepLocalRowNotOnServer(r, serverIds) {
  const id = String(r?.id || "").trim();
  if (!id) return false;
  if (serverIds.has(id)) return false;
  if (!UUID_RE.test(id)) return true;
  if (!timeLedgerRowIsSyncable(r)) return true;
  return true;
}

export function mergeTimeLedgerEntriesFromServer(dbRows) {
  if (!Array.isArray(dbRows) || dbRows.length === 0) return;
  const local = readTimeLedgerEntriesRaw();
  const { rows: localWithIds } = ensureTimeLedgerEntryIds(local);
  const serverLocals = dbRows.map((r) => dbRowToLocalTimeLedgerRow(r));
  const merged = mergeLocalAndServerRows(localWithIds, serverLocals);
  writeTimeLedgerEntriesRaw(merged);
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
 * [rangeStart, rangeEnd] 안: 서버 구간 pull + 로컬 동일 구간을 last-write-wins 병합.
 * 그 밖 날짜 행은 그대로 유지.
 */
export function mergeTimeLedgerEntriesFromServerForDateRange(dbRows, rangeStart, rangeEnd) {
  if (!rangeStart || !rangeEnd) return;
  const serverRows = Array.isArray(dbRows) ? dbRows : [];
  const local = readTimeLedgerEntriesRaw();
  const { rows: localWithIds } = ensureTimeLedgerEntryIds(local);
  const serverLocals = serverRows.map((r) => dbRowToLocalTimeLedgerRow(r));

  const outside = localWithIds.filter(
    (r) => !rowEntryDateInInclusiveRange(r, rangeStart, rangeEnd),
  );
  const insideLocals = localWithIds.filter((r) =>
    rowEntryDateInInclusiveRange(r, rangeStart, rangeEnd),
  );
  const mergedInside = mergeLocalAndServerRows(insideLocals, serverLocals);
  const merged = [...outside, ...mergedInside];
  writeTimeLedgerEntriesRaw(merged);
}

export function readTimeLedgerEntriesRaw() {
  if (!Array.isArray(_ledgerRowsMem)) return [];
  return _ledgerRowsMem.slice();
}

export function writeTimeLedgerEntriesRaw(rows) {
  const arr = Array.isArray(rows) ? rows.slice() : [];
  _ledgerRowsMem = arr;
  if (!_idbDisabled) {
    void writeAllRowsToIdb(arr).catch((e) => console.warn("[time-ledger-store] idb write", e));
  }
  tryMirrorTimeLedgerToLocalStorage(arr);
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
  const updatedRow = next.find((r) => r && String(r.id || "").trim() === id);
  const feedbackTrim = String(feedbackText ?? "").trim();
  console.info("[archive] [메모→로컬] 저장됨 (행 유지, feedback만 갱신)", {
    entryId: id,
    feedback글자수: feedbackTrim.length,
    메모비움: feedbackTrim.length === 0,
    "Supabase upsert 대상 여부(timeLedgerRowIsSyncable)": updatedRow
      ? timeLedgerRowIsSyncable(updatedRow)
      : false,
  });
  try {
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent("calendar-time-rows-updated", { detail: {} }));
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("time-ledger-entries-saved", {
          detail: { source: "archiveMemo", entryId: id },
        }),
      );
    }
  } catch (_) {}
  return { ok: true };
}
