/**
 * 과제·스탬프 picker 아이콘 캐시 정책
 * - 기본 아이콘 + 사용자가 이미 고른(사용 중) 아이콘만 SW에 미리 둠 (모바일·데스크탑 동일)
 * - 전체 목록은 아이콘 선택 화면을 열 때만 받음
 */

import {
  warmIconPathInSwCache,
  warmTimeTaskPickerIconsOnce,
} from "./appIconPrefetch.js";
import { decodeDisplayIconSrcs } from "./decodeDisplayIcons.js";
import {
  getTimeTaskIconDisplaySrcByKey,
  getTimeTaskIconSrcByKey,
  listDefaultPickerIconKeys,
} from "./timeTaskIconUrls.js";
import { readTaskOptionsMemRows } from "./timeTaskOptionsModel.js";
import { readCalendarDayIconsSnapshot } from "./calendarDayIconsModel.js";

/** @type {Promise<void> | null} */
let _inUseWarmJob = null;
let _fullPickerWarmScheduled = false;

/** @param {string} key */
function pathsForIconKey(key) {
  const k = String(key || "").trim();
  if (!k) return [];
  /** @type {string[]} */
  const out = [];
  const seen = new Set();
  const push = (src) => {
    const s = String(src || "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  push(getTimeTaskIconSrcByKey(k));
  push(getTimeTaskIconDisplaySrcByKey(k));
  return out;
}

/** @returns {string[]} */
function collectDefaultAndInUseIconKeys() {
  const keys = new Set(listDefaultPickerIconKeys());
  try {
    for (const row of readTaskOptionsMemRows()) {
      const k = String(row?.iconKey || "").trim();
      if (k) keys.add(k);
    }
  } catch (_) {}
  try {
    const snap = readCalendarDayIconsSnapshot();
    for (const row of Object.values(snap || {})) {
      const k = String(row?.iconKey || "").trim();
      if (k) keys.add(k);
    }
  } catch (_) {}
  return [...keys];
}

/** 한 개 iconKey 를 SW 캐시에 둠 (고른 직후 등) */
export function warmPickerIconKeyInSwCache(iconKey) {
  for (const src of pathsForIconKey(iconKey)) {
    void warmIconPathInSwCache(src);
  }
}

/**
 * 기본 + 사용 중 아이콘만 기기에 미리 받아 둠.
 * 탭 진입·부팅·과제 목록 갱신 후 호출.
 */
export function warmDefaultAndInUsePickerIcons() {
  if (_inUseWarmJob) return _inUseWarmJob;
  _inUseWarmJob = (async () => {
    const paths = [];
    const seen = new Set();
    for (const key of collectDefaultAndInUseIconKeys()) {
      for (const src of pathsForIconKey(key)) {
        if (seen.has(src)) continue;
        seen.add(src);
        paths.push(src);
      }
    }
    /* SW 다 채운 뒤에야 decode 하면 첫 화면·날짜 변경 아이콘이 ~1초 늦음 */
    void decodeDisplayIconSrcs(paths, { timeoutMs: 2500 });
    const CHUNK = 16;
    for (let i = 0; i < paths.length; i += CHUNK) {
      const batch = paths.slice(i, i + CHUNK);
      await Promise.all(batch.map((p) => warmIconPathInSwCache(p)));
      if (i + CHUNK < paths.length) {
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  })().finally(() => {
    _inUseWarmJob = null;
  });
  return _inUseWarmJob;
}

/** 아이콘 선택 모달을 열 때만 전체 picker 세트를 받기 시작 */
export function warmFullPickerIconsWhenOpeningPicker() {
  if (_fullPickerWarmScheduled) {
    void warmTimeTaskPickerIconsOnce();
    return;
  }
  _fullPickerWarmScheduled = true;
  void warmTimeTaskPickerIconsOnce();
}
