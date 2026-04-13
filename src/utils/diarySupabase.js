/**
 * 감정관리 일기 ↔ Supabase diary_daily_entries 동기화
 *
 * - 아카이브(time_ledger 월 pull)와 같은 원칙: 서버에서 받은 스냅샷이 진실(삭제·수정 반영).
 * - 날짜 피커 대신 월 범위가 아니라 "유저 전체 행" 한 번에 pull (일기량이 텍스트 위주라 통째 조회).
 * - 서버 응답이 빈 배열이면 병합하지 않음 — 빈 서버로 로컬 일기를 지우지 않음(time_ledger와 정책 다름).
 */

import { supabase } from "../supabase.js";
import {
  loadDiaryEntries,
  saveDiaryEntries,
  ensureDiaryEntryUuid,
  isDiaryEntryUuid,
  getDiaryServerHadRowsFlag,
  setDiaryServerHadRowsFlag,
} from "../diaryData.js";
import { lpPullDebug } from "./lpPullDebug.js";

const TABLE = "diary_daily_entries";

const TAB_TO_KIND = { "1": "free", "2": "control", "3": "emotion" };
const KIND_TO_TAB = { free: "1", control: "2", emotion: "3" };

function normalizeDate(d) {
  return String(d || "").replace(/\//g, "-").slice(0, 10);
}

function sortEntriesList(list) {
  return [...list].sort((a, b) => {
    const byDate = (b.date || "").localeCompare(a.date || "");
    if (byDate !== 0) return byDate;
    return (b.id || "").localeCompare(a.id || "");
  });
}

function emptyDiaryShape() {
  return {
    "1": { entries: [] },
    "2": { entries: [] },
    "3": { entries: [] },
  };
}

function entryToPayload(tabId, entry) {
  if (tabId === "3") {
    return {
      q1: entry.q1 != null ? String(entry.q1) : "",
      q2: entry.q2 != null ? String(entry.q2) : "",
      q3: entry.q3 != null ? String(entry.q3) : "",
      q4: entry.q4 != null ? String(entry.q4) : "",
    };
  }
  if (tabId === "2") {
    const qa = entry.qa && typeof entry.qa === "object" ? { ...entry.qa } : {};
    return { qa };
  }
  return { content: entry.content != null ? String(entry.content) : "" };
}

function payloadToEntry(tabId, dateStr, payload, rowId) {
  const p = payload && typeof payload === "object" ? payload : {};
  const base = {
    id: rowId || "e_" + Date.now(),
    date: dateStr,
    title: "제목없음",
  };
  if (tabId === "3") {
    return {
      ...base,
      q1: p.q1 != null ? String(p.q1) : "",
      q2: p.q2 != null ? String(p.q2) : "",
      q3: p.q3 != null ? String(p.q3) : "",
      q4: p.q4 != null ? String(p.q4) : "",
    };
  }
  if (tabId === "2") {
    return {
      ...base,
      content: "",
      qa: p.qa && typeof p.qa === "object" ? { ...p.qa } : {},
    };
  }
  return {
    ...base,
    content: p.content != null ? String(p.content) : "",
  };
}

/** 서버 행 → 로컬 diary_entries 객체 */
export function rowsToDiaryEntries(rows) {
  const out = emptyDiaryShape();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    const tabId = KIND_TO_TAB[row.diary_kind];
    if (!tabId) continue;
    const d = normalizeDate(row.entry_date);
    if (!d || d.length < 10) continue;
    const entry = payloadToEntry(tabId, d, row.payload, row.id);
    out[tabId].entries.push(entry);
  }
  for (const tid of ["1", "2", "3"]) {
    out[tid].entries = sortEntriesList(out[tid].entries);
  }
  return out;
}

/** 탭별 본문이 비어 있지 않은지 — 아카이브 timeLedgerRowIsSyncable 과 같은 역할(빈 초안은 pull 시 삭제 대상 아님) */
function diaryEntryHasPayload(e, tabId) {
  if (tabId === "3") {
    return ["q1", "q2", "q3", "q4"].some((k) => String(e[k] ?? "").trim());
  }
  if (tabId === "2") {
    const qa = e.qa && typeof e.qa === "object" ? e.qa : {};
    return Object.values(qa).some((v) => String(v ?? "").trim());
  }
  return String(e.content ?? "").trim().length > 0;
}

function diaryEntryIsSyncable(e, tabId) {
  if (!isDiaryEntryUuid(e.id)) return false;
  const d = normalizeDate(e.date);
  if (!d || d.length < 10) return false;
  return diaryEntryHasPayload(e, tabId);
}

/**
 * 서버 id 집합에 없는 로컬 행을 둘지(아카이브 keepLocalRowNotOnServer 와 동일 규칙).
 * UUID + 동기화 가능 + 서버에 없음 → 삭제된 것으로 보고 로컬에서 제외.
 */
function keepLocalDiaryEntryNotOnServer(e, serverIds, tabId) {
  const id = String(e?.id || "").trim();
  if (!id) return false;
  if (serverIds.has(id)) return false;
  if (!isDiaryEntryUuid(id)) return true;
  if (!diaryEntryIsSyncable(e, tabId)) return true;
  return false;
}

