/**
 * 시간가계부 기록 행 — 이 모듈은 프로세스 메모리만 유지. 영속 복구는 Supabase pull.
 * (구버전 IndexedDB·localStorage 잔여물은 기동·purge 시 비움)
 */

import { isUuid, UUID_RE } from "./idUtils.js";
import { lpSaveDebug } from "./lpSaveDebug.js";
import {
  writeAllRowsToIdb,
  TIME_LEDGER_STORAGE_KEY,
} from "./timeLedgerEntriesStore.js";

/**
 * 로그아웃·계정 전환 시 호출. 구버전 로컬 저장소 잔여를 비우고 메모리를 초기화합니다.
 */
export async function purgeTimeLedgerLocalData() {
  try {
    await writeAllRowsToIdb([]);
  } catch (_) {}
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(TIME_LEDGER_STORAGE_KEY);
      localStorage.removeItem(TIME_LEDGER_DELETE_TOMBSTONES_LS_LEGACY_KEY);
    }
  } catch (_) {}
  _deletionTombstonesObj = {};
  _ledgerRowsMem = [];
  _storageReadyPromise = null;
}

export const TIME_LEDGER_ENTRIES_KEY = TIME_LEDGER_STORAGE_KEY;

/** 구버전 tombstone 키 — 남아 있으면 한 번 제거 */
const TIME_LEDGER_DELETE_TOMBSTONES_LS_LEGACY_KEY =
  "lp-time-ledger-entry-tombstones";
const TIME_LEDGER_TOMBSTONE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** 세션 메모리만 — 새로고침 시 초기화 */
let _deletionTombstonesObj = {};

/**
 * 만료된 항목 제거 후 id → 기록 시각(ms) 맵
 */
function getActiveDeletionTombstones() {
  const raw = _deletionTombstonesObj;
  const now = Date.now();
  const out = {};
  for (const [id, ts] of Object.entries(raw)) {
    if (!UUID_RE.test(String(id || ""))) continue;
    const t = Number(ts);
    if (!Number.isFinite(t) || now - t > TIME_LEDGER_TOMBSTONE_MAX_AGE_MS)
      continue;
    out[id] = t;
  }
  if (Object.keys(out).length !== Object.keys(raw).length) {
    _deletionTombstonesObj = out;
  }
  return out;
}

/**
 * Supabase에서 해당 id 삭제가 성공했을 때만 호출. 이후 구간 pull이 같은 id를 실어도 메모리에 재삽입하지 않음(같은 탭 세션 한정).
 */
export function recordTimeLedgerDeletionTombstone(entryId) {
  const id = String(entryId || "").trim();
  if (!id || !UUID_RE.test(id)) return;
  const tomb = { ...getActiveDeletionTombstones(), [id]: Date.now() };
  _deletionTombstonesObj = tomb;
}

/** 메모리 캐시 — readTimeLedgerEntriesRaw / writeTimeLedgerEntriesRaw */
let _ledgerRowsMem = null;

/** @type {Promise<void> | null} */
let _storageReadyPromise = null;

/**
 * 앱 본 화면(mountApp) 전에 반드시 await. 메모리는 빈 배열로 시작합니다.
 */
