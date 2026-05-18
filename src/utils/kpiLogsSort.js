/**
 * KPI 로그 목록: 날짜 형식(dateRaw / 표시용 date)이 섞여도 비교 가능하도록 YYYY-MM-DD 로 정규화
 */
export function kpiLogSortKey(log) {
  const raw = log?.dateRaw;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) {
    return String(raw).trim();
  }
  const s = String(raw || "").trim();
  const head = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (head) return `${head[1]}-${head[2]}-${head[3]}`;
  const m = String(log?.date || "").match(/(\d{4})\D*(\d{1,2})\D*(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  }
  return "";
}

/** dateRaw가 날짜만이 아니면 Date.parse 가능 시각(ms), 없으면 NaN */
function kpiLogOptionalInstantMs(log) {
  const raw = String(log?.dateRaw || "").trim();
  if (raw.length <= 10) return NaN;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? NaN : ms;
}

/**
 * 최신 날짜가 위로. 같은 날이면 dateRaw에 시·분까지 있으면 그 순서, 없으면 저장 배열에서 뒤(나중 추가)가 위로.
 * @param {object[]} logs — kpiId 로 걸러진 로그만
 * @param {object[]|null|undefined} fullKpiLogsArray — 원본 kpiLogs (저장 순서 보조 정렬용)
 */
export function sortKpiLogsNewestFirst(logs, fullKpiLogsArray) {
  const order = new Map(
    (fullKpiLogsArray || []).map((l, i) => [l.id, i]),
  );
  return [...logs].sort((a, b) => {
    const ka = kpiLogSortKey(a);
    const kb = kpiLogSortKey(b);
    const byDate = kb.localeCompare(ka);
    if (byDate !== 0) return byDate;
    const ta = kpiLogOptionalInstantMs(a);
    const tb = kpiLogOptionalInstantMs(b);
    if (!Number.isNaN(ta) && !Number.isNaN(tb) && tb !== ta) {
      return tb - ta;
    }
    return (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0);
  });
}

/** KPI 값 입력란이 비어 있지 않은 로그(시간기록만 연동·빈 value 는 false) */
export function kpiLogHasExplicitValueForKpi(log) {
  return String(log?.value ?? "").trim() !== "";
}

/**
 * 낮을수록 좋음용: 정렬상 가장 최신이면서 수치를 실제로 입력한 로그 한 건
 */
export function getLatestKpiLogWithExplicitValue(kpiId, allLogs) {
  const kid = String(kpiId || "").trim();
  if (!kid) return null;
  const logs = (allLogs || []).filter(
    (l) => String(l?.kpiId || "").trim() === kid,
  );
  if (logs.length === 0) return null;
  const sorted = sortKpiLogsNewestFirst(logs, allLogs);
  return sorted.find((l) => kpiLogHasExplicitValueForKpi(l)) ?? null;
}
