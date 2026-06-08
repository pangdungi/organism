/**
 * 앱 전역 UI 글꼴 — 계정별 localStorage + 서버(user_subscriptions.ui_font_id) + --lp-app-font-family
 */

import { supabase } from "../supabase.js";
import { getSupabaseSession } from "./supabaseSession.js";
import {
  getActiveClientStorageUserId,
  getScopedLocalStorageItem,
  migrateLegacyLocalStorageToScoped,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";

export const LP_APP_UI_FONT_STORAGE_KEY = "lp_app_ui_font_id";

/** 앱 기본 글꼴 (localStorage·서버 값 없을 때) */
export const LP_APP_DEFAULT_FONT_ID = "kyobohandwriting";

/** 앱에서 「시스템 기본」 선택 시만 사용 */
export const LP_APP_SYSTEM_FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** 커스텀 글꼴 뒤에 붙는 공통 폴백 */
const LP_APP_FONT_FALLBACK = LP_APP_SYSTEM_FONT_STACK;

/** @typedef {{ id: string, label: string, stack: string }} LpAppFontOption */

/** @type {LpAppFontOption[]} */
export const LP_APP_FONT_OPTIONS = [
  {
    id: "kyobohandwriting",
    label: "교보 손글씨",
    stack: `"LP Kyobo Handwriting", ${LP_APP_FONT_FALLBACK}`,
  },
  {
    id: "bakdahyun",
    label: "온글잎 박다현체",
    stack: `"LP Ongleip Bakdahyun", ${LP_APP_FONT_FALLBACK}`,
  },
  {
    id: "ryuddung",
    label: "온글잎 류뚱체",
    stack: `"LP Ongleip Ryuddung", ${LP_APP_FONT_FALLBACK}`,
  },
  {
    id: "adultkid",
    label: "Adultkid",
    stack: `"Adultkid", ${LP_APP_FONT_FALLBACK}`,
  },
];

const LP_APP_FONT_ID_SET = new Set(LP_APP_FONT_OPTIONS.map((o) => o.id));

/** 나의 계정에서 글꼴 변경 직후 서버 pull 이 로컬 선택을 덮지 않도록 */
const LP_LOCAL_FONT_CHANGE_GRACE_MS = 15_000;
let _localFontChangedAt = 0;
let _resumeFontSyncBound = false;

/**
 * @param {unknown} id
 * @returns {string}
 */
export function normalizeAppFontId(id) {
  const v = String(id ?? "").trim().toLowerCase();
  if (v === "parkdahyun") return "bakdahyun";
  if (v === "pakyongjun" || v === "leeseoyun" || v === "system") {
    return LP_APP_DEFAULT_FONT_ID;
  }
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

function readCachedAuthUserIdForStorage() {
  try {
    return String(localStorage.getItem("lp_last_auth_uid") || "").trim();
  } catch (_) {
    return "";
  }
}

function resolveStorageUserId() {
  const active = getActiveClientStorageUserId();
  if (active) return active;
  return readCachedAuthUserIdForStorage();
}

function readLegacyAppFontId() {
  try {
    const v = localStorage.getItem(LP_APP_UI_FONT_STORAGE_KEY);
    if (v && LP_APP_FONT_ID_SET.has(v)) return v;
  } catch (_) {}
  return null;
}

/**
 * @returns {string}
 */
export function getStoredAppFontId() {
  try {
    const uid = resolveStorageUserId();
    if (uid) {
      migrateLegacyLocalStorageToScoped(LP_APP_UI_FONT_STORAGE_KEY, uid);
      const scoped = getScopedLocalStorageItem(LP_APP_UI_FONT_STORAGE_KEY, uid);
      if (scoped && LP_APP_FONT_ID_SET.has(scoped)) return scoped;
    }
    const legacy = readLegacyAppFontId();
    if (legacy) return legacy;
  } catch (_) {}
  return LP_APP_DEFAULT_FONT_ID;
}

function persistAppFontIdLocal(id) {
  const use = normalizeAppFontId(id);
  try {
    const uid = resolveStorageUserId();
    if (uid) {
      setScopedLocalStorageItem(LP_APP_UI_FONT_STORAGE_KEY, use, uid);
      localStorage.removeItem(LP_APP_UI_FONT_STORAGE_KEY);
    } else {
      localStorage.setItem(LP_APP_UI_FONT_STORAGE_KEY, use);
    }
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
    const root = document.documentElement;
    root.style.setProperty("--lp-app-font-family", stack);
    root.style.fontFamily = stack;
  } catch (_) {}
}

/**
 * 서버에서 받은 글꼴 id → 로컬·화면 (push 없음)
 * @param {unknown} id
 * @returns {boolean} 반영 여부
 */
export function applyAppFontIdFromServer(id) {
  if (id == null || String(id).trim() === "") return false;
  if (Date.now() - _localFontChangedAt < LP_LOCAL_FONT_CHANGE_GRACE_MS) return false;
  const serverId = normalizeAppFontId(id);
  if (serverId === getStoredAppFontId()) {
    applyAppFont();
    return true;
  }
  const use = persistAppFontIdLocal(serverId);
  applyAppFont();
  emitAppFontChanged(use);
  return true;
}

/**
 * 로그인·pull 시 서버↔로컬 글꼴 맞춤
 * 서버에 값이 있으면 서버 우선, 없으면 로컬 선택을 서버에 올림
 * @param {unknown} serverUiFontId
 */
export async function syncAppFontFromServerOnPull(serverUiFontId) {
  const serverRaw = String(serverUiFontId ?? "").trim();
  if (serverRaw) {
    return applyAppFontIdFromServer(serverRaw);
  }
  const localId = getStoredAppFontId();
  const pushed = await pushAppFontIdToSupabase(localId);
  applyAppFont();
  return pushed;
}

/** 다른 기기에서 바꾼 글꼴 — 서버 조회 후 화면·로컬 반영 */
export async function pullAppFontIdFromSupabase() {
  if (!supabase) return false;
  const {
    data: { session },
  } = await getSupabaseSession();
  if (!session?.user?.id) return false;
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("ui_font_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error || !data) return false;
  return syncAppFontFromServerOnPull(data.ui_font_id);
}

/** 로그인·계정 설정 변경 시 서버에 글꼴 id 저장 */
export async function pushAppFontIdToSupabase(id) {
  if (!supabase) return false;
  const {
    data: { session },
  } = await getSupabaseSession();
  const uid = session?.user?.id;
  if (!uid) return false;
  const use = normalizeAppFontId(id);
  const { error } = await supabase.rpc("set_my_ui_font_id", { p_font_id: use });
  if (error) return false;
  const { data, error: readErr } = await supabase
    .from("user_subscriptions")
    .select("ui_font_id")
    .eq("user_id", uid)
    .maybeSingle();
  if (readErr || !data) return false;
  return normalizeAppFontId(data.ui_font_id) === use;
}

/**
 * @param {string} id
 * @param {{ pushServer?: boolean }} [opts]
 */
export function setAppFontId(id, opts = {}) {
  const pushServer = opts.pushServer !== false;
  const use = persistAppFontIdLocal(id);
  _localFontChangedAt = Date.now();
  applyAppFont();
  emitAppFontChanged(use);
  if (pushServer) void pushAppFontIdToSupabase(use);
}

/** PWA·모바일: 앱으로 돌아올 때 서버 글꼴 다시 맞춤 */
export function initAppFontResumeSync() {
  if (_resumeFontSyncBound || typeof window === "undefined") return;
  _resumeFontSyncBound = true;
  window.addEventListener(
    "pageshow",
    () => {
      void pullAppFontIdFromSupabase();
    },
    { passive: true },
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") {
        void pullAppFontIdFromSupabase();
      }
    },
    { passive: true },
  );
}