export function ensureTimeLedgerStorageReady() {
  if (!_storageReadyPromise) {
    _storageReadyPromise = (async () => {
      _ledgerRowsMem = [];
      try {
        await writeAllRowsToIdb([]);
      } catch (_) {}
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.removeItem(TIME_LEDGER_STORAGE_KEY);
          localStorage.removeItem(TIME_LEDGER_DELETE_TOMBSTONES_LS_LEGACY_KEY);
        }
      } catch (_) {}
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
  if (typeof crypto !== "undefined" && crypto.randomUUID)
    return crypto.randomUUID();
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
    const lm =
      typeof r.localModifiedAt === "number" &&
      Number.isFinite(r.localModifiedAt)
        ? r.localModifiedAt
        : Date.now();
    return { ...r, id: newRowId(), localModifiedAt: lm };
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
  const mealDetail = (r.mealDetail || "").trim();
  const start = (r.startTime || "").trim();
  return !!(taskName || timeTracked || feedback || mealDetail || start);
}

/**
 * 이 기기에서 사용자가 수정·추가한 행만 서버로 보냄.
 * (끌어오기만 한 행은 serverUpdatedAt만 있고 localModifiedAt 없음 → upsert 생략 → 다른 기기 기록 덮어쓰기 방지)
 */
export function timeLedgerRowNeedsPush(r) {
  if (!timeLedgerRowIsSyncable(r)) return false;
  const lm = r.localModifiedAt;
  const hasLm = typeof lm === "number" && Number.isFinite(lm);
  if (!hasLm) return false;
  const s = String(r.serverUpdatedAt || "").trim();
  if (!s) return true;
  const serverMs = Date.parse(s);
  if (!Number.isFinite(serverMs)) return true;
  return lm > serverMs;
}

/** upsert 응답의 updated_at으로 로컰 메타 정리(다음 푸시에서 중복 업서트 방지) */
export function mergeTimeLedgerEntriesPushedServerTimes(dbRows) {
  const arr = Array.isArray(dbRows) ? dbRows : [];
  if (arr.length === 0) return;
  const respById = new Map(arr.map((db) => [String(db.id || "").trim(), db]));
  const rows = readTimeLedgerEntriesRaw();
  let changed = false;
  const next = rows.map((row) => {
    const id = String(row?.id || "").trim();
    const db = respById.get(id);
    if (!db) return row;
    const su =
      db.updated_at != null && db.updated_at !== ""
        ? String(db.updated_at)
        : String(row.serverUpdatedAt || "").trim();
    const { localModifiedAt: _drop, ...rest } = row;
    changed = true;
    return { ...rest, serverUpdatedAt: su };
  });
  if (changed) writeTimeLedgerEntriesRaw(next);
}

/** 구버전: memo_tags 안에 lp-expense:uuid 가 섞여 있던 경우 — DB에는 분리 저장 */
const LEDGER_EXPENSE_TAG_PREFIX = "lp-expense:";

function partitionMemoTagsAndLegacyExpenseIds(memoTags) {
  const clean = [];
  const legacyIds = [];
  for (const t of Array.isArray(memoTags) ? memoTags : []) {
    const s = String(t ?? "").trim();
    if (s.startsWith(LEDGER_EXPENSE_TAG_PREFIX)) {
      const id = s.slice(LEDGER_EXPENSE_TAG_PREFIX.length).trim();
      if (id) legacyIds.push(id);
    } else {
      clean.push(t);
    }
  }
  return { clean, legacyIds };
}

/** 구버전 memo에만 있던 `[식단] …` 한 줄 → 로컬 mealDetail·feedback 분리 (컬럼 meal_detail 비었을 때) */
const UNHEALTHY_MEAL_MEMO_PREFIX = "[식단] ";

/** pull·편집 폴백용: 예전에 memo 한 칸에 넣었던 값 분리 */
export function splitUnhealthyMealMemoFromDb(memo) {
  const m = String(memo || "").trim();
  if (!m.startsWith(UNHEALTHY_MEAL_MEMO_PREFIX)) {
    return { mealDetail: "", feedback: m };
  }
  const nl = m.indexOf("\n");
  const firstLine = nl === -1 ? m : m.slice(0, nl);
  const rest = nl === -1 ? "" : m.slice(nl + 1);
  const mealDetail = firstLine.slice(UNHEALTHY_MEAL_MEMO_PREFIX.length).trim();
  return { mealDetail, feedback: rest.trim() };
}

export function localTimeLedgerRowToDbPayload(userId, row) {
  const entry_date = normalizeEntryDate(row.date);
  if (!entry_date) return null;
  const events = parseFocusEventsForStorage(row.focus, "");
  const focus_events = events.map((e) => ({
    time: e.time || "",
    type: e.type || "",
  }));
  const rowLinked = Array.isArray(row.linkedExpenseIds)
    ? row.linkedExpenseIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  const { clean: memoTagsClean, legacyIds: fromMemoStray } =
    partitionMemoTagsAndLegacyExpenseIds(row.memoTags);
  const linked_expense_ids = [...new Set([...rowLinked, ...fromMemoStray])];
  const tid = String(row.taskId || "").trim();
  if (linked_expense_ids.length > 0) {
    lpSaveDebug("time_ledger payload(지출 연결 있음)", {
      id: String(row.id || "")
        .trim()
        .slice(0, 8),
      linked_expense_ids,
      memo_tags_len: memoTagsClean.length,
    });
  }
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
    meal_detail: String(row.mealDetail || "").trim(),
    memo_tags: memoTagsClean,
    linked_expense_ids,
  };
}

