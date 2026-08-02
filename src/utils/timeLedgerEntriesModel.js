/**
 * 시간가계부 기록 행 — 메모리 + 계정별 IndexedDB/localStorage.
 * 로그아웃·계정 전환 시 purge. 새로고침 시 계정 캐시 복구.
 */

import { isUuid, UUID_RE } from "./idUtils.js";
import { lpSaveDebug } from "./lpSaveDebug.js";
import { getActiveClientStorageUserId } from "./clientStorageScope.js";
import {
  readAllRowsFromIdb,
  readTimeLedgerRowsLocalMirrorSync,
  writeAllRowsToIdb,
  purgeTimeLedgerIdbForUser,
  TIME_LEDGER_STORAGE_KEY,
  tryMirrorTimeLedgerToLocalStorage,
} from "./timeLedgerEntriesStore.js";
import {
  removeScopedLocalStorageItem,
} from "./clientStorageScope.js";
import { normalizeTimeEndReasonsForRow } from "./timeTaskEndReasons.js";
import { normalizeTimeFlowFactorsForRow } from "./timeTaskFlowFactors.js";
import { normalizeTimeFlowDisruptorsForRow } from "./timeTaskFlowDisruptors.js";
import { normalizeTimeSleepGoodFactorsForRow } from "./timeTaskSleepGoodFactors.js";
import { normalizeTimeSleepPoorReasonsForRow } from "./timeTaskSleepPoorReasons.js";
import { normalizeTimeBadFeelingReasonsForRow } from "./timeTaskBadFeelingReasons.js";
import { normalizeTimeGoodFeelingReasonsForRow } from "./timeTaskGoodFeelingReasons.js";
import { normalizeTimeContentEvalReasonsForRow } from "./timeTaskContentEvalReasons.js";

export { normalizeTimeEndReasonForRow, normalizeTimeEndReasonsForRow } from "./timeTaskEndReasons.js";
export {
  normalizeTimeFlowFactorForRow,
  normalizeTimeFlowFactorsForRow,
} from "./timeTaskFlowFactors.js";
export { normalizeTimeFlowDisruptorsForRow } from "./timeTaskFlowDisruptors.js";
export {
  normalizeTimeSleepGoodFactorForRow,
  normalizeTimeSleepGoodFactorsForRow,
} from "./timeTaskSleepGoodFactors.js";
export {
  normalizeTimeSleepPoorReasonForRow,
  normalizeTimeSleepPoorReasonsForRow,
} from "./timeTaskSleepPoorReasons.js";
export {
  normalizeTimeBadFeelingReasonForRow,
  normalizeTimeBadFeelingReasonsForRow,
} from "./timeTaskBadFeelingReasons.js";
export {
  normalizeTimeGoodFeelingReasonForRow,
  normalizeTimeGoodFeelingReasonsForRow,
} from "./timeTaskGoodFeelingReasons.js";
export {
  normalizeTimeContentEvalReasonForRow,
  normalizeTimeContentEvalReasonsForRow,
} from "./timeTaskContentEvalReasons.js";

/**
 * 로그아웃·계정 전환 시 호출. 해당 계정 로컬 저장·메모리 초기화.
 */
export async function purgeTimeLedgerLocalData(uid = getActiveClientStorageUserId()) {
  const u = String(uid || "").trim();
  try {
    await purgeTimeLedgerIdbForUser(u);
  } catch (_) {}
  try {
    removeScopedLocalStorageItem(TIME_LEDGER_STORAGE_KEY, u);
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(TIME_LEDGER_STORAGE_KEY);
      localStorage.removeItem(TIME_LEDGER_DELETE_TOMBSTONES_LS_LEGACY_KEY);
    }
  } catch (_) {}
  _deletionTombstonesObj = {};
  _ledgerRowsMem = [];
  _ledgerMemRevision += 1;
  _storageReadyPromise = null;
  if (_persistTimer != null) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
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

/**
 * 메모리 기록 세대. pull/저장이 IDB hydrate보다 먼저 메모리를 바꾸면
 * 옛 IndexedDB 결과로 서버 스냅샷을 덮지 않기 위해 씀.
 */
let _ledgerMemRevision = 0;

/** @type {Promise<void> | null} */
let _storageReadyPromise = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let _persistTimer = null;

