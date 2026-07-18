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

function normalizeTagLabel(label) {
  return String(label || "").trim();
}

function tagLabelKey(label) {
  return normalizeTagLabel(label).toLowerCase();
}

/** @param {object} row */
export function rowToSideincomeKpiNoteTag(row) {
  return {
    id: String(row.id || "").trim(),
    kpiId: String(row.kpi_id || "").trim(),
    label: normalizeTagLabel(row.label),
    serverUpdatedAt: serverUpdatedAtFromRow(row),
  };
}

/** @param {object} row */
export function rowToSideincomeKpiNote(row) {
  const tagsRaw = row?.tags;
  const legacyTags = Array.isArray(tagsRaw)
    ? normalizeKpiNoteTags(tagsRaw)
    : normalizeKpiNoteTags([]);
  return {
    id: String(row.id || "").trim(),
    kpiId: String(row.kpi_id || "").trim(),
    tagId: String(row.tag_id || row.tagId || "").trim(),
    tags: legacyTags,
    memo: String(row.memo || "").trim(),
    serverUpdatedAt: serverUpdatedAtFromRow(row),
  };
}

function noteToDbRow(userId, note) {
  return {
    user_id: userId,
    id: String(note.id || "").trim(),
    kpi_id: String(note.kpiId || "").trim(),
    tag_id: String(note.tagId || "").trim(),
    tags: [],
    memo: String(note.memo || "").trim(),
    updated_at: new Date().toISOString(),
  };
}

function tagToDbRow(userId, tag) {
  return {
    user_id: userId,
    id: String(tag.id || "").trim(),
    kpi_id: String(tag.kpiId || "").trim(),
    label: normalizeTagLabel(tag.label),
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
    if (!raw) return { kpiNotes: [], kpiNoteTags: [] };
    const p = JSON.parse(raw);
    return {
      ...p,
      kpiNotes: Array.isArray(p.kpiNotes) ? p.kpiNotes : [],
      kpiNoteTags: Array.isArray(p.kpiNoteTags) ? p.kpiNoteTags : [],
    };
  } catch (_) {
    return { kpiNotes: [], kpiNoteTags: [] };
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

function writeLocalKpiNoteTags(allTags) {
  try {
    const raw = readKpiMapScopedStorageRaw(SIDEINCOME_KPI_MAP_STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    p.kpiNoteTags = allTags;
    writeKpiMapScopedStorageRaw(SIDEINCOME_KPI_MAP_STORAGE_KEY, JSON.stringify(p));
  } catch (_) {}
}

function writeLocalNotesAndTags(allNotes, allTags) {
  try {
    const raw = readKpiMapScopedStorageRaw(SIDEINCOME_KPI_MAP_STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    p.kpiNotes = allNotes;
    p.kpiNoteTags = allTags;
    writeKpiMapScopedStorageRaw(SIDEINCOME_KPI_MAP_STORAGE_KEY, JSON.stringify(p));
  } catch (_) {}
}

/** @param {string} kpiId */
export function getLocalSideincomeKpiNoteTags(kpiId) {
  const kid = String(kpiId || "").trim();
  const tags = (readLocalMap().kpiNoteTags || []).filter(
    (t) => String(t.kpiId || "").trim() === kid,
  );
  return sortKpiNoteTagsByLabel(tags);
}

/** @param {object[]} tags */
export function sortKpiNoteTagsByLabel(tags) {
  return [...(tags || [])].sort((a, b) =>
    normalizeTagLabel(a.label).localeCompare(normalizeTagLabel(b.label), "ko"),
  );
}

/**
 * @param {string} kpiId
 * @param {string} label
 * @param {object[]} tagPool
 */
export function findKpiNoteTagByLabel(kpiId, label, tagPool) {
  const kid = String(kpiId || "").trim();
  const key = tagLabelKey(label);
  if (!kid || !key) return null;
  return (
    (tagPool || []).find(
      (t) =>
        String(t.kpiId || "").trim() === kid &&
        tagLabelKey(t.label) === key,
    ) || null
  );
}

/**
 * @param {string} kpiId
 */
export function migrateLegacySideincomeKpiNotesForKpi(kpiId) {
  const kid = String(kpiId || "").trim();
  if (!kid) return;
  const map = readLocalMap();
  let tags = [...(map.kpiNoteTags || [])];
  let notes = [...(map.kpiNotes || [])];
  let changed = false;

  const ensureTagForLabel = (label) => {
    const lbl = normalizeTagLabel(label);
    if (!lbl) return "";
    let hit = findKpiNoteTagByLabel(kid, lbl, tags);
    if (hit) return hit.id;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `kt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    hit = { id, kpiId: kid, label: lbl, localUpdatedAt: Date.now() };
    tags.push(hit);
    changed = true;
    return id;
  };

  notes = notes.flatMap((note) => {
    if (String(note.kpiId || "").trim() !== kid) return [note];
    const tid = String(note.tagId || "").trim();
    if (tid) return [note];
    const legacy = normalizeKpiNoteTags(note.tags);
    const memo = String(note.memo || "").trim();
    if (!legacy.length) {
      changed = true;
      return [];
    }
    changed = true;
    if (legacy.length === 1) {
      return [{ ...note, tagId: ensureTagForLabel(legacy[0]), tags: [] }];
    }
    return legacy.map((lbl, i) => ({
      ...note,
      id:
        i === 0
          ? note.id
          : typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `kn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      tagId: ensureTagForLabel(lbl),
      tags: [],
      memo,
    }));
  });

  if (changed) writeLocalNotesAndTags(notes, tags);
}