export function dbRowToLocalTimeLedgerRow(db) {
  const focus = focusEventsToRaw(
    Array.isArray(db.focus_events) ? db.focus_events : [],
  );
  const raw_memo_tags = Array.isArray(db.memo_tags) ? db.memo_tags : [];
  const fromDbLinked = Array.isArray(db.linked_expense_ids)
    ? db.linked_expense_ids
    : [];
  const dbLinkedIds = fromDbLinked
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  const { clean: memoTagsClean, legacyIds: legacyFromMemo } =
    partitionMemoTagsAndLegacyExpenseIds(raw_memo_tags);
  const linkedExpenseIds = [...new Set([...dbLinkedIds, ...legacyFromMemo])];
  const tn = String(db.task_name || "").trim();
  let feedback = String(db.memo || "").trim();
  let mealDetail = String(db.meal_detail ?? "").trim();
  if (!mealDetail && feedback.startsWith(UNHEALTHY_MEAL_MEMO_PREFIX)) {
    const sp = splitUnhealthyMealMemoFromDb(feedback);
    mealDetail = sp.mealDetail;
    feedback = sp.feedback;
  }
  return {
    id: String(db.id || "").trim(),
    date:
      normalizeEntryDate(db.entry_date) ||
      String(db.entry_date || "").slice(0, 10),
    taskName: tn,
    taskId: db.task_id ? String(db.task_id).trim() : "",
    startTime: String(db.start_time || "").trim(),
    endTime: String(db.end_time || "").trim(),
    productivity: String(db.productivity || "").trim(),
    category: String(db.category || "").trim(),
    timeTracked: String(db.time_tracked || "").trim(),
    focus,
    feedback,
    mealDetail,
    memoTags: memoTagsClean,
    linkedExpenseIds,
    /** Supabase updated_at — 병합 시 last-write-wins */
    /** Supabase updated_at — 서버 스냅샷·동기화 표시용 */
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

function rowEntryDateInInclusiveRange(row, startYmd, endYmd) {
  const d = normalizeEntryDate(row.date);
  if (!d) return false;
  return d >= startYmd && d <= endYmd;
}

/**
 * 서버에서 받은 행만으로 로컬 시간기록 전체를 교체 (로컬·서버 병합 없음).
 * 성공 응답이 빈 배열이면 로컬도 비움.
 */
export function applyTimeLedgerServerFullSnapshot(dbRows) {
  const arr = Array.isArray(dbRows) ? dbRows : [];
  const tombIds = new Set(Object.keys(getActiveDeletionTombstones()));
  const filtered =
    tombIds.size > 0
      ? arr.filter((r) => {
          const id = String(r?.id || "").trim();
          return !id || !tombIds.has(id);
        })
      : arr;
  const locals = filtered.map((r) => dbRowToLocalTimeLedgerRow(r));
  const { rows: withIds } = ensureTimeLedgerEntryIds(locals);
  writeTimeLedgerEntriesRaw(withIds);
}

/**
 * entry_date가 [rangeStart, rangeEnd] (포함)인 구간만 서버 스냅샷으로 교체. 그 외 날짜 행은 유지.
 */
export function applyTimeLedgerServerRangeSnapshot(
  dbRows,
  rangeStart,
  rangeEnd,
) {
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  if (!rs || !re) return;
  const serverRows = Array.isArray(dbRows) ? dbRows : [];
  const tombIds = new Set(Object.keys(getActiveDeletionTombstones()));
  const serverRowsFiltered = tombIds.size
    ? serverRows.filter((r) => {
        const id = String(r?.id || "").trim();
        return !id || !tombIds.has(id);
      })
    : serverRows;
  const serverLocals = serverRowsFiltered.map((r) =>
    dbRowToLocalTimeLedgerRow(r),
  );
  const { rows: insideFromServer } = ensureTimeLedgerEntryIds(serverLocals);
  const { rows: localWithIds } = ensureTimeLedgerEntryIds(
    readTimeLedgerEntriesRaw(),
  );
  const outside = localWithIds.filter(
    (r) => !rowEntryDateInInclusiveRange(r, rs, re),
  );
  const merged = [...outside, ...insideFromServer];
  writeTimeLedgerEntriesRaw(merged);
  try {
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("calendar-time-rows-updated", { detail: {} }),
      );
    }
  } catch (_) {}
}

