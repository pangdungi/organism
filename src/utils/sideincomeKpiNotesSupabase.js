/**
 * 시급상승 KPI 기록(태그·메모) — pull·단건 upsert/delete 만 (맵 bulk push 와 분리)
 */

import { supabase } from "../supabase.js";
import {
  readKpiMapScopedStorageRaw,
  writeKpiMapScopedStorageRaw,
} from "./kpiMapLocalStorage.js";
import { SIDEINCOME_KPI_MAP_STORAGE_KEY } from "./sideincomeKpiMapSupabase.js";
import { serverUpdatedAtFromRow } from "./kpiMapLwwMerge.js";
import { showToast } from "./showToast.js";

/** @param {unknown} raw */
export function parseKpiNoteTagsInput(raw) {
  return String(raw || "")
    .split(/[,，、\n]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** @param {unknown} tags */
export function normalizeKpiNoteTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t || "").trim()).filter(Boolean))];
}

/** @param {object} row */
export function rowToSideincomeKpiNote(row) {
  const tagsRaw = row?.tags;
  const tags = Array.isArray(tagsRaw)
    ? normalizeKpiNoteTags(tagsRaw)
    : normalizeKpiNoteTags([]);
  return {
    id: String(row.id || "").trim(),
    kpiId: String(row.kpi_id || "").trim(),
    tags,
    memo: String(row.memo || "").trim(),
    serverUpdatedAt: serverUpdatedAtFromRow(row),
  };
}

function noteToDbRow(userId, note) {
  return {
    user_id: userId,
    id: String(note.id || "").trim(),
    kpi_id: String(note.kpiId || "").trim(),
    tags: normalizeKpiNoteTags(note.tags),
    memo: String(note.memo || "").trim(),
    updated_at: new Date().toISOString(),
  };
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function readLocalMap() {
  try {
    const raw = readKpiMapScopedStorageRaw(SIDEINCOME_KPI_MAP_STORAGE_KEY);
    if (!raw) return { kpiNotes: [] };
    const p = JSON.parse(raw);
    return {
      ...p,
      kpiNotes: Array.isArray(p.kpiNotes) ? p.kpiNotes : [],
    };
  } catch (_) {
    return { kpiNotes: [] };
  }
}

function writeLocalKpiNotes(allNotes) {
  try {
    const raw = readKpiMapScopedStorageRaw(SIDEINCOME_KPI_MAP_STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    p.kpiNotes = allNotes;
    writeKpiMapScopedStorageRaw(SIDEINCOME_KPI_MAP_STORAGE_KEY, JSON.stringify(p));
  } catch (_) {}
}

/** @param {string} kpiId */
export function getLocalSideincomeKpiNotes(kpiId) {
  const kid = String(kpiId || "").trim();
  const notes = (readLocalMap().kpiNotes || []).filter(
    (n) => String(n.kpiId || "").trim() === kid,
  );
  return sortKpiNotesNewestFirst(notes);
}

/** @param {object[]} notes */
export function sortKpiNotesNewestFirst(notes) {
  return [...(notes || [])].sort((a, b) => {
    const ta = Date.parse(a.serverUpdatedAt || "") || Number(a.localUpdatedAt) || 0;
    const tb = Date.parse(b.serverUpdatedAt || "") || Number(b.localUpdatedAt) || 0;
    return tb - ta;
  });
}

/**
 * @param {string} kpiId
 * @returns {Promise<object[]>}
 */
export async function pullSideincomeKpiNotesForKpi(kpiId) {
  const kid = String(kpiId || "").trim();
  if (!kid || !supabase) return getLocalSideincomeKpiNotes(kid);
  const userId = await getSessionUserId();
  if (!userId) return getLocalSideincomeKpiNotes(kid);

  const { data, error } = await supabase
    .from("sideincome_map_kpi_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("kpi_id", kid)
    .order("updated_at", { ascending: false });

  if (error) {
    return getLocalSideincomeKpiNotes(kid);
  }

  const pulled = (data || []).map(rowToSideincomeKpiNote);
  const map = readLocalMap();
  const others = (map.kpiNotes || []).filter(
    (n) => String(n.kpiId || "").trim() !== kid,
  );
  writeLocalKpiNotes([...others, ...pulled]);
  return sortKpiNotesNewestFirst(pulled);
}

/**
 * @param {{ id: string, kpiId: string, tags: string[], memo: string }} note
 */
export async function upsertSideincomeKpiNoteOnServer(note) {
  if (!supabase) {
    showToast("로그인·연결 상태를 확인해 주세요.");
    return { ok: false, error: "no_supabase" };
  }
  const userId = await getSessionUserId();
  if (!userId) {
    showToast("로그인이 필요합니다.");
    return { ok: false, error: "no_session" };
  }
  const row = noteToDbRow(userId, note);
  const { data, error } = await supabase
    .from("sideincome_map_kpi_notes")
    .upsert(row, { onConflict: "user_id,id" })
    .select("*")
    .maybeSingle();

  if (error) {
    showToast("기록 저장에 실패했습니다.", error.message || "");
    return { ok: false, error: error.message };
  }

  const saved = rowToSideincomeKpiNote(data || row);
  const map = readLocalMap();
  const list = (map.kpiNotes || []).filter((n) => n.id !== saved.id);
  list.push(saved);
  writeLocalKpiNotes(list);
  return { ok: true, note: saved };
}

/**
 * @param {string} noteId
 * @param {string} kpiId
 */
export async function deleteSideincomeKpiNoteOnServer(noteId, kpiId) {
  const id = String(noteId || "").trim();
  const kid = String(kpiId || "").trim();
  if (!id) return { ok: false, error: "missing_id" };

  if (!supabase) {
    showToast("로그인·연결 상태를 확인해 주세요.");
    return { ok: false, error: "no_supabase" };
  }
  const userId = await getSessionUserId();
  if (!userId) {
    showToast("로그인이 필요합니다.");
    return { ok: false, error: "no_session" };
  }

  const { error } = await supabase
    .from("sideincome_map_kpi_notes")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);

  if (error) {
    showToast("기록 삭제에 실패했습니다.", error.message || "");
    return { ok: false, error: error.message };
  }

  const map = readLocalMap();
  writeLocalKpiNotes(
    (map.kpiNotes || []).filter((n) => String(n.id) !== id),
  );
  return { ok: true };
}

/**
 * 로컬에만 먼저 반영(optimistic) — 서버 성공 후 pull 로 덮어씀
 * @param {object} note
 */
export function upsertLocalSideincomeKpiNote(note) {
  const map = readLocalMap();
  const list = (map.kpiNotes || []).filter((n) => n.id !== note.id);
  list.push({
    ...note,
    tags: normalizeKpiNoteTags(note.tags),
    memo: String(note.memo || "").trim(),
    localUpdatedAt: Date.now(),
  });
  writeLocalKpiNotes(list);
}

export function removeLocalSideincomeKpiNote(noteId) {
  const id = String(noteId || "").trim();
  const map = readLocalMap();
  writeLocalKpiNotes((map.kpiNotes || []).filter((n) => String(n.id) !== id));
}