function bumpLedgerMemRevision() {
  _ledgerMemRevision += 1;
}

function schedulePersistTimeLedgerRowsToDisk() {
  const uid = getActiveClientStorageUserId();
  if (!uid) return;
  if (_persistTimer != null) clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    _persistTimer = null;
    const rows = readTimeLedgerEntriesRaw();
    void writeAllRowsToIdb(rows, uid).catch(() => {});
  }, 350);
}

/** pull 직후 — 디바운스 없이 디스크·미러에 바로 써서 껏다 켜도 옛 IDB가 안 남게 */
export function flushTimeLedgerRowsToDiskNow() {
  const uid = getActiveClientStorageUserId();
  if (!uid) return Promise.resolve();
  if (_persistTimer != null) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
  return writeAllRowsToIdb(readTimeLedgerEntriesRaw(), uid).catch(() => {});
}

function applyTimeLedgerRowsToMemory(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  const { rows: withIds, dirty } = ensureTimeLedgerEntryIds(arr);
  _ledgerRowsMem = withIds;
  bumpLedgerMemRevision();
  if (dirty) schedulePersistTimeLedgerRowsToDisk();
}

function dispatchTimeLedgerRowsHydratedFromIdb() {
  try {
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("calendar-time-rows-updated", {
          detail: { fromIdbHydrate: true },
        }),
      );
    }
  } catch (_) {}
}

/**
 * mountApp 직전: localStorage 미러만 동기 로드(IndexedDB open 대기 없음).
 * 이미 pull/저장으로 메모리가 있으면 옛 미러로 덮지 않음(캘린더 탭 전환 레이스 방지).
 * @param {{ force?: boolean }} [opts]
 * @returns {boolean} 미러에서 1건 이상 복구했으면 true
 */
export function hydrateTimeLedgerFromLocalMirrorForBoot(opts = {}) {
  const uid = getActiveClientStorageUserId();
  if (!uid) {
    _ledgerRowsMem = [];
    bumpLedgerMemRevision();
    return false;
  }
  if (
    !opts.force &&
    Array.isArray(_ledgerRowsMem) &&
    _ledgerRowsMem.length > 0 &&
    _ledgerMemRevision > 0
  ) {
    return true;
  }
  try {
    const rows = readTimeLedgerRowsLocalMirrorSync(uid);
    applyTimeLedgerRowsToMemory(rows);
    return rows.length > 0;
  } catch (_) {
    if (_ledgerRowsMem == null) _ledgerRowsMem = [];
    return false;
  }
}

async function hydrateTimeLedgerFromIdbAuthoritative() {
  const uid = getActiveClientStorageUserId();
  if (!uid) {
    _ledgerRowsMem = [];
    bumpLedgerMemRevision();
    return;
  }
  const memBeforeHydrate = Array.isArray(_ledgerRowsMem) ? _ledgerRowsMem : [];
  const revAtStart = _ledgerMemRevision;
  let prevSig = "";
  try {
    prevSig = JSON.stringify(memBeforeHydrate);
  } catch (_) {}
  try {
    const rows = await readAllRowsFromIdb(uid);
    /*
     * IDB 읽는 동안 서버 pull/저장이 메모리를 갱신했으면 옛 IDB로 덮지 않음.
     * (예: 부팅 hydrate 중 탭 pull → 최신 서버가 옛 폰 캐시에 지워지던 버그)
     */
    if (revAtStart !== _ledgerMemRevision) {
      schedulePersistTimeLedgerRowsToDisk();
      return;
    }
    /* 빈 IDB로 pull 직후 메모리를 비우지 않음 */
    if (rows.length > 0 || memBeforeHydrate.length === 0) {
      applyTimeLedgerRowsToMemory(rows);
    }
  } catch (_) {
    if (_ledgerRowsMem == null) {
      _ledgerRowsMem = [];
      bumpLedgerMemRevision();
    }
  }
  let nextSig = "";
  try {
    nextSig = JSON.stringify(_ledgerRowsMem || []);
  } catch (_) {}
  if (prevSig !== nextSig) dispatchTimeLedgerRowsHydratedFromIdb();
}

/**
 * IndexedDB 기준 전체 복구(백그라운드). mountApp 은 await 하지 않음.
 */
