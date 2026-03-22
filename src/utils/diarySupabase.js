/**
 * 감정관리 일기 ↔ Supabase diary_daily_entries 동기화
 */

import { supabase } from "../supabase.js";
import {
  loadDiaryEntries,
  saveDiaryEntries,
  ensureDiaryEntryUuid,
  isDiaryEntryUuid,
} from "../diaryData.js";

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
      qa: p.qa && typeof p.qa === "object" ? p.qa : {},
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

/** 서버 데이터와 로컬 병합: 행 id 기준. 동일 id는 서버 행 우선, 로컬만 있는 행 유지 */
export function mergeDiaryServerWins(local, serverRows) {
  const fromServer = rowsToDiaryEntries(serverRows);
  const out = emptyDiaryShape();
  for (const tabId of ["1", "2", "3"]) {
    const map = new Map();
    for (const e of fromServer[tabId].entries || []) {
      const id = String(e?.id || "").trim();
      if (id) map.set(id, e);
    }
    for (const e of local?.[tabId]?.entries || []) {
      const copy = JSON.parse(JSON.stringify(e));
      if (!String(copy?.id || "").trim()) ensureDiaryEntryUuid(copy);
      const id = String(copy.id || "").trim();
      if (!id) continue;
      if (!map.has(id)) map.set(id, copy);
    }
    out[tabId].entries = sortEntriesList([...map.values()]);
  }
  return out;
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/** 로그인 상태에서 서버에서 전부 가져와 로컬과 병합 후 저장 */
export async function pullDiaryFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return null;
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, diary_kind, entry_date, payload, updated_at")
    .eq("user_id", userId)
    .order("entry_date", { ascending: false });
  if (error) {
    console.warn("[diary sync] pull", error.message);
    return null;
  }
  const local = loadDiaryEntries();
  const merged = mergeDiaryServerWins(local, data || []);
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

/** 로컬 상태를 서버에 반영 (id PK upsert + 로컬에 없는 id 삭제) */
export async function syncDiaryToSupabase(entries) {
  const userId = await getSessionUserId();
  if (!userId || !supabase || !entries || typeof entries !== "object") return;

  let mutatedIds = false;
  const localIds = new Set();
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
      localIds.add(id);
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

  const { data: remote, error: rErr } = await supabase
    .from(TABLE)
    .select("id")
    .eq("user_id", userId);
  if (rErr || !remote) return;

  for (const r of remote) {
    const rid = r.id;
    if (rid && !localIds.has(String(rid))) {
      const { error: dErr } = await supabase.from(TABLE).delete().eq("id", rid);
      if (dErr) console.warn("[diary sync] delete", dErr.message);
    }
  }
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

/** 감정일기 탭 진입 시: pull → 서버 비었으면 로컬 업로드 */
export async function hydrateDiaryFromCloud() {
  if (!supabase) return;
  attachDiarySaveListener();
  const pulled = await pullDiaryFromSupabase();
  const entries = pulled ?? loadDiaryEntries();
  await pushAllLocalDiaryIfServerEmpty(entries);
}
