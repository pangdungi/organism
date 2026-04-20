/**
 * 시간가계부(건강한 식사 등) memo_tags에 식단명을 싣고,
 * 근무-식단표 월별 뷰에서 근무표 행과 합쳐 표시할 때 사용합니다.
 */

export const WS_DIET_LEDGER_MEMO_PREFIX = "lp-meal:";

export function isWorkScheduleDietLedgerMemoTag(tag) {
  return String(tag ?? "").trim().startsWith(WS_DIET_LEDGER_MEMO_PREFIX);
}

export function dietNameFromLedgerMemoTag(tag) {
  const s = String(tag ?? "").trim();
  if (!isWorkScheduleDietLedgerMemoTag(s)) return "";
  return s.slice(WS_DIET_LEDGER_MEMO_PREFIX.length).trim();
}

export function makeWorkScheduleDietLedgerMemoTag(dietName) {
  const n = String(dietName ?? "").trim();
  if (!n) return "";
  return `${WS_DIET_LEDGER_MEMO_PREFIX}${n}`;
}

/** memo_tags에 lp-meal 을 붙이는 과제명 (과제 기록 모달 식단 체크리스트와 동일 계열) */
export const WS_DIET_LEDGER_TASK_NAMES = new Set([
  "건강한 식사",
  "건강한 식사 준비",
  "건강한 식사준비",
]);

export function ledgerRowLogsDietForWorkSchedule(row) {
  const tn = String(row?.taskName ?? "").trim();
  return WS_DIET_LEDGER_TASK_NAMES.has(tn);
}

/**
 * 해당 날짜·시간가계부 행에 기록된 식단명 집합 (여러 행·여러 태그 합침)
 * @param {any[]} ledgerRows
 * @param {string} ymd YYYY-MM-DD
 */
export function collectDietNamesFromLedgerForDate(ledgerRows, ymd) {
  const dateKey = String(ymd || "").trim().replace(/\//g, "-").slice(0, 10);
  if (dateKey.length < 10) return new Set();
  const out = new Set();
  for (const row of Array.isArray(ledgerRows) ? ledgerRows : []) {
    const rd = String(row?.date ?? "")
      .trim()
      .replace(/\//g, "-")
      .slice(0, 10);
    if (rd !== dateKey) continue;
    if (!ledgerRowLogsDietForWorkSchedule(row)) continue;
    const tags = Array.isArray(row.memoTags) ? row.memoTags : [];
    for (const t of tags) {
      const name = dietNameFromLedgerMemoTag(t);
      if (name) out.add(name);
    }
  }
  return out;
}
