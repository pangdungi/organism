/**
 * 캘린더 날짜 직접 추가 스탬프 — 사용자·날짜당 사진 1장, 256px.
 * 이전 날짜 사진은 이 칸에 목록으로 보여 주지 않음. 바꾸면 그날 파일만 교체.
 */
import { supabase } from "../supabase.js";

export const CALENDAR_CUSTOM_STAMP_PREFIX = "lp-custom:";
export const CALENDAR_CUSTOM_STAMP_SIZE = 256;
export const CALENDAR_CUSTOM_STAMP_BUCKET = "calendar-day-stamps";

const SIGNED_TTL_SEC = 60 * 60 * 24 * 7;

/** @type {Map<string, string>} ymd → 표시 URL */
const _srcByYmd = new Map();

function normalizeYmd(v) {
  const ymd = String(v || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : "";
}

export function isCalendarCustomStampKey(key) {
  return String(key || "").trim().startsWith(CALENDAR_CUSTOM_STAMP_PREFIX);
}

export function calendarCustomStampYmdFromKey(key) {
  if (!isCalendarCustomStampKey(key)) return "";
  return normalizeYmd(String(key || "").slice(CALENDAR_CUSTOM_STAMP_PREFIX.length));
}

export function buildCalendarCustomStampKey(ymd) {
  const day = normalizeYmd(ymd);
  return day ? `${CALENDAR_CUSTOM_STAMP_PREFIX}${day}` : "";
}

export function getCalendarCustomStampSrc(keyOrYmd) {
  const raw = String(keyOrYmd || "").trim();
  const ymd = isCalendarCustomStampKey(raw)
    ? calendarCustomStampYmdFromKey(raw)
    : normalizeYmd(raw);
  if (!ymd) return "";
  return String(_srcByYmd.get(ymd) || "").trim();
}

export function setCalendarCustomStampSrc(ymd, url) {
  const day = normalizeYmd(ymd);
  const src = String(url || "").trim();
  if (!day) return;
  if (!src) _srcByYmd.delete(day);
  else _srcByYmd.set(day, src);
}

export function clearCalendarCustomStampSrc(ymd) {
  const day = normalizeYmd(ymd);
  if (day) _srcByYmd.delete(day);
}

async function getSessionUserId() {
  if (!supabase) return "";
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return String(session?.user?.id || "").trim();
}

function stampObjectPath(userId, ymd) {
  return `${userId}/${ymd}.webp`;
}

function loadHtmlImageFromBlob(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode_failed"));
    };
    img.src = url;
  });
}

async function convertHeicToJpegBlob(file) {
  const { heicTo } = await import("heic-to");
  return heicTo({
    blob: file,
    type: "image/jpeg",
    quality: 0.9,
  });
}

async function blobToDrawSource(file) {
  try {
    if (typeof createImageBitmap === "function") {
      return await createImageBitmap(file);
    }
  } catch (_) {}
  try {
    return await loadHtmlImageFromBlob(file);
  } catch (_) {}
  const jpeg = await convertHeicToJpegBlob(file);
  try {
    if (typeof createImageBitmap === "function") {
      return await createImageBitmap(jpeg);
    }
  } catch (_) {}
  return loadHtmlImageFromBlob(jpeg);
}

/**
 * @param {File|Blob} file
 * @returns {Promise<Blob>}
 */
export async function resizeImageFileToCalendarStampBlob(file) {
  if (!file) throw new Error("no_file");
  const source = await blobToDrawSource(file);
  const canvas = document.createElement("canvas");
  canvas.width = CALENDAR_CUSTOM_STAMP_SIZE;
  canvas.height = CALENDAR_CUSTOM_STAMP_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no_canvas");
  const sw = source.width || CALENDAR_CUSTOM_STAMP_SIZE;
  const sh = source.height || CALENDAR_CUSTOM_STAMP_SIZE;
  const scale = Math.max(
    CALENDAR_CUSTOM_STAMP_SIZE / sw,
    CALENDAR_CUSTOM_STAMP_SIZE / sh,
  );
  const dw = sw * scale;
  const dh = sh * scale;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CALENDAR_CUSTOM_STAMP_SIZE, CALENDAR_CUSTOM_STAMP_SIZE);
  ctx.filter = "grayscale(1)";
  ctx.drawImage(
    source,
    (CALENDAR_CUSTOM_STAMP_SIZE - dw) / 2,
    (CALENDAR_CUSTOM_STAMP_SIZE - dh) / 2,
    dw,
    dh,
  );
  ctx.filter = "none";
  try {
    const imageData = ctx.getImageData(
      0,
      0,
      CALENDAR_CUSTOM_STAMP_SIZE,
      CALENDAR_CUSTOM_STAMP_SIZE,
    );
    const px = imageData.data;
    for (let i = 0; i < px.length; i += 4) {
      const g = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
      px[i] = g;
      px[i + 1] = g;
      px[i + 2] = g;
    }
    ctx.putImageData(imageData, 0, 0);
  } catch (_) {}
  if (typeof source.close === "function") {
    try {
      source.close();
    } catch (_) {}
  }
  const blob = await new Promise((resolve) => {
    canvas.toBlob((next) => resolve(next), "image/webp", 0.82);
  });
  if (blob && blob.size > 0) return blob;
  const png = await new Promise((resolve) => {
    canvas.toBlob((next) => resolve(next), "image/png");
  });
  if (!png || !png.size) throw new Error("encode_failed");
  return png;
}

