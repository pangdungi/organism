/**
 * 앱 전역 UI 글꼴 — --lp-app-font-family (그리운·온글잎 등 사용자 선택)
 * 캘린더 월(June)·날짜 숫자(Hello Scratchy·이서윤)는 변경하지 않음.
 */

import {
  getScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";
import { supabase } from "../supabase.js";
import { getSupabaseSession } from "./supabaseSession.js";

export const USER_UI_FONT_ID_KEY = "user_ui_font_id";
export const DEFAULT_UI_FONT_ID = "cocochoitoon";

/** @typedef {{ id: string, label: string, family: string, url: string, format: "truetype"|"opentype", weight: number|string }} UiFontDef */

/** @type {Record<string, UiFontDef>} */
export const UI_FONT_DEFS = {
  cocochoitoon: {
    id: "cocochoitoon",
    label: "그리운 코코최윤체",
    family: "LP Griun Cocochoitoon",
    url: "/fonts/LP-Griun-Cocochoitoon.ttf",
    format: "truetype",
    weight: 500,
  },
  gongbujahana: {
    id: "gongbujahana",
    label: "온글잎 공부잘하자나",
    family: "LP Ongleip Gongbujahana",
    url: "/fonts/LP-Ongleip-Gongbujahana.ttf",
    format: "truetype",
    weight: 400,
  },
  ryuryu: {
    id: "ryuryu",
    label: "온글잎 류류체",
    family: "LP Ongleip Ryuryu",
    url: "/fonts/LP-Ongleip-Ryuryu.ttf",
    format: "truetype",
    weight: 400,
  },
  mongtori: {
    id: "mongtori",
    label: "그리운 몽토리",
    family: "LP Griun Mongtori",
    url: "/fonts/LP-Griun-Mongtori-Rg.ttf",
    format: "truetype",
    weight: 400,
  },
  cherryspoon: {
    id: "cherryspoon",
    label: "그리운 체리1스푼",
    family: "LP Griun Cherry1Spoon",
    url: "/fonts/LP-Griun-Cherry1Spoon-Rg.ttf",
    format: "truetype",
    weight: 400,
  },
  myeoneunheulrim: {
    id: "myeoneunheulrim",
    label: "그리운 묘은흘림체",
    family: "LP Griun Myeoneunheulrim",
    url: "/fonts/LP-Griun-Myeoneunheulrim.ttf",
    format: "truetype",
    weight: 400,
  },
};

/** 나의 계정 — 선택 가능한 UI 글꼴(기본 포함) */
export const UI_FONT_PICKER_OPTIONS = [
  UI_FONT_DEFS.cocochoitoon,
  UI_FONT_DEFS.gongbujahana,
  UI_FONT_DEFS.ryuryu,
  UI_FONT_DEFS.mongtori,
  UI_FONT_DEFS.cherryspoon,
  UI_FONT_DEFS.myeoneunheulrim,
];

const LEGACY_UI_FONT_ALIASES = {
  parkdahyun: "bakdahyun",
  pakyongjun: "kyobohandwriting",
};

/** @deprecated applyUiFontById 사용 */
export const LP_APP_FONT_STACK = fontStackForDef(UI_FONT_DEFS.cocochoitoon);

export const LP_LEE_SEOYUN_FONT_STACK =
  '"LP Lee Seoyun", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const LP_CALENDAR_MONTH_FONT_STACK =
  '"Hello Scratchy Outlines", sans-serif';

export const LP_CALENDAR_DAY_NUM_FONT_STACK =
  '"LP Lee Seoyun", sans-serif';

/** @param {UiFontDef} def */
export function fontStackForDef(def) {
  return `"${def.family}", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
}

/** @param {string} fontId */
export function normalizeUiFontId(fontId) {
  let id = String(fontId || "")
    .trim()
    .toLowerCase();
  if (LEGACY_UI_FONT_ALIASES[id]) id = LEGACY_UI_FONT_ALIASES[id];
  if (UI_FONT_DEFS[id]) return id;
  return DEFAULT_UI_FONT_ID;
}

/** @param {string} fontId */
export function getUiFontDef(fontId) {
  return UI_FONT_DEFS[normalizeUiFontId(fontId)];
}

export function readUiFontIdLocal() {
  const raw = getScopedLocalStorageItem(USER_UI_FONT_ID_KEY);
  return raw ? normalizeUiFontId(raw) : DEFAULT_UI_FONT_ID;
}

/** @param {string} fontId */
export function persistUiFontIdLocal(fontId) {
  const id = normalizeUiFontId(fontId);
  setScopedLocalStorageItem(USER_UI_FONT_ID_KEY, id);
  return id;
}

/** html·--lp-app-font-family — 그리운 계열만 교체, 캘린더 전용 폰트는 유지 */
export function applyUiFontById(fontId) {
  const def = getUiFontDef(fontId);
  const stack = fontStackForDef(def);
  try {
    const root = document.documentElement;
    root.style.setProperty("--lp-app-font-family", stack);
    root.style.setProperty(
      "--lp-app-font-weight-base",
      String(def.weight ?? 400),
    );
    root.style.setProperty(
      "--lp-calendar-month-abbr-font-family",
      LP_CALENDAR_MONTH_FONT_STACK,
    );
    root.style.setProperty(
      "--lp-calendar-day-num-font-family",
      LP_CALENDAR_DAY_NUM_FONT_STACK,
    );
    root.style.fontFamily = stack;
    root.style.fontWeight = String(def.weight ?? 400);
  } catch (_) {}
}

/** @deprecated applyUiFontById(readUiFontIdLocal()) */
export function applyAppFont() {
  applyUiFontById(readUiFontIdLocal());
}

export function applyUiFontFromLocalCache() {
  applyUiFontById(readUiFontIdLocal());
}

/** @param {string} fontId */
export function preloadUiFontById(fontId) {
  const def = getUiFontDef(fontId);
  applyUiFontById(def.id);
  try {
    if (document.fonts?.load) {
      return Promise.all([
        document.fonts.load(`${def.weight || 400} 16px "${def.family}"`),
        document.fonts.load('16px "Hello Scratchy Outlines"'),
        document.fonts.load('16px "LP Lee Seoyun"'),
      ]);
    }
  } catch (_) {}
  return Promise.resolve();
}

/** 캘린더 전용 폰트 선로드 + 선택 UI 글꼴 */
export function preloadCalendarMonthFont() {
  return preloadUiFontById(readUiFontIdLocal());
}

/** 서버 ui_font_id → 로컬 미러·화면 (서버만 진실) */
export function applyUiFontFromServerRow(row) {
  const raw = row?.ui_font_id;
  const id =
    raw == null || String(raw).trim() === ""
      ? DEFAULT_UI_FONT_ID
      : normalizeUiFontId(raw);
  const prev = readUiFontIdLocal();
  persistUiFontIdLocal(id);
  applyUiFontById(id);
  if (prev !== id) void preloadUiFontById(id);
  return prev !== id;
}

/** 로그인·앱 진입 직후 — 계정별 ui_font_id만 pull */
export async function pullUserUiFontFromSupabase() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await getSupabaseSession();
  if (!session?.user?.id) return null;
  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("ui_font_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error || !data) return null;
  applyUiFontFromServerRow(data);
  return data;
}

/** @param {string} fontId — 서버 저장 성공 후에만 로컬·화면 반영 */
export async function saveUserUiFontToSupabase(fontId) {
  if (!supabase) return { ok: false };
  const id = normalizeUiFontId(fontId);
  const { error } = await supabase.rpc("set_my_ui_font_id", {
    p_font_id: id,
  });
  if (error) return { ok: false, id, error };
  persistUiFontIdLocal(id);
  applyUiFontById(id);
  await preloadUiFontById(id);
  return { ok: true, id };
}