/**
 * 서버에서 받은 전체 행으로 로컬 병합: 서버에 있는 id는 서버 스냅샷, 없는 syncable uuid는 제거.
 * @param {object} local
 * @param {object[]} serverRowsFlat — Supabase select 행 배열
 */
export function mergeDiaryFromServerSnapshot(local, serverRowsFlat) {
  const rows = Array.isArray(serverRowsFlat) ? serverRowsFlat : [];
  const fromServer = rowsToDiaryEntries(rows);
  const serverIds = new Set();
  for (const tid of ["1", "2", "3"]) {
    for (const e of fromServer[tid].entries || []) {
      const id = String(e?.id || "").trim();
      if (id) serverIds.add(id);
    }
  }

  const out = emptyDiaryShape();
  for (const tabId of ["1", "2", "3"]) {
    const byId = new Map();
    for (const e of fromServer[tabId].entries || []) {
      const id = String(e?.id || "").trim();
      if (id) byId.set(id, JSON.parse(JSON.stringify(e)));
    }
    for (const e of local?.[tabId]?.entries || []) {
      if (!keepLocalDiaryEntryNotOnServer(e, serverIds, tabId)) continue;
      const id = String(e.id || "").trim();
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, JSON.parse(JSON.stringify(e)));
    }
    out[tabId].entries = sortEntriesList([...byId.values()]);
  }
  return out;
}

/** @deprecated 이름 호환 — mergeDiaryFromServerSnapshot 과 동일 */
export const mergeDiaryServerWins = mergeDiaryFromServerSnapshot;

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * 로그인 시 서버 전체 행을 받아 로컬과 병합.
 * 서버에 한 건도 없으면 병합하지 않음(빈 배열로 로컬을 비우지 않음).
 */
export async function pullDiaryFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, diary_kind, entry_date, payload, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) {
    console.warn("[diary sync] pull", error.message);
    return null;
  }
  const local = loadDiaryEntries();
  const hadRowsFlag = getDiaryServerHadRowsFlag();

  if (!Array.isArray(data) || data.length === 0) {
    if (hadRowsFlag) {
      const merged = mergeDiaryFromServerSnapshot(local, []);
      saveDiaryEntries(merged);
      return merged;
    }
    return null;
  }

  setDiaryServerHadRowsFlag(true);

  const merged = mergeDiaryFromServerSnapshot(local, data);
  saveDiaryEntries(merged);
  return merged;
}

/** 서버에 일기가 하나도 없을 때 로컬 전체 업로드 */
export async function pushAllLocalDiaryIfServerEmpty(entries) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;
  const { count, error: cErr } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (cErr || (count != null && count > 0)) return;
  await syncDiaryToSupabase(entries);
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

/** 로컬 상태를 서버에 반영 (id PK upsert만; 삭제는 deleteDiaryEntryFromSupabase 또는 서버 진실 pull 반영) */
export async function syncDiaryToSupabase(entries) {
  const userId = await getSessionUserId();
  if (!userId || !supabase || !entries || typeof entries !== "object") return;

  let mutatedIds = false;
  const upserts = [];

  for (const tabId of ["1", "2", "3"]) {
    const kind = TAB_TO_KIND[tabId];
    const list = entries[tabId]?.entries;
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      const d = normalizeDate(e.date);
      if (!d || d.length < 10) continue;
      if (!isDiaryEntryUuid(e.id)) {
        ensureDiaryEntryUuid(e);
        mutatedIds = true;
      }
      const id = String(e.id || "").trim();
      if (!id) continue;
      upserts.push({
        id,
        user_id: userId,
        diary_kind: kind,
        entry_date: d,
        payload: entryToPayload(tabId, e),
      });
    }
  }

  if (mutatedIds) saveDiaryEntries(entries);

  if (upserts.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(upserts, {
      onConflict: "id",
    });
    if (error) console.warn("[diary sync] upsert", error.message);
  }
}

/** 사용자가 일기를 삭제했을 때 해당 행만 서버에서 제거 */
export async function deleteDiaryEntryFromSupabase(entryId) {
  const userId = await getSessionUserId();
  if (!userId || !supabase || !entryId) return;
  const id = String(entryId).trim();
  if (!isDiaryEntryUuid(id)) return;
  const { error } = await supabase.from(TABLE).delete().eq("id", id).eq("user_id", userId);
  if (error) console.warn("[diary sync] delete row", error.message);
}

export function scheduleDiarySyncPush(entries) {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncDiaryToSupabase(entries).catch((e) => console.warn("[diary sync]", e));
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachDiarySaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("diary-entries-saved", (ev) => {
    const data = ev.detail?.data;
    if (data) scheduleDiarySyncPush(data);
  });
}

/** 감정일기 탭 진입 시: 전체 pull(서버 진실 병합) → 서버 비었으면 로컬 시드 */
export async function hydrateDiaryFromCloud() {
  lpPullDebug("hydrateDiaryFromCloud", {});
  if (!supabase) return null;
  attachDiarySaveListener();
  const merged = await pullDiaryFromSupabase();
  const entries = merged ?? loadDiaryEntries();
  await pushAllLocalDiaryIfServerEmpty(entries);
  return { merged: entries };
}