export function ensureTimeLedgerStorageReady() {
  if (!_storageReadyPromise) {
    _storageReadyPromise = hydrateTimeLedgerFromIdbAuthoritative();
  }
  return _storageReadyPromise;
}

/**
 * 앱 진입: 미러로 즉시 메모리 채운 뒤 IDB 정합은 백그라운드.
 */
export function prepareTimeLedgerStorageForBoot() {
  hydrateTimeLedgerFromLocalMirrorForBoot();
  void ensureTimeLedgerStorageReady();
}

/** 계정 전환: 메모리만 비우고 스토리지 ready 플래그 리셋 */
export function resetTimeLedgerMemoryForAccountSwitch() {
  _deletionTombstonesObj = {};
  _ledgerRowsMem = [];
  bumpLedgerMemRevision();
  _storageReadyPromise = null;
  if (_persistTimer != null) {
    clearTimeout(_persistTimer);
    _persistTimer = null;
  }
}

/** 활성 계정 id 기준 캐시 다시 로드 */
export async function reloadTimeLedgerStorageForActiveUser() {
  resetTimeLedgerMemoryForAccountSwitch();
  await ensureTimeLedgerStorageReady();
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

/**
 * 같은 id가 두 줄이면 서버 upsert가 실패함 — 더 최근 수정본 1개만 남김.
 * @returns {{ rows: object[], dirty: boolean }}
 */
export function dedupeTimeLedgerEntriesById(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  const byId = new Map();
  const noId = [];
  let dirty = false;
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const id = String(r.id || "").trim();
    if (!id) {
      noId.push(r);
      continue;
    }
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, r);
      continue;
    }
    dirty = true;
    const prevLm =
      typeof prev.localModifiedAt === "number" &&
      Number.isFinite(prev.localModifiedAt)
        ? prev.localModifiedAt
        : 0;
    const nextLm =
      typeof r.localModifiedAt === "number" && Number.isFinite(r.localModifiedAt)
        ? r.localModifiedAt
        : 0;
    byId.set(id, nextLm >= prevLm ? r : prev);
  }
  if (!dirty) return { rows: arr, dirty: false };
  return { rows: [...byId.values(), ...noId], dirty: true };
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
  const deduped = dedupeTimeLedgerEntriesById(out);
  return { rows: deduped.rows, dirty: dirty || deduped.dirty };
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

/** 과제 기록 모달 «오늘의 수행값» */
function normalizeKpiPerformedValueForRow(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? "" : String(n);
}

