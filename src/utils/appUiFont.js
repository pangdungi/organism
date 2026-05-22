/**
 * 앱 전역 UI 글꼴 — localStorage + 서버(user_subscriptions.ui_font_id) + --lp-app-font-family
 * 로고·캘린더 포함 UI는 .lp-app-font / --lp-app-font-family 로 통일합니다.
 */

import { supabase } from "../supabase.js";

export const LP_APP_UI_FONT_STORAGE_KEY = "lp_app_ui_font_id";

/** 앱에서 「시스템 기본」: 폰트 설정 도입 전 모달에 쓰던 스택과 동일 */
export const LP_APP_SYSTEM_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif';

/** 커스텀 글꼴 뒤에 붙는 공통 폴백 */
const LP_APP_FONT_FALLBACK = LP_APP_SYSTEM_FONT_STACK;

/** @typedef {{ id: string, label: string, stack: string }} LpAppFontOption */

/** @type {LpAppFontOption[]} */
export const LP_APP_FONT_OPTIONS = [
  { id: "system", label: "시스템 기본", stack: LP_APP_SYSTEM_FONT_STACK },
  {
    id: "leeseoyun",
    label: "Lee Seoyun",
    stack: `"LP Lee Seoyun", ${LP_APP_FONT_FALLBACK}`,
  },
  {
    id: "pakyongjun",
    label: "Pak Yong jun",
    stack: `"LP Pak Yong jun", ${LP_APP_FONT_FALLBACK}`,
  },
];

const LP_APP_FONT_ID_SET = new Set(LP_APP_FONT_OPTIONS.map((o) => o.id));

/**
 * @param {unknown} id
 * @returns {string}
 */
export function normalizeAppFontId(id) {
  const v = String(id ?? "").trim().toLowerCase();
  return LP_APP_FONT_ID_SET.has(v) ? v : "system";
}

/**
 * @param {string} id
 * @returns {string}
 */
export function getAppFontStackForId(id) {
  const opt = LP_APP_FONT_OPTIONS.find((o) => o.id === normalizeAppFontId(id));
  return opt ? opt.stack : LP_APP_SYSTEM_FONT_STACK;
}

/**
 * @returns {string}
 */
export function getStoredAppFontId() {
  try {
    const v = localStorage.getItem(LP_APP_UI_FONT_STORAGE_KEY);
    if (v && LP_APP_FONT_ID_SET.has(v)) return v;
  } catch (_) {}
  return "system";
}

function persistAppFontIdLocal(id) {
  const use = normalizeAppFontId(id);
  try {
    localStorage.setItem(LP_APP_UI_FONT_STORAGE_KEY, use);
  } catch (_) {}
  return use;
}

function emitAppFontChanged(use) {
  try {
    window.dispatchEvent(
      new CustomEvent("lp-app-font-changed", { detail: { id: use } }),
    );
  } catch (_) {}
}

export function applyAppFont() {
  try {
    const id = getStoredAppFontId();
    const stack = getAppFontStackForId(id);
    document.documentElement.style.setProperty("--lp-app-font-family", stack);
    document.documentElement.style.setProperty("--app-font-family", stack);
  } catch (_) {}
}

/**
 * 서버에서 받은 글꼴 id → 로컬·화면 (push 없음)
 * @param {unknown} id
 * @returns {boolean} 반영 여부
 */
export function applyAppFontIdFromServer(id) {
  if (id == null || String(id).trim() === "") return false;
  const use = persistAppFontIdLocal(id);
  applyAppFont();
  emitAppFontChanged(use);
  return true;
}

/** 로그인·계정 설정 변경 시 서버에 글꼴 id 저장 */
export async function pushAppFontIdToSupabase(id) {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return;
  const use = normalizeAppFontId(id);
  try {
    await supabase.rpc("set_my_ui_font_id", { p_font_id: use });
  } catch (_) {}
}

/**
 * @param {string} id
 * @param {{ pushServer?: boolean }} [opts]
 */
export function setAppFontId(id, opts = {}) {
  const pushServer = opts.pushServer !== false;
  const use = persistAppFontIdLocal(id);
  applyAppFont();
  emitAppFontChanged(use);
  if (pushServer) void pushAppFontIdToSupabase(use);
}