export function readTimeLedgerEntriesRaw() {
  if (!Array.isArray(_ledgerRowsMem)) return [];
  return _ledgerRowsMem.slice();
}

export function writeTimeLedgerEntriesRaw(rows) {
  const arr = Array.isArray(rows) ? rows.slice() : [];
  _ledgerRowsMem = arr;
}

/** Calendar 일간 ledger 필터와 동일한 날짜 정규화(YYYY-MM-DD) */
export function normalizeLedgerRowDateYmdTen(s) {
  return String(s || "").replace(/\//g, "-").trim().slice(0, 10);
}

/** 시작 시각 문자열 앞부분에서 YYYY-MM-DD 추출 */
export function parseYmdTenFromLedgerStartTimeStr(str) {
  if (!str || typeof str !== "string") return "";
  const m = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  return m
    ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`
    : "";
}

/** 해당 일(YYYY-MM-DD)의 시간가계부 행만 — Calendar `ledgerRowsForCalendarYmd`와 동일 규칙 */
export function filterTimeLedgerEntriesByYmdTen(allRows, ymdTen) {
  if (!ymdTen || !Array.isArray(allRows)) return [];
  return allRows.filter((r) => {
    const d = normalizeLedgerRowDateYmdTen(
      r?.date || parseYmdTenFromLedgerStartTimeStr(r?.startTime),
    );
    return d === ymdTen;
  });
}

/**
 * 시간기록 행의 메모(feedback)만 갱신. 행 삭제 없음. 호출 쪽에서 Supabase 반영(pushDirty) 필요.
 * @returns {{ ok: boolean, msg?: string }}
 */
export function updateTimeLedgerEntryFeedbackById(entryId, feedbackText) {
  const id = String(entryId || "").trim();
  if (!id) return { ok: false, msg: "기록 id가 없어요." };
  const rows = readTimeLedgerEntriesRaw();
  let found = false;
  let changed = false;
  const newFb = String(feedbackText ?? "").trim();
  const next = rows.map((r) => {
    if (!r || String(r.id || "").trim() !== id) return r;
    found = true;
    const prevFb = String(r.feedback ?? "").trim();
    const prevMeal = String(r.mealDetail ?? "").trim();
    let mealNext = prevMeal;
    if (
      (String(r.taskName || "").trim() === "건강하지 않은 섭취" ||
        String(r.taskName || "").trim() === "건강하지 않은 식사") &&
      !newFb
    ) {
      mealNext = "";
    }
    if (newFb === prevFb && mealNext === prevMeal) return r;
    changed = true;
    return {
      ...r,
      feedback: newFb,
      mealDetail: mealNext,
      localModifiedAt: Date.now(),
    };
  });
  if (!found) return { ok: false, msg: "해당 기록을 찾을 수 없어요." };
  if (!changed) return { ok: true };
  writeTimeLedgerEntriesRaw(next);
  try {
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("calendar-time-rows-updated", { detail: {} }),
      );
    }
  } catch (_) {}
  return { ok: true };
}