/** @param {string} kpiId */
export function getLocalSideincomeKpiNotes(kpiId) {
  migrateLegacySideincomeKpiNotesForKpi(kpiId);
  const kid = String(kpiId || "").trim();
  const notes = (readLocalMap().kpiNotes || []).filter(
    (n) => String(n.kpiId || "").trim() === kid && String(n.tagId || "").trim(),
  );
  return sortKpiNotesNewestFirst(notes);
}

/**
 * @param {string} kpiId
 * @param {object[]} notes
 * @param {object[]} tags
 */
export function groupSideincomeKpiNotesByTag(kpiId, notes, tags) {
  const kid = String(kpiId || "").trim();
  const tagById = new Map(
    (tags || [])
      .filter((t) => String(t.kpiId || "").trim() === kid)
      .map((t) => [String(t.id), t]),
  );
  const groups = new Map();
  sortKpiNotesNewestFirst(notes).forEach((note) => {
    const tid = String(note.tagId || "").trim();
    if (!tid) return;
    if (!groups.has(tid)) {
      groups.set(tid, {
        tag: tagById.get(tid) || { id: tid, kpiId: kid, label: "태그" },
        notes: [],
      });
    }
    groups.get(tid).notes.push(note);
  });
  return [...groups.values()].sort((a, b) =>
    normalizeTagLabel(a.tag.label).localeCompare(
      normalizeTagLabel(b.tag.label),
      "ko",
    ),
  );
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
export async function pullSideincomeKpiNoteTagsForKpi(kpiId) {
  const kid = String(kpiId || "").trim();
  migrateLegacySideincomeKpiNotesForKpi(kid);
  if (!kid || !supabase) return getLocalSideincomeKpiNoteTags(kid);
  const userId = await getSessionUserId();
  if (!userId) return getLocalSideincomeKpiNoteTags(kid);

  const { data, error } = await supabase
    .from("sideincome_map_kpi_note_tags")
    .select("*")
    .eq("user_id", userId)
    .eq("kpi_id", kid)
    .order("label", { ascending: true });

  if (error) return getLocalSideincomeKpiNoteTags(kid);

  const pulled = (data || []).map(rowToSideincomeKpiNoteTag);
  const map = readLocalMap();
  const others = (map.kpiNoteTags || []).filter(
    (t) => String(t.kpiId || "").trim() !== kid,
  );
  writeLocalKpiNoteTags([...others, ...pulled]);
  return sortKpiNoteTagsByLabel(pulled);
}

/**
 * @param {string} kpiId
 * @returns {Promise<object[]>}
 */
export async function pullSideincomeKpiNotesForKpi(kpiId) {
  const kid = String(kpiId || "").trim();
  migrateLegacySideincomeKpiNotesForKpi(kid);
  await pullSideincomeKpiNoteTagsForKpi(kid);
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
  migrateLegacySideincomeKpiNotesForKpi(kid);
  return getLocalSideincomeKpiNotes(kid);
}

/**
 * @param {{ id: string, kpiId: string, label: string }} tag
 */
export async function upsertSideincomeKpiNoteTagOnServer(tag) {
  if (!supabase) {
    showToast("로그인·연결 상태를 확인해 주세요.");
    return { ok: false, error: "no_supabase" };
  }
  const userId = await getSessionUserId();
  if (!userId) {
    showToast("로그인이 필요합니다.");
    return { ok: false, error: "no_session" };
  }
  const row = tagToDbRow(userId, tag);
  const { data, error } = await supabase
    .from("sideincome_map_kpi_note_tags")
    .upsert(row, { onConflict: "user_id,id" })
    .select("*")
    .maybeSingle();

  if (error) {
    showToast("태그 저장에 실패했습니다.", error.message || "");
    return { ok: false, error: error.message };
  }

  const saved = rowToSideincomeKpiNoteTag(data || row);
  const map = readLocalMap();
  const list = (map.kpiNoteTags || []).filter((t) => t.id !== saved.id);
  list.push(saved);
  writeLocalKpiNoteTags(list);
  return { ok: true, tag: saved };
}

/**
 * @param {string} kpiId
 * @param {string} label
 * @param {() => string} nextId
 */
export async function ensureSideincomeKpiNoteTagId(kpiId, label, nextId) {
  const kid = String(kpiId || "").trim();
  const lbl = normalizeTagLabel(label);
  if (!kid || !lbl) return { ok: false, error: "missing" };
  migrateLegacySideincomeKpiNotesForKpi(kid);
  const existing = findKpiNoteTagByLabel(
    kid,
    lbl,
    getLocalSideincomeKpiNoteTags(kid),
  );
  if (existing?.id) return { ok: true, tag: existing };
  const tag = { id: nextId(), kpiId: kid, label: lbl };
  return upsertSideincomeKpiNoteTagOnServer(tag);
}

/**
 * @param {{ id: string, kpiId: string, tagId: string, memo: string }} note
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
    tagId: String(note.tagId || "").trim(),
    tags: [],
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