/** 시간기록 모달 «이 시간 평가» 1~5 (미선택 null) */
export function normalizeTimeRatingForRow(raw) {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

/** 생산적 과제 + 시간평가 별점 → 행동의 가치 배율 (미평가 null) */
export function productiveTimeRatingPriceMultiplier(rawRating) {
  const n = normalizeTimeRatingForRow(rawRating);
  if (n == null) return null;
  if (n === 5) return 2;
  if (n === 4) return 1.5;
  if (n === 3) return 1;
  if (n === 2) return 0.75;
  if (n === 1) return 0.5;
  return 1;
}

/** 기준 금액 대비 수익률(%) — 5점 +100%, 4점 +50%, 3점 0%, 2점 -25%, 1점 -50% */
export function productiveTimeRatingReturnPercent(rawRating) {
  const mult = productiveTimeRatingPriceMultiplier(rawRating);
  if (mult == null) return null;
  return Math.round((mult - 1) * 100);
}

/** 생산적 별점 배율 표기 — 5점 ×2, 4점 ×1.5, 3점 ×1, 2점 ×0.75, 1점 ×0.5 */
export function formatProductiveTimeRatingMultiplierLabel(rawRating) {
  const mult = productiveTimeRatingPriceMultiplier(rawRating);
  if (mult == null) return null;
  return `×${mult}`;
}

export function applyProductiveTimeRatingToBasePrice(basePrice, rawRating) {
  const mult = productiveTimeRatingPriceMultiplier(rawRating);
  if (mult == null) return basePrice;
  return basePrice * mult;
}

/** 시간기록 카드 — 평가 별 HTML (미평가 null) */
export function formatTimeLedgerCardRatingStarsHtml(raw) {
  const n = normalizeTimeRatingForRow(raw);
  if (n == null) return null;
  let html = "";
  for (let i = 1; i <= 5; i += 1) {
    html += `<span class="${i <= n ? "is-on" : "is-off"}" aria-hidden="true">★</span>`;
  }
  return html;
}

/** 과제 기록 모달 매일할일 체크 [{ id, text }] */
function normalizeHabitDailyCompletedForRow(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const t of raw) {
    if (!t || typeof t !== "object") continue;
    const id = String(t.id || "").trim();
    const text = String(t.text || "").trim();
    const key = id || `text:${text}`;
    if (!id && !text) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: id || key, text: text || id });
  }
  return out;
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
    habit_daily_completed: normalizeHabitDailyCompletedForRow(
      row.habitDailyCompleted,
    ),
    kpi_performed_value: normalizeKpiPerformedValueForRow(row.kpiPerformedValue),
    time_rating: normalizeTimeRatingForRow(row.timeRating),
    time_end_reasons: normalizeTimeEndReasonsForRow(
      row.timeEndReasons ?? row.timeEndReason,
    ),
    time_flow_factors: normalizeTimeFlowFactorsForRow(
      row.timeFlowFactors ?? row.timeFlowFactor,
    ),
    time_flow_disruptors: normalizeTimeFlowDisruptorsForRow(
      row.timeFlowDisruptors ?? row.timeFlowDisruptor,
    ),
    time_sleep_good_factors: normalizeTimeSleepGoodFactorsForRow(
      row.timeSleepGoodFactors,
    ),
    time_sleep_poor_reasons: normalizeTimeSleepPoorReasonsForRow(
      row.timeSleepPoorReasons,
    ),
    time_bad_feeling_reasons: normalizeTimeBadFeelingReasonsForRow(
      row.timeBadFeelingReasons,
    ),
    time_good_feeling_reasons: normalizeTimeGoodFeelingReasonsForRow(
      row.timeGoodFeelingReasons,
    ),
    time_content_eval_reasons: normalizeTimeContentEvalReasonsForRow(
      row.timeContentEvalReasons,
    ),
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
    habitDailyCompleted: normalizeHabitDailyCompletedForRow(
      db.habit_daily_completed,
    ),
    kpiPerformedValue: normalizeKpiPerformedValueForRow(db.kpi_performed_value),
    timeRating: normalizeTimeRatingForRow(db.time_rating),
    timeEndReasons: normalizeTimeEndReasonsForRow(
      db.time_end_reasons ?? db.time_end_reason,
    ),
    timeFlowFactors: normalizeTimeFlowFactorsForRow(
      db.time_flow_factors ?? db.time_flow_factor,
    ),
    timeFlowDisruptors: normalizeTimeFlowDisruptorsForRow(
      db.time_flow_disruptors ?? db.time_flow_disruptor,
    ),
    /* select에 컬럼이 빠지면 undefined — pull이 로컬 이유를 []로 지우지 않게 표시 */
    timeSleepGoodFactors: Object.prototype.hasOwnProperty.call(
      db,
      "time_sleep_good_factors",
    )
      ? normalizeTimeSleepGoodFactorsForRow(db.time_sleep_good_factors)
      : undefined,
    timeSleepPoorReasons: Object.prototype.hasOwnProperty.call(
      db,
      "time_sleep_poor_reasons",
    )
      ? normalizeTimeSleepPoorReasonsForRow(db.time_sleep_poor_reasons)
      : undefined,
    timeBadFeelingReasons: Object.prototype.hasOwnProperty.call(
      db,
      "time_bad_feeling_reasons",
    )
      ? normalizeTimeBadFeelingReasonsForRow(db.time_bad_feeling_reasons)
      : undefined,
    timeGoodFeelingReasons: Object.prototype.hasOwnProperty.call(
      db,
      "time_good_feeling_reasons",
    )
      ? normalizeTimeGoodFeelingReasonsForRow(db.time_good_feeling_reasons)
      : undefined,
    timeContentEvalReasons: Object.prototype.hasOwnProperty.call(
      db,
      "time_content_eval_reasons",
    )
      ? normalizeTimeContentEvalReasonsForRow(db.time_content_eval_reasons)
      : undefined,
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
  const {
    localModifiedAt,
    serverUpdatedAt,
    endTimeClearedByUser: _endCleared,
    ...rest
  } = row;
  try {
    return JSON.stringify(rest);
  } catch (_) {
    return "";
  }
}

