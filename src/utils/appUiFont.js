/**
 * 앱 전역 UI 글꼴 — localStorage + 서버(user_subscriptions.ui_font_id) + --lp-app-font-family
 * 앱 전역은 html 의 --lp-app-font-family 하나만 사용합니다.
 */

import { supabase } from "../supabase.js";

export const LP_APP_UI_FONT_STORAGE_KEY = "lp_app_ui_font_id";

/** 앱 기본 글꼴 (localStorage·서버 값 없을 때) */
export const LP_APP_DEFAULT_FONT_ID = "pakyongjun";

/** 앱에서 「시스템 기본」 선택 시만 사용 */
export const LP_APP_SYSTEM_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** 커스텀 글꼴 뒤에 붙는 공통 폴백 */
const LP_APP_FONT_FALLBACK = LP_APP_SYSTEM_FONT_STACK;

/** @typedef {{ id: string, label: string, stack: string }} LpAppFontOption */

/** @type {LpAppFontOption[]} */
export const LP_APP_FONT_OPTIONS = [
  {
    id: "pakyongjun",
    label: "세종 글꽃",
    stack: `"LP Sejong Geulggot", ${LP_APP_FONT_FALLBACK}`,
  },
  {
    id: "leeseoyun",
    label: "Lee Seoyun",
    stack: `"LP Lee Seoyun", ${LP_APP_FONT_FALLBACK}`,
  },
  {
    id: "kyobohandwriting",
    label: "교보 손글씨",
    stack: `"LP Kyobo Handwriting", ${LP_APP_FONT_FALLBACK}`,
  },
  { id: "system", label: "시스템 기본", stack: LP_APP_SYSTEM_FONT_STACK },
];

const LP_APP_FONT_ID_SET = new Set(LP_APP_FONT_OPTIONS.map((o) => o.id));

/**
 * @param {unknown} id
 * @returns {string}
 */
export function normalizeAppFontId(id) {
  const v = String(id ?? "").trim().toLowerCase();
  if (v === "parkdahyun") return "kyobohandwriting";
  return LP_APP_FONT_ID_SET.has(v) ? v : LP_APP_DEFAULT_FONT_ID;
}

/**
 * @param {string} id
 * @returns {string}
 */
export function getAppFontStackForId(id) {
  const normalized = normalizeAppFontId(id);
  const opt = LP_APP_FONT_OPTIONS.find((o) => o.id === normalized);
  if (opt) return opt.stack;
  const def = LP_APP_FONT_OPTIONS.find((o) => o.id === LP_APP_DEFAULT_FONT_ID);
  return def?.stack ?? LP_APP_SYSTEM_FONT_STACK;
}

/**
 * @returns {string}
 */
export function getStoredAppFontId() {
  try {
    const v = localStorage.getItem(LP_APP_UI_FONT_STORAGE_KEY);
    if (v && LP_APP_FONT_ID_SET.has(v)) return v;
  } catch (_) {}
  return LP_APP_DEFAULT_FONT_ID;
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
