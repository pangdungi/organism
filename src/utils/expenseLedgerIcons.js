/**
 * 가계부 목록 아이콘 — 시간가계부 소비 기록 모달(`EXPENSE_MODAL_CLASSIFICATIONS`)과 동일 경로·스트로크 규격.
 * 입금(수입) 분류는 `public/toolbaricons/bag-dollar.svg` 도안으로 통일.
 */
import { EXPENSE_MODAL_CLASSIFICATIONS } from "../expenseModalClassifications.js";

/** `bag-dollar.svg` 내부 path만 — 시간가계부 분류 버튼 등에서 지출 분류 버튼과 동일 SVG 래퍼로 감쌀 때 사용 */
export const BAG_DOLLAR_PATHS_INNER =
  `<path d="m9 6h6"/><path d="m15.512 5.147 2.488-4.147h-12l2.488 4.147c.274.456.148 1.052-.299 1.341-3.503 2.26-7.189 6.653-7.189 10.609 0 1.282.248 2.283.688 3.073v.05c0-.015.002-.029.003-.044 1.399 2.502 4.781 2.824 8.737 2.824h3.143c5.208 0 9.429-.547 9.429-5.903 0-3.956-3.686-8.349-7.189-10.61-.447-.288-.573-.884-.299-1.34z"/><path d="m12 12v-1.5"/><path d="m12 19.5v-1.5"/><path d="m13.5 12h-2c-.828 0-1.5.672-1.5 1.5 0 .828.672 1.5 1.5 1.5h1c.828 0 1.5.672 1.5 1.5 0 .828-.672 1.5-1.5 1.5h-2.5"/>`;

/** Time.js `makeClsBtn` 과 동일 속성 + 목록 슬롯용 크기 */
function wrapExpenseModalPaths(innerPaths) {
  return `<svg viewBox="0 0 24 24" width="22" height="22" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${innerPaths}</svg>`;
}

/** `bag-dollar.svg` — stroke를 currentColor로 맞춘 목록용 인라인 SVG */
export const EXPENSE_LEDGER_BAG_DOLLAR_SVG = wrapExpenseModalPaths(BAG_DOLLAR_PATHS_INNER);

function svgInner(label) {
  const row = EXPENSE_MODAL_CLASSIFICATIONS.find((o) => o.label === label);
  return row ? row.svg : "";
}

const COIN_SVG = svgInner("예/적금");
const 교육비_SVG = svgInner("교육비");
const 주거비_SVG = svgInner("주거비");
const 보험료_SVG = svgInner("보험료");

/** 모달 그리드에 없는 지출 전용 분류 라벨 → 모달 아이콘 경로 재사용 */
const EXTRA_LABEL_TO_MODAL_PATHS = {
  교육: 교육비_SVG,
  대출상환: COIN_SVG,
  카드대금: 보험료_SVG,
};

const MAP = new Map();
for (const { label, svg } of EXPENSE_MODAL_CLASSIFICATIONS) {
  MAP.set(label, wrapExpenseModalPaths(svg));
}
for (const [label, paths] of Object.entries(EXTRA_LABEL_TO_MODAL_PATHS)) {
  if (!MAP.has(label) && paths) MAP.set(label, wrapExpenseModalPaths(paths));
}

const DEFAULT_ICON = COIN_SVG ? wrapExpenseModalPaths(COIN_SVG) : "";

/**
 * @param {string} label 소비/수입 분류 라벨
 * @param {string} [flowType] 큰분류 — `입금`이면 분류와 무관하게 가방 달러 아이콘
 */
export function getExpenseLedgerIconSvg(label, flowType) {
  if (String(flowType || "").trim() === "입금") {
    return EXPENSE_LEDGER_BAG_DOLLAR_SVG;
  }
  const k = String(label || "").trim();
  return MAP.get(k) || DEFAULT_ICON;
}