/**
 * 사용자가 넣었던 마감시간을 빈 값으로 덮지 않음.
 * 지우기 버튼(endTimeClearedByUser)으로 명시한 경우만 빈 마감 허용.
 */
export function preserveTimeLedgerEndTimeUnlessCleared(prevRow, nextRow) {
  if (!nextRow || typeof nextRow !== "object") return nextRow;
  const {
    endTimeClearedByUser: clearedFlag,
    ...rest
  } = nextRow;
  const prevEnd = String(prevRow?.endTime || "").trim();
  const nextEnd = String(rest.endTime || "").trim();
  if (prevEnd && !nextEnd && !clearedFlag) {
    return { ...rest, endTime: prevEnd };
  }
  return rest;
}

function rowEntryDateInInclusiveRange(row, startYmd, endYmd) {
  const d = ledgerRowEntryDateYmd(row);
  if (!d) return false;
  return d >= startYmd && d <= endYmd;
}

/** 필터·구간 병합용 — date 없으면 startTime에서 YYYY-MM-DD */
export function ledgerRowEntryDateYmd(row) {
  const d = normalizeEntryDate(row?.date);
  if (d) return d;
  const fromStart = parseYmdTenFromLedgerStartTimeStr(row?.startTime || "");
  return fromStart || "";
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
  const prevById = new Map(
    readTimeLedgerEntriesRaw()
      .map((r) => [String(r?.id || "").trim(), r])
      .filter(([id]) => id),
  );
  const locals = filtered.map((r) => {
    const row = dbRowToLocalTimeLedgerRow(r);
    const id = String(row?.id || "").trim();
    const prev = id ? prevById.get(id) : null;
    if (!prev) {
      return {
        ...row,
        timeSleepGoodFactors: normalizeTimeSleepGoodFactorsForRow(
          row.timeSleepGoodFactors,
        ),
        timeSleepPoorReasons: normalizeTimeSleepPoorReasonsForRow(
          row.timeSleepPoorReasons,
        ),
        timeBadFeelingReasons: normalizeTimeBadFeelingReasonsForRow(
          row.timeBadFeelingReasons,
        ),
        timeGoodFeelingReasons: normalizeTimeGoodFeelingReasonsForRow(
          row.timeGoodFeelingReasons,
        ),
        timeContentEvalReasons: normalizeTimeContentEvalReasonsForRow(
          row.timeContentEvalReasons,
        ),
      };
    }
    return {
      ...row,
      timeSleepGoodFactors:
        row.timeSleepGoodFactors === undefined
          ? normalizeTimeSleepGoodFactorsForRow(prev.timeSleepGoodFactors)
          : normalizeTimeSleepGoodFactorsForRow(row.timeSleepGoodFactors),
      timeSleepPoorReasons:
        row.timeSleepPoorReasons === undefined
          ? normalizeTimeSleepPoorReasonsForRow(prev.timeSleepPoorReasons)
          : normalizeTimeSleepPoorReasonsForRow(row.timeSleepPoorReasons),
      timeBadFeelingReasons:
        row.timeBadFeelingReasons === undefined
          ? normalizeTimeBadFeelingReasonsForRow(prev.timeBadFeelingReasons)
          : normalizeTimeBadFeelingReasonsForRow(row.timeBadFeelingReasons),
      timeGoodFeelingReasons:
        row.timeGoodFeelingReasons === undefined
          ? normalizeTimeGoodFeelingReasonsForRow(prev.timeGoodFeelingReasons)
          : normalizeTimeGoodFeelingReasonsForRow(row.timeGoodFeelingReasons),
      timeContentEvalReasons:
        row.timeContentEvalReasons === undefined
          ? normalizeTimeContentEvalReasonsForRow(prev.timeContentEvalReasons)
          : normalizeTimeContentEvalReasonsForRow(row.timeContentEvalReasons),
    };
  });
  const { rows: withIds } = ensureTimeLedgerEntryIds(locals);
  writeTimeLedgerEntriesRaw(withIds);
}

/**
 * entry_date가 [rangeStart, rangeEnd] (포함)인 구간만 **서버 스냅샷**으로 맞춤.
 * 구간 안은 서버에 있는 행만 남김(로컬에만 있던 「가짜 저장」이 새로고침 후에도 보이지 않게).
 * 미업로드 행은 pull 호출 쪽에서 먼저 모았다가 서버에 올린 뒤 이 함수를 씀.
 * @param {{ preferServer?: boolean }} [opts] — 호환용(무시).
 */
