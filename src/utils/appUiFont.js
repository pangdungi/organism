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
export const DEFAULT_UI_FONT_ID = "fromsol";

/** @typedef {{ id: string, label: string, family: string, url: string, format: "truetype"|"opentype", weight: number|string }} UiFontDef */

/** @type {Record<string, UiFontDef>} */
export const UI_FONT_DEFS = {
  gongbujahana: {
    id: "gongbujahana",
    label: "온글잎 공부잘하자나",
    family: "LP Ongleip Gongbujahana",
    url: "/fonts/LP-Ongleip-Gongbujahana.ttf",
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
  leeseoyun: {
    id: "leeseoyun",
    label: "이서윤체",
    family: "LP Lee Seoyun",
    url: "/fonts/LP-LeeSeoyun.otf",
    format: "opentype",
    weight: 400,
  },
  mitmi: {
    id: "mitmi",
    label: "온글잎 밑미",
    family: "LP Ongleip Mitmi",
    url: "/fonts/LP-Ongleip-Mitmi.ttf",
    format: "truetype",
    weight: 400,
  },
  uhbeezziba: {
    id: "uhbeezziba",
    label: "어비 찌바체",
    family: "LP UhBee ZZIBA",
    url: "/fonts/LP-UhBee-ZZIBA.ttf",
    format: "truetype",
    weight: 400,
  },
  oksooni: {
    id: "oksooni",
    label: "그리운 옥수니체",
    family: "LP Griun Oksooni",
    url: "/fonts/LP-Griun-Oksooni-Rg.ttf",
    format: "truetype",
    weight: 400,
  },
  myoeunddobak: {
    id: "myoeunddobak",
    label: "그리운 묘은또박체",
    family: "LP Griun Myoeunddobak",
    url: "/fonts/LP-Griun-Myoeunddobak-Rg.ttf",
    format: "truetype",
    weight: 400,
  },
  fromsol: {
    id: "fromsol",
    label: "그리운 프롬솔",
    family: "LP Griun Fromsol",
    url: "/fonts/LP-Griun-Fromsol-Rg.ttf",
    format: "truetype",
    weight: 400,
  },
};

/** 나의 계정 — 선택 가능한 UI 글꼴(기본 포함) */
export const UI_FONT_PICKER_OPTIONS = [
  UI_FONT_DEFS.fromsol,
  UI_FONT_DEFS.leeseoyun,
  UI_FONT_DEFS.gongbujahana,
  UI_FONT_DEFS.mitmi,
  UI_FONT_DEFS.myeoneunheulrim,
  UI_FONT_DEFS.uhbeezziba,
  UI_FONT_DEFS.oksooni,
  UI_FONT_DEFS.myoeunddobak,
];

const LEGACY_UI_FONT_ALIASES = {
  parkdahyun: "bakdahyun",
  pakyongjun: "kyobohandwriting",
  ryuryu: "mitmi",
  cocochoitoon: "mitmi",
  mongtori: "mitmi",
  cherryspoon: "mitmi",
  uhbeerice: "mitmi",
};

/** @deprecated applyUiFontById 사용 */
export const LP_APP_FONT_STACK = fontStackForDef(UI_FONT_DEFS.fromsol);

export const LP_LEE_SEOYUN_FONT_STACK =
  '"LP Lee Seoyun", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export const LP_CALENDAR_MONTH_FONT_STACK =
  '"Hello Scratchy Outlines", sans-serif';

export const LP_CALENDAR_DAY_NUM_FONT_STACK =
  '"LP Lee Seoyun", sans-serif';

/** @param {UiFontDef} def */
export function fontStackForDef(def) {
  return `"${def.family}", "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
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

/** 서버 ui_font_id → 로컬 미러·화면. 서버가 비면 이미 고른 로컬 글꼴은 유지 */
export function applyUiFontFromServerRow(row) {
  const raw = row?.ui_font_id;
  const storedRaw = getScopedLocalStorageItem(USER_UI_FONT_ID_KEY);
  const id =
    raw == null || String(raw).trim() === ""
      ? storedRaw
        ? normalizeUiFontId(storedRaw)
        : DEFAULT_UI_FONT_ID
      : normalizeUiFontId(raw);
  const prev = storedRaw ? normalizeUiFontId(storedRaw) : DEFAULT_UI_FONT_ID;
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
  const requestedId = normalizeUiFontId(fontId);
  const { error } = await supabase.rpc("set_my_ui_font_id", {
    p_font_id: requestedId,
  });
  if (error) return { ok: false, id: requestedId, error };
  /* 서버 allowlist가 옛것이면 다른 id(밑미 등)로 저장될 수 있음 → 실제 저장값으로 맞춤 */
  let savedId = requestedId;
  try {
    const {
      data: { session },
    } = await getSupabaseSession();
    if (session?.user?.id) {
      const { data } = await supabase
        .from("user_subscriptions")
        .select("ui_font_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (data?.ui_font_id != null && String(data.ui_font_id).trim() !== "") {
        savedId = normalizeUiFontId(data.ui_font_id);
      }
    }
  } catch (_) {}
  persistUiFontIdLocal(savedId);
  applyUiFontById(savedId);
  await preloadUiFontById(savedId);
  return {
    ok: true,
    id: savedId,
    mismatched: savedId !== requestedId,
  };
}