async function signStampPath(userId, ymd) {
  if (!supabase || !userId || !ymd) return "";
  const path = stampObjectPath(userId, ymd);
  const { data, error } = await supabase.storage
    .from(CALENDAR_CUSTOM_STAMP_BUCKET)
    .createSignedUrl(path, SIGNED_TTL_SEC);
  if (error || !data?.signedUrl) return "";
  return `${data.signedUrl}`;
}

export async function refreshCalendarCustomStampSignedUrls(ymds) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;
  const days = [...new Set((Array.isArray(ymds) ? ymds : []).map(normalizeYmd).filter(Boolean))];
  if (!days.length) return;
  const paths = days.map((ymd) => stampObjectPath(userId, ymd));
  const { data, error } = await supabase.storage
    .from(CALENDAR_CUSTOM_STAMP_BUCKET)
    .createSignedUrls(paths, SIGNED_TTL_SEC);
  if (error || !Array.isArray(data)) return;
  data.forEach((item, i) => {
    const ymd = days[i];
    const url = String(item?.signedUrl || "").trim();
    if (ymd && url) setCalendarCustomStampSrc(ymd, url);
    else if (ymd) clearCalendarCustomStampSrc(ymd);
  });
  try {
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("calendar-day-custom-stamps-ready"),
      );
    }
  } catch (_) {}
}

/**
 * @param {string} ymd
 * @param {Blob} blob
 * @returns {Promise<{ ok: boolean, key: string, reason?: string }>}
 */
export async function uploadCalendarCustomStampForDate(ymd, blob) {
  const day = normalizeYmd(ymd);
  const userId = await getSessionUserId();
  if (!day || !userId || !supabase || !blob) {
    return { ok: false, key: "", reason: "no_session" };
  }
  const path = stampObjectPath(userId, day);
  const { error } = await supabase.storage
    .from(CALENDAR_CUSTOM_STAMP_BUCKET)
    .upload(path, blob, {
      upsert: true,
      contentType: blob.type || "image/webp",
      cacheControl: "3600",
    });
  if (error) {
    return { ok: false, key: "", reason: error.message || "upload_failed" };
  }
  const signed = await signStampPath(userId, day);
  if (signed) setCalendarCustomStampSrc(day, signed);
  return { ok: true, key: buildCalendarCustomStampKey(day) };
}

export async function removeCalendarCustomStampFile(ymd) {
  const day = normalizeYmd(ymd);
  const userId = await getSessionUserId();
  if (!day || !userId || !supabase) return { ok: false };
  const { error } = await supabase.storage
    .from(CALENDAR_CUSTOM_STAMP_BUCKET)
    .remove([stampObjectPath(userId, day)]);
  clearCalendarCustomStampSrc(day);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

export async function moveCalendarCustomStampFile(fromYmd, toYmd) {
  const from = normalizeYmd(fromYmd);
  const to = normalizeYmd(toYmd);
  const userId = await getSessionUserId();
  if (!from || !to || !userId || !supabase) return { ok: false };
  if (from === to) return { ok: true };
  const fromPath = stampObjectPath(userId, from);
  const toPath = stampObjectPath(userId, to);
  await supabase.storage.from(CALENDAR_CUSTOM_STAMP_BUCKET).remove([toPath]);
  const { error: copyErr } = await supabase.storage
    .from(CALENDAR_CUSTOM_STAMP_BUCKET)
    .copy(fromPath, toPath);
  if (copyErr) return { ok: false, reason: copyErr.message };
  await supabase.storage.from(CALENDAR_CUSTOM_STAMP_BUCKET).remove([fromPath]);
  const signed = await signStampPath(userId, to);
  if (signed) setCalendarCustomStampSrc(to, signed);
  clearCalendarCustomStampSrc(from);
  return { ok: true };
}