export function applyTimeLedgerServerRangeSnapshot(
  dbRows,
  rangeStart,
  rangeEnd,
  _opts = {},
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
  const prevById = new Map(
    localWithIds
      .map((r) => [String(r?.id || "").trim(), r])
      .filter(([id]) => id),
  );
  /* 서버 응답에 수면 이유 컬럼이 없으면(undefined) 로컬에 있던 값을 유지 */
  const insideMerged = insideFromServer.map((row) => {
    const id = String(row?.id || "").trim();
    const prev = id ? prevById.get(id) : null;
    if (!prev) {
      return {
        ...row,
        timeSleepGoodFactors: normalizeTimeSleepGoodFactorsForRow(
          row.timeSleepGoodFactors,
        ),
        timeSleepPoorReasons: normalizeTimeSleepPoorReasonsForRow(
          row.timeSleepPoorReasons,
        ),
        timeBadFeelingReasons: normalizeTimeBadFeelingReasonsForRow(
          row.timeBadFeelingReasons,
        ),
        timeGoodFeelingReasons: normalizeTimeGoodFeelingReasonsForRow(
          row.timeGoodFeelingReasons,
        ),
        timeContentEvalReasons: normalizeTimeContentEvalReasonsForRow(
          row.timeContentEvalReasons,
        ),
      };
    }
    return {
      ...row,
      timeSleepGoodFactors:
        row.timeSleepGoodFactors === undefined
          ? normalizeTimeSleepGoodFactorsForRow(prev.timeSleepGoodFactors)
          : normalizeTimeSleepGoodFactorsForRow(row.timeSleepGoodFactors),
      timeSleepPoorReasons:
        row.timeSleepPoorReasons === undefined
          ? normalizeTimeSleepPoorReasonsForRow(prev.timeSleepPoorReasons)
          : normalizeTimeSleepPoorReasonsForRow(row.timeSleepPoorReasons),
      timeBadFeelingReasons:
        row.timeBadFeelingReasons === undefined
          ? normalizeTimeBadFeelingReasonsForRow(prev.timeBadFeelingReasons)
          : normalizeTimeBadFeelingReasonsForRow(row.timeBadFeelingReasons),
      timeGoodFeelingReasons:
        row.timeGoodFeelingReasons === undefined
          ? normalizeTimeGoodFeelingReasonsForRow(prev.timeGoodFeelingReasons)
          : normalizeTimeGoodFeelingReasonsForRow(row.timeGoodFeelingReasons),
      timeContentEvalReasons:
        row.timeContentEvalReasons === undefined
          ? normalizeTimeContentEvalReasonsForRow(prev.timeContentEvalReasons)
          : normalizeTimeContentEvalReasonsForRow(row.timeContentEvalReasons),
    };
  });
  const outside = localWithIds.filter(
    (r) => !rowEntryDateInInclusiveRange(r, rs, re),
  );
  const merged = [...outside, ...insideMerged];
  writeTimeLedgerEntriesRaw(merged);
  void flushTimeLedgerRowsToDiskNow();
  try {
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("calendar-time-rows-updated", { detail: {} }),
      );
    }
  } catch (_) {}
}

/**
 * pull 직전에 — 구간에 있고 아직 서버에 안 올린 로컬 행(모달 저장분)을 모음.
 */
export function collectTimeLedgerDirtyRowsInRange(rangeStart, rangeEnd) {
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  if (!rs || !re) return [];
  const { rows } = ensureTimeLedgerEntryIds(readTimeLedgerEntriesRaw());
  return rows.filter(
    (r) =>
      rowEntryDateInInclusiveRange(r, rs, re) && timeLedgerRowNeedsPush(r),
  );
}

export function readTimeLedgerEntriesRaw() {
  if (!Array.isArray(_ledgerRowsMem)) return [];
  return _ledgerRowsMem.slice();
}

export function writeTimeLedgerEntriesRaw(rows) {
  const arr = Array.isArray(rows) ? rows.slice() : [];
  _ledgerRowsMem = arr;
  bumpLedgerMemRevision();
  schedulePersistTimeLedgerRowsToDisk();
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
