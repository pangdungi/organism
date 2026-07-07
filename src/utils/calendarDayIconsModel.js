/**
 * 캘린더 월간 뷰 — 날짜별 아이콘 1개 세션 메모리
 * @typedef {{ id: string, iconKey: string }} CalendarDayIconRow
 */

import { warmIconPathInSwCache } from "./appIconPrefetch.js";
import {
  getActiveClientStorageUserId,
  getScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";
import { getTimeTaskIconSrcByKey } from "./timeTaskIconUrls.js";

const MIRROR_KEY = "calendar_day_icons_mirror_v1";

/** @type {Record<string, CalendarDayIconRow>} */
let _byDate = {};
/** 서버 push/pull 중인 날짜 — pull이 방금 지운 로컬 스탬프를 되살리지 않게 */
const _pendingLocalSyncYmds = new Set();
let _memInitialized = false;
let _loadedUid = "";

function mirrorCalendarDayIconsToScopedLocalStorage() {
  const uid = getActiveClientStorageUserId();
  if (!uid) return;
  try {
    setScopedLocalStorageItem(MIRROR_KEY, JSON.stringify(_byDate), uid);
  } catch (_) {}
}

function initCalendarDayIconsMemOnce() {
  const uid = getActiveClientStorageUserId();
  if (_memInitialized && uid === _loadedUid) return;
  _memInitialized = true;
  _loadedUid = uid || "";
  _byDate = {};
  if (!uid) return;
  try {
    const raw = getScopedLocalStorageItem(MIRROR_KEY, uid);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return;
    /** @type {Record<string, CalendarDayIconRow>} */
    const next = {};
    for (const [ymd, row] of Object.entries(parsed)) {
      const key = normalizeYmd(ymd);
      const iconKey = normalizeIconKey(row?.iconKey);
      const id = String(row?.id || "").trim();
      if (!key || !iconKey) continue;
      next[key] = { id: id || newCalendarDayIconId(), iconKey };
    }
    if (Object.keys(next).length) _byDate = next;
  } catch (_) {}
}

/** mountApp·일정 탭 진입 직전 — 미러만 동기 로드 */
export function prepareCalendarDayIconsForBoot() {
  initCalendarDayIconsMemOnce();
}

/** @returns {boolean} 미러에서 1건 이상 복구했으면 true */
export function hydrateCalendarDayIconsFromLocalMirrorForBoot() {
  initCalendarDayIconsMemOnce();
  const ok = Object.keys(_byDate).length > 0;
  if (ok) warmCalendarDayStampIconAssetsFromMemory();
  return ok;
}

export function warmCalendarDayStampIconAssetsFromMemory() {
  const seen = new Set();
  for (const row of Object.values(_byDate)) {
    const src = getTimeTaskIconSrcByKey(row?.iconKey);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    void warmIconPathInSwCache(src);
  }
}

export function resetCalendarDayIconsMemory() {
  _byDate = {};
  mirrorCalendarDayIconsToScopedLocalStorage();
}

function newCalendarDayIconId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return `cdi-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeYmd(v) {
  return String(v || "").trim().slice(0, 10);
}

function normalizeIconKey(v) {
  const k = String(v || "").trim();
  if (!k || !getTimeTaskIconSrcByKey(k)) return "";
  return k;
}

export function readCalendarDayIconsSnapshot() {
  /** @type {Record<string, CalendarDayIconRow>} */
  const out = {};
  for (const [ymd, row] of Object.entries(_byDate)) {
    const key = normalizeYmd(ymd);
    if (!key || !row?.iconKey) continue;
    out[key] = {
      id: String(row.id || "").trim(),
      iconKey: normalizeIconKey(row.iconKey),
    };
  }
  return out;
}

export function markCalendarDayIconLocalSyncPending(dateKey) {
  const ymd = normalizeYmd(dateKey);
  if (ymd) _pendingLocalSyncYmds.add(ymd);
}

export function clearCalendarDayIconLocalSyncPending(dateKey) {
  _pendingLocalSyncYmds.delete(normalizeYmd(dateKey));
}

/**
 * @param {unknown[]} rows Supabase SELECT rows
 */
export function applyCalendarDayIconsServerSnapshot(rows) {
  /** @type {Record<string, CalendarDayIconRow>} */
  const next = {};
  for (const row of Array.isArray(rows) ? rows : []) {
    const r = row && typeof row === "object" ? row : {};
    const ymd = normalizeYmd(r.day_date);
    const iconKey = normalizeIconKey(r.icon_key);
    const id = String(r.id || "").trim();
    if (!ymd || !iconKey || !id) continue;
    if (!next[ymd]) {
      next[ymd] = { id, iconKey };
    }
  }
  for (const ymd of _pendingLocalSyncYmds) {
    if (_byDate[ymd]) {
      next[ymd] = { ..._byDate[ymd] };
    } else {
      delete next[ymd];
    }
  }
  _byDate = next;
  mirrorCalendarDayIconsToScopedLocalStorage();
  warmCalendarDayStampIconAssetsFromMemory();
}

/** @param {string} dateKey */
export function getCalendarDayIconKeyForDate(dateKey) {
  const ymd = normalizeYmd(dateKey);
  if (!ymd) return "";
  return normalizeIconKey(_byDate[ymd]?.iconKey);
}

/** @param {string} dateKey — 하위 호환 */
export function getCalendarDayIconsForDate(dateKey) {
  const iconKey = getCalendarDayIconKeyForDate(dateKey);
  if (!iconKey) return [];
  const ymd = normalizeYmd(dateKey);
  const id = _byDate[ymd]?.id || "";
  return [{ id, iconKey, sortOrder: 0 }];
}

/** @param {string} dateKey @param {string} iconKey */
export function setCalendarDayIconKeyForDate(dateKey, iconKey) {
  const ymd = normalizeYmd(dateKey);
  if (!ymd) return;
  const key = normalizeIconKey(iconKey);
  if (!key) {
    delete _byDate[ymd];
    mirrorCalendarDayIconsToScopedLocalStorage();
    return;
  }
  const prevId = _byDate[ymd]?.id;
  _byDate[ymd] = {
    id: prevId || newCalendarDayIconId(),
    iconKey: key,
  };
  mirrorCalendarDayIconsToScopedLocalStorage();
  warmCalendarDayStampIconAssetsFromMemory();
}

/** @param {string} dateKey @param {string[]} iconKeys — 첫 항목만 사용 */
export function setCalendarDayIconKeysForDate(dateKey, iconKeys) {
  const first = (Array.isArray(iconKeys) ? iconKeys : [])
    .map(normalizeIconKey)
    .find(Boolean);
  setCalendarDayIconKeyForDate(dateKey, first || "");
}

/**
 * 스탬프 날짜 이동·교체 — from 비우고 to에 iconKey 반영(이미 있으면 교체)
 * @returns {boolean}
 */
export function moveCalendarDayIconOnDate(fromDateKey, toDateKey) {
  const from = normalizeYmd(fromDateKey);
  const to = normalizeYmd(toDateKey);
  if (!from || !to) return false;
  const iconKey = normalizeIconKey(_byDate[from]?.iconKey);
  if (!iconKey) return false;
  if (from === to) return true;
  delete _byDate[from];
  _byDate[to] = {
    id: _byDate[to]?.id || newCalendarDayIconId(),
    iconKey,
  };
  mirrorCalendarDayIconsToScopedLocalStorage();
  warmCalendarDayStampIconAssetsFromMemory();
  return true;
}
