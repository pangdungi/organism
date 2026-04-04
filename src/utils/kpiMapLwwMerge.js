/**
 * KPI 맵 pull 시 행 단위 last-write-wins (서버 updated_at vs 로컬 localModifiedAt/serverUpdatedAt)
 */

export function parseIsoMs(iso) {
  if (iso == null || iso === "") return 0;
  if (typeof iso === "number" && Number.isFinite(iso)) return iso;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : 0;
}

export function serverUpdatedAtFromRow(r) {
  if (r == null || r.updated_at == null || r.updated_at === "") return "";
  return String(r.updated_at);
}

/** 로컬 행의 "최근 수정" 시각(ms) — 편집 시각이 있으면 우선 */
export function localEntityTimeMs(item) {
  if (!item || typeof item !== "object") return 0;
  const lm =
    typeof item.localModifiedAt === "number" && Number.isFinite(item.localModifiedAt)
      ? item.localModifiedAt
      : 0;
  const su = parseIsoMs(item.serverUpdatedAt);
  return Math.max(lm, su);
}

export function buildIdToUpdatedMsMap(rows) {
  const m = new Map();
  for (const r of rows || []) {
    const id = String(r?.id || "").trim();
    if (!id) continue;
    m.set(id, parseIsoMs(r?.updated_at));
  }
  return m;
}

export function stripKpiRowSyncMeta(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const { localModifiedAt, serverUpdatedAt, ...rest } = obj;
  return rest;
}

/**
 * 서버 배열 순서를 유지하며, 동일 id는 updated_at vs 로컬 시각으로 승자 선택.
 * 동률(tLoc === tSrv)은 로컬(미반영 편집) 우선.
 */
export function mergeRowsByLwwWithServerOrder({
  localArr,
  serverArr,
  serverTsMap,
  getId,
}) {
  const localById = new Map(
    (localArr || []).map((x) => [String(getId(x)), x]),
  );
  const serverById = new Map(
    (serverArr || []).map((x) => [String(getId(x)), x]),
  );
  const serverOrder = (serverArr || []).map((x) => String(getId(x)));
  const out = [];
  const seen = new Set();
  for (const id of serverOrder) {
    const loc = localById.get(id);
    const srv = serverById.get(id);
    const tSrv = serverTsMap.get(id) || 0;
    if (!loc) {
      if (srv) out.push(srv);
      seen.add(id);
      continue;
    }
    if (!srv) {
      out.push(loc);
      seen.add(id);
      continue;
    }
    const tLoc = localEntityTimeMs(loc);
    if (tLoc > tSrv) out.push({ ...loc });
    else if (tSrv > tLoc) out.push({ ...srv });
    else out.push({ ...loc });
    seen.add(id);
  }
  for (const [id, loc] of localById) {
    if (!seen.has(id)) out.push(loc);
  }
  return out;
}

export function bumpEntityArrayLocalModified(prevArr, nextArr, getId) {
  const prevById = new Map(
    (prevArr || []).map((x) => [String(getId(x)), x]),
  );
  return (nextArr || []).map((item) => {
    const id = String(getId(item));
    const p = prevById.get(id);
    if (!p) return { ...item, localModifiedAt: Date.now() };
    let same = false;
    try {
      same =
        JSON.stringify(stripKpiRowSyncMeta(p)) ===
        JSON.stringify(stripKpiRowSyncMeta(item));
    } catch (_) {
      same = false;
    }
    if (!same) return { ...item, localModifiedAt: Date.now() };
    return {
      ...item,
      localModifiedAt: p.localModifiedAt,
      serverUpdatedAt:
        p.serverUpdatedAt !== undefined && p.serverUpdatedAt !== ""
          ? p.serverUpdatedAt
          : item.serverUpdatedAt,
    };
  });
}
