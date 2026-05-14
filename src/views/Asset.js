/**
 * 자산관리 - 순자산(총 부채), 지출입력장, 현금흐름, 자산관리계획
 */

import {
  attachAssetExpensePrefsSaveListener,
  pullAssetExpensePrefsFromSupabase,
  readExpenseClassificationSavedMem,
  syncAssetExpensePrefsToSupabase,
  writeExpenseClassificationSavedMem,
  readExpensePaymentOptionsListMem,
  writeExpensePaymentOptionsListMem,
} from "../utils/assetExpensePrefsSupabase.js";
import {
  attachAssetExpenseTransactionsSaveListener,
  deleteAssetExpenseTransactionsFromSupabase,
  getExpenseRowsMem,
  persistAssetExpensePullBounds,
  pullAssetExpenseTransactionsFromSupabase,
  pullAssetExpenseTransactionsForDateRange,
  setExpenseRowsMem,
} from "../utils/assetExpenseTransactionsSupabase.js";
import { pullAllAssetFromCloud } from "../utils/assetCloudRefresh.js";
import {
  attachAssetNetWorthGoalSaveListener,
  getNetWorthTargetDisplayStrMem,
  setNetWorthTargetDisplayStrMem,
} from "../utils/assetNetWorthTargetSupabase.js";
import {
  attachAssetStockCategoryOptionsSaveListener,
  readStockCategoryCustomLabelsMem,
  writeStockCategoryCustomLabelsMem,
} from "../utils/assetStockCategorySupabase.js";
import {
  attachAssetPlanMonthlyGoalsSaveListener,
  getPlanMonthlyGoalsRowsMem,
  setPlanMonthlyGoalsRowsMem,
} from "../utils/assetPlanMonthlyGoalsSupabase.js";
import {
  attachAssetNetWorthBundleSaveListener,
  readNetWorthBundleKey,
  writeNetWorthBundleKey,
} from "../utils/assetNetWorthBundleSupabase.js";
import {
  readExpenseCategoryOptionsMemRaw,
  writeExpenseCategoryOptionsMemRaw,
  readSavingsGoalOptionsMemRaw,
  writeSavingsGoalOptionsMemRaw,
  readInsuranceKindOptionsMemRaw,
  writeInsuranceKindOptionsMemRaw,
} from "../utils/assetUiSessionMem.js";
import { confirmDeleteRow } from "../utils/confirmModal.js";
import { EXPENSE_MODAL_CLASSIFICATIONS } from "../expenseModalClassifications.js";
import { getExpenseLedgerIconSvg } from "../utils/expenseLedgerIcons.js";
import { showToast } from "../utils/showToast.js";

const DEBT_ROWS_KEY = "asset_debt_rows";
const ASSET_ROWS_KEY = "asset_asset_rows";
const REAL_ESTATE_ROWS_KEY = "asset_real_estate_rows";
const STOCK_ROWS_KEY = "asset_stock_rows";
const INSURANCE_ROWS_KEY = "asset_insurance_rows";
const ANNUITY_ROWS_KEY = "asset_annuity_rows";

/** renderMain으로 패널이 다시 그려져도 가계부/현금흐름 등 하위 탭 유지 (근무표 `lp_work_schedule_subview` 와 동일 패턴) */
const SESSION_ASSET_SUBVIEW_KEY = "lp_asset_subview";
const ASSET_SUBVIEWS = new Set(["expense", "cashflow", "networth", "plan"]);

/** 가계부 거래 추가 + : 할일 줄 `CALENDAR_TOOLBAR_QUICK_ADD_ICON`(시간가계부 +) 과 동일 */
const ASSET_EXPENSE_LEDGER_PLUS_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>';

function readSavedAssetSubView() {
  try {
    if (typeof sessionStorage === "undefined") return null;
    const v = sessionStorage.getItem(SESSION_ASSET_SUBVIEW_KEY);
    if (ASSET_SUBVIEWS.has(v)) return v;
  } catch (_) {}
  return null;
}

function saveAssetSubView(v) {
  if (!ASSET_SUBVIEWS.has(v)) return;
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(SESSION_ASSET_SUBVIEW_KEY, v);
  } catch (_) {}
}

const DEFAULT_STOCK_CATEGORY_OPTIONS = ["미국주식", "국내주식", "ETF", "코인", "현물", "선물"];

function getStockCategoryOptions() {
  const defaults = [...DEFAULT_STOCK_CATEGORY_OPTIONS];
  const custom = readStockCategoryCustomLabelsMem();
  if (custom.length > 0) {
    return [...defaults, ...custom.filter((s) => typeof s === "string" && s.trim() && !defaults.includes(s.trim()))];
  }
  return defaults;
}

function addStockCategoryOption(name) {
  const defaults = DEFAULT_STOCK_CATEGORY_OPTIONS;
  const trimmed = (name || "").trim();
  if (!trimmed || defaults.includes(trimmed)) return getStockCategoryOptions();
  const opts = getStockCategoryOptions();
  if (opts.includes(trimmed)) return opts;
  let custom = readStockCategoryCustomLabelsMem().slice();
  if (!custom.includes(trimmed)) custom.push(trimmed);
  writeStockCategoryCustomLabelsMem(custom);
  window.dispatchEvent(new CustomEvent("asset-stock-category-options-saved"));
  return getStockCategoryOptions();
}

function removeStockCategoryOption(name) {
  if (!name || DEFAULT_STOCK_CATEGORY_OPTIONS.includes(name)) return getStockCategoryOptions();
  const defaults = DEFAULT_STOCK_CATEGORY_OPTIONS;
  const custom = getStockCategoryOptions().filter((o) => !defaults.includes(o) && o !== name);
  writeStockCategoryCustomLabelsMem(custom.filter((o) => !defaults.includes(o)));
  window.dispatchEvent(new CustomEvent("asset-stock-category-options-saved"));
  return getStockCategoryOptions();
}

function isDefaultStockCategory(name) {
  return DEFAULT_STOCK_CATEGORY_OPTIONS.includes(name);
}

const DEFAULT_INSURANCE_KIND_OPTIONS = [
  { label: "실손보험", color: "asset-insurance-kind-blue" },
  { label: "자동차보험", color: "asset-insurance-kind-blue" },
  { label: "운전자보험", color: "asset-insurance-kind-blue" },
  { label: "질병상해보험", color: "asset-insurance-kind-amber" },
  { label: "화재보험", color: "asset-insurance-kind-amber" },
  { label: "종신보험", color: "asset-insurance-kind-amber" },
  { label: "암보험", color: "asset-insurance-kind-purple" },
  { label: "CI보험", color: "asset-insurance-kind-purple" },
];
function getInsuranceKindOptions() {
  const defaults = DEFAULT_INSURANCE_KIND_OPTIONS.map((o) => o.label);
  const raw = readInsuranceKindOptionsMemRaw();
  if (Array.isArray(raw) && raw.length > 0) {
    return [...defaults, ...raw.filter((s) => typeof s === "string" && s.trim() && !defaults.includes(s.trim()))];
  }
  return defaults;
}

function addInsuranceKindOption(name) {
  const defaults = DEFAULT_INSURANCE_KIND_OPTIONS.map((o) => o.label);
  const opts = getInsuranceKindOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.includes(trimmed)) return opts;
  const custom = opts.filter((o) => !defaults.includes(o));
  custom.push(trimmed);
  writeInsuranceKindOptionsMemRaw(custom);
  return getInsuranceKindOptions();
}

function removeInsuranceKindOption(name) {
  if (!name || DEFAULT_INSURANCE_KIND_OPTIONS.some((o) => o.label === name)) return getInsuranceKindOptions();
  const defaults = DEFAULT_INSURANCE_KIND_OPTIONS.map((o) => o.label);
  const custom = getInsuranceKindOptions().filter((o) => !defaults.includes(o) && o !== name);
  writeInsuranceKindOptionsMemRaw(custom.filter((o) => !defaults.includes(o)));
  return getInsuranceKindOptions();
}

function isDefaultInsuranceKind(name) {
  return DEFAULT_INSURANCE_KIND_OPTIONS.some((o) => o.label === name);
}

function getInsuranceKindColor(label) {
  const opt = DEFAULT_INSURANCE_KIND_OPTIONS.find((o) => o.label === label);
  return opt ? opt.color : "asset-insurance-kind-gray";
}

const DEFAULT_DEBT_ROWS_COUNT = 5;
const DEFAULT_ASSET_ROWS_COUNT = 5;
const DEBT_TYPE_OPTIONS = [
  { label: "학자금대출" },
  { label: "마통" },
  { label: "카드할부" },
  { label: "신용대출" },
  { label: "주택담보대출" },
  { label: "기타대출" },
  { label: "신용카드 대금" },
  { label: "친구/가족 빌린 돈" },
];

const REPAYMENT_OPTIONS = [
  "원리금균등상환",
  "원금균등상환",
  "만기일시상환",
  "분할상환",
  "기타",
];

const ASSET_TYPE_OPTIONS = [
  { label: "예적금잔고", color: "asset-asset-type-teal" },
  { label: "주식", color: "asset-asset-type-blue" },
  { label: "펀드", color: "asset-asset-type-green" },
  { label: "부동산", color: "asset-asset-type-purple" },
  { label: "연금적립액", color: "asset-asset-type-orange" },
  { label: "부동산 전월세 보증금", color: "asset-asset-type-pink" },
  { label: "CMA", color: "asset-asset-type-cyan" },
  { label: "청약통장", color: "asset-asset-type-indigo" },
  { label: "RP", color: "asset-asset-type-lime" },
  { label: "발행어음", color: "asset-asset-type-amber" },
  { label: "ETF", color: "asset-asset-type-rose" },
  { label: "채권", color: "asset-asset-type-emerald" },
  { label: "가상자산", color: "asset-asset-type-sky" },
];

const ASSET_CATEGORY_OPTIONS = [
  { label: "현금 및 예금", color: "asset-asset-category-teal" },
  { label: "투자", color: "asset-asset-category-blue" },
  { label: "부동산", color: "asset-asset-category-purple" },
  { label: "소비성자산", color: "asset-asset-category-orange" },
];

const ASSET_GROUP_MAP = {
  예금: ["CMA", "청약통장", "RP", "발행어음"],
  적금: ["예적금잔고"],
  부동산: ["부동산", "부동산 전월세 보증금"],
  주식: ["주식", "펀드", "ETF", "채권", "가상자산"],
  보험: [],
  연금: [],
};

function getAssetGroup(assetType) {
  for (const [group, types] of Object.entries(ASSET_GROUP_MAP)) {
    if (types.includes(assetType)) return group;
  }
  return "예금";
}

const DEFAULT_EXPENSE_CATEGORY_OPTIONS = [
  { label: "고정비", color: "expense-cat-teal" },
  { label: "변동비", color: "expense-cat-blue" },
  { label: "저축", color: "expense-cat-green" },
  { label: "투자", color: "expense-cat-purple" },
  { label: "수입", color: "expense-cat-indigo" },
];

const DEFAULT_EXPENSE_CLASSIFICATION_BY_CATEGORY = {
  고정비: [
    { label: "주거비", color: "expense-cls-teal" },
    { label: "보험료", color: "expense-cls-blue" },
    { label: "통신비", color: "expense-cls-green" },
    { label: "관리비", color: "expense-cls-purple" },
    { label: "구독료", color: "expense-cls-orange" },
    { label: "대출상환", color: "expense-cls-indigo" },
    { label: "교육비", color: "expense-cls-blue" },
    { label: "운동", color: "expense-cls-green" },
  ],
  변동비: [
    { label: "식비", color: "expense-cls-teal" },
    { label: "교통비", color: "expense-cls-blue" },
    { label: "여가/취미", color: "expense-cls-green" },
    { label: "생활용품", color: "expense-cls-purple" },
    { label: "쇼핑", color: "expense-cls-orange" },
    { label: "미용", color: "expense-cls-pink" },
    { label: "의료/건강", color: "expense-cls-indigo" },
    { label: "교육", color: "expense-cls-teal" },
    { label: "카드대금", color: "expense-cls-blue" },
    { label: "세금", color: "expense-cls-green" },
    { label: "경조사", color: "expense-cls-purple" },
    { label: "반려동물", color: "expense-cls-orange" },
    { label: "여행비", color: "expense-cls-pink" },
    { label: "선물비", color: "expense-cls-indigo" },
    { label: "기부/후원", color: "expense-cls-teal" },
  ],
  저축: [
    { label: "예/적금", color: "expense-cls-teal" },
    { label: "비상금통장", color: "expense-cls-blue" },
    { label: "청약통장", color: "expense-cls-green" },
    { label: "연금", color: "expense-cls-purple" },
    { label: "기타계좌", color: "expense-cls-orange" },
  ],
  투자: [
    { label: "국내주식", color: "expense-cls-teal" },
    { label: "해외주식", color: "expense-cls-blue" },
    { label: "ETF", color: "expense-cls-green" },
    { label: "부동산", color: "expense-cls-purple" },
    { label: "기타투자", color: "expense-cls-orange" },
  ],
  수입: [
    { label: "근로소득", color: "expense-cls-teal" },
    { label: "부수입", color: "expense-cls-blue" },
    { label: "용돈", color: "expense-cls-green" },
    { label: "임대소득", color: "expense-cls-purple" },
    { label: "금융수입", color: "expense-cls-orange" },
    { label: "이월", color: "expense-cls-indigo" },
    { label: "기타", color: "expense-cls-gray" },
  ],
};

function getExpenseCategoryOptions() {
  const raw = readExpenseCategoryOptionsMemRaw();
  if (Array.isArray(raw) && raw.length > 0) return raw.map((o) => ({ ...o }));
  return DEFAULT_EXPENSE_CATEGORY_OPTIONS.map((o) => ({ ...o }));
}

function saveExpenseCategoryOptions(arr) {
  writeExpenseCategoryOptionsMemRaw(Array.isArray(arr) ? arr : []);
}

function getExpenseClassificationByCategory() {
  const out = {};
  try {
    const savedRaw = readExpenseClassificationSavedMem();
    const saved = savedRaw && typeof savedRaw === "object" ? savedRaw : null;
    const allCats = new Set([
      ...Object.keys(DEFAULT_EXPENSE_CLASSIFICATION_BY_CATEGORY),
      ...(saved && typeof saved === "object" ? Object.keys(saved) : []),
    ]);
    allCats.forEach((cat) => {
      const savedList = (saved && saved[cat]) ? saved[cat].map((o) => ({ ...o })) : [];
      const defaults = DEFAULT_EXPENSE_CLASSIFICATION_BY_CATEGORY[cat] || [];
      if (defaults.length === 0) {
        out[cat] = savedList;
        return;
      }
      const existingLabels = new Set(savedList.map((x) => x.label));
      const missingDefaults = defaults.filter((d) => !existingLabels.has(d.label)).map((o) => ({ ...o }));
      out[cat] = [...savedList, ...missingDefaults];
    });
    // 고정비: 교통비 제거(변동비만), 건강 관련 → 운동
    if (out.고정비) {
      const has운동 = out.고정비.some((o) => o.label === "운동");
      out.고정비 = out.고정비
        .filter((o) => o.label !== "교통비")
        .map((o) =>
          o.label === "건강 관련"
            ? { label: "운동", color: o.color || "expense-cls-green" }
            : o,
        );
      if (!has운동 && !out.고정비.some((o) => o.label === "운동")) {
        out.고정비.push({ label: "운동", color: "expense-cls-green" });
      }
    }
  } catch (_) {
    Object.keys(DEFAULT_EXPENSE_CLASSIFICATION_BY_CATEGORY).forEach((k) => {
      out[k] = DEFAULT_EXPENSE_CLASSIFICATION_BY_CATEGORY[k].map((o) => ({ ...o }));
    });
  }
  return out;
}

function saveExpenseClassificationByCategory(obj) {
  writeExpenseClassificationSavedMem(obj && typeof obj === "object" ? obj : {});
}

const DEFAULT_SAVINGS_GOAL_OPTIONS = ["전세자금", "여행자금", "결혼자금", "목돈마련", "통장잔고", "현금보관", "생활비", "예비자금", "비상금", "그 외"];

const DEFAULT_PAYMENT_OPTIONS = ["신용카드", "체크카드", "현금"];
function getSavingsGoalOptions() {
  const raw = readSavingsGoalOptionsMemRaw();
  if (Array.isArray(raw) && raw.length > 0) return raw.map((o) => (typeof o === "string" ? o : o.name));
  return [...DEFAULT_SAVINGS_GOAL_OPTIONS];
}

function removeSavingsGoalOption(name) {
  if (!name || DEFAULT_SAVINGS_GOAL_OPTIONS.includes(name)) return getSavingsGoalOptions();
  const opts = getSavingsGoalOptions().filter((o) => o !== name);
  writeSavingsGoalOptionsMemRaw(opts);
  return opts;
}

function isDefaultSavingsGoal(name) {
  return DEFAULT_SAVINGS_GOAL_OPTIONS.includes(name);
}

function getPaymentOptions() {
  const arr = readExpensePaymentOptionsListMem();
  if (Array.isArray(arr) && arr.length > 0) {
    return arr.map((o) => (typeof o === "string" ? o : o.name));
  }
  return [...DEFAULT_PAYMENT_OPTIONS];
}

function addPaymentOption(name) {
  const opts = getPaymentOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.includes(trimmed)) return opts;
  opts.unshift(trimmed);
  writeExpensePaymentOptionsListMem(opts);
  return opts;
}

function removePaymentOption(name) {
  const opts = getPaymentOptions().filter((o) => o !== name);
  writeExpensePaymentOptionsListMem(opts);
  return opts;
}

function savePaymentOptions(opts) {
  const arr = Array.isArray(opts) ? opts.filter((o) => (o || "").trim()) : [];
  writeExpensePaymentOptionsListMem(arr);
  return arr;
}

function isDefaultPaymentOption(name) {
  return DEFAULT_PAYMENT_OPTIONS.includes(name || "");
}

function getExpenseClassificationOptions(category) {
  if (!category) return [];
  const byCat = getExpenseClassificationByCategory();
  return byCat[category] || byCat.기타 || [];
}

/** 분류 → 카테고리 매핑 (소비/수입 분류 선택 시 카테고리 자동 채우기용) */
function getClassificationToCategoryMap() {
  const map = {};
  const byCat = getExpenseClassificationByCategory();
  Object.keys(byCat).forEach((cat) => {
    (byCat[cat] || []).forEach((o) => {
      map[o.label] = cat;
    });
  });
  return map;
}

/** 큰분류(입금/지출)에 따른 소비/수입 분류 옵션: 입금→수입만, 지출→고정비/변동비/저축/투자 */
function getClassificationsByFlowType(flowType) {
  const byCat = getExpenseClassificationByCategory();
  if (flowType === "입금") {
    return (byCat.수입 || []).map((o) => ({ ...o }));
  }
  if (flowType === "지출") {
    const cats = ["고정비", "변동비", "저축", "투자"];
    return cats.flatMap((cat) => (byCat[cat] || []).map((o) => ({ ...o })));
  }
  return [];
}

function loadDebtRows() {
  try {
    const arr = readNetWorthBundleKey(DEBT_ROWS_KEY);
    if (arr !== undefined) {
      /* 빈 배열 [] 도 “대출 없음”으로 유지 (이전: length>0 아니면 기본 5행 → 삭제 후에도 5행 부활) */
      if (Array.isArray(arr)) {
        if (arr.length === 0) return [];
        return arr.map((r) => ({
          ...r,
          debtType: r.debtType ?? "",
          repayment: r.repayment ?? "",
          periodYears: r.periodYears ?? "",
          interestRate: r.interestRate ?? "",
          startDate: r.startDate ?? "",
          endDate: r.endDate ?? "",
          paid: r.paid ?? "",
          extraPaid: r.extraPaid ?? "",
        }));
      }
    }
  } catch (_) {}
  return Array.from({ length: DEFAULT_DEBT_ROWS_COUNT }, () => ({
    name: "",
    debtType: "",
    repayment: "",
    periodYears: "",
    interestRate: "",
    principal: "",
    startDate: "",
    endDate: "",
    paid: "",
    extraPaid: "",
  }));
}

function saveDebtRows(rows) {
  writeNetWorthBundleKey(DEBT_ROWS_KEY, rows);
}

function readDebtDataFromTr(tr) {
  const nameInput = tr.querySelector(".asset-debt-input-name");
  const debtTypeInput = tr.querySelector(".asset-debt-input-type");
  const repaymentInput = tr.querySelector(".asset-debt-input-repayment");
  const periodInput = tr.querySelector(".asset-debt-input-period");
  const rateInput = tr.querySelector(".asset-debt-input-rate");
  const principalInput = tr.querySelector(".asset-debt-input-principal");
  const startDateInput = tr.querySelector(".asset-debt-input-start-date");
  const endDateInput = tr.querySelector(".asset-debt-input-end-date");
  const paidDisplay = tr.querySelector(".asset-debt-paid-display");
  const extraPaidInput = tr.querySelector(".asset-debt-input-extra-paid");
  return {
    name: nameInput?.value || "",
    debtType: debtTypeInput?.value || "",
    repayment: repaymentInput?.value || "",
    periodYears: periodInput?.value || "",
    interestRate: rateInput?.value || "",
    principal: principalInput?.value || "",
    startDate: startDateInput?.value || "",
    endDate: endDateInput?.value || "",
    paid: paidDisplay?.textContent?.trim() && paidDisplay.textContent !== "-" ? paidDisplay.textContent.trim() : "",
    extraPaid: extraPaidInput?.value || "",
  };
}

function collectDebtRowsFromDOM(tableEl) {
  const rows = [];
  const tbl = tableEl?.querySelector?.("table") || tableEl;
  if (!tbl) return rows;
  tbl.querySelectorAll("tbody > tr.asset-debt-row").forEach((tr) => {
    if (tr.classList.contains("asset-debt-row--draft")) return;
    rows.push(readDebtDataFromTr(tr));
  });
  return rows;
}

function loadAssetRows() {
  try {
    const arr = readNetWorthBundleKey(ASSET_ROWS_KEY);
    if (arr !== undefined && Array.isArray(arr)) {
      if (arr.length === 0) return [];
      return arr.map((r) => ({
        ...r,
        assetType: r.assetType ?? "",
        assetCategory: r.assetCategory ?? "",
        principal: r.principal ?? "",
        monthly: r.monthly ?? "",
        rate: r.rate ?? "",
        months: r.months ?? "",
        openDate: r.openDate ?? "",
        maturityDate: r.maturityDate ?? "",
        matured: r.matured === true,
      }));
    }
  } catch (_) {}
  return Array.from({ length: DEFAULT_ASSET_ROWS_COUNT }, () => ({
    name: "",
    assetType: "",
    assetCategory: "",
    principal: "",
    monthly: "",
    rate: "",
    months: "",
    openDate: "",
    maturityDate: "",
    matured: false,
  }));
}

function saveAssetRows(rows) {
  writeNetWorthBundleKey(ASSET_ROWS_KEY, rows);
}

function loadRealEstateRows() {
  try {
    const arr = readNetWorthBundleKey(REAL_ESTATE_ROWS_KEY);
    if (Array.isArray(arr)) return arr;
  } catch (_) {}
  return [];
}

function loadStockRows() {
  try {
    const arr = readNetWorthBundleKey(STOCK_ROWS_KEY);
    if (Array.isArray(arr)) return arr;
  } catch (_) {}
  return [];
}

function saveStockRows(rows) {
  writeNetWorthBundleKey(STOCK_ROWS_KEY, rows);
}

function loadInsuranceRows() {
  try {
    const arr = readNetWorthBundleKey(INSURANCE_ROWS_KEY);
    if (Array.isArray(arr)) return arr;
  } catch (_) {}
  return [];
}

function saveInsuranceRows(rows) {
  writeNetWorthBundleKey(INSURANCE_ROWS_KEY, rows);
}

function loadAnnuityRows() {
  try {
    const arr = readNetWorthBundleKey(ANNUITY_ROWS_KEY);
    if (Array.isArray(arr)) return arr;
  } catch (_) {}
  return [];
}

function saveAnnuityRows(rows) {
  writeNetWorthBundleKey(ANNUITY_ROWS_KEY, rows);
}

function collectStockRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".asset-asset-row-stock").forEach((tr) => {
    const nameInput = tr.querySelector(".asset-stock-input-name");
    const categoryInput = tr.querySelector(".asset-stock-input-category");
    const currentPriceInput = tr.querySelector(".asset-stock-input-current-price");
    const avgPriceInput = tr.querySelector(".asset-stock-input-avg-price");
    const quantityInput = tr.querySelector(".asset-stock-input-quantity");
    const holdingInput = tr.querySelector(".asset-stock-input-holding");
    rows.push({
      name: nameInput?.value || "",
      category: categoryInput?.value || "",
      currentPrice: currentPriceInput?.value || "",
      avgPrice: avgPriceInput?.value || "",
      quantity: quantityInput?.value || "",
      holdingStatus: holdingInput?.value || "보유중",
    });
  });
  return rows;
}

function collectInsuranceRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".asset-asset-row-insurance").forEach((tr) => {
    rows.push({
      name: tr.querySelector(".asset-insurance-input-name")?.value || "",
      kind: tr.querySelector(".asset-insurance-input-kind")?.value || "",
      contractDate: tr.querySelector(".asset-insurance-input-contract-date")?.value || "",
      maturityDate: tr.querySelector(".asset-insurance-input-maturity-date")?.value || "",
      monthly: tr.querySelector(".asset-insurance-input-monthly")?.value || "",
      surrenderValue: tr.querySelector(".asset-insurance-input-surrender")?.value || "",
      coverage: tr.querySelector(".asset-insurance-input-coverage")?.value || "",
    });
  });
  return rows;
}

function collectAnnuityRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".asset-asset-row-annuity").forEach((tr) => {
    rows.push({
      name: tr.querySelector(".asset-annuity-input-name")?.value || "",
      kind: tr.querySelector(".asset-annuity-input-kind")?.value || "",
      paymentStartDate: tr.querySelector(".asset-annuity-input-payment-start")?.value || "",
      paymentEndDate: tr.querySelector(".asset-annuity-input-payment-end")?.value || "",
      monthly: tr.querySelector(".asset-annuity-input-monthly")?.value || "",
      receiptStartDate: tr.querySelector(".asset-annuity-input-receipt-start")?.value || "",
      monthlyReceipt: tr.querySelector(".asset-annuity-input-monthly-receipt")?.value || "",
    });
  });
  return rows;
}

function saveRealEstateRows(rows) {
  writeNetWorthBundleKey(REAL_ESTATE_ROWS_KEY, rows);
}

function loadNetWorthTarget() {
  return getNetWorthTargetDisplayStrMem();
}

function saveNetWorthTarget(value) {
  setNetWorthTargetDisplayStrMem(value);
  window.dispatchEvent(new CustomEvent("asset-networth-target-saved"));
}

function newExpenseRowId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "";
}

const EXPENSE_ROW_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function loadExpenseRows() {
  const uuidRe = EXPENSE_ROW_UUID_RE;
  const arr = getExpenseRowsMem();
  if (arr.length === 0) return [];
  let needSave = false;
  const out = arr.map((r) => {
    if (typeof r !== "object" || !r) return r;
    const id = String(r.id || "").trim();
    if (!id || !uuidRe.test(id)) {
      needSave = true;
      return { ...r, id: newExpenseRowId() };
    }
    return r;
  });
  if (needSave) {
    setExpenseRowsMem(out);
    try {
      window.dispatchEvent(new CustomEvent("asset-expense-transactions-saved"));
    } catch (_) {}
  }
  return out;
}

function saveExpenseRows(rows) {
  setExpenseRowsMem(rows);
}

function collectExpenseRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".asset-expense-row").forEach((tr) => {
    if (tr.classList.contains("asset-expense-row--draft")) return;
    if (tr.classList.contains("asset-expense-row--editing")) {
      const id = (tr.dataset.assetExpenseRowId || "").trim();
      if (id && EXPENSE_ROW_UUID_RE.test(id)) {
        const mem = loadExpenseRows().find((r) => String(r.id) === id);
        if (mem) {
          rows.push({ ...mem });
          return;
        }
      }
    }
    rows.push(readExpenseDataFromTr(tr));
  });
  return rows;
}

function readRealEstateDataFromTr(tr) {
  const contractInput = tr.querySelector(".asset-asset-input-contract");
  const salePriceInput = tr.querySelector(".asset-asset-input-sale-price");
  const loanInput = tr.querySelector(".asset-asset-input-loan");
  return {
    contract: contractInput?.value || "",
    salePrice: salePriceInput?.value || "",
    loan: loanInput?.value || "",
  };
}

function collectRealEstateRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".asset-asset-row-real-estate").forEach((tr) => {
    if (tr.classList.contains("asset-asset-row--draft")) return;
    rows.push(readRealEstateDataFromTr(tr));
  });
  return rows;
}

function collectAssetRowsFromDOM(tableEl) {
  const rows = [];
  tableEl
    ?.querySelectorAll(
      ".asset-asset-row:not(.asset-asset-row-real-estate):not(.asset-asset-row-stock):not(.asset-asset-row-insurance):not(.asset-asset-row-annuity)",
    )
    .forEach((tr) => {
    const nameInput = tr.querySelector(".asset-asset-input-name");
    const principalInput = tr.querySelector(".asset-asset-input-principal");
    const monthlyInput = tr.querySelector(".asset-asset-input-monthly");
    const rateInput = tr.querySelector(".asset-asset-input-rate");
    const monthsInput = tr.querySelector(".asset-asset-input-months");
    const openDateInput = tr.querySelector(".asset-asset-input-open-date");
    const maturityDateInput = tr.querySelector(".asset-asset-input-maturity-date");
    const isSavings = tr.dataset.savings === "true";
    let assetType = "";
    let assetCategory = "";
    if (isSavings) {
      assetType = tr.querySelector(".asset-asset-input-type")?.value || "예적금잔고";
      assetCategory = tr.querySelector(".asset-asset-input-savings-goal")?.value || "";
    } else {
      assetType = tr.querySelector(".asset-asset-input-type")?.value || "";
      assetCategory = tr.querySelector(".asset-asset-input-category")?.value || "";
    }
    rows.push({
      name: nameInput?.value || "",
      assetType,
      assetCategory,
      principal: principalInput?.value || "",
      monthly: monthlyInput?.value || "",
      rate: rateInput?.value || "",
      months: monthsInput?.value || "",
      openDate: openDateInput?.value || "",
      maturityDate: maturityDateInput?.value || "",
      matured: tr.dataset.matured === "true",
    });
  });
  return rows;
}

/** 소비 기록 모달과 동일 라벨 → 아이콘 path (가계부 거래 분류 패널 지출 그리드용) */
const EXPENSE_MODAL_CLASSIFICATION_BY_LABEL = new Map(
  EXPENSE_MODAL_CLASSIFICATIONS.map((o) => [o.label, o]),
);

/** 다른 드롭다운 패널 모두 닫기 (겹침 방지) */
function closeAllDebtDropdownPanels(exceptPanel = null) {
  const selectors =
    ".asset-debt-type-panel, .asset-debt-repayment-panel, .asset-stock-category-panel, .asset-insurance-kind-panel, .asset-asset-type-panel, .asset-asset-category-panel, .asset-asset-savings-goal-panel, .asset-expense-flow-type-panel, .asset-expense-category-panel, .asset-expense-classification-panel, .asset-expense-payment-panel, .asset-plan-category-panel";
  document.querySelectorAll(selectors).forEach((p) => {
    if (p !== exceptPanel) p.hidden = true;
  });
}

let _scrollCloseHandlerAttached = false;
const DROPDOWN_PANEL_SELECTOR =
  ".asset-debt-type-panel, .asset-debt-repayment-panel, .asset-stock-category-panel, .asset-insurance-kind-panel, .asset-asset-type-panel, .asset-asset-category-panel, .asset-asset-savings-goal-panel, .asset-expense-flow-type-panel, .asset-expense-category-panel, .asset-expense-classification-panel, .asset-expense-payment-panel, .asset-plan-category-panel";
/** 스크롤 시 열린 옵션창 자동 닫기 (스크롤 따라 올라가는 현상 방지) - 단, 옵션창 내부 스크롤 시에는 닫지 않음 */
function setupScrollClosePanels() {
  if (_scrollCloseHandlerAttached) return;
  _scrollCloseHandlerAttached = true;
  document.addEventListener(
    "scroll",
    (e) => {
      if (e.target?.closest?.(DROPDOWN_PANEL_SELECTOR)) return;
      closeAllDebtDropdownPanels();
    },
    true
  );
}

/** 부채유형 드롭다운 - 상환방식과 동일한 회색계열 스타일 */
function createDebtTypeDropdown(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "asset-debt-type-wrap";

  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-debt-input-type";
  input.value = initialValue;

  const display = document.createElement("span");
  display.className = "asset-debt-type-display";

  function updateDisplay() {
    const val = input.value || "";
    display.textContent = val || "선택";
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      updatePanelPosition();
      panel.hidden = false;
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target)) panel.hidden = true;
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      panel.hidden = true;
    }
  });

  const panel = document.createElement("div");
  panel.className = "asset-debt-type-panel";
  panel.hidden = true;

  function updatePanelPosition() {
    const rect = display.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 180)}px`;
  }

  DEBT_TYPE_OPTIONS.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-debt-type-option";
    row.textContent = opt.label;
    row.addEventListener("click", () => {
      input.value = opt.label;
      updateDisplay();
      panel.hidden = true;
      onUpdate?.();
    });
    panel.appendChild(row);
  });

  updateDisplay();
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return wrap;
}

/** 상환방식 드롭다운 */
function createDebtRepaymentDropdown(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "asset-debt-repayment-wrap";

  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-debt-input-repayment";
  input.value = initialValue;

  const display = document.createElement("span");
  display.className = "asset-debt-repayment-display";

  function updateDisplay() {
    const val = input.value || "";
    display.textContent = val || "선택";
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      updatePanelPosition();
      panel.hidden = false;
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target)) panel.hidden = true;
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      panel.hidden = true;
    }
  });

  const panel = document.createElement("div");
  panel.className = "asset-debt-repayment-panel";
  panel.hidden = true;

  function updatePanelPosition() {
    const rect = display.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 140)}px`;
  }

  REPAYMENT_OPTIONS.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-debt-repayment-option";
    row.textContent = opt;
    row.addEventListener("click", () => {
      input.value = opt;
      updateDisplay();
      panel.hidden = true;
      onUpdate?.();
    });
    panel.appendChild(row);
  });

  updateDisplay();
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return wrap;
}

/** 자산유형 드롭다운 - 고정 옵션, 파스텔 pill 스타일 */
function createAssetTypeDropdown(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "asset-asset-type-wrap";

  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-asset-input-type";
  input.value = initialValue;

  const display = document.createElement("span");
  display.className = "asset-asset-type-display";

  function getColorClass(val) {
    const opt = ASSET_TYPE_OPTIONS.find((o) => o.label === val);
    return opt ? opt.color : "";
  }

  function updateDisplay() {
    const val = input.value || "";
    display.textContent = val || "선택";
    display.className = "asset-asset-type-display " + getColorClass(val);
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      updatePanelPosition();
      panel.hidden = false;
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target)) panel.hidden = true;
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      panel.hidden = true;
    }
  });

  const panel = document.createElement("div");
  panel.className = "asset-asset-type-panel";
  panel.hidden = true;

  function updatePanelPosition() {
    const rect = display.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 180)}px`;
  }

  const sep = document.createElement("div");
  sep.className = "asset-asset-type-separator";
  sep.textContent = "—";
  panel.appendChild(sep);

  ASSET_TYPE_OPTIONS.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-asset-type-option";
    row.innerHTML = `<span class="asset-asset-type-tag ${opt.color}">${opt.label}</span>`;
    row.addEventListener("click", () => {
      input.value = opt.label;
      updateDisplay();
      panel.hidden = true;
      onUpdate?.();
    });
    panel.appendChild(row);
  });

  updateDisplay();
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return wrap;
}

/** 자산 구분 드롭다운 - 현금 및 예금 / 투자 / 부동산 / 소비성자산 */
function createAssetCategoryDropdown(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "asset-asset-category-wrap";

  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-asset-input-category";
  input.value = initialValue;

  const display = document.createElement("span");
  display.className = "asset-asset-category-display";

  function getColorClass(val) {
    const opt = ASSET_CATEGORY_OPTIONS.find((o) => o.label === val);
    return opt ? opt.color : "";
  }

  function updateDisplay() {
    const val = input.value || "";
    display.textContent = val || "선택";
    display.className = "asset-asset-category-display " + getColorClass(val);
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      updatePanelPosition();
      panel.hidden = false;
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target)) panel.hidden = true;
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      panel.hidden = true;
    }
  });

  const panel = document.createElement("div");
  panel.className = "asset-asset-category-panel";
  panel.hidden = true;

  function updatePanelPosition() {
    const rect = display.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 180)}px`;
  }

  const sep = document.createElement("div");
  sep.className = "asset-asset-category-separator";
  sep.textContent = "—";
  panel.appendChild(sep);

  ASSET_CATEGORY_OPTIONS.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-asset-category-option";
    row.innerHTML = `<span class="asset-asset-category-tag ${opt.color}">${opt.label}</span>`;
    row.addEventListener("click", () => {
      input.value = opt.label;
      updateDisplay();
      panel.hidden = true;
      onUpdate?.();
    });
    panel.appendChild(row);
  });

  updateDisplay();
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return wrap;
}

/** 주식분류 드롭다운 - 기본 6종 + 하단에서 Enter로 사용자 추가(예금·적금 용도와 다름). 사용자 추가분은 삭제 가능 */
function createStockCategoryDropdown(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "asset-stock-category-wrap";
  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-stock-input-category";
  input.value = initialValue;
  const display = document.createElement("span");
  display.className = "asset-stock-category-display";

  function updateDisplay() {
    const val = input.value || "";
    display.textContent = val || "선택";
    display.className = "asset-stock-category-display";
  }

  const panel = document.createElement("div");
  panel.className = "asset-stock-category-panel";
  panel.hidden = true;

  function buildPanel() {
    panel.innerHTML = "";
    getStockCategoryOptions().forEach((label) => {
      const row = document.createElement("div");
      row.className = "asset-stock-category-option";
      const lbl = document.createElement("span");
      lbl.className = "asset-stock-category-option-label";
      lbl.textContent = label;
      lbl.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = label;
        updateDisplay();
        panel.hidden = true;
        onUpdate?.();
      });
      row.appendChild(lbl);
      if (!isDefaultStockCategory(label)) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "asset-stock-category-option-delete";
        delBtn.title = "삭제";
        delBtn.setAttribute("aria-label", "삭제");
        delBtn.innerHTML =
          '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeStockCategoryOption(label);
          buildPanel();
          onUpdate?.();
        });
        row.appendChild(delBtn);
      }
      panel.appendChild(row);
    });
    const addRow = document.createElement("div");
    addRow.className = "asset-stock-category-add";
    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.placeholder = "추가 입력 후 Enter";
    addInput.className = "asset-stock-category-add-input";
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = (addInput.value || "").trim();
        if (val) {
          addStockCategoryOption(val);
          input.value = val;
          updateDisplay();
          addInput.value = "";
          buildPanel();
          onUpdate?.();
        }
      }
    });
    addRow.appendChild(addInput);
    panel.appendChild(addRow);
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      buildPanel();
      const rect = display.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 2}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.minWidth = `${Math.max(rect.width, 140)}px`;
      document.body.appendChild(panel);
      panel.hidden = false;
      const handler = (ev) => {
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) {
          document.removeEventListener("click", handler);
          panel.hidden = true;
        }
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      panel.hidden = true;
    }
  });

  updateDisplay();
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return wrap;
}

/** 보험종류 드롭다운 - 실손보험, CI보험 등 + 사용자 추가 */
function createInsuranceKindDropdown(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "asset-insurance-kind-wrap";
  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-insurance-input-kind";
  input.value = initialValue;
  const display = document.createElement("span");
  display.className = "asset-insurance-kind-display";

  function updateDisplay() {
    const val = input.value || "";
    display.textContent = val || "선택";
    display.className = "asset-insurance-kind-display" + (val ? " " + getInsuranceKindColor(val) : "");
  }

  const panel = document.createElement("div");
  panel.className = "asset-insurance-kind-panel";
  panel.hidden = true;

  function buildPanel() {
    panel.innerHTML = "";
    const titleRow = document.createElement("div");
    titleRow.className = "asset-insurance-kind-panel-title";
    titleRow.textContent = "옵션 선택 또는 생성";
    panel.appendChild(titleRow);
    getInsuranceKindOptions().forEach((label) => {
      const row = document.createElement("div");
      row.className = "asset-insurance-kind-option";
      const tag = document.createElement("span");
      tag.className = "asset-insurance-kind-tag " + getInsuranceKindColor(label);
      tag.textContent = label;
      tag.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = label;
        updateDisplay();
        panel.hidden = true;
        onUpdate?.();
      });
      row.appendChild(tag);
      if (!isDefaultInsuranceKind(label)) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "asset-insurance-kind-option-delete";
        delBtn.title = "삭제";
        delBtn.innerHTML =
          '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeInsuranceKindOption(label);
          buildPanel();
          onUpdate?.();
        });
        row.appendChild(delBtn);
      }
      panel.appendChild(row);
    });
    const addRow = document.createElement("div");
    addRow.className = "asset-insurance-kind-add";
    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.placeholder = "추가 입력 후 Enter";
    addInput.className = "asset-insurance-kind-add-input";
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = (addInput.value || "").trim();
        if (val) {
          addInsuranceKindOption(val);
          input.value = val;
          updateDisplay();
          addInput.value = "";
          buildPanel();
          onUpdate?.();
        }
      }
    });
    addRow.appendChild(addInput);
    panel.appendChild(addRow);
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      buildPanel();
      const rect = display.getBoundingClientRect();
      panel.style.position = "fixed";
      panel.style.top = `${rect.bottom + 2}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.minWidth = `${Math.max(rect.width, 160)}px`;
      document.body.appendChild(panel);
      panel.hidden = false;
      const handler = (ev) => {
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) {
          document.removeEventListener("click", handler);
          panel.hidden = true;
        }
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      panel.hidden = true;
    }
  });

  updateDisplay();
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return wrap;
}

/** 예적금 용도 드롭다운 - 기본 목록만 (예금·적금 공통, 임의 추가 없음) */
function createSavingsGoalDropdown(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "asset-asset-savings-goal-wrap";

  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-asset-input-savings-goal";
  input.value = initialValue;

  const display = document.createElement("span");
  display.className = "asset-asset-savings-goal-display";

  function updateDisplay() {
    const val = input.value || "";
    display.textContent = val || "선택";
  }

  const panel = document.createElement("div");
  panel.className = "asset-asset-savings-goal-panel";
  panel.hidden = true;

  function buildPanel() {
    panel.innerHTML = "";
    const opts = getSavingsGoalOptions();
    opts.forEach((opt) => {
      const row = document.createElement("div");
      row.className = "asset-asset-savings-goal-option";
      const label = document.createElement("span");
      label.className = "asset-asset-savings-goal-option-label";
      label.textContent = opt;
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = opt;
        updateDisplay();
        panel.hidden = true;
        onUpdate?.();
      });
      row.appendChild(label);
      if (!isDefaultSavingsGoal(opt)) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "asset-asset-savings-goal-option-delete";
        delBtn.title = "삭제";
        delBtn.innerHTML =
          '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeSavingsGoalOption(opt);
          buildPanel();
          onUpdate?.();
        });
        row.appendChild(delBtn);
      }
      panel.appendChild(row);
    });
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      buildPanel();
      const rect = display.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 2}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.minWidth = `${Math.max(rect.width, 140)}px`;
      document.body.appendChild(panel);
      panel.hidden = false;
      const handler = (ev) => {
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) {
          document.removeEventListener("click", handler);
          panel.hidden = true;
        }
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      panel.hidden = true;
    }
  });

  updateDisplay();
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return wrap;
}

/** 지출입력장 카테고리 드롭다운 - 고정비, 변동비, 저축, 투자, 기타 */
/** 큰분류 드롭다운 - 선택 → 지출(적색) / 입금(청색) */
function createExpenseFlowTypeDropdown(initialValue, onUpdate) {
  const FLOW_OPTIONS = [
    { label: "지출", value: "지출", color: "asset-flow-expense" },
    { label: "입금", value: "입금", color: "asset-flow-deposit" },
  ];
  const wrap = document.createElement("div");
  wrap.className = "asset-expense-flow-type-wrap";

  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-expense-input-flow-type";
  input.value = initialValue || "";

  const display = document.createElement("span");
  display.className = "asset-expense-flow-type-display";

  function updateDisplay() {
    const val = input.value || "";
    display.textContent = val || "선택";
    const opt = FLOW_OPTIONS.find((o) => o.value === val);
    display.className = "asset-expense-flow-type-display " + (opt ? opt.color : "");
  }

  const panel = document.createElement("div");
  panel.className = "asset-expense-flow-type-panel";
  panel.hidden = true;

  function updatePanelPosition() {
    const rect = display.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 100)}px`;
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      updatePanelPosition();
      document.body.appendChild(panel);
      panel.hidden = false;
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) {
          panel.hidden = true;
        }
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      panel.hidden = true;
    }
  });

  FLOW_OPTIONS.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-expense-flow-type-option " + opt.color;
    row.textContent = opt.label;
    row.addEventListener("click", () => {
      input.value = opt.value;
      updateDisplay();
      panel.hidden = true;
      onUpdate?.();
    });
    panel.appendChild(row);
  });

  updateDisplay();
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return wrap;
}

function createExpenseCategoryDropdown(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "asset-expense-category-wrap";

  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-expense-input-category";
  input.value = initialValue;

  const display = document.createElement("span");
  display.className = "asset-expense-category-display";

  function getColorClass(val) {
    const opt = getExpenseCategoryOptions().find((o) => o.label === val);
    return opt ? opt.color : "";
  }

  function updateDisplay() {
    const val = input.value || "";
    display.textContent = val || "선택";
    display.className = "asset-expense-category-display " + getColorClass(val);
  }

  const panel = document.createElement("div");
  panel.className = "asset-expense-category-panel";
  panel.hidden = true;

  function updatePanelPosition() {
    const rect = display.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 160)}px`;
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      updatePanelPosition();
      document.body.appendChild(panel);
      panel.hidden = false;
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) {
          panel.hidden = true;
        }
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      panel.hidden = true;
    }
  });

  getExpenseCategoryOptions().forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-expense-category-option";
    row.innerHTML = `<span class="asset-expense-category-tag ${opt.color}">${opt.label}</span>`;
    row.addEventListener("click", () => {
      input.value = opt.label;
      updateDisplay();
      panel.hidden = true;
      onUpdate?.();
    });
    panel.appendChild(row);
  });

  updateDisplay();
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return wrap;
}

/** 지출입력장 소비/수입 분류 드롭다운 - 큰분류(입금/지출)에 따라 옵션 변경, 선택 시 카테고리 자동 채움 */
function createExpenseClassificationDropdownByFlowType(initialFlowType, initialClassification, initialCategory, onSelect) {
  const wrap = document.createElement("div");
  wrap.className = "asset-expense-classification-wrap";

  const classificationInput = document.createElement("input");
  classificationInput.type = "hidden";
  classificationInput.className = "asset-expense-input-classification";
  classificationInput.value = initialClassification || "";

  const categoryInput = document.createElement("input");
  categoryInput.type = "hidden";
  categoryInput.className = "asset-expense-input-category";
  categoryInput.value = initialCategory || "";

  const display = document.createElement("span");
  display.className = "asset-expense-classification-display";

  let flowType = initialFlowType || "";
  const clsToCat = getClassificationToCategoryMap();

  const svgStrokeOpen =
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">';

  function getColorClass(val) {
    const category = clsToCat[val] || "";
    return getExpenseCategoryOptions().find((o) => o.label === category)?.color || "";
  }

  function updateDisplay() {
    const val = classificationInput.value || "";
    display.textContent = val || "선택";
    const canSelect = flowType === "입금" || flowType === "지출";
    display.className = "asset-expense-classification-display " + (canSelect ? "" : "is-disabled ") + getColorClass(val);
  }

  const panel = document.createElement("div");
  panel.className = "asset-expense-classification-panel";
  panel.hidden = true;

  let closeHandler = null;

  function detachCloseHandler() {
    if (closeHandler) {
      document.removeEventListener("mousedown", closeHandler, true);
      closeHandler = null;
    }
  }

  function hideClassificationPanel() {
    panel.hidden = true;
    panel.style.maxHeight = "";
    panel.style.overflow = "";
    panel.style.overflowY = "";
    panel.classList.remove("asset-expense-classification-panel--modal-popover");
    detachCloseHandler();
  }

  function getCategoryColorClass(category) {
    const opt = getExpenseCategoryOptions().find((o) => o.label === category);
    return opt ? opt.color : "expense-cat-teal";
  }

  /** 새 거래 모달·인라인 패널 안에서 고정 배치 및 높이(모달에서는 스크롤 없이 안에 맞춤) */
  function syncPanelFixedPosition() {
    const trxShell = wrap.closest(".asset-expense-transaction-modal-panel-shell");
    const shell = trxShell || wrap.closest(".asset-expense-inline-panel") || null;
    const rect = display.getBoundingClientRect();
    const pad = 10;
    let left = rect.left;
    let width = Math.max(rect.width, 200);

    if (shell) {
      const sr = shell.getBoundingClientRect();
      const minLeft = sr.left + pad;
      const maxRight = sr.right - pad;
      let candidateLeft = left;
      let candidateW = width;
      if (candidateLeft + candidateW > maxRight) {
        candidateW = Math.max(160, maxRight - Math.max(candidateLeft, minLeft));
      }
      if (candidateLeft < minLeft) candidateLeft = minLeft;
      if (candidateLeft + candidateW > maxRight) {
        candidateLeft = Math.max(minLeft, maxRight - candidateW);
      }
      width = candidateW;
      left = candidateLeft;
      const isExpensePopover =
        trxShell &&
        panel.classList.contains("asset-expense-classification-panel--expense-icons");
      if (isExpensePopover) {
        panel.style.maxHeight = "";
        panel.style.overflow = "visible";
        panel.style.overflowY = "visible";
        panel.classList.add("asset-expense-classification-panel--modal-popover");
        left = minLeft;
        width = Math.max(candidateW, maxRight - minLeft);
      } else {
        panel.classList.remove("asset-expense-classification-panel--modal-popover");
        const bottomSpace = sr.bottom - rect.bottom - 10;
        panel.style.maxHeight = `${Math.max(120, Math.floor(Math.min(bottomSpace, window.innerHeight * 0.52)))}px`;
        panel.style.overflow = "";
        panel.style.overflowY = "";
      }
    } else {
      panel.classList.remove("asset-expense-classification-panel--modal-popover");
      panel.style.maxHeight = "";
      panel.style.overflow = "";
      panel.style.overflowY = "";
      const vwPad = 12;
      width = Math.min(width, window.innerWidth - vwPad * 2);
      left = Math.min(Math.max(vwPad, left), window.innerWidth - vwPad - width);
    }

    panel.style.position = "fixed";
    panel.style.left = `${Math.round(left)}px`;
    const tentativeTop = rect.bottom + 2;
    panel.style.top = `${Math.round(tentativeTop)}px`;
    panel.style.width = `${Math.round(width)}px`;
    panel.style.right = "auto";
    panel.style.minWidth = "";
    panel.style.maxWidth = "";
    panel.style.boxSizing = "border-box";

    const isExpenseModalPop =
      trxShell &&
      panel.classList.contains("asset-expense-classification-panel--expense-icons") &&
      panel.classList.contains("asset-expense-classification-panel--modal-popover");
    if (isExpenseModalPop && shell) {
      const vwPad = 8;
      const finish = () => {
        const sr = shell.getBoundingClientRect();
        const availBot = Math.min(sr.bottom, window.innerHeight - vwPad);
        const availTop = Math.max(sr.top, vwPad) + vwPad;
        const bh = panel.getBoundingClientRect().height;
        let topPx = rect.bottom + 2;
        const fitsBelow = topPx + bh <= availBot + 1;
        if (!fitsBelow) {
          const aboveCandidate = rect.top - 2 - bh;
          if (aboveCandidate >= availTop) {
            topPx = aboveCandidate;
          } else {
            topPx = Math.min(topPx, Math.max(availTop, availBot - bh));
          }
        }
        if (topPx < availTop) topPx = availTop;
        panel.style.top = `${Math.round(topPx)}px`;
      };
      requestAnimationFrame(() => requestAnimationFrame(finish));
    }
  }

  function bindOptionClose(btn, optLabel, category) {
    btn.addEventListener("mousedown", (e) => e.stopPropagation());
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      classificationInput.value = optLabel;
      categoryInput.value = category;
      updateDisplay();
      hideClassificationPanel();
      onSelect?.(optLabel, category);
    });
  }

  function buildPanel() {
    panel.innerHTML = "";
    panel.className = "asset-expense-classification-panel";

    const opts = getClassificationsByFlowType(flowType);

    if (flowType === "입금") {
      panel.classList.add("asset-expense-classification-panel--income-list");
      opts.forEach((opt) => {
        const category = clsToCat[opt.label] || "";
        const row = document.createElement("button");
        row.type = "button";
        row.className = "asset-expense-classification-dropdown-text-row";
        row.textContent = opt.label;
        bindOptionClose(row, opt.label, category);
        panel.appendChild(row);
      });
      return;
    }

    if (flowType === "지출") {
      panel.classList.add("asset-expense-classification-panel--expense-icons");
      opts.forEach((opt) => {
        const category = clsToCat[opt.label] || "";
        const modalOpt = EXPENSE_MODAL_CLASSIFICATION_BY_LABEL.get(opt.label);
        const btn = document.createElement("button");
        btn.type = "button";
        const colorCls = opt.color || getCategoryColorClass(category);
        btn.className = "asset-expense-classification-expense-icon-btn " + colorCls;
        if (modalOpt?.svg) {
          btn.classList.add("asset-expense-classification-expense-icon-btn--has-icon");
          btn.innerHTML =
            `<span class="asset-expense-classification-expense-icon" aria-hidden="true">${svgStrokeOpen}${modalOpt.svg}</svg></span>` +
            `<span class="asset-expense-classification-expense-label">${escapeHtml(opt.label)}</span>`;
        } else {
          btn.classList.add("asset-expense-classification-expense-icon-btn--text-only");
          btn.textContent = opt.label;
        }
        bindOptionClose(btn, opt.label, category);
        panel.appendChild(btn);
      });
    }
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      document.body.appendChild(panel);

      if (flowType !== "입금" && flowType !== "지출") {
        panel.className = "asset-expense-classification-panel asset-expense-classification-panel--hint-only";
        panel.innerHTML =
          '<p class="asset-expense-classification-hint">큰 분류(지출/입금)를 먼저 선택해 주세요.</p>';
        syncPanelFixedPosition();
        panel.hidden = false;
        closeHandler = (ev) => {
          if (panel.hidden) return;
          const inWrap = wrap.contains(ev.target);
          const inPanel = panel.contains(ev.target);
          if (!inWrap && !inPanel) hideClassificationPanel();
        };
        setTimeout(() => document.addEventListener("mousedown", closeHandler, true), 0);
        return;
      }

      buildPanel();
      syncPanelFixedPosition();
      panel.hidden = false;
      closeHandler = (ev) => {
        if (panel.hidden) return;
        const inWrap = wrap.contains(ev.target);
        const inPanel = panel.contains(ev.target);
        if (!inWrap && !inPanel) hideClassificationPanel();
      };
      setTimeout(() => document.addEventListener("mousedown", closeHandler, true), 0);
    } else {
      hideClassificationPanel();
    }
  });

  function refresh(newFlowType) {
    hideClassificationPanel();
    flowType = newFlowType || "";
    const opts = getClassificationsByFlowType(flowType);
    const currentVal = classificationInput.value;
    const valid = opts.some((o) => o.label === currentVal);
    if (!valid) {
      classificationInput.value = "";
      categoryInput.value = "";
    }
    updateDisplay();
  }

  refresh(flowType);
  const hiddenContainer = document.createElement("div");
  hiddenContainer.className = "asset-expense-classification-hidden";
  hiddenContainer.appendChild(classificationInput);
  hiddenContainer.appendChild(categoryInput);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  wrap.appendChild(hiddenContainer);
  return { wrap, classificationInput, categoryInput, refresh, updateDisplay };
}

/** 지출입력장 지출 분류 드롭다운 - 카테고리에 따라 옵션 변경 (가계부 설정 등에서 사용) */
function createExpenseClassificationDropdown(category, initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "asset-expense-classification-wrap";

  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-expense-input-classification";
  input.value = initialValue;

  const display = document.createElement("span");
  display.className = "asset-expense-classification-display";

  let panel = document.createElement("div");
  panel.className = "asset-expense-classification-panel";
  panel.hidden = true;

  function getColorClass(val, opts) {
    const opt = (opts || []).find((o) => o.label === val);
    return opt ? opt.color : "";
  }

  function buildPanel(opts) {
    panel.innerHTML = "";
    if (!opts || opts.length === 0) {
      const hintRow = document.createElement("div");
      hintRow.className = "asset-expense-classification-hint";
      hintRow.textContent = "카테고리를 먼저 선택해 주세요";
      panel.appendChild(hintRow);
      return;
    }
    opts.forEach((opt) => {
      const row = document.createElement("div");
      row.className = "asset-expense-classification-option";
      row.innerHTML = `<span class="asset-expense-classification-tag ${opt.color}">${opt.label}</span>`;
      row.addEventListener("click", () => {
        input.value = opt.label;
        updateDisplay(opts);
        panel.hidden = true;
        onUpdate?.();
      });
      panel.appendChild(row);
    });
  }

  function updateDisplay(opts) {
    const optsList = opts ?? getExpenseClassificationOptions(category);
    const val = input.value || "";
    const isEmpty = !category && !val;
    display.textContent = val || (isEmpty ? "카테고리를 먼저 선택" : "선택");
    display.className = "asset-expense-classification-display " + (isEmpty ? "is-required-first" : "") + " " + getColorClass(val, optsList);
  }

  function refresh(newCategory) {
    category = newCategory;
    const opts = getExpenseClassificationOptions(category);
    const currentVal = input.value;
    const valid = opts.some((o) => o.label === currentVal);
    if (!valid) input.value = "";
    buildPanel(opts);
    updateDisplay(opts);
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      const rect = display.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 2}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.minWidth = `${Math.max(rect.width, 160)}px`;
      document.body.appendChild(panel);
      panel.hidden = false;
      const handler = (ev) => {
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) {
          panel.hidden = true;
          document.removeEventListener("mousedown", handler, true);
        }
      };
      setTimeout(() => document.addEventListener("mousedown", handler, true), 0);
    } else {
      panel.hidden = true;
    }
  });

  refresh(category);
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return { wrap, input, refresh };
}

/** 지출입력장 결제수단. `opts.inlineButtons`는 모달/인라인 패널(새 거래·수정)만 true → 옵션을 버튼으로 노출.
 * 목록 카드(view)는 false — 저장된 하나만 다른 태그와 같이 칩으로 표시(선택 UI 없음).
 * 입금 시 비활성화(setPaymentIncomeMode), 지출 저장 시 결제수단 검증 유지.
 */
function createExpensePaymentInput(initialValue, onUpdate, opts = {}) {
  const wrap = document.createElement("div");
  wrap.className = "asset-expense-payment-wrap";

  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-expense-input-payment";
  input.value = initialValue || "";

  let incomeDepositOff = false;

  if (!opts.inlineButtons) {
    const display = document.createElement("span");
    display.className = "asset-expense-payment-display";

    function repaintDisplay() {
      if (incomeDepositOff) {
        display.textContent = "—";
        display.className =
          "asset-expense-payment-display asset-expense-payment-display--income-placeholder";
        return;
      }
      const val = (input.value || "").trim();
      display.textContent = val || "-";
      display.className = "asset-expense-payment-display" + (val ? " has-value" : "");
    }

    function setPaymentIncomeMode(on) {
      incomeDepositOff = !!on;
      wrap.classList.toggle("asset-expense-payment-wrap--income-muted", incomeDepositOff);
      if (incomeDepositOff) {
        input.value = "";
      }
      repaintDisplay();
      onUpdate?.();
    }

    repaintDisplay();
    wrap.appendChild(input);
    wrap.appendChild(display);

    return { wrap, input, setPaymentIncomeMode };
  }

  wrap.classList.add("asset-expense-payment-wrap--modal-btns");

  const group = document.createElement("div");
  group.className = "asset-expense-payment-btn-group";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "결제수단");

  const incomeHint = document.createElement("span");
  incomeHint.className = "asset-expense-payment-income-hint";
  incomeHint.textContent = "—";
  incomeHint.hidden = true;

  const btnByValue = new Map();

  function buildButtons() {
    group.replaceChildren();
    btnByValue.clear();
    getPaymentOptions().forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "asset-expense-payment-btn";
      btn.dataset.value = opt;
      btn.textContent = opt;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (incomeDepositOff) return;
        input.value = opt;
        syncButtonSelection();
        onUpdate?.();
      });
      group.appendChild(btn);
      btnByValue.set(opt, btn);
    });
  }

  function syncButtonSelection() {
    const val = (input.value || "").trim();
    btnByValue.forEach((btn, opt) => {
      const sel = val === opt;
      btn.classList.toggle("is-selected", sel);
      btn.setAttribute("aria-pressed", sel ? "true" : "false");
    });
  }

  function setPaymentIncomeMode(on) {
    incomeDepositOff = !!on;
    wrap.classList.toggle("asset-expense-payment-wrap--income-muted", incomeDepositOff);
    if (incomeDepositOff) {
      input.value = "";
      syncButtonSelection();
      group.hidden = true;
      incomeHint.hidden = false;
    } else {
      incomeHint.hidden = true;
      group.hidden = false;
      buildButtons();
      syncButtonSelection();
    }
    btnByValue.forEach((btn) => {
      btn.disabled = incomeDepositOff;
    });
    onUpdate?.();
  }

  buildButtons();
  syncButtonSelection();
  wrap.appendChild(input);
  wrap.appendChild(group);
  wrap.appendChild(incomeHint);

  return { wrap, input, setPaymentIncomeMode };
}

function parseNum(val) {
  const s = String(val || "")
    .replace(/,/g, "")
    .replace(/원/g, "")
    .trim();
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

/** 금리 문자열 → 연 이율 숫자(퍼센트 포인트). 예: 4.2 또는 4.2% → 4.2 (계산 시 /100 적용) */
function parseRate(val) {
  const s = String(val || "").replace(/%/g, "").replace(/,/g, "").trim();
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function formatNum(val) {
  if (val === null || val === undefined || val === "") return "";
  const n = parseNum(val);
  return n === null ? "" : n.toLocaleString("ko-KR");
}

/** 가계부 금액 입력 표시(blur)·초기값: 천 단위 + 원 */
function formatExpenseLedgerAmount(val) {
  if (val === null || val === undefined || val === "") return "";
  const n = typeof val === "number" && !Number.isNaN(val) ? val : parseNum(val);
  if (n === null) return "";
  return `${formatNum(n)}원`;
}

function expenseAmountInitialInputValue(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const n = parseNum(s);
  return n === null ? s : formatExpenseLedgerAmount(n);
}

/** 가계부 행(모달/버튼 확정) — 필수값 충족 시에만 메모리·서버에 반영 */
function canCommitAssetExpenseRow(d) {
  if (!d || typeof d !== "object") return { ok: false, msg: "입력이 비어 있습니다." };
  if (!String(d.date || "").trim()) return { ok: false, msg: "거래일을 입력해 주세요." };
  const ft = d.flowType;
  if (ft !== "입금" && ft !== "지출") return { ok: false, msg: "큰분류(지출/입금)를 선택해 주세요." };
  if (parseNum(d.amount) === null) return { ok: false, msg: "금액을 입력해 주세요." };
  if (!String(d.classification || "").trim()) return { ok: false, msg: "소비/수입 분류를 선택해 주세요." };
  if (ft === "지출" && !String(d.payment || "").trim()) return { ok: false, msg: "결제수단을 선택해 주세요." };
  return { ok: true, msg: "" };
}

function readExpenseDataFromTr(tr) {
  const isDraft = tr.classList.contains("asset-expense-row--draft");
  let id = (tr.dataset.assetExpenseRowId || "").trim();
  if (!isDraft && !id) {
    id = newExpenseRowId() || "";
    if (id) tr.dataset.assetExpenseRowId = id;
  }
  const nameInput = tr.querySelector(".asset-expense-input-name");
  const dateInput = tr.querySelector(".asset-expense-input-date");
  const flowTypeInput = tr.querySelector(".asset-expense-input-flow-type");
  const categoryInput = tr.querySelector(".asset-expense-input-category");
  const classificationInput = tr.querySelector(".asset-expense-input-classification");
  const amountInput = tr.querySelector(".asset-expense-input-amount");
  const paymentInput = tr.querySelector(".asset-expense-input-payment");
  const memoInput = tr.querySelector(".asset-expense-input-memo");
  let memo = "";
  if (memoInput) {
    memo = memoInput.value || "";
  } else {
    const rowId = (tr.dataset.assetExpenseRowId || "").trim();
    if (rowId) {
      const mem = loadExpenseRows().find((r) => String(r.id) === rowId);
      if (mem != null && mem.memo != null) memo = String(mem.memo);
    }
  }
  return {
    id,
    name: nameInput?.value || "",
    date: dateInput?.value || "",
    flowType: flowTypeInput?.value || "",
    category: categoryInput?.value || "",
    classification: classificationInput?.value || "",
    amount: amountInput
      ? (() => {
          const raw = (amountInput.value || "").trim();
          const n = parseNum(raw);
          return n === null ? raw : formatNum(n);
        })()
      : "",
    payment: paymentInput?.value || "",
    memo,
  };
}

/** 숫자 전용 입력: 비숫자 문자 제거 (allowDecimal: 소수점 허용 여부) */
function filterNumericInput(el, allowDecimal, inputEvent) {
  if (inputEvent && inputEvent.isComposing) return;
  const re = allowDecimal ? /[^\d,.]/g : /[^\d,]/g;
  const v = el.value;
  const filtered = v.replace(re, "");
  if (v !== filtered) el.value = filtered;
}

/**
 * 자유 텍스트 input: IME 조합 중에는 input 콜백 생략(한글 중복·꼬임 방지).
 * 조합 직후 input 이벤트가 안 오는 브라우저 대비: compositionend 뒤 microtask로 한 번 더 commit.
 * 포커스 이동 시 마지막 글자 반영: blur 시 commit.
 */
function bindNetWorthTextInput(el, onCommit) {
  let imeComposing = false;
  el.addEventListener("compositionstart", () => {
    imeComposing = true;
  });
  el.addEventListener("compositionend", () => {
    imeComposing = false;
    queueMicrotask(() => onCommit());
  });
  el.addEventListener("input", (e) => {
    if (e.isComposing || imeComposing) return;
    onCommit();
  });
  el.addEventListener("blur", () => onCommit());
}

function parseDate(val) {
  const s = String(val || "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** 대출기간(개월) 문자열을 개월 수로 변환. 숫자만 입력 (예: 24) */
function parseLoanPeriodToMonths(val) {
  const num = parseNum(val);
  if (num === null || num <= 0) return 0;
  return Math.round(num);
}

function formatDateYYMMDD(val) {
  if (!val) return "";
  const [y, m, d] = String(val).split("-");
  if (!y || !m || !d) return val;
  return `${y}/${m}/${d}`;
}

/** 개설일~만기일 기준, 현재날짜로 납입 진행률(%) 계산 */
function calcMaturityRate(openDate, maturityDate) {
  const open = parseDate(openDate);
  const maturity = parseDate(maturityDate);
  if (!open || !maturity || maturity <= open) return null;
  const now = new Date();
  if (now <= open) return 0;
  if (now >= maturity) return 100;
  const totalMs = maturity.getTime() - open.getTime();
  const elapsedMs = now.getTime() - open.getTime();
  return Math.min(100, Math.round((elapsedMs / totalMs) * 100));
}

/** 적금: 개설일~현재(또는 만기)까지 월납입 누적액 (이자 제외) */
function calcCumulativePaidFromMonthlyDeposit(monthly, openDate, maturityDate) {
  const monthlyAmt = parseNum(monthly);
  const open = parseDate(openDate);
  const maturity = parseDate(maturityDate);
  if (monthlyAmt === null || monthlyAmt <= 0 || !open || !maturity || maturity <= open) return null;
  const now = new Date();
  const endDate = now < maturity ? now : maturity;
  if (endDate <= open) return 0;
  const elapsedMonths =
    (endDate.getFullYear() - open.getFullYear()) * 12 + (endDate.getMonth() - open.getMonth());
  if (elapsedMonths <= 0) return 0;
  return Math.round(monthlyAmt * elapsedMonths);
}

/** 예금 만기예상액, 이자 계산 (원금, 개설일, 만기일, 이자율) - 단리 */
function calcDepositMaturityAmount(principal, openDate, maturityDate, rateStr) {
  const principalAmt = parseNum(principal);
  const open = parseDate(openDate);
  const maturity = parseDate(maturityDate);
  if (principalAmt === null || principalAmt <= 0 || !open || !maturity || maturity <= open) return null;
  const rate = parseRate(rateStr);
  const months = (maturity.getFullYear() - open.getFullYear()) * 12 + (maturity.getMonth() - open.getMonth());
  if (months <= 0) return { maturityAmount: Math.round(principalAmt), interest: 0 };
  if (rate === null || rate === 0) return { maturityAmount: Math.round(principalAmt), interest: 0 };
  const interest = principalAmt * (rate / 100) * (months / 12);
  return { maturityAmount: Math.round(principalAmt + interest), interest: Math.round(interest) };
}

/** 만기 시 만기예상액, 이자 계산 (월납입액, 개월수, 이자율) - 적금 단리 공식 */
function calcMaturityAmountAndInterest(monthly, totalMonths, rateStr) {
  const monthlyAmt = parseNum(monthly);
  const months = parseNum(totalMonths);
  if (monthlyAmt === null || monthlyAmt <= 0 || months === null || months <= 0) return null;
  const rate = parseRate(rateStr);
  const totalPrincipal = monthlyAmt * months;
  if (rate === null || rate === 0) {
    return { maturityAmount: Math.round(totalPrincipal), interest: 0 };
  }
  const r = rate / 100 / 12;
  const interest = monthlyAmt * r * (months * (months + 1)) / 2;
  return { maturityAmount: Math.round(totalPrincipal + interest), interest: Math.round(interest) };
}

/** 총 대출 이자 자동 계산 (총원금, 대출금리, 대출기간, 상환방식) */
function calcTotalLoanInterest(principal, rateStr, periodStr, repaymentMethod) {
  const P = parseNum(principal);
  const rate = parseRate(rateStr);
  const n = parseLoanPeriodToMonths(periodStr);
  if (P === null || P <= 0 || rate === null || rate < 0) return null;
  if (n <= 0) return null;
  const r = rate / 100 / 12;

  const method = String(repaymentMethod || "").trim();
  if (method === "원리금균등상환") {
    if (r === 0) return 0;
    const m = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const totalPayment = m * n;
    return Math.round(totalPayment - P);
  }
  if (method === "원금균등상환") {
    let balance = P;
    const monthlyPrincipal = P / n;
    let totalInterest = 0;
    for (let i = 0; i < n; i++) {
      const interest = balance * r;
      totalInterest += interest;
      balance -= monthlyPrincipal;
    }
    return Math.round(totalInterest);
  }
  if (method === "만기일시상환") {
    return Math.round(P * (rate / 100) * (n / 12));
  }
  /* 분할상환, 기타: 단리 적용 */
  return Math.round(P * (rate / 100) * (n / 12));
}

/** 월 원금·월 이자 (첫 달 기준) - 상환방식별 */
function calcMonthlyPrincipalAndInterest(principal, rateStr, periodStr, repaymentMethod) {
  const P = parseNum(principal);
  const rate = parseRate(rateStr);
  const n = parseLoanPeriodToMonths(periodStr);
  if (P === null || P <= 0) return null;
  if (n <= 0) return null;
  const r = rate !== null && rate >= 0 ? rate / 100 / 12 : 0;

  const method = String(repaymentMethod || "").trim();
  if (method === "원리금균등상환") {
    if (r === 0) return { monthlyPrincipal: Math.round(P / n), monthlyInterest: 0 };
    const m = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const firstMonthInterest = P * r;
    return { monthlyPrincipal: Math.round(m - firstMonthInterest), monthlyInterest: Math.round(firstMonthInterest) };
  }
  if (method === "원금균등상환") {
    const monthlyPrincipal = P / n;
    const firstMonthInterest = P * r;
    return { monthlyPrincipal: Math.round(monthlyPrincipal), monthlyInterest: Math.round(firstMonthInterest) };
  }
  if (method === "만기일시상환") {
    return { monthlyPrincipal: 0, monthlyInterest: Math.round(P * r) };
  }
  /* 분할상환, 기타: 원리금균등과 동일 추정 */
  if (r === 0) return { monthlyPrincipal: Math.round(P / n), monthlyInterest: 0 };
  const m = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const firstMonthInterest = P * r;
  return { monthlyPrincipal: Math.round(m - firstMonthInterest), monthlyInterest: Math.round(firstMonthInterest) };
}

/** 시작일~기준일 기준 상환금액 자동 계산 (지금까지 갚은 금액)
 *  endDate: 만기일(대출만기). 실제 계산은 min(오늘, 만기일)로 함 → "지금까지 갚은 금액" */
function calcRepaidAmountFromDates(principal, rateStr, periodStr, repaymentMethod, startDate, endDate) {
  const P = parseNum(principal);
  const rate = parseRate(rateStr);
  const n = parseLoanPeriodToMonths(periodStr);
  const start = parseDate(startDate);
  const loanEnd = parseDate(endDate);
  if (P === null || P <= 0 || !start) return null;
  if (n <= 0) return null;
  const r = rate !== null && rate >= 0 ? rate / 100 / 12 : 0;

  /* 상환금액 = 지금까지 갚은 금액 → 오늘과 만기일(대출만기) 중 더 이른 날짜까지 */
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start) start.setHours(0, 0, 0, 0);
  if (loanEnd) loanEnd.setHours(0, 0, 0, 0);
  const end = !loanEnd ? today : (loanEnd < today ? loanEnd : today);
  if (end < start) return 0;

  /* 납입 개월 수: 같은 달의 같은 일 이상이어야 해당 월 납입 완료로 인정 */
  let monthsElapsed = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) monthsElapsed = Math.max(0, monthsElapsed - 1);
  if (monthsElapsed <= 0) return 0;
  const paymentsMade = Math.min(monthsElapsed, n);

  const method = String(repaymentMethod || "").trim();
  if (method === "원리금균등상환") {
    if (r === 0) return Math.round((P / n) * paymentsMade);
    const m = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return Math.round(m * paymentsMade);
  }
  if (method === "원금균등상환") {
    let total = 0;
    let balance = P;
    const monthlyPrincipal = P / n;
    for (let i = 0; i < paymentsMade; i++) {
      const interest = balance * r;
      total += monthlyPrincipal + interest;
      balance -= monthlyPrincipal;
    }
    return Math.round(total);
  }
  if (method === "만기일시상환") {
    const monthlyInterest = P * r;
    return Math.round(monthlyInterest * paymentsMade);
  }
  /* 분할상환, 기타: 단리로 추정 */
  const monthlyEst = P * (rate !== null ? rate / 100 / 12 : 0) + P / n;
  return Math.round(monthlyEst * paymentsMade);
}

/** 남은 원금(잔액) 자동 계산 - 상환방식에 따라 이자 반영
 *  paymentsMade개월 납입 후 남은 원금 */
function calcRemainingBalance(principal, rateStr, periodStr, repaymentMethod, startDate, endDate) {
  const P = parseNum(principal);
  const rate = parseRate(rateStr);
  const n = parseLoanPeriodToMonths(periodStr);
  const start = parseDate(startDate);
  const loanEnd = parseDate(endDate);
  if (P === null || P <= 0 || !start) return null;
  if (n <= 0) return null;
  const r = rate !== null && rate >= 0 ? rate / 100 / 12 : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start) start.setHours(0, 0, 0, 0);
  if (loanEnd) loanEnd.setHours(0, 0, 0, 0);
  const end = !loanEnd ? today : (loanEnd < today ? loanEnd : today);
  if (end < start) return P;

  /* 납입 개월 수: 같은 달의 같은 일 이상이어야 해당 월 납입 완료로 인정 */
  let monthsElapsed = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) monthsElapsed = Math.max(0, monthsElapsed - 1);
  const paymentsMade = Math.min(Math.max(0, monthsElapsed), n);

  const method = String(repaymentMethod || "").trim();
  if (method === "원리금균등상환") {
    if (r === 0) return Math.round(P - (P / n) * paymentsMade);
    const m = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    const remaining = P * Math.pow(1 + r, paymentsMade) - m * (Math.pow(1 + r, paymentsMade) - 1) / r;
    return Math.round(Math.max(0, remaining));
  }
  if (method === "원금균등상환") {
    const remaining = P - (P / n) * paymentsMade;
    return Math.round(Math.max(0, remaining));
  }
  if (method === "만기일시상환") {
    return paymentsMade >= n ? 0 : Math.round(P);
  }
  /* 분할상환, 기타: 원리금균등과 동일하게 추정 */
  if (r === 0) return Math.round(P - (P / n) * paymentsMade);
  const m = (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const remaining = P * Math.pow(1 + r, paymentsMade) - m * (Math.pow(1 + r, paymentsMade) - 1) / r;
  return Math.round(Math.max(0, remaining));
}

function escapeHtml(s) {
  if (typeof s !== "string") return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderNetworthView() {
  const wrap = document.createElement("div");
  wrap.className = "asset-networth-view";

  /* 순자산 대시보드 (총 자산 - 총 부채) */
  const netWorthDashboard = document.createElement("div");
  netWorthDashboard.className = "asset-networth-dashboard";
  netWorthDashboard.innerHTML = `
    <div class="asset-networth-dashboard-formula">
      <div class="asset-networth-dashboard-formula-item">
        <span class="asset-networth-dashboard-formula-label asset-networth-dashboard-formula-label--with-icon">
          <img src="/asset-icons/networth-assets-coins.png" alt="" width="22" height="22" class="asset-networth-dashboard-formula-icon" aria-hidden="true" />
          총 자산
        </span>
        <span class="asset-networth-dashboard-formula-value asset-networth-dashboard-assets-value">-</span>
      </div>
      <span class="asset-networth-dashboard-formula-op">−</span>
      <div class="asset-networth-dashboard-formula-item">
        <span class="asset-networth-dashboard-formula-label asset-networth-dashboard-formula-label--with-icon">
          <img src="/asset-icons/networth-debt-hand-coin.png" alt="" width="22" height="22" class="asset-networth-dashboard-formula-icon" aria-hidden="true" />
          총 부채
        </span>
        <span class="asset-networth-dashboard-formula-value asset-networth-dashboard-debt-value">-</span>
      </div>
      <span class="asset-networth-dashboard-formula-eq">=</span>
      <div class="asset-networth-dashboard-formula-item asset-networth-dashboard-result">
        <span class="asset-networth-dashboard-formula-label">총 순자산</span>
        <span class="asset-networth-dashboard-formula-value asset-networth-dashboard-value">-</span>
      </div>
    </div>
    <div class="asset-networth-dashboard-target">
      <label class="asset-networth-dashboard-target-label">목표 순자산</label>
      <input type="text" class="asset-networth-dashboard-target-input" placeholder="예: 100,000,000" />
    </div>
    <div class="asset-networth-dashboard-progress-wrap">
      <div class="asset-networth-dashboard-progress-bar">
        <div class="asset-networth-dashboard-progress-fill"></div>
      </div>
    </div>
    <div class="asset-networth-dashboard-remaining">
      <span class="asset-networth-dashboard-remaining-text">-</span>
    </div>
  `;
  const netWorthValueEl = netWorthDashboard.querySelector(".asset-networth-dashboard-value");
  const assetsValueEl = netWorthDashboard.querySelector(".asset-networth-dashboard-assets-value");
  const debtValueEl = netWorthDashboard.querySelector(".asset-networth-dashboard-debt-value");
  const targetInput = netWorthDashboard.querySelector(".asset-networth-dashboard-target-input");
  const remainingTextEl = netWorthDashboard.querySelector(".asset-networth-dashboard-remaining-text");
  const targetProgressFill = netWorthDashboard.querySelector(".asset-networth-dashboard-progress-fill");
  targetInput.value = loadNetWorthTarget();
  targetInput.addEventListener("input", () => saveNetWorthTarget(targetInput.value));
  targetInput.addEventListener("keydown", (e) => e.key === "Enter" && targetInput.blur());
  targetInput.addEventListener("blur", () => {
    const n = parseNum(targetInput.value);
    if (n !== null) targetInput.value = formatNum(n);
    saveNetWorthTarget(targetInput.value);
  });
  let updateNetWorthDashboard = () => {};

  const debtSection = document.createElement("div");
  debtSection.className = "asset-debt-section";

  const debtHeader = document.createElement("div");
  debtHeader.className = "asset-debt-header";
  debtHeader.innerHTML = `
    <span class="asset-debt-title">총 부채</span>
    <span class="asset-debt-count">0</span>
    <span class="asset-debt-more">⋯</span>
  `;

  const debtProgressWrap = document.createElement("div");
  debtProgressWrap.className = "asset-debt-progress-wrap";
  debtProgressWrap.innerHTML = `
    <div class="asset-debt-progress-header">
      <span class="asset-debt-progress-label">상환 진행률</span>
      <span class="asset-debt-progress-remaining">더 갚아야 할 금액: <strong class="asset-debt-progress-remaining-value">-</strong></span>
    </div>
    <div class="asset-debt-progress-bar">
      <div class="asset-debt-progress-fill"></div>
    </div>
    <div class="asset-debt-progress-footer">
      <span class="asset-debt-progress-paid">상환 완료</span>
      <span class="asset-debt-progress-percent">0%</span>
    </div>
  `;
  const progressFill = debtProgressWrap.querySelector(".asset-debt-progress-fill");
  const progressRemainingValue = debtProgressWrap.querySelector(".asset-debt-progress-remaining-value");
  const progressPercent = debtProgressWrap.querySelector(".asset-debt-progress-percent");

  const tableWrap = document.createElement("div");
  tableWrap.className = "asset-debt-table-wrap";
  const table = document.createElement("table");
  table.className = "asset-debt-table";
  table.innerHTML = `
    <colgroup>
      <col class="asset-debt-col-name">
      <col class="asset-debt-col-type">
      <col class="asset-debt-col-repayment">
      <col class="asset-debt-col-period">
      <col class="asset-debt-col-rate">
      <col class="asset-debt-col-principal">
      <col class="asset-debt-col-interest">
      <col class="asset-debt-col-monthly-principal">
      <col class="asset-debt-col-monthly-interest">
      <col class="asset-debt-col-start-date">
      <col class="asset-debt-col-end-date">
      <col class="asset-debt-col-paid">
      <col class="asset-debt-col-extra-paid">
      <col class="asset-debt-col-balance">
      <col class="asset-debt-col-actions">
    </colgroup>
    <thead>
      <tr>
        <th class="asset-debt-th-name">대출 이름</th>
        <th class="asset-debt-th-type">부채유형</th>
        <th class="asset-debt-th-repayment">상환방식</th>
        <th class="asset-debt-th-period">약정 개월</th>
        <th class="asset-debt-th-rate">금리(%)</th>
        <th class="asset-debt-th-principal">대출 원금</th>
        <th class="asset-debt-th-interest">총 대출 이자</th>
        <th class="asset-debt-th-monthly-principal">월 원금</th>
        <th class="asset-debt-th-monthly-interest">월 이자</th>
        <th class="asset-debt-th-start-date">가입일</th>
        <th class="asset-debt-th-end-date">만기일</th>
        <th class="asset-debt-th-paid">상환금액</th>
        <th class="asset-debt-th-extra-paid">중도상환(수수료 제외)</th>
        <th class="asset-debt-th-balance">잔여 원금</th>
        <th class="asset-debt-th-actions"></th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector("tbody");
  const totalsRow = document.createElement("tr");
  totalsRow.className = "asset-debt-row-totals";
  totalsRow.innerHTML = `
    <td class="asset-debt-cell-totals-label asset-debt-cell-name">합계</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td class="asset-debt-cell-totals-principal">-</td>
    <td class="asset-debt-cell-totals-interest">-</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td class="asset-debt-cell-totals-paid">-</td>
    <td class="asset-debt-cell-totals-extra-paid">-</td>
    <td class="asset-debt-cell-totals-balance">-</td>
    <td class="asset-debt-cell-actions"></td>
  `;
  const addTaskBtn = document.createElement("button");
  addTaskBtn.type = "button";
  addTaskBtn.className = "asset-debt-add-task";
  addTaskBtn.innerHTML = '<span class="asset-debt-add-icon">+</span>';
  tbody.appendChild(totalsRow);

  /** 넓은 표에서 '수정'이 오른쪽 끝에 있을 때: 편집 패널이 가로 스크롤 래퍼 안 앞쪽(왼쪽)에 오도록 */
  function bringDebtRowPanelIntoView(tr) {
    if (!tr) return;
    const run = () => {
      const panel = tr.querySelector(".asset-expense-inline-panel");
      const wrap = tr.closest(".asset-debt-table-wrap");
      if (!wrap) return;
      const el = panel || tr;
      if (el.scrollIntoView) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "start" });
      }
      requestAnimationFrame(() => {
        const pr = el.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        if (pr.left < wr.left) wrap.scrollLeft += pr.left - wr.left;
        if (pr.right > wr.right) wrap.scrollLeft += pr.right - wr.right;
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  function createDebtRow(data = {}, onUpdate, options = {}) {
    const mode = options.mode != null ? options.mode : "view";
    const isView = mode === "view";
    const isDraft = mode === "draft";
    const isEdit = mode === "edit";
    const memSnapshot = isEdit
      ? options.memSnapshot
        ? { ...options.memSnapshot }
        : { ...data }
      : null;
    const inPanel = isDraft || isEdit;
    const inRowUpdate = isView ? () => {} : onUpdate;

    const tr = document.createElement("tr");
    tr.className = "asset-debt-row";
    if (isView) {
      tr.classList.add("asset-debt-row--view");
    }
    if (inPanel) {
      tr.classList.add("asset-debt-row--inner-panel");
      if (isDraft) tr.classList.add("asset-debt-row--draft");
      if (isEdit) tr.classList.add("asset-debt-row--editing");
    }

    let dataRowTarget;
    let panelFooter = null;
    let xBtn = null;
    if (inPanel) {
      const panelTitle = isDraft ? "새 대출" : "대출 수정";
      tr.innerHTML =
        '<td colspan="15" class="asset-debt-cell-panel">' +
        '<div class="asset-expense-inline-panel asset-debt-inline-panel">' +
        '<div class="asset-expense-inline-panel-top">' +
        '<span class="asset-expense-inline-panel-title">' +
        panelTitle +
        "</span>" +
        '<button type="button" class="asset-expense-inline-panel-x" aria-label="닫기">×</button>' +
        "</div>" +
        '<div class="asset-expense-inline-panel-body"></div>' +
        '<div class="asset-expense-inline-panel-bottom" aria-label="확인 작업"></div>' +
        "</div></td>";
      const panelBody = tr.querySelector(".asset-expense-inline-panel-body");
      panelFooter = tr.querySelector(".asset-expense-inline-panel-bottom");
      xBtn = tr.querySelector(".asset-expense-inline-panel-x");
      const formStack = document.createElement("div");
      formStack.className = "asset-expense-form-stack";
      formStack.setAttribute("role", "group");
      formStack.setAttribute("aria-label", "대출 입력");
      panelBody.appendChild(formStack);
      dataRowTarget = formStack;
    } else {
      dataRowTarget = tr;
    }

    function appendToRow(label, tdClass, node, options = {}) {
      const isComputedPanel = inPanel && options.computed === true;
      if (inPanel) {
        const row = document.createElement("div");
        row.className = "asset-expense-form-row";
        const lab = document.createElement("span");
        lab.className = "asset-expense-form-label";
        lab.textContent = label;
        const control = document.createElement("div");
        control.className =
          "asset-expense-form-control asset-expense-form-control--field" +
          (isComputedPanel ? " asset-debt-panel-value--computed" : "") +
          (tdClass ? " " + tdClass : "");
        if (isComputedPanel) {
          control.setAttribute("data-debt-value-kind", "computed");
        }
        if (node) control.appendChild(node);
        row.appendChild(lab);
        row.appendChild(control);
        dataRowTarget.appendChild(row);
        return control;
      }
      const td = document.createElement("td");
      if (tdClass) td.className = tdClass;
      if (node) td.appendChild(node);
      dataRowTarget.appendChild(td);
      return td;
    }
    function appendManyToRow(label, tdClass, ...nodes) {
      if (inPanel) {
        const row = document.createElement("div");
        row.className = "asset-expense-form-row";
        const lab = document.createElement("span");
        lab.className = "asset-expense-form-label";
        lab.textContent = label;
        const control = document.createElement("div");
        control.className = "asset-expense-form-control asset-expense-form-control--field" + (tdClass ? " " + tdClass : "");
        nodes.forEach((n) => {
          if (n) control.appendChild(n);
        });
        row.appendChild(lab);
        row.appendChild(control);
        dataRowTarget.appendChild(row);
        return control;
      }
      const td = document.createElement("td");
      if (tdClass) td.className = tdClass;
      nodes.forEach((n) => {
        if (n) td.appendChild(n);
      });
      dataRowTarget.appendChild(td);
      return td;
    }
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "asset-debt-input-name";
    nameInput.value = data.name || "";
    nameInput.placeholder = "";
    bindNetWorthTextInput(nameInput, inRowUpdate);
    nameInput.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && nameInput.blur());
    appendToRow("대출 이름", "asset-debt-cell-name", nameInput);

    appendToRow("부채유형", "asset-debt-cell-type", createDebtTypeDropdown(data.debtType || "", inRowUpdate));

    let repaymentHost;
    repaymentHost = appendToRow("상환방식", "asset-debt-cell-repayment", null);

    const periodInput = document.createElement("input");
    periodInput.type = "text";
    periodInput.className = "asset-debt-input-period";
    periodInput.value = data.periodYears ?? "";
    periodInput.placeholder = "-";
    periodInput.addEventListener("input", (e) => filterNumericInput(periodInput, false, e));
    periodInput.addEventListener("keydown", (e) => e.key === "Enter" && periodInput.blur());
    appendToRow("약정 개월", "asset-debt-cell-period", periodInput);

    const rateInput = document.createElement("input");
    rateInput.type = "text";
    rateInput.className = "asset-debt-input-rate";
    rateInput.value = data.interestRate ?? "";
    rateInput.placeholder = "예: 4.2";
    rateInput.title = "연 금리, 퍼센트 숫자만 (4.2 = 4.2%, % 생략 가능)";
    rateInput.addEventListener("input", (e) => filterNumericInput(rateInput, true, e));
    rateInput.addEventListener("keydown", (e) => e.key === "Enter" && rateInput.blur());
    appendToRow("금리(%)", "asset-debt-cell-rate", rateInput);

    const principalInput = document.createElement("input");
    principalInput.type = "text";
    principalInput.className = "asset-debt-input-principal";
    principalInput.value = data.principal ? (formatNum(data.principal) || data.principal) : "";
    principalInput.placeholder = "-";
    principalInput.addEventListener("input", (e) => filterNumericInput(principalInput, false, e));
    principalInput.addEventListener("blur", () => {
      const formatted = formatNum(principalInput.value);
      if (formatted !== "") principalInput.value = formatted;
    });
    principalInput.addEventListener("keydown", (e) => e.key === "Enter" && principalInput.blur());
    appendToRow("대출 원금", "asset-debt-cell-principal", principalInput);

    const interestSpan = document.createElement("span");
    interestSpan.className = "asset-debt-interest-display";

    function updateInterest() {
      const repaymentInput = tr.querySelector(".asset-debt-input-repayment");
      const interest = calcTotalLoanInterest(
        principalInput.value,
        rateInput.value,
        periodInput.value,
        repaymentInput?.value
      );
      interestSpan.textContent = interest !== null ? formatNum(interest) : "";
    }

    let updatePaidFromDatesRef;
    let updateBalanceRef;
    let updateMonthlyBreakdownRef;
    const repaymentOnUpdate = () => {
      updateInterest();
      updateMonthlyBreakdownRef?.();
      updatePaidFromDatesRef?.();
      updateBalanceRef?.();
      inRowUpdate();
    };
    repaymentHost.replaceChildren();
    repaymentHost.appendChild(createDebtRepaymentDropdown(data.repayment || "", repaymentOnUpdate));
    updateInterest();
    appendToRow("총 대출 이자", "asset-debt-cell-interest", interestSpan, { computed: true });

    const monthlyPrincipalSpan = document.createElement("span");
    monthlyPrincipalSpan.className = "asset-debt-monthly-principal-display";

    const monthlyInterestSpan = document.createElement("span");
    monthlyInterestSpan.className = "asset-debt-monthly-interest-display";

    function updateMonthlyBreakdown() {
      const repaymentInput = tr.querySelector(".asset-debt-input-repayment");
      const result = calcMonthlyPrincipalAndInterest(
        principalInput.value,
        rateInput.value,
        periodInput.value,
        repaymentInput?.value
      );
      if (result !== null) {
        monthlyPrincipalSpan.textContent = formatNum(result.monthlyPrincipal) || "";
        monthlyInterestSpan.textContent = formatNum(result.monthlyInterest) || "";
      } else {
        monthlyPrincipalSpan.textContent = "";
        monthlyInterestSpan.textContent = "";
      }
    }

    appendToRow("월 원금", "asset-debt-cell-monthly-principal", monthlyPrincipalSpan, { computed: true });
    appendToRow("월 이자", "asset-debt-cell-monthly-interest", monthlyInterestSpan, { computed: true });
    updateMonthlyBreakdownRef = updateMonthlyBreakdown;
    updateMonthlyBreakdown();

    const startDateDisplay = document.createElement("span");
    startDateDisplay.className = "asset-debt-date-display";
    const startDateInput = document.createElement("input");
    startDateInput.type = "date";
    startDateInput.className = "asset-debt-input-start-date";
    startDateInput.value = data.startDate ?? "";

    function updateStartDateDisplay() {
      startDateDisplay.textContent = startDateInput.value ? formatDateYYMMDD(startDateInput.value) : "-";
    }

    const endDateDisplay = document.createElement("span");
    endDateDisplay.className = "asset-debt-date-display";
    const endDateInput = document.createElement("input");
    endDateInput.type = "date";
    endDateInput.className = "asset-debt-input-end-date";
    endDateInput.value = data.endDate ?? "";

    function updateEndDateDisplay() {
      endDateDisplay.textContent = endDateInput.value ? formatDateYYMMDD(endDateInput.value) : "-";
    }

    function updateEndDateFromStartDate() {
      const start = parseDate(startDateInput.value);
      const months = parseLoanPeriodToMonths(periodInput.value);
      if (start && months > 0) {
        const end = new Date(start);
        end.setMonth(end.getMonth() + months);
        const y = end.getFullYear();
        const m = String(end.getMonth() + 1).padStart(2, "0");
        const d = String(end.getDate()).padStart(2, "0");
        endDateInput.value = `${y}-${m}-${d}`;
        updateEndDateDisplay();
      }
    }

    startDateInput.addEventListener("change", () => {
      updateStartDateDisplay();
      updateEndDateFromStartDate();
      updatePaidFromDates();
      inRowUpdate();
    });
    const startHost = appendManyToRow("가입일", "asset-debt-cell-start-date asset-debt-date-cell", startDateDisplay, startDateInput);
    startHost.addEventListener("click", (e) => {
      e.preventDefault();
      startDateInput.focus();
      if (typeof startDateInput.showPicker === "function") startDateInput.showPicker();
    });

    endDateInput.addEventListener("change", () => {
      updateEndDateDisplay();
      updatePaidFromDates();
      inRowUpdate();
    });
    const endHost = appendManyToRow("만기일", "asset-debt-cell-end-date asset-debt-date-cell", endDateDisplay, endDateInput);
    endHost.addEventListener("click", (e) => {
      e.preventDefault();
      endDateInput.focus();
      if (typeof endDateInput.showPicker === "function") endDateInput.showPicker();
    });

    updateStartDateDisplay();
    updateEndDateDisplay();

    const paidSpan = document.createElement("span");
    paidSpan.className = "asset-debt-paid-display";
    paidSpan.title = "가입일~오늘 기준 자동 계산 (입력 불가)";

    function updatePaidFromDates() {
      const repaymentInput = tr.querySelector(".asset-debt-input-repayment");
      const calc = calcRepaidAmountFromDates(
        principalInput.value,
        rateInput.value,
        periodInput.value,
        repaymentInput?.value,
        startDateInput.value,
        endDateInput.value
      );
      paidSpan.textContent = calc !== null ? formatNum(calc) : "-";
      updateBalanceRef?.();
      inRowUpdate();
    }
    updatePaidFromDatesRef = updatePaidFromDates;

    rateInput.addEventListener("input", () => {
      updateInterest();
      updateMonthlyBreakdown();
      updatePaidFromDates();
      inRowUpdate();
    });
    periodInput.addEventListener("input", () => {
      updateInterest();
      updateEndDateFromStartDate();
      updateMonthlyBreakdown();
      updatePaidFromDates();
      inRowUpdate();
    });
    principalInput.addEventListener("input", () => {
      updateInterest();
      updateMonthlyBreakdown();
      updatePaidFromDates();
      inRowUpdate();
    });
    appendToRow("상환금액", "asset-debt-cell-paid", paidSpan, { computed: true });

    const extraPaidInput = document.createElement("input");
    extraPaidInput.type = "text";
    extraPaidInput.className = "asset-debt-input-extra-paid";
    extraPaidInput.value = data.extraPaid ? (formatNum(data.extraPaid) || data.extraPaid) : "";
    extraPaidInput.placeholder = "-";
    extraPaidInput.title = "중도상환 금액 (수수료 제외)";
    extraPaidInput.addEventListener("input", (e) => filterNumericInput(extraPaidInput, false, e));
    extraPaidInput.addEventListener("input", inRowUpdate);
    extraPaidInput.addEventListener("blur", () => {
      const formatted = formatNum(extraPaidInput.value);
      if (formatted !== "") extraPaidInput.value = formatted;
      updateBalance();
    });
    extraPaidInput.addEventListener("keydown", (e) => e.key === "Enter" && extraPaidInput.blur());
    appendToRow("중도상환(수수료 제외)", "asset-debt-cell-extra-paid", extraPaidInput);

    const balanceSpan = document.createElement("span");
    balanceSpan.className = "asset-debt-balance-display";

    function updateBalance() {
      const p = parseNum(principalInput.value);
      const repaymentInput = tr.querySelector(".asset-debt-input-repayment");
      const method = repaymentInput?.value?.trim() || "";
      const extraPaid = parseNum(extraPaidInput.value) ?? 0;

      const calcBalance = calcRemainingBalance(
        principalInput.value,
        rateInput.value,
        periodInput.value,
        method,
        startDateInput.value,
        endDateInput.value
      );

      if (calcBalance !== null) {
        const balance = Math.max(0, calcBalance - extraPaid);
        balanceSpan.textContent = formatNum(balance) || "-";
      } else {
        const paid = parseNum(paidSpan.textContent);
        if (p === null && paid === null) balanceSpan.textContent = "-";
        else {
          const balance = Math.max(0, (p ?? 0) - (paid ?? 0) - extraPaid);
          balanceSpan.textContent = formatNum(balance) || "-";
        }
      }
    }

    principalInput.addEventListener("input", updateBalance);
    extraPaidInput.addEventListener("input", updateBalance);
    rateInput.addEventListener("input", updateBalance);
    periodInput.addEventListener("input", updateBalance);
    updateBalanceRef = updateBalance;
    startDateInput.addEventListener("change", updateBalance);
    endDateInput.addEventListener("change", updateBalance);
    updateBalance();

    appendToRow("잔여 원금", "asset-debt-cell-balance", balanceSpan, { computed: true });

    if (startDateInput.value && !endDateInput.value) {
      updateEndDateFromStartDate();
    }
    if (startDateInput.value && endDateInput.value) {
      updatePaidFromDates();
    }


    if (inPanel) {
      const doCancel = (e) => {
        e?.stopPropagation?.();
        if (isDraft) {
          tr.remove();
          onUpdate();
          return;
        }
        if (isEdit) {
          if (memSnapshot) {
            tr.replaceWith(createDebtRow(memSnapshot, onUpdate, { mode: "view" }));
          } else {
            tr.remove();
          }
          onUpdate();
        }
      };
      if (xBtn) xBtn.addEventListener("click", doCancel);
      if (panelFooter) {
        panelFooter.textContent = "";
        if (isDraft) {
          const saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--primary";
          saveBtn.textContent = "저장";
          saveBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const d = readDebtDataFromTr(tr);
            tr.replaceWith(createDebtRow(d, onUpdate, { mode: "view" }));
            onUpdate();
          });
          const footInner = document.createElement("div");
          footInner.className = "asset-expense-inline-panel-bottom-inner";
          footInner.appendChild(saveBtn);
          panelFooter.appendChild(footInner);
        } else if (isEdit) {
          const delBtn2 = document.createElement("button");
          delBtn2.type = "button";
          delBtn2.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--danger";
          delBtn2.textContent = "삭제";
          const applyBtn = document.createElement("button");
          applyBtn.type = "button";
          applyBtn.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--primary";
          applyBtn.textContent = "수정";
          delBtn2.addEventListener("click", (e) => {
            e.stopPropagation();
            confirmDeleteRow(() => {
              tr.remove();
              onUpdate();
            });
          });
          applyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const d = readDebtDataFromTr(tr);
            tr.replaceWith(createDebtRow(d, onUpdate, { mode: "view" }));
            onUpdate();
          });
          const footInner = document.createElement("div");
          footInner.className = "asset-expense-inline-panel-bottom-inner";
          footInner.appendChild(delBtn2);
          footInner.appendChild(applyBtn);
          panelFooter.appendChild(footInner);
        }
      }
    } else {
      const actionsTd = document.createElement("td");
      actionsTd.className = "asset-debt-cell-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "asset-expense-btn-row";
      editBtn.textContent = "수정";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = readDebtDataFromTr(tr);
        const newTr = createDebtRow(d, onUpdate, { mode: "edit", memSnapshot: d });
        tr.replaceWith(newTr);
        onUpdate();
        bringDebtRowPanelIntoView(newTr);
      });
      actionsTd.appendChild(editBtn);
      dataRowTarget.appendChild(actionsTd);
    }

    return tr;
  }

  /** 대출 행 로컬 반영: onUpdate() → 여기. localStorage asset_debt_rows + "asset-networth-bundle-saved" */
  function save() {
    const rows = collectDebtRowsFromDOM(tableWrap);
    saveDebtRows(rows);
    window.dispatchEvent(new CustomEvent("asset-networth-bundle-saved"));
  }

  function updateCount() {
    const count = table.querySelectorAll(".asset-debt-row").length;
    debtHeader.querySelector(".asset-debt-count").textContent = count;
  }

  function updateTotals() {
    let sumPrincipal = 0;
    let sumPaid = 0;
    let sumExtraPaid = 0;
    let sumBalance = 0;
    let sumInterest = 0;
    table.querySelectorAll(".asset-debt-row").forEach((tr) => {
      const p = parseNum(tr.querySelector(".asset-debt-input-principal")?.value);
      const paid = parseNum(tr.querySelector(".asset-debt-paid-display")?.textContent);
      const extraPaid = parseNum(tr.querySelector(".asset-debt-input-extra-paid")?.value);
      const balanceEl = tr.querySelector(".asset-debt-balance-display");
      const balance = parseNum(balanceEl?.textContent);
      const interestEl = tr.querySelector(".asset-debt-interest-display");
      const interest = parseNum(interestEl?.textContent);
      if (p !== null) sumPrincipal += p;
      if (paid !== null) sumPaid += paid;
      if (extraPaid !== null) sumExtraPaid += extraPaid;
      if (balance !== null) sumBalance += balance;
      if (interest !== null) sumInterest += interest;
    });
    const principalCell = totalsRow.querySelector(".asset-debt-cell-totals-principal");
    const interestCell = totalsRow.querySelector(".asset-debt-cell-totals-interest");
    const paidCell = totalsRow.querySelector(".asset-debt-cell-totals-paid");
    const extraPaidCell = totalsRow.querySelector(".asset-debt-cell-totals-extra-paid");
    const balanceCell = totalsRow.querySelector(".asset-debt-cell-totals-balance");
    principalCell.textContent = sumPrincipal > 0 ? formatNum(sumPrincipal) : "-";
    interestCell.textContent = sumInterest > 0 ? formatNum(sumInterest) : "-";
    paidCell.textContent = sumPaid > 0 ? formatNum(sumPaid) : "-";
    if (extraPaidCell) extraPaidCell.textContent = sumExtraPaid > 0 ? formatNum(sumExtraPaid) : "-";
    balanceCell.textContent = sumBalance !== 0 ? formatNum(sumBalance) : "-";

    /* 프로그레스 바 업데이트: (상환금액 + 중도상환) / (대출 원금 + 총 대출 이자) × 100 */
    const totalToRepay = sumPrincipal + (sumInterest || 0);
    const totalPaid = sumPaid + sumExtraPaid;
    const percent = totalToRepay > 0 ? Math.min(100, (totalPaid / totalToRepay) * 100) : 0;
    progressFill.style.width = `${percent}%`;
    progressPercent.textContent = `${Math.round(percent)}%`;
    progressRemainingValue.textContent = sumBalance !== 0 ? formatNum(sumBalance) : "-";
  }

  const onUpdate = () => {
    save();
    updateCount();
    updateTotals();
    updateNetWorthDashboard();
  };

  const initialRows = loadDebtRows();
  initialRows.forEach((row) => {
    const tr = createDebtRow(row, onUpdate, { mode: "view" });
    tbody.insertBefore(tr, totalsRow);
  });

  addTaskBtn.addEventListener("click", () => {
    if (tbody.querySelector(".asset-debt-row--draft")) {
      showToast("입력을 저장하거나 취소한 뒤에 새 항목을 추가해 주세요.", "");
      return;
    }
    const tr = createDebtRow({}, onUpdate, { mode: "draft" });
    tbody.insertBefore(tr, totalsRow);
    onUpdate();
    bringDebtRowPanelIntoView(tr);
  });

  updateCount();
  updateTotals();
  tableWrap.appendChild(table);
  const debtTableContainer = document.createElement("div");
  debtTableContainer.className = "asset-debt-table-container";
  debtTableContainer.appendChild(tableWrap);
  const debtAddButtonWrap = document.createElement("div");
  debtAddButtonWrap.className = "asset-debt-add-button-wrap";
  debtAddButtonWrap.appendChild(addTaskBtn);
  debtTableContainer.appendChild(debtAddButtonWrap);
  debtSection.appendChild(debtHeader);
  debtSection.appendChild(debtProgressWrap);
  debtSection.appendChild(debtTableContainer);
  wrap.appendChild(netWorthDashboard);
  wrap.appendChild(debtSection);

  /* 총 자산 섹션 - 4개 테이블로 분리 */
  const assetSection = document.createElement("div");
  assetSection.className = "asset-asset-section";

  const assetHeader = document.createElement("div");
  assetHeader.className = "asset-asset-header";
  assetHeader.innerHTML = `
    <span class="asset-asset-title">총 자산</span>
    <span class="asset-asset-count">0</span>
    <span class="asset-asset-more">⋯</span>
  `;

  const assetTableWrap = document.createElement("div");
  assetTableWrap.className = "asset-asset-tables-wrap";

  const ASSET_GROUPS = [
    { key: "예금", label: "예금", defaultType: "CMA" },
    { key: "적금", label: "적금", defaultType: "예적금잔고" },
    { key: "부동산", label: "부동산", defaultType: "부동산" },
    { key: "주식", label: "주식", defaultType: "주식" },
    { key: "보험", label: "투자성 보험", defaultType: null },
    { key: "연금", label: "연금", defaultType: null },
  ];

  const subsectionElements = {};

  function createRealEstateRow(data = {}, onAssetUpdate, options = {}) {
    const mode = options.mode != null ? options.mode : "view";
    const isView = mode === "view";
    const isDraft = mode === "draft";
    const isEdit = mode === "edit";
    const memSnapshot = isEdit
      ? options.memSnapshot
        ? { ...options.memSnapshot }
        : { ...data }
      : null;
    const inPanel = isDraft || isEdit;
    const inRowUpdate = isView ? () => {} : onAssetUpdate;
    const RE_COL = 5;

    const tr = document.createElement("tr");
    tr.className = "asset-asset-row asset-asset-row-real-estate";
    tr.dataset.realEstate = "true";
    if (isView) {
      tr.classList.add("asset-asset-row--view");
    }
    if (inPanel) {
      tr.classList.add("asset-asset-row--inner-panel");
      if (isDraft) tr.classList.add("asset-asset-row--draft");
      if (isEdit) tr.classList.add("asset-asset-row--editing");
    }

    let dataRowTarget;
    let panelFooter = null;
    let xBtn = null;
    if (inPanel) {
      const panelTitle = isDraft ? "새 부동산" : "부동산 수정";
      tr.innerHTML =
        '<td colspan="' +
        RE_COL +
        '" class="asset-asset-cell-panel">' +
        '<div class="asset-expense-inline-panel asset-networth-inline-panel">' +
        '<div class="asset-expense-inline-panel-top">' +
        '<span class="asset-expense-inline-panel-title">' +
        panelTitle +
        "</span>" +
        '<button type="button" class="asset-expense-inline-panel-x" aria-label="닫기">×</button>' +
        "</div>" +
        '<div class="asset-expense-inline-panel-body"></div>' +
        '<div class="asset-expense-inline-panel-bottom" aria-label="확인 작업"></div>' +
        "</div></td>";
      const panelBody = tr.querySelector(".asset-expense-inline-panel-body");
      panelFooter = tr.querySelector(".asset-expense-inline-panel-bottom");
      xBtn = tr.querySelector(".asset-expense-inline-panel-x");
      const subTable = document.createElement("table");
      subTable.className = "asset-debt-inline-data-table";
      const innerTr = document.createElement("tr");
      subTable.appendChild(innerTr);
      panelBody.appendChild(subTable);
      dataRowTarget = innerTr;
    } else {
      dataRowTarget = tr;
    }

    const contractTd = document.createElement("td");
    contractTd.className = "asset-asset-cell-contract";
    const contractInput = document.createElement("input");
    contractInput.type = "text";
    contractInput.className = "asset-asset-input-contract";
    contractInput.value = data.contract || "";
    contractInput.placeholder = "";
    bindNetWorthTextInput(contractInput, inRowUpdate);
    contractInput.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && contractInput.blur());
    contractTd.appendChild(contractInput);
    dataRowTarget.appendChild(contractTd);

    const salePriceTd = document.createElement("td");
    salePriceTd.className = "asset-asset-cell-sale-price";
    const salePriceInput = document.createElement("input");
    salePriceInput.type = "text";
    salePriceInput.className = "asset-asset-input-sale-price";
    salePriceInput.value = data.salePrice ? (formatNum(data.salePrice) || data.salePrice) : "";
    salePriceInput.placeholder = "-";
    salePriceInput.addEventListener("input", (e) => filterNumericInput(salePriceInput, false, e));
    salePriceInput.addEventListener("input", () => {
      updateAssetValueDisplay();
      inRowUpdate();
    });
    salePriceInput.addEventListener("blur", () => {
      const formatted = formatNum(salePriceInput.value);
      if (formatted !== "") salePriceInput.value = formatted;
      updateAssetValueDisplay();
      inRowUpdate();
    });
    salePriceInput.addEventListener("keydown", (e) => e.key === "Enter" && salePriceInput.blur());
    salePriceTd.appendChild(salePriceInput);
    dataRowTarget.appendChild(salePriceTd);

    const loanTd = document.createElement("td");
    loanTd.className = "asset-asset-cell-loan";
    const loanInput = document.createElement("input");
    loanInput.type = "text";
    loanInput.className = "asset-asset-input-loan";
    loanInput.value = data.loan ? (formatNum(data.loan) || data.loan) : "";
    loanInput.placeholder = "-";
    loanInput.addEventListener("input", (e) => filterNumericInput(loanInput, false, e));
    loanInput.addEventListener("input", () => {
      updateAssetValueDisplay();
      inRowUpdate();
    });
    loanInput.addEventListener("blur", () => {
      const formatted = formatNum(loanInput.value);
      if (formatted !== "") loanInput.value = formatted;
      updateAssetValueDisplay();
      inRowUpdate();
    });
    loanInput.addEventListener("keydown", (e) => e.key === "Enter" && loanInput.blur());
    loanTd.appendChild(loanInput);
    dataRowTarget.appendChild(loanTd);

    const assetValueTd = document.createElement("td");
    assetValueTd.className = "asset-asset-cell-asset-value";
    const assetValueDisplay = document.createElement("span");
    assetValueDisplay.className = "asset-asset-asset-value-display";
    assetValueTd.appendChild(assetValueDisplay);

    function updateAssetValueDisplay() {
      const sale = parseNum(salePriceInput.value);
      const loan = parseNum(loanInput.value);
      const val = sale !== null && loan !== null ? sale - loan : null;
      assetValueDisplay.textContent = val !== null ? formatNum(val) : "";
    }
    updateAssetValueDisplay();
    dataRowTarget.appendChild(assetValueTd);

    if (inPanel) {
      const doCancel = (e) => {
        e?.stopPropagation?.();
        if (isDraft) {
          tr.remove();
          onAssetUpdate();
          return;
        }
        if (isEdit) {
          if (memSnapshot) {
            tr.replaceWith(createRealEstateRow(memSnapshot, onAssetUpdate, { mode: "view" }));
          } else {
            tr.remove();
          }
          onAssetUpdate();
        }
      };
      if (xBtn) xBtn.addEventListener("click", doCancel);
      if (panelFooter) {
        panelFooter.textContent = "";
        if (isDraft) {
          const saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--primary";
          saveBtn.textContent = "저장";
          saveBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const d = readRealEstateDataFromTr(tr);
            tr.replaceWith(createRealEstateRow(d, onAssetUpdate, { mode: "view" }));
            onAssetUpdate();
          });
          const footInner = document.createElement("div");
          footInner.className = "asset-expense-inline-panel-bottom-inner";
          footInner.appendChild(saveBtn);
          panelFooter.appendChild(footInner);
        } else if (isEdit) {
          const delBtn2 = document.createElement("button");
          delBtn2.type = "button";
          delBtn2.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--danger";
          delBtn2.textContent = "삭제";
          const applyBtn = document.createElement("button");
          applyBtn.type = "button";
          applyBtn.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--primary";
          applyBtn.textContent = "수정";
          delBtn2.addEventListener("click", (e) => {
            e.stopPropagation();
            confirmDeleteRow(() => {
              tr.remove();
              onAssetUpdate();
            });
          });
          applyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const d = readRealEstateDataFromTr(tr);
            tr.replaceWith(createRealEstateRow(d, onAssetUpdate, { mode: "view" }));
            onAssetUpdate();
          });
          const footInner = document.createElement("div");
          footInner.className = "asset-expense-inline-panel-bottom-inner";
          footInner.appendChild(delBtn2);
          footInner.appendChild(applyBtn);
          panelFooter.appendChild(footInner);
        }
      }
    } else {
      const actionsTd = document.createElement("td");
      actionsTd.className = "asset-asset-cell-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "asset-expense-btn-row";
      editBtn.textContent = "수정";
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const d = readRealEstateDataFromTr(tr);
        tr.replaceWith(createRealEstateRow(d, onAssetUpdate, { mode: "edit", memSnapshot: d }));
        onAssetUpdate();
      });
      actionsTd.appendChild(editBtn);
      dataRowTarget.appendChild(actionsTd);
    }

    return tr;
  }

  function createStockRow(data = {}, onAssetUpdate) {
    const tr = document.createElement("tr");
    tr.className = "asset-asset-row asset-asset-row-stock";
    tr.dataset.stock = "true";

    const nameTd = document.createElement("td");
    nameTd.className = "asset-stock-cell-name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "asset-stock-input-name";
    nameInput.value = data.name || "";
    nameInput.placeholder = "";
    bindNetWorthTextInput(nameInput, onAssetUpdate);
    nameInput.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && nameInput.blur());
    nameTd.appendChild(nameInput);
    tr.appendChild(nameTd);

    const categoryTd = document.createElement("td");
    categoryTd.className = "asset-stock-cell-category";
    categoryTd.appendChild(createStockCategoryDropdown(data.category || "", onAssetUpdate));
    tr.appendChild(categoryTd);

    const avgPriceTd = document.createElement("td");
    avgPriceTd.className = "asset-stock-cell-avg-price";
    const avgPriceInput = document.createElement("input");
    avgPriceInput.type = "text";
    avgPriceInput.className = "asset-stock-input-avg-price";
    avgPriceInput.value = data.avgPrice ? (formatNum(data.avgPrice) || data.avgPrice) : "";
    avgPriceInput.placeholder = "-";
    avgPriceInput.addEventListener("input", (e) => filterNumericInput(avgPriceInput, true, e));
    avgPriceInput.addEventListener("input", () => {
      updateStockCalculations();
      onAssetUpdate();
    });
    avgPriceInput.addEventListener("blur", () => {
      const formatted = formatNum(avgPriceInput.value);
      if (formatted !== "") avgPriceInput.value = formatted;
      updateStockCalculations();
      onAssetUpdate();
    });
    avgPriceInput.addEventListener("keydown", (e) => e.key === "Enter" && avgPriceInput.blur());
    avgPriceTd.appendChild(avgPriceInput);
    tr.appendChild(avgPriceTd);

    const quantityTd = document.createElement("td");
    quantityTd.className = "asset-stock-cell-quantity";
    const quantityInput = document.createElement("input");
    quantityInput.type = "text";
    quantityInput.className = "asset-stock-input-quantity";
    quantityInput.value = data.quantity ?? "";
    quantityInput.placeholder = "-";
    quantityInput.addEventListener("input", (e) => filterNumericInput(quantityInput, false, e));
    quantityInput.addEventListener("input", () => {
      updateStockCalculations();
      onAssetUpdate();
    });
    quantityInput.addEventListener("blur", () => {
      const formatted = formatNum(quantityInput.value);
      if (formatted !== "") quantityInput.value = formatted;
      updateStockCalculations();
      onAssetUpdate();
    });
    quantityInput.addEventListener("keydown", (e) => e.key === "Enter" && quantityInput.blur());
    quantityTd.appendChild(quantityInput);
    tr.appendChild(quantityTd);

    const purchaseAmtTd = document.createElement("td");
    purchaseAmtTd.className = "asset-stock-cell-purchase-amt";
    const purchaseAmtSpan = document.createElement("span");
    purchaseAmtSpan.className = "asset-stock-purchase-amt-display";
    purchaseAmtTd.appendChild(purchaseAmtSpan);
    tr.appendChild(purchaseAmtTd);

    const currentPriceTd = document.createElement("td");
    currentPriceTd.className = "asset-stock-cell-current-price";
    const currentPriceInput = document.createElement("input");
    currentPriceInput.type = "text";
    currentPriceInput.className = "asset-stock-input-current-price";
    currentPriceInput.value = data.currentPrice ? (formatNum(data.currentPrice) || data.currentPrice) : "";
    currentPriceInput.placeholder = "-";
    currentPriceInput.addEventListener("input", (e) => filterNumericInput(currentPriceInput, true, e));
    currentPriceInput.addEventListener("input", () => {
      updateStockCalculations();
      onAssetUpdate();
    });
    currentPriceInput.addEventListener("blur", () => {
      const formatted = formatNum(currentPriceInput.value);
      if (formatted !== "") currentPriceInput.value = formatted;
      updateStockCalculations();
      onAssetUpdate();
    });
    currentPriceInput.addEventListener("keydown", (e) => e.key === "Enter" && currentPriceInput.blur());
    currentPriceTd.appendChild(currentPriceInput);
    tr.appendChild(currentPriceTd);

    const appraisalAmtTd = document.createElement("td");
    appraisalAmtTd.className = "asset-stock-cell-appraisal-amt";
    const appraisalAmtSpan = document.createElement("span");
    appraisalAmtSpan.className = "asset-stock-appraisal-amt-display";
    appraisalAmtTd.appendChild(appraisalAmtSpan);
    tr.appendChild(appraisalAmtTd);

    const returnRateTd = document.createElement("td");
    returnRateTd.className = "asset-stock-cell-return-rate";
    const returnRateSpan = document.createElement("span");
    returnRateSpan.className = "asset-stock-return-rate-display";
    returnRateTd.appendChild(returnRateSpan);
    tr.appendChild(returnRateTd);

    const profitLossTd = document.createElement("td");
    profitLossTd.className = "asset-stock-cell-profit-loss";
    const profitLossSpan = document.createElement("span");
    profitLossSpan.className = "asset-stock-profit-loss-display";
    profitLossTd.appendChild(profitLossSpan);
    tr.appendChild(profitLossTd);

    function updateStockCalculations() {
      const avg = parseNum(avgPriceInput.value);
      const qty = parseNum(quantityInput.value);
      const current = parseNum(currentPriceInput.value);
      const purchaseAmt = avg !== null && qty !== null && qty > 0 ? avg * qty : null;
      const appraisalAmt = current !== null && qty !== null && qty > 0 ? current * qty : null;
      const profitLoss = purchaseAmt !== null && appraisalAmt !== null ? appraisalAmt - purchaseAmt : null;
      const returnRate = purchaseAmt !== null && purchaseAmt > 0 && profitLoss !== null
        ? (profitLoss / purchaseAmt) * 100 : null;
      purchaseAmtSpan.textContent = purchaseAmt !== null ? formatNum(Math.round(purchaseAmt)) : "";
      appraisalAmtSpan.textContent = appraisalAmt !== null ? formatNum(Math.round(appraisalAmt)) : "";
      if (profitLoss === null) {
        profitLossSpan.textContent = "";
        profitLossSpan.className = "asset-stock-profit-loss-display";
      } else {
        const plRounded = Math.round(profitLoss);
        const plAbs = formatNum(Math.abs(plRounded));
        if (plRounded > 0) {
          profitLossSpan.textContent = "+" + plAbs;
          profitLossSpan.className = "asset-stock-profit-loss-display profit";
        } else if (plRounded < 0) {
          profitLossSpan.textContent = "-" + plAbs;
          profitLossSpan.className = "asset-stock-profit-loss-display loss";
        } else {
          profitLossSpan.textContent = "0";
          profitLossSpan.className = "asset-stock-profit-loss-display breakeven";
        }
      }
      if (returnRate === null) {
        returnRateSpan.textContent = "";
        returnRateSpan.className = "asset-stock-return-rate-display";
      } else {
        const rr = Math.round(returnRate);
        returnRateSpan.textContent = (rr > 0 ? "+" : rr < 0 ? "" : "") + rr + "%";
        returnRateSpan.className =
          "asset-stock-return-rate-display " + (rr > 0 ? "profit" : rr < 0 ? "loss" : "breakeven");
      }
    }
    updateStockCalculations();

    const actionsTd = document.createElement("td");
    actionsTd.className = "asset-stock-cell-actions";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "asset-asset-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      confirmDeleteRow(() => {
        tr.remove();
        onAssetUpdate();
      });
    });
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

    return tr;
  }

  function createInsuranceRow(data = {}, onAssetUpdate) {
    const tr = document.createElement("tr");
    tr.className = "asset-asset-row asset-asset-row-insurance";
    tr.dataset.insurance = "true";

    const addNumInputTd = (cls, val, placeholder = "-") => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.className = cls;
      input.value = val ? (formatNum(val) || val) : "";
      input.placeholder = placeholder;
      input.addEventListener("input", onAssetUpdate);
      input.addEventListener("blur", () => {
        const f = formatNum(input.value);
        if (f !== "") input.value = f;
        onAssetUpdate();
      });
      input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
      td.appendChild(input);
      tr.appendChild(td);
      return input;
    };
    const addTextInputTd = (cls, val, placeholder = "-") => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.className = cls;
      input.value = val || "";
      input.placeholder = placeholder;
      bindNetWorthTextInput(input, onAssetUpdate);
      input.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && input.blur());
      td.appendChild(input);
      tr.appendChild(td);
      return input;
    };
    const addDateInputTd = (cls, val, onDateChange) => {
      const td = document.createElement("td");
      td.className = "asset-asset-cell-date";
      const wrap = document.createElement("div");
      wrap.className = "asset-asset-date-wrap";
      const display = document.createElement("span");
      display.className = "asset-asset-date-display";
      const input = document.createElement("input");
      input.type = "date";
      input.className = cls + " asset-asset-input-date-hidden";
      input.value = val || "";
      input.tabIndex = -1;
      function refreshDisplay() {
        display.textContent = input.value ? formatDateYYMMDD(input.value) : "";
      }
      input.addEventListener("change", () => {
        refreshDisplay();
        onDateChange?.();
        onAssetUpdate();
      });
      wrap.addEventListener("click", () => {
        input.focus();
        if (typeof input.showPicker === "function") input.showPicker();
        else input.click();
      });
      refreshDisplay();
      wrap.appendChild(display);
      wrap.appendChild(input);
      td.appendChild(wrap);
      tr.appendChild(td);
      return input;
    };

    addTextInputTd("asset-insurance-input-name", data.name, "");
    addTextInputTd("asset-insurance-input-kind", data.kind || "", "-");
    const contractDateInput = addDateInputTd("asset-insurance-input-contract-date", data.contractDate, updateTotalPaid);
    const maturityDateInput = addDateInputTd("asset-insurance-input-maturity-date", data.maturityDate, updateTotalPaid);
    const monthlyInput = addNumInputTd("asset-insurance-input-monthly", data.monthly);

    const totalPaidTd = document.createElement("td");
    totalPaidTd.className = "asset-insurance-cell-total-paid";
    const totalPaidSpan = document.createElement("span");
    totalPaidSpan.className = "asset-insurance-total-paid-display";
    totalPaidTd.appendChild(totalPaidSpan);
    tr.appendChild(totalPaidTd);

    function updateTotalPaid() {
      const monthly = parseNum(monthlyInput.value);
      const contractStr = contractDateInput.value;
      const maturityStr = maturityDateInput.value;
      if (monthly === null || monthly < 0 || !contractStr) {
        totalPaidSpan.textContent = "-";
        return;
      }
      const contractDate = new Date(contractStr);
      const endDate = maturityStr ? new Date(maturityStr) : new Date();
      const today = new Date();
      const toDate = endDate > today ? today : endDate;
      if (isNaN(contractDate.getTime()) || isNaN(toDate.getTime()) || contractDate > toDate) {
        totalPaidSpan.textContent = "-";
        return;
      }
      const months = Math.max(0, (toDate.getFullYear() - contractDate.getFullYear()) * 12 + (toDate.getMonth() - contractDate.getMonth()) + (toDate.getDate() >= contractDate.getDate() ? 1 : 0));
      const total = Math.round(monthly * months);
      totalPaidSpan.textContent = formatNum(total);
    }
    monthlyInput.addEventListener("input", updateTotalPaid);
    monthlyInput.addEventListener("blur", updateTotalPaid);
    updateTotalPaid();

    addNumInputTd("asset-insurance-input-surrender", data.surrenderValue);
    addTextInputTd("asset-insurance-input-coverage", data.coverage);

    const actionsTd = document.createElement("td");
    actionsTd.className = "asset-asset-cell-actions";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "asset-asset-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      confirmDeleteRow(() => {
        tr.remove();
        onAssetUpdate();
      });
    });
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);
    return tr;
  }

  function createAnnuityRow(data = {}, onAssetUpdate) {
    const tr = document.createElement("tr");
    tr.className = "asset-asset-row asset-asset-row-annuity";
    tr.dataset.annuity = "true";

    const addNumInputTd = (cls, val, placeholder = "-") => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.className = cls;
      input.value = val ? (formatNum(val) || val) : "";
      input.placeholder = placeholder;
      input.addEventListener("input", (e) => filterNumericInput(input, false, e));
      input.addEventListener("input", () => { updateAnnuityCalc(); onAssetUpdate(); });
      input.addEventListener("blur", () => {
        const f = formatNum(input.value);
        if (f !== "") input.value = f;
        updateAnnuityCalc();
        onAssetUpdate();
      });
      input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
      td.appendChild(input);
      tr.appendChild(td);
      return input;
    };
    const addTextInputTd = (cls, val, placeholder = "-") => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.className = cls;
      input.value = val || "";
      input.placeholder = placeholder;
      bindNetWorthTextInput(input, () => {
        updateAnnuityCalc();
        onAssetUpdate();
      });
      input.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && input.blur());
      td.appendChild(input);
      tr.appendChild(td);
      return input;
    };
    const addDateInputTd = (cls, val, onDateChange) => {
      const td = document.createElement("td");
      td.className = "asset-asset-cell-date";
      const wrap = document.createElement("div");
      wrap.className = "asset-asset-date-wrap";
      const display = document.createElement("span");
      display.className = "asset-asset-date-display";
      const input = document.createElement("input");
      input.type = "date";
      input.className = cls + " asset-asset-input-date-hidden";
      input.value = val || "";
      input.tabIndex = -1;
      function refreshDisplay() {
        display.textContent = input.value ? formatDateYYMMDD(input.value) : "";
      }
      input.addEventListener("change", () => {
        refreshDisplay();
        onDateChange?.();
        onAssetUpdate();
      });
      wrap.addEventListener("click", () => {
        input.focus();
        if (typeof input.showPicker === "function") input.showPicker();
        else input.click();
      });
      refreshDisplay();
      wrap.appendChild(display);
      wrap.appendChild(input);
      td.appendChild(wrap);
      tr.appendChild(td);
      return input;
    };

    addTextInputTd("asset-annuity-input-name", data.name, "");
    addTextInputTd("asset-annuity-input-kind", data.kind || "", "-");
    const paymentStartInput = addDateInputTd("asset-annuity-input-payment-start", data.paymentStartDate, updateAnnuityCalc);
    const paymentEndInput = addDateInputTd("asset-annuity-input-payment-end", data.paymentEndDate, updateAnnuityCalc);

    const paymentYearsTd = document.createElement("td");
    paymentYearsTd.className = "asset-annuity-cell-payment-years";
    const paymentYearsSpan = document.createElement("span");
    paymentYearsSpan.className = "asset-annuity-payment-years-display";
    paymentYearsTd.appendChild(paymentYearsSpan);
    tr.appendChild(paymentYearsTd);

    const monthlyInput = addNumInputTd("asset-annuity-input-monthly", data.monthly);

    const totalPaidTd = document.createElement("td");
    totalPaidTd.className = "asset-annuity-cell-total-paid";
    const totalPaidSpan = document.createElement("span");
    totalPaidSpan.className = "asset-annuity-total-paid-display";
    totalPaidTd.appendChild(totalPaidSpan);
    tr.appendChild(totalPaidTd);

    const receiptStartInput = addDateInputTd("asset-annuity-input-receipt-start", data.receiptStartDate);
    const monthlyReceiptInput = addNumInputTd("asset-annuity-input-monthly-receipt", data.monthlyReceipt);

    function updateAnnuityCalc() {
      const startStr = paymentStartInput.value;
      const endStr = paymentEndInput.value;
      const monthly = parseNum(monthlyInput.value);
      if (startStr && endStr) {
        const startDate = new Date(startStr);
        const endDate = new Date(endStr);
        if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime()) && startDate <= endDate) {
          const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + (endDate.getDate() >= startDate.getDate() ? 1 : 0);
          const years = Math.round((months / 12) * 10) / 10;
          paymentYearsSpan.textContent = years > 0 ? years + "년" : "-";
          if (monthly !== null && monthly >= 0 && months > 0) {
            totalPaidSpan.textContent = formatNum(Math.round(monthly * months));
          } else {
            totalPaidSpan.textContent = "";
          }
        } else {
          paymentYearsSpan.textContent = "-";
          totalPaidSpan.textContent = "";
        }
      } else {
        paymentYearsSpan.textContent = "-";
        totalPaidSpan.textContent = "";
      }
    }
    monthlyInput.addEventListener("input", updateAnnuityCalc);
    monthlyInput.addEventListener("blur", updateAnnuityCalc);
    updateAnnuityCalc();

    const actionsTd = document.createElement("td");
    actionsTd.className = "asset-asset-cell-actions";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "asset-asset-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      confirmDeleteRow(() => {
        tr.remove();
        onAssetUpdate();
      });
    });
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);
    return tr;
  }

  function createAssetRow(data = {}, onAssetUpdate, isSavings = false, savingsDefaultType = "예적금잔고", isDeposit = false) {
    const tr = document.createElement("tr");
    tr.className = "asset-asset-row";
    if (isSavings) tr.dataset.savings = "true";
    if (isSavings) tr.dataset.matured = data.matured ? "true" : "false";

    const nameTd = document.createElement("td");
    nameTd.className = "asset-asset-cell-name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "asset-asset-input-name";
    nameInput.value = data.name || "";
    nameInput.placeholder = "";
    bindNetWorthTextInput(nameInput, onAssetUpdate);
    nameInput.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && nameInput.blur());
    nameTd.appendChild(nameInput);
    tr.appendChild(nameTd);

    const categoryTd = document.createElement("td");
    categoryTd.className = "asset-asset-cell-category";
    if (isSavings) {
      categoryTd.appendChild(createSavingsGoalDropdown(data.assetCategory || "", onAssetUpdate));
      const typeHidden = document.createElement("input");
      typeHidden.type = "hidden";
      typeHidden.className = "asset-asset-input-type";
      typeHidden.value = data.assetType || savingsDefaultType;
      typeHidden.name = "assetType";
      categoryTd.appendChild(typeHidden);
    } else {
      categoryTd.appendChild(createAssetCategoryDropdown(data.assetCategory || "", onAssetUpdate));
    }
    tr.appendChild(categoryTd);

    if (!isSavings) {
      const assetTypeTd = document.createElement("td");
      assetTypeTd.className = "asset-asset-cell-type";
      assetTypeTd.appendChild(createAssetTypeDropdown(data.assetType || "", onAssetUpdate));
      tr.appendChild(assetTypeTd);
    }

    const principalTd = document.createElement("td");
    principalTd.className = "asset-asset-cell-principal";
    const principalInput = document.createElement("input");
    principalInput.type = "text";
    principalInput.className = "asset-asset-input-principal";
    principalInput.value = data.principal ? (formatNum(data.principal) || data.principal) : "";
    principalInput.placeholder = "-";
    principalInput.addEventListener("input", (e) => filterNumericInput(principalInput, false, e));
    principalInput.addEventListener("input", () => {
      if (isDeposit) updateDepositMaturityAmt();
      onAssetUpdate();
    });
    principalInput.addEventListener("blur", () => {
      const formatted = formatNum(principalInput.value);
      if (formatted !== "") principalInput.value = formatted;
    });
    principalInput.addEventListener("keydown", (e) => e.key === "Enter" && principalInput.blur());
    principalTd.appendChild(principalInput);
    const deferPrincipalToBeforeMaturityAmt = isSavings && !isDeposit;
    if (!deferPrincipalToBeforeMaturityAmt) {
      tr.appendChild(principalTd);
    }

    function updateDepositMaturityAmt() {
      if (!isDeposit) return;
      const result = calcDepositMaturityAmount(
        principalInput.value,
        openDateInput?.value,
        maturityDateInput?.value,
        rateInput?.value
      );
      if (result !== null) {
        interestDisplay.textContent = result.interest > 0 ? formatNum(result.interest) : "";
        maturityAmtDisplay.textContent =
          result.maturityAmount > 0 ? formatNum(result.maturityAmount) : "";
      } else {
        interestDisplay.textContent = "";
        maturityAmtDisplay.textContent = "";
      }
    }

    let monthlyInput;
    if (!isDeposit) {
      const monthlyTd = document.createElement("td");
      monthlyTd.className = "asset-asset-cell-monthly";
      monthlyInput = document.createElement("input");
      monthlyInput.type = "text";
      monthlyInput.className = "asset-asset-input-monthly";
      monthlyInput.value = data.monthly ? (formatNum(data.monthly) || data.monthly) : "";
      monthlyInput.placeholder = "-";
      monthlyInput.addEventListener("input", (e) => filterNumericInput(monthlyInput, false, e));
      monthlyInput.addEventListener("input", () => {
        updatePrincipalFromCalc();
        updateInterestAndMaturityAmt();
        onAssetUpdate();
      });
      monthlyInput.addEventListener("blur", () => {
        const formatted = formatNum(monthlyInput.value);
        if (formatted !== "") monthlyInput.value = formatted;
      });
      monthlyInput.addEventListener("keydown", (e) => e.key === "Enter" && monthlyInput.blur());
      monthlyTd.appendChild(monthlyInput);
      tr.appendChild(monthlyTd);
    }

    function getTotalMonths() {
      if (!monthsInput) return null;
      const m = parseNum(monthsInput?.value);
      if (m !== null && m > 0) return m;
      const open = parseDate(openDateInput?.value);
      const maturity = parseDate(maturityDateInput?.value);
      if (!open || !maturity || maturity <= open) return null;
      return (
        (maturity.getFullYear() - open.getFullYear()) * 12 +
        (maturity.getMonth() - open.getMonth())
      );
    }

    function updatePrincipalFromCalc() {
      if (isDeposit || !monthlyInput) return;
      const calc = calcCumulativePaidFromMonthlyDeposit(
        monthlyInput.value,
        openDateInput?.value,
        maturityDateInput?.value
      );
      if (calc !== null) {
        principalInput.value = formatNum(calc);
      }
    }

    function updateInterestAndMaturityAmt() {
      if (isDeposit) {
        updateDepositMaturityAmt();
        return;
      }
      const totalMonths = getTotalMonths();
      const result = calcMaturityAmountAndInterest(
        monthlyInput?.value,
        totalMonths,
        rateInput?.value
      );
      if (result !== null) {
        interestDisplay.textContent = result.interest > 0 ? formatNum(result.interest) : "";
        maturityAmtDisplay.textContent =
          result.maturityAmount > 0 ? formatNum(result.maturityAmount) : "";
      } else {
        interestDisplay.textContent = "";
        maturityAmtDisplay.textContent = "";
      }
    }

    const rateTd = document.createElement("td");
    rateTd.className = "asset-asset-cell-rate";
    const rateInput = document.createElement("input");
    rateInput.type = "text";
    rateInput.className = "asset-asset-input-rate";
    rateInput.value = data.rate ?? "";
    rateInput.placeholder = isSavings ? "예: 4.2" : "-";
    rateInput.title = isSavings ? "연 금리, 퍼센트 숫자만 (4.2 = 4.2%, % 생략 가능)" : "";
    rateInput.addEventListener("input", (e) => filterNumericInput(rateInput, true, e));
    rateInput.addEventListener("input", () => {
      if (isDeposit) updateDepositMaturityAmt();
      else {
        updatePrincipalFromCalc();
        updateInterestAndMaturityAmt();
      }
      onAssetUpdate();
    });
    rateInput.addEventListener("keydown", (e) => e.key === "Enter" && rateInput.blur());
    rateTd.appendChild(rateInput);
    tr.appendChild(rateTd);

    let monthsInput;
    if (!isDeposit) {
      const monthsTd = document.createElement("td");
      monthsTd.className = "asset-asset-cell-months";
      monthsInput = document.createElement("input");
      monthsInput.type = "text";
      monthsInput.className = "asset-asset-input-months";
      monthsInput.value = data.months ?? "";
      monthsInput.placeholder = "-";
      monthsInput.addEventListener("input", (e) => filterNumericInput(monthsInput, false, e));
      monthsInput.addEventListener("input", () => {
        syncSavingsMaturityFromOpenAndMonths();
        updatePrincipalFromCalc();
        updateInterestAndMaturityAmt();
        onAssetUpdate();
      });
      monthsInput.addEventListener("keydown", (e) => e.key === "Enter" && monthsInput.blur());
      monthsTd.appendChild(monthsInput);
      tr.appendChild(monthsTd);
    }

    /* 적금: 개설일+개월 → 만기일 자동(대출 만기와 동일). 본문은 maturityDateInput 생성 후 할당 */
    var syncSavingsMaturityFromOpenAndMonths = function () {};

    const openDateTd = document.createElement("td");
    openDateTd.className = "asset-asset-cell-open-date asset-asset-cell-date";
    const openDateWrap = document.createElement("div");
    openDateWrap.className = "asset-asset-date-wrap";
    const openDateDisplay = document.createElement("span");
    openDateDisplay.className = "asset-asset-date-display";
    const openDateInput = document.createElement("input");
    openDateInput.type = "date";
    openDateInput.className = "asset-asset-input-open-date asset-asset-input-date-hidden";
    openDateInput.value = data.openDate || "";
    openDateInput.tabIndex = -1;
    function refreshOpenDate() {
      openDateDisplay.textContent = openDateInput.value ? formatDateYYMMDD(openDateInput.value) : "";
    }
    openDateInput.addEventListener("change", () => {
      refreshOpenDate();
      if (isDeposit) updateDepositMaturityAmt();
      else {
        syncSavingsMaturityFromOpenAndMonths();
        updatePrincipalFromCalc();
        updateInterestAndMaturityAmt();
      }
      onAssetUpdate();
    });
    openDateWrap.addEventListener("click", () => {
      openDateInput.focus();
      if (typeof openDateInput.showPicker === "function") openDateInput.showPicker();
      else openDateInput.click();
    });
    refreshOpenDate();
    openDateWrap.appendChild(openDateDisplay);
    openDateWrap.appendChild(openDateInput);
    openDateTd.appendChild(openDateWrap);
    tr.appendChild(openDateTd);

    const maturityDateTd = document.createElement("td");
    maturityDateTd.className = "asset-asset-cell-maturity-date asset-asset-cell-date";
    const maturityDateWrap = document.createElement("div");
    maturityDateWrap.className = "asset-asset-date-wrap";
    const maturityDateDisplay = document.createElement("span");
    maturityDateDisplay.className = "asset-asset-date-display";
    const maturityDateInput = document.createElement("input");
    maturityDateInput.type = "date";
    maturityDateInput.className = "asset-asset-input-maturity-date asset-asset-input-date-hidden";
    maturityDateInput.value = data.maturityDate || "";
    maturityDateInput.tabIndex = -1;
    function refreshMaturityDate() {
      maturityDateDisplay.textContent = maturityDateInput.value ? formatDateYYMMDD(maturityDateInput.value) : "";
    }
    syncSavingsMaturityFromOpenAndMonths = function () {
      if (isDeposit || !monthsInput) return;
      const open = parseDate(openDateInput.value);
      const m = parseNum(monthsInput.value);
      if (!open || m === null || m <= 0) return;
      const end = new Date(open);
      end.setMonth(end.getMonth() + Math.floor(m));
      const y = end.getFullYear();
      const mo = String(end.getMonth() + 1).padStart(2, "0");
      const d = String(end.getDate()).padStart(2, "0");
      maturityDateInput.value = `${y}-${mo}-${d}`;
      refreshMaturityDate();
    };
    maturityDateInput.addEventListener("change", () => {
      refreshMaturityDate();
      if (isDeposit) updateDepositMaturityAmt();
      else {
        updatePrincipalFromCalc();
        updateInterestAndMaturityAmt();
      }
      onAssetUpdate();
    });
    if (isDeposit) {
      maturityDateWrap.addEventListener("click", () => {
        maturityDateInput.focus();
        if (typeof maturityDateInput.showPicker === "function") maturityDateInput.showPicker();
        else maturityDateInput.click();
      });
    } else {
      maturityDateTd.classList.add("asset-asset-cell-maturity-date--computed");
      maturityDateTd.title = "가입일·개월 기준 자동 계산 (직접 수정 불가)";
      maturityDateWrap.classList.add("asset-asset-maturity-date-wrap--computed");
      maturityDateDisplay.classList.add("asset-asset-date-display--computed");
      maturityDateInput.readOnly = true;
      maturityDateInput.setAttribute("aria-readonly", "true");
    }
    refreshMaturityDate();
    maturityDateWrap.appendChild(maturityDateDisplay);
    maturityDateWrap.appendChild(maturityDateInput);
    maturityDateTd.appendChild(maturityDateWrap);
    tr.appendChild(maturityDateTd);

    const maturityRateTd = document.createElement("td");
    maturityRateTd.className = "asset-asset-cell-maturity-rate";
    const maturityRateSpan = document.createElement("span");
    maturityRateSpan.className = "asset-asset-maturity-rate-display";
    maturityRateTd.appendChild(maturityRateSpan);
    tr.appendChild(maturityRateTd);

    const interestTd = document.createElement("td");
    interestTd.className = "asset-asset-cell-interest";
    const interestDisplay = document.createElement("span");
    interestDisplay.className = "asset-asset-interest-display";
    interestDisplay.textContent = "";
    interestTd.appendChild(interestDisplay);
    tr.appendChild(interestTd);

    if (deferPrincipalToBeforeMaturityAmt) {
      tr.appendChild(principalTd);
    }

    const maturityAmtTd = document.createElement("td");
    maturityAmtTd.className = "asset-asset-cell-maturity-amt";
    const maturityAmtDisplay = document.createElement("span");
    maturityAmtDisplay.className = "asset-asset-maturity-amt-display";
    maturityAmtDisplay.textContent = "";
    maturityAmtTd.appendChild(maturityAmtDisplay);
    tr.appendChild(maturityAmtTd);

    if (isDeposit) updateDepositMaturityAmt();
    else {
      if (monthsInput && openDateInput.value && monthsInput.value && !maturityDateInput.value) {
        syncSavingsMaturityFromOpenAndMonths();
      }
      updatePrincipalFromCalc();
      updateInterestAndMaturityAmt();
    }

    const actionsTd = document.createElement("td");
    actionsTd.className = "asset-asset-cell-actions";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "asset-asset-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      confirmDeleteRow(() => {
        tr.remove();
        onAssetUpdate();
      });
    });
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

    return tr;
  }

  /**
   * 순자산(총 자산 테이블) 로컬 반영 시점: onAssetUpdate() → 여기.
   * - localStorage: asset_asset_rows, asset_real_estate_rows, asset_stock_rows, asset_insurance_rows, asset_annuity_rows
   * - 이후 window "asset-networth-bundle-saved" → assetNetWorthBundleSupabase 에서 디바운스 upsert
   */
  function saveAssets() {
    const rows = collectAssetRowsFromDOM(assetTableWrap);
    saveAssetRows(rows);
    const realEstateRows = collectRealEstateRowsFromDOM(assetTableWrap);
    saveRealEstateRows(realEstateRows);
    const stockRows = collectStockRowsFromDOM(assetTableWrap);
    saveStockRows(stockRows);
    const insuranceRows = collectInsuranceRowsFromDOM(assetTableWrap);
    saveInsuranceRows(insuranceRows);
    const annuityRows = collectAnnuityRowsFromDOM(assetTableWrap);
    saveAnnuityRows(annuityRows);
    window.dispatchEvent(new CustomEvent("asset-networth-bundle-saved"));
  }

  function updateAssetTotals() {
    ASSET_GROUPS.forEach((g) => {
      const el = subsectionElements[g.key];
      if (!el) return;
      let sum = 0;
      if (el.isStock) {
        let sumPurchase = 0;
        el.tbody.querySelectorAll(".asset-asset-row-stock").forEach((tr) => {
          const purchaseSpan = tr.querySelector(".asset-stock-purchase-amt-display");
          const purchase = parseNum(purchaseSpan?.textContent);
          if (purchase !== null) sumPurchase += purchase;
          const appraisalSpan = tr.querySelector(".asset-stock-appraisal-amt-display");
          const appraisal = parseNum(appraisalSpan?.textContent);
          if (appraisal !== null) sum += appraisal;
        });
        const purchaseCell = el.totalsRow.querySelector(".asset-stock-cell-totals-purchase-amt");
        if (purchaseCell) purchaseCell.textContent = sumPurchase > 0 ? formatNum(sumPurchase) : "";
      } else if (el.isRealEstate) {
        let saleTotal = 0;
        let loanTotal = 0;
        el.tbody.querySelectorAll(".asset-asset-row-real-estate").forEach((tr) => {
          const sale = parseNum(tr.querySelector(".asset-asset-input-sale-price")?.value);
          const loan = parseNum(tr.querySelector(".asset-asset-input-loan")?.value);
          if (sale !== null && loan !== null) sum += sale - loan;
          if (sale !== null) saleTotal += sale;
          if (loan !== null) loanTotal += loan;
        });
        const saleCell = el.totalsRow.querySelector(".asset-asset-cell-totals-sale-price");
        const loanCell = el.totalsRow.querySelector(".asset-asset-cell-totals-loan");
        if (saleCell) saleCell.textContent = saleTotal > 0 ? formatNum(saleTotal) : "";
        if (loanCell) loanCell.textContent = loanTotal > 0 ? formatNum(loanTotal) : "";
      } else if (el.isInsurance) {
        el.tbody.querySelectorAll(".asset-asset-row-insurance").forEach((tr) => {
          const surrender = parseNum(tr.querySelector(".asset-insurance-input-surrender")?.value);
          if (surrender !== null) sum += surrender;
        });
        const surrenderCell = el.totalsRow.querySelector(".asset-insurance-cell-totals-surrender");
        if (surrenderCell) surrenderCell.textContent = sum > 0 ? formatNum(sum) : "-";
      } else if (el.isAnnuity) {
        let monthlyReceiptTotal = 0;
        el.tbody.querySelectorAll(".asset-asset-row-annuity").forEach((tr) => {
          const totalPaid = parseNum(tr.querySelector(".asset-annuity-total-paid-display")?.textContent);
          const monthlyReceipt = parseNum(tr.querySelector(".asset-annuity-input-monthly-receipt")?.value);
          if (totalPaid !== null) sum += totalPaid;
          if (monthlyReceipt !== null) monthlyReceiptTotal += monthlyReceipt;
        });
        const totalPaidCell = el.totalsRow.querySelector(".asset-annuity-cell-totals-total-paid");
        const monthlyReceiptCell = el.totalsRow.querySelector(".asset-annuity-cell-totals-monthly-receipt");
        if (totalPaidCell) totalPaidCell.textContent = sum > 0 ? formatNum(sum) : "";
        if (monthlyReceiptCell) monthlyReceiptCell.textContent = monthlyReceiptTotal > 0 ? formatNum(monthlyReceiptTotal) : "";
      } else {
        let sumMaturityAmt = 0;
        el.tbody.querySelectorAll(".asset-asset-row:not(.asset-asset-row-real-estate):not(.asset-asset-row-stock):not(.asset-asset-row-insurance):not(.asset-asset-row-annuity)").forEach((tr) => {
          if (tr.dataset.matured === "true") return;
          const p = parseNum(tr.querySelector(".asset-asset-input-principal")?.value);
          if (p !== null) sum += p;
          if (g.key === "예금" || g.key === "적금") {
            const m = parseNum(tr.querySelector(".asset-asset-maturity-amt-display")?.textContent);
            if (m !== null) sumMaturityAmt += m;
          }
        });
        const maturityAmtCell = el.totalsRow.querySelector(".asset-asset-cell-totals-maturity-amt");
        if (maturityAmtCell) maturityAmtCell.textContent = sumMaturityAmt > 0 ? formatNum(sumMaturityAmt) : "-";
      }
      const emptyVal = el.isRealEstate || el.isStock ? "" : "-";
      el.totalsCell.textContent = sum > 0 ? formatNum(sum) : emptyVal;
    });
  }

  updateNetWorthDashboard = () => {
    let sumAssets = 0;
    assetTableWrap.querySelectorAll(".asset-asset-row:not(.asset-asset-row-real-estate):not(.asset-asset-row-stock):not(.asset-asset-row-insurance):not(.asset-asset-row-annuity)").forEach((tr) => {
      if (tr.dataset.matured === "true") return;
      const p = parseNum(tr.querySelector(".asset-asset-input-principal")?.value);
      if (p !== null) sumAssets += p;
    });
    assetTableWrap.querySelectorAll(".asset-asset-row-real-estate").forEach((tr) => {
      const sale = parseNum(tr.querySelector(".asset-asset-input-sale-price")?.value);
      const loan = parseNum(tr.querySelector(".asset-asset-input-loan")?.value);
      if (sale !== null && loan !== null) sumAssets += sale - loan;
    });
    assetTableWrap.querySelectorAll(".asset-asset-row-stock").forEach((tr) => {
      const appraisalSpan = tr.querySelector(".asset-stock-appraisal-amt-display");
      const appraisal = parseNum(appraisalSpan?.textContent);
      if (appraisal !== null) sumAssets += appraisal;
    });
    assetTableWrap.querySelectorAll(".asset-asset-row-insurance").forEach((tr) => {
      const surrender = parseNum(tr.querySelector(".asset-insurance-input-surrender")?.value);
      if (surrender !== null) sumAssets += surrender;
    });
    assetTableWrap.querySelectorAll(".asset-asset-row-annuity").forEach((tr) => {
      const totalPaid = parseNum(tr.querySelector(".asset-annuity-total-paid-display")?.textContent);
      if (totalPaid !== null) sumAssets += totalPaid;
    });
    let sumDebt = 0;
    table.querySelectorAll(".asset-debt-row").forEach((tr) => {
      const balanceEl = tr.querySelector(".asset-debt-balance-display");
      const balance = parseNum(balanceEl?.textContent);
      if (balance !== null) sumDebt += balance;
    });
    const netWorth = sumAssets - sumDebt;
    if (assetsValueEl) assetsValueEl.textContent = sumAssets !== 0 ? formatNum(sumAssets) : "-";
    if (debtValueEl) debtValueEl.textContent = sumDebt !== 0 ? formatNum(sumDebt) : "-";
    netWorthValueEl.textContent = netWorth !== 0 ? formatNum(netWorth) : "-";

    const targetVal = parseNum(targetInput.value);
    if (targetVal !== null && targetVal > 0) {
      const remaining = targetVal - netWorth;
      const progressPercent = Math.min(100, Math.max(0, (netWorth / targetVal) * 100));
      targetProgressFill.style.width = `${progressPercent}%`;
      if (remaining <= 0) {
        remainingTextEl.textContent = "목표 달성!";
        remainingTextEl.className = "asset-networth-dashboard-remaining-text asset-networth-dashboard-remaining-success";
      } else {
        remainingTextEl.textContent = `목표까지 ${formatNum(remaining)}원 남음`;
        remainingTextEl.className = "asset-networth-dashboard-remaining-text";
      }
    } else {
      targetProgressFill.style.width = "0%";
      remainingTextEl.textContent = "목표 순자산을 입력하세요";
      remainingTextEl.className = "asset-networth-dashboard-remaining-text";
    }
  };

  function updateAllMaturityRates() {
    assetTableWrap.querySelectorAll(".asset-asset-row").forEach((tr) => {
      const openInput = tr.querySelector(".asset-asset-input-open-date");
      const maturityInput = tr.querySelector(".asset-asset-input-maturity-date");
      const display = tr.querySelector(".asset-asset-maturity-rate-display");
      if (!display) return;
      const rate = calcMaturityRate(openInput?.value, maturityInput?.value);
      display.textContent = rate !== null ? `${rate}%` : "";
      /* matured는 우클릭 '만기로 이동'으로만 변경 (자동 미적용) */
    });
    document.querySelectorAll("[data-deposit-savings-tabs]").forEach((tabsEl) => {
      const active = tabsEl.dataset.activeTab || "in-progress";
      applyDepositSavingsTabFilter(tabsEl, active);
    });
  }

  function applyDepositSavingsTabFilter(tabsEl, tab) {
    tabsEl.dataset.activeTab = tab;
    const section = tabsEl.closest(".asset-asset-subsection");
    if (!section) return;
    const tbody = section.querySelector("tbody");
    if (!tbody) return;
    tbody.querySelectorAll(".asset-asset-row").forEach((tr) => {
      const matured = tr.dataset.matured === "true";
      const show = tab === "in-progress" ? !matured : matured;
      tr.style.display = show ? "" : "none";
    });
    tabsEl.querySelectorAll(".asset-asset-tab-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === tab);
    });
  }

  /** 예·적금·부동산·주식·보험·연금 셀 변경·행 삭제·추가 시마다 호출 → saveAssets + 화면 합계 갱신 */
  const onAssetUpdate = () => {
    updateAllMaturityRates();
    saveAssets();
    updateAssetCount();
    updateAssetTotals();
    updateNetWorthDashboard();
  };

  ASSET_GROUPS.forEach((g) => {
    const isDeposit = g.key === "예금";
    const isSavings = g.key === "예금" || g.key === "적금";
    const subSection = document.createElement("div");
    subSection.className = "asset-asset-subsection";
    subSection.dataset.group = g.key;

    const subHeader = document.createElement("div");
    subHeader.className = "asset-asset-subheader";
    subHeader.innerHTML = `<span class="asset-asset-subtitle">${g.label}</span>`;

    let tabsEl = null;
    if (isDeposit || (isSavings && g.key === "적금")) {
      tabsEl = document.createElement("div");
      tabsEl.className = "asset-asset-deposit-savings-tabs";
      tabsEl.dataset.depositSavingsTabs = "";
      tabsEl.dataset.activeTab = "in-progress";
      tabsEl.innerHTML = `
        <button type="button" class="asset-asset-tab-btn is-active" data-tab="in-progress">보유중</button>
        <button type="button" class="asset-asset-tab-btn" data-tab="matured">만기</button>
      `;
      tabsEl.querySelectorAll(".asset-asset-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => applyDepositSavingsTabFilter(tabsEl, btn.dataset.tab));
      });
    }

    const subTableWrap = document.createElement("div");
    subTableWrap.className = "asset-asset-table-wrap";
    const subTable = document.createElement("table");
    subTable.className =
      "asset-asset-table" +
      (isDeposit ? " asset-asset-table-deposit" : isSavings ? " asset-asset-table-savings" : "");
    if (isDeposit) {
      subTable.innerHTML = `
        <colgroup>
          <col class="asset-asset-col-name">
          <col class="asset-asset-col-category">
          <col class="asset-asset-col-principal">
          <col class="asset-asset-col-rate">
          <col class="asset-asset-col-open-date">
          <col class="asset-asset-col-maturity-date">
          <col class="asset-asset-col-maturity-rate">
          <col class="asset-asset-col-interest">
          <col class="asset-asset-col-maturity-amt">
          <col class="asset-asset-col-actions">
        </colgroup>
        <thead>
          <tr>
            <th class="asset-asset-th-name">상품명</th>
            <th class="asset-asset-th-category">용도</th>
            <th class="asset-asset-th-principal">예치금</th>
            <th class="asset-asset-th-rate">금리(%)</th>
            <th class="asset-asset-th-open-date">가입일</th>
            <th class="asset-asset-th-maturity-date">만기일</th>
            <th class="asset-asset-th-maturity-rate">만기율</th>
            <th class="asset-asset-th-interest">이자</th>
            <th class="asset-asset-th-maturity-amt">만기예상액</th>
            <th class="asset-asset-th-actions"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
    } else if (isSavings) {
      subTable.innerHTML = `
        <colgroup>
          <col class="asset-asset-col-name">
          <col class="asset-asset-col-category">
          <col class="asset-asset-col-monthly">
          <col class="asset-asset-col-rate">
          <col class="asset-asset-col-months">
          <col class="asset-asset-col-open-date">
          <col class="asset-asset-col-maturity-date">
          <col class="asset-asset-col-maturity-rate">
          <col class="asset-asset-col-interest">
          <col class="asset-asset-col-principal">
          <col class="asset-asset-col-maturity-amt">
          <col class="asset-asset-col-actions">
        </colgroup>
        <thead>
          <tr>
            <th class="asset-asset-th-name">상품명</th>
            <th class="asset-asset-th-category">용도</th>
            <th class="asset-asset-th-monthly">월납입액</th>
            <th class="asset-asset-th-rate">금리(%)</th>
            <th class="asset-asset-th-months">개월수</th>
            <th class="asset-asset-th-open-date">가입일</th>
            <th class="asset-asset-th-maturity-date">만기일</th>
            <th class="asset-asset-th-maturity-rate">만기율</th>
            <th class="asset-asset-th-interest">이자</th>
            <th class="asset-asset-th-principal">납입액</th>
            <th class="asset-asset-th-maturity-amt">만기예상액</th>
            <th class="asset-asset-th-actions"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
    } else if (g.key === "부동산") {
      subTable.innerHTML = `
        <colgroup>
          <col class="asset-asset-col-contract">
          <col class="asset-asset-col-sale-price">
          <col class="asset-asset-col-loan">
          <col class="asset-asset-col-asset-value">
          <col class="asset-asset-col-actions">
        </colgroup>
        <thead>
          <tr>
            <th class="asset-asset-th-contract">계약대상</th>
            <th class="asset-asset-th-sale-price">매매가</th>
            <th class="asset-asset-th-loan">대출금</th>
            <th class="asset-asset-th-asset-value">자산가치</th>
            <th class="asset-asset-th-actions"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
    } else if (g.key === "보험") {
      subTable.className = subTable.className + " asset-asset-table-insurance";
      subTable.innerHTML = `
        <colgroup>
          <col class="asset-insurance-col-name">
          <col class="asset-insurance-col-kind">
          <col class="asset-insurance-col-contract-date">
          <col class="asset-insurance-col-maturity-date">
          <col class="asset-insurance-col-monthly">
          <col class="asset-insurance-col-total-paid">
          <col class="asset-insurance-col-surrender">
          <col class="asset-insurance-col-coverage">
          <col class="asset-asset-col-actions">
        </colgroup>
        <thead>
          <tr>
            <th class="asset-insurance-th-name">보험명</th>
            <th class="asset-insurance-th-kind">보험종류</th>
            <th class="asset-insurance-th-contract-date">계약일</th>
            <th class="asset-insurance-th-maturity-date">만기일</th>
            <th class="asset-insurance-th-monthly">월납입액</th>
            <th class="asset-insurance-th-total-paid">총납입액</th>
            <th class="asset-insurance-th-surrender">해지환급금</th>
            <th class="asset-insurance-th-coverage">보장내용</th>
            <th class="asset-asset-th-actions"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
    } else if (g.key === "연금") {
      subTable.className = subTable.className + " asset-asset-table-annuity";
      subTable.innerHTML = `
        <colgroup>
          <col class="asset-annuity-col-name">
          <col class="asset-annuity-col-kind">
          <col class="asset-annuity-col-payment-start">
          <col class="asset-annuity-col-payment-end">
          <col class="asset-annuity-col-payment-years">
          <col class="asset-annuity-col-monthly">
          <col class="asset-annuity-col-total-paid">
          <col class="asset-annuity-col-receipt-start">
          <col class="asset-annuity-col-monthly-receipt">
          <col class="asset-asset-col-actions">
        </colgroup>
        <thead>
          <tr>
            <th class="asset-annuity-th-name">상품명</th>
            <th class="asset-annuity-th-kind">종류</th>
            <th class="asset-annuity-th-payment-start">납입 시작일</th>
            <th class="asset-annuity-th-payment-end">납입종료일</th>
            <th class="asset-annuity-th-payment-years">납입연수</th>
            <th class="asset-annuity-th-monthly">월납입액</th>
            <th class="asset-annuity-th-total-paid">총납입액</th>
            <th class="asset-annuity-th-receipt-start">수령시작일</th>
            <th class="asset-annuity-th-monthly-receipt">월예상수령액</th>
            <th class="asset-asset-th-actions"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
    } else if (g.key === "주식") {
      subTable.className = subTable.className + " asset-asset-table-stock";
      subTable.innerHTML = `
        <colgroup>
          <col class="asset-stock-col-name">
          <col class="asset-stock-col-category">
          <col class="asset-stock-col-avg-price">
          <col class="asset-stock-col-quantity">
          <col class="asset-stock-col-purchase-amt">
          <col class="asset-stock-col-current-price">
          <col class="asset-stock-col-appraisal-amt">
          <col class="asset-stock-col-return-rate">
          <col class="asset-stock-col-profit-loss">
          <col class="asset-stock-col-actions">
        </colgroup>
        <thead>
          <tr>
            <th class="asset-stock-th-name">종목명</th>
            <th class="asset-stock-th-category">주식분류</th>
            <th class="asset-stock-th-avg-price">매입단가</th>
            <th class="asset-stock-th-quantity">보유수량</th>
            <th class="asset-stock-th-purchase-amt">매입금액</th>
            <th class="asset-stock-th-current-price">현재가</th>
            <th class="asset-stock-th-appraisal-amt">평가금액</th>
            <th class="asset-stock-th-return-rate">수익률</th>
            <th class="asset-stock-th-profit-loss">평가손익</th>
            <th class="asset-stock-th-actions"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
    } else {
      subTable.innerHTML = `
        <colgroup>
          <col class="asset-asset-col-name">
          <col class="asset-asset-col-category">
          <col class="asset-asset-col-type">
          <col class="asset-asset-col-principal">
          <col class="asset-asset-col-monthly">
          <col class="asset-asset-col-rate">
          <col class="asset-asset-col-months">
          <col class="asset-asset-col-open-date">
          <col class="asset-asset-col-maturity-date">
          <col class="asset-asset-col-maturity-rate">
          <col class="asset-asset-col-interest">
          <col class="asset-asset-col-maturity-amt">
          <col class="asset-asset-col-actions">
        </colgroup>
        <thead>
          <tr>
            <th class="asset-asset-th-name">자산이름</th>
            <th class="asset-asset-th-category">자산 구분</th>
            <th class="asset-asset-th-type">자산유형</th>
            <th class="asset-asset-th-principal">자산액</th>
            <th class="asset-asset-th-monthly">월납입액</th>
            <th class="asset-asset-th-rate">금리(%)</th>
            <th class="asset-asset-th-months">개월수</th>
            <th class="asset-asset-th-open-date">가입일</th>
            <th class="asset-asset-th-maturity-date">만기일</th>
            <th class="asset-asset-th-maturity-rate">만기율</th>
            <th class="asset-asset-th-interest">이자</th>
            <th class="asset-asset-th-maturity-amt">만기예상액</th>
            <th class="asset-asset-th-actions"></th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
    }

    const subTbody = subTable.querySelector("tbody");
    const isRealEstate = g.key === "부동산";
    const isStock = g.key === "주식";
    const isInsurance = g.key === "보험";
    const isAnnuity = g.key === "연금";
    const subTotalsRow = document.createElement("tr");
    subTotalsRow.className = "asset-asset-row-totals";
    let subTotalsCell;
    if (isStock) {
      subTotalsRow.innerHTML = `
        <td class="asset-asset-cell-totals-label" colspan="5">합계</td>
        <td class="asset-stock-cell-totals-purchase-amt"></td>
        <td class="asset-stock-cell-totals-appraisal-amt"></td>
        <td></td>
        <td></td>
        <td class="asset-stock-cell-actions"></td>
      `;
      subTotalsCell = subTotalsRow.querySelector(".asset-stock-cell-totals-appraisal-amt");
    } else if (isRealEstate) {
      subTotalsRow.innerHTML = `
        <td class="asset-asset-cell-totals-label" colspan="1">합계</td>
        <td class="asset-asset-cell-totals-sale-price"></td>
        <td class="asset-asset-cell-totals-loan"></td>
        <td class="asset-asset-cell-totals-asset-value"></td>
        <td class="asset-asset-cell-actions"></td>
      `;
      subTotalsCell = subTotalsRow.querySelector(".asset-asset-cell-totals-asset-value");
    } else if (isInsurance) {
      subTotalsRow.innerHTML = `
        <td class="asset-asset-cell-totals-label" colspan="6">합계</td>
        <td class="asset-insurance-cell-totals-surrender">-</td>
        <td></td>
        <td class="asset-asset-cell-actions"></td>
      `;
      subTotalsCell = subTotalsRow.querySelector(".asset-insurance-cell-totals-surrender");
    } else if (isAnnuity) {
      subTotalsRow.innerHTML = `
        <td class="asset-asset-cell-totals-label" colspan="6">합계</td>
        <td class="asset-annuity-cell-totals-total-paid"></td>
        <td></td>
        <td class="asset-annuity-cell-totals-monthly-receipt"></td>
        <td class="asset-asset-cell-actions"></td>
      `;
      subTotalsCell = subTotalsRow.querySelector(".asset-annuity-cell-totals-total-paid");
    } else if (isDeposit) {
      subTotalsRow.innerHTML = `
        <td class="asset-asset-cell-totals-label" colspan="2">합계</td>
        <td class="asset-asset-cell-totals-principal">-</td>
        ${Array(5).fill("<td></td>").join("")}
        <td class="asset-asset-cell-totals-maturity-amt">-</td>
        <td class="asset-asset-cell-actions"></td>
      `;
      subTotalsCell = subTotalsRow.querySelector(".asset-asset-cell-totals-principal");
    } else if (isSavings) {
      subTotalsRow.innerHTML = `
        <td class="asset-asset-cell-totals-label" colspan="2">합계</td>
        ${Array(7).fill("<td></td>").join("")}
        <td class="asset-asset-cell-totals-principal">-</td>
        <td class="asset-asset-cell-totals-maturity-amt">-</td>
        <td class="asset-asset-cell-actions"></td>
      `;
      subTotalsCell = subTotalsRow.querySelector(".asset-asset-cell-totals-principal");
    } else {
      const totalsColspan = 3;
      const totalsEmptyCells = 8;
      subTotalsRow.innerHTML = `
        <td class="asset-asset-cell-totals-label" colspan="${totalsColspan}">합계</td>
        <td class="asset-asset-cell-totals-principal">-</td>
        ${Array(totalsEmptyCells).fill("<td></td>").join("")}
        <td class="asset-asset-cell-totals-maturity-amt">-</td>
        <td class="asset-asset-cell-actions"></td>
      `;
      subTotalsCell = subTotalsRow.querySelector(".asset-asset-cell-totals-principal");
    }
    const subAddBtn = document.createElement("button");
    subAddBtn.type = "button";
    subAddBtn.className = "asset-asset-add-task";
    subAddBtn.innerHTML = '<span class="asset-asset-add-icon">+</span>';
    subTbody.appendChild(subTotalsRow);

    subAddBtn.addEventListener("click", () => {
      if (isStock) {
        const tr = createStockRow({}, onAssetUpdate);
        subTbody.insertBefore(tr, subTotalsRow);
      } else if (isRealEstate) {
        if (subTbody.querySelector(".asset-asset-row-real-estate.asset-asset-row--draft")) {
          showToast("입력을 저장하거나 취소한 뒤에 새 항목을 추가해 주세요.", "");
          return;
        }
        const tr = createRealEstateRow({}, onAssetUpdate, { mode: "draft" });
        subTbody.insertBefore(tr, subTotalsRow);
      } else if (isInsurance) {
        const tr = createInsuranceRow({}, onAssetUpdate);
        subTbody.insertBefore(tr, subTotalsRow);
      } else if (isAnnuity) {
        const tr = createAnnuityRow({}, onAssetUpdate);
        subTbody.insertBefore(tr, subTotalsRow);
      } else {
        const tr = createAssetRow(
          isSavings ? { assetCategory: "", assetType: g.defaultType } : { assetType: g.defaultType },
          onAssetUpdate,
          isSavings,
          isSavings ? g.defaultType : undefined,
          isDeposit
        );
        subTbody.insertBefore(tr, subTotalsRow);
      }
      onAssetUpdate();
    });

    subsectionElements[g.key] = { tbody: subTbody, totalsRow: subTotalsRow, totalsCell: subTotalsCell, isRealEstate, isStock, isInsurance, isAnnuity };

    if (tabsEl) {
      subTbody.addEventListener("contextmenu", (e) => {
        const tr = e.target.closest(".asset-asset-row");
        if (!tr || tr.dataset.savings !== "true") return;
        e.preventDefault();
        const menu = document.createElement("div");
        menu.className = "asset-asset-maturity-context-menu";
        menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:100000;`;
        const isMatured = tr.dataset.matured === "true";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "asset-asset-maturity-context-menu-item";
        btn.textContent = isMatured ? "보유중으로 이동" : "만기로 이동";
        btn.addEventListener("click", () => {
          tr.dataset.matured = isMatured ? "false" : "true";
          document.body.removeChild(menu);
          document.removeEventListener("click", hide);
          document.removeEventListener("contextmenu", hide);
          onAssetUpdate();
        });
        menu.appendChild(btn);
        const hide = () => {
          if (menu.parentNode) document.body.removeChild(menu);
          document.removeEventListener("click", hide);
          document.removeEventListener("contextmenu", hide);
        };
        document.body.appendChild(menu);
        requestAnimationFrame(() => {
          document.addEventListener("click", hide);
          document.addEventListener("contextmenu", hide);
        });
      });
    }

    subTableWrap.appendChild(subTable);
    const assetTableContainer = document.createElement("div");
    assetTableContainer.className = "asset-asset-table-container";
    assetTableContainer.appendChild(subTableWrap);
    const assetAddButtonWrap = document.createElement("div");
    assetAddButtonWrap.className = "asset-asset-add-button-wrap";
    assetAddButtonWrap.appendChild(subAddBtn);
    assetTableContainer.appendChild(assetAddButtonWrap);
    subSection.appendChild(subHeader);
    if (tabsEl) subSection.appendChild(tabsEl);
    subSection.appendChild(assetTableContainer);
    assetTableWrap.appendChild(subSection);
  });

  const initialAssetRows = loadAssetRows();
  initialAssetRows.forEach((row) => {
    const assetType = row.assetType || "";
    if (assetType === "부동산" || assetType === "부동산 전월세 보증금") return;
    const group = getAssetGroup(assetType);
    const el = subsectionElements[group];
    const isSavings = group === "예금" || group === "적금";
    const savingsDefaultType = group === "예금" ? "CMA" : group === "적금" ? "예적금잔고" : "예적금잔고";
    const isDeposit = group === "예금";
    if (el && !el.isRealEstate) {
      const tr = createAssetRow(row, onAssetUpdate, isSavings, savingsDefaultType, isDeposit);
      el.tbody.insertBefore(tr, el.totalsRow);
    } else if (!el) {
      const el2 = subsectionElements["예금"];
      if (el2) {
        const tr = createAssetRow(row, onAssetUpdate, true, "CMA", true);
        el2.tbody.insertBefore(tr, el2.totalsRow);
      }
    }
  });

  const realEstateEl = subsectionElements["부동산"];
  if (realEstateEl) {
    const initialRealEstateRows = loadRealEstateRows();
    initialRealEstateRows.forEach((row) => {
      const tr = createRealEstateRow(row, onAssetUpdate, { mode: "view" });
      realEstateEl.tbody.insertBefore(tr, realEstateEl.totalsRow);
    });
  }

  const insuranceEl = subsectionElements["보험"];
  if (insuranceEl) {
    loadInsuranceRows().forEach((row) => {
      const tr = createInsuranceRow(row, onAssetUpdate);
      insuranceEl.tbody.insertBefore(tr, insuranceEl.totalsRow);
    });
  }

  const annuityEl = subsectionElements["연금"];
  if (annuityEl) {
    loadAnnuityRows().forEach((row) => {
      const tr = createAnnuityRow(row, onAssetUpdate);
      annuityEl.tbody.insertBefore(tr, annuityEl.totalsRow);
    });
  }

  function updateAssetCount() {
    const count = assetTableWrap.querySelectorAll(".asset-asset-row").length;
    assetHeader.querySelector(".asset-asset-count").textContent = count;
  }

  updateAssetCount();
  updateAllMaturityRates();
  updateAssetTotals();
  updateNetWorthDashboard();
  assetSection.appendChild(assetHeader);
  assetSection.appendChild(assetTableWrap);
  wrap.appendChild(assetSection);

  return wrap;
}

function renderExpenseView(options = {}) {
  const expenseMobile =
    typeof window !== "undefined" && window.matchMedia("(max-width: 48rem)").matches;

  const wrap = document.createElement("div");
  wrap.className =
    "asset-expense-view" + (expenseMobile ? " asset-expense-view--mobile" : "");

  const now = new Date();
  let filterType = expenseMobile ? "range" : "month";
  let filterYear = now.getFullYear();
  let filterMonth = now.getMonth() + 1;
  let filterStartDate = getTodayDateStr();
  let filterEndDate = getTodayDateStr();

  let expenseFilterPullTimer = null;
  /** 날짜·월 필터에 맞는 구간만 서버에서 받아 표 갱신 */
  let scheduleExpenseMemPullFromServer = () => {};

  function getTodayDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function formatDateForDayFilter(dateStr) {
    if (!dateStr || dateStr.length < 10) return "";
    const d = new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const weekday = d.toLocaleDateString("ko-KR", { weekday: "short" });
    return `${month}월 ${day}일 (${weekday})`;
  }

  /** 모바일 구간 필터 라벨 — 근무표·아카이브와 동일 톤 */
  function formatExpenseFilterDateKr(dStr) {
    if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
    const [y, mo, d] = dStr.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    return `${y}년 ${mo}월 ${d}일(${weekdays[dt.getDay()]})`;
  }

  const filterBar = document.createElement("div");
  filterBar.className = "asset-expense-filter-bar";
  if (expenseMobile) {
    filterBar.innerHTML = `
      <div class="time-filter-nav-cluster asset-expense-date-nav-cluster">
        <div class="time-filter-range-wrap asset-expense-date-range-wrap" data-filter-wrap="range">
          <div class="time-filter-date-field">
            <input type="date" class="time-filter-start-date" name="asset-filter-start" aria-label="시작일" />
            <span class="time-filter-date-label time-filter-date-label--start" aria-hidden="true"></span>
            <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
          </div>
          <span class="time-filter-range-sep">~</span>
          <div class="time-filter-date-field">
            <input type="date" class="time-filter-end-date" name="asset-filter-end" aria-label="종료일" />
            <span class="time-filter-date-label time-filter-date-label--end" aria-hidden="true"></span>
            <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
          </div>
        </div>
      </div>
    `;
  } else {
    filterBar.innerHTML = `
    <div class="time-filter-tabs todo-category-tabs time-view-tabs time-view-tabs--segmented todo-list-segment-tabs">
      <span class="time-view-tabs-thumb" aria-hidden="true"></span>
      <button type="button" class="time-filter-btn time-view-tab active" data-filter="month">월별</button>
      <button type="button" class="time-filter-btn time-view-tab" data-filter="day">하루</button>
      <button type="button" class="time-filter-btn time-view-tab" data-filter="range">날짜 선택</button>
    </div>
    <div class="time-filter-day-wrap" data-filter-wrap="day" style="display:none">
      <div class="time-filter-day-nav">
        <button type="button" class="time-filter-day-prev" aria-label="이전 날짜">
          <img src="/toolbaricons/caret-left-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
        </button>
        <span class="time-filter-day-display">${formatDateForDayFilter(filterStartDate)}</span>
        <button type="button" class="time-filter-day-next" aria-label="다음 날짜">
          <img src="/toolbaricons/caret-right-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="time-filter-month-wrap" data-filter-wrap="month">
      <div class="asset-cashflow-month-nav" aria-label="월 선택">
        <button type="button" class="asset-cashflow-year-btn asset-expense-month-prev" aria-label="이전 달">
          <img src="/toolbaricons/caret-left-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
        </button>
        <span class="asset-cashflow-month-display" id="asset-expense-month-display">${filterMonth}월</span>
        <button type="button" class="asset-cashflow-year-btn asset-expense-month-next" aria-label="다음 달">
          <img src="/toolbaricons/caret-right-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
        </button>
      </div>
      <div class="asset-cashflow-year-nav" aria-label="연도 선택">
        <button type="button" class="asset-cashflow-year-btn" aria-label="이전 연도">
          <img src="/toolbaricons/caret-left-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
        </button>
        <span class="asset-cashflow-year-display">${filterYear}</span>
        <button type="button" class="asset-cashflow-year-btn" aria-label="다음 연도">
          <img src="/toolbaricons/caret-right-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div class="time-filter-range-wrap" data-filter-wrap="range" style="display:none">
      <input type="date" class="time-filter-start-date" name="asset-filter-start" />
      <span>~</span>
      <input type="date" class="time-filter-end-date" name="asset-filter-end" />
    </div>
  `;
  }

  const dayWrap = filterBar.querySelector("[data-filter-wrap='day']");
  const monthWrap = filterBar.querySelector("[data-filter-wrap='month']");
  const rangeWrap = filterBar.querySelector("[data-filter-wrap='range']");
  const dayDisplay = filterBar.querySelector(".time-filter-day-display");
  const dayPrevBtn = filterBar.querySelector(".time-filter-day-prev");
  const dayNextBtn = filterBar.querySelector(".time-filter-day-next");
  const startDateInput = filterBar.querySelector(".time-filter-start-date");
  const endDateInput = filterBar.querySelector(".time-filter-end-date");
  const monthDisplayEl = filterBar.querySelector("#asset-expense-month-display");
  const monthPrevBtn = filterBar.querySelector(".asset-expense-month-prev");
  const monthNextBtn = filterBar.querySelector(".asset-expense-month-next");
  const yearDisplay = filterBar.querySelector(".time-filter-month-wrap .asset-cashflow-year-display");
  const yearPrevBtn = filterBar.querySelector(".time-filter-month-wrap .asset-cashflow-year-nav .asset-cashflow-year-btn:first-child");
  const yearNextBtn = filterBar.querySelector(".time-filter-month-wrap .asset-cashflow-year-nav .asset-cashflow-year-btn:last-child");

  function syncExpenseMonthYearLabels() {
    if (monthDisplayEl) monthDisplayEl.textContent = `${filterMonth}월`;
    if (yearDisplay) yearDisplay.textContent = String(filterYear);
  }

  if (!expenseMobile && monthWrap) {
    monthPrevBtn?.addEventListener("click", () => {
      filterMonth -= 1;
      if (filterMonth < 1) {
        filterMonth = 12;
        filterYear -= 1;
      }
      syncExpenseMonthYearLabels();
      applyExpenseFilter();
      syncExpenseFooterSummaryLabel();
      scheduleExpenseMemPullFromServer();
    });
    monthNextBtn?.addEventListener("click", () => {
      filterMonth += 1;
      if (filterMonth > 12) {
        filterMonth = 1;
        filterYear += 1;
      }
      syncExpenseMonthYearLabels();
      applyExpenseFilter();
      syncExpenseFooterSummaryLabel();
      scheduleExpenseMemPullFromServer();
    });
    yearPrevBtn?.addEventListener("click", () => {
      filterYear -= 1;
      syncExpenseMonthYearLabels();
      applyExpenseFilter();
      syncExpenseFooterSummaryLabel();
      scheduleExpenseMemPullFromServer();
    });
    yearNextBtn?.addEventListener("click", () => {
      filterYear += 1;
      syncExpenseMonthYearLabels();
      applyExpenseFilter();
      syncExpenseFooterSummaryLabel();
      scheduleExpenseMemPullFromServer();
    });
  }

  function updateDayDisplay() {
    if (dayDisplay) dayDisplay.textContent = formatDateForDayFilter(filterStartDate);
  }

  dayPrevBtn?.addEventListener("click", () => {
    const d = new Date(filterStartDate + "T12:00:00");
    d.setDate(d.getDate() - 1);
    filterStartDate = filterEndDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    startDateInput.value = filterStartDate;
    endDateInput.value = filterEndDate;
    updateDayDisplay();
    applyExpenseFilter();
    syncExpenseFooterSummaryLabel();
    scheduleExpenseMemPullFromServer();
  });
  dayNextBtn?.addEventListener("click", () => {
    const d = new Date(filterStartDate + "T12:00:00");
    d.setDate(d.getDate() + 1);
    filterStartDate = filterEndDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    startDateInput.value = filterStartDate;
    endDateInput.value = filterEndDate;
    updateDayDisplay();
    applyExpenseFilter();
    syncExpenseFooterSummaryLabel();
    scheduleExpenseMemPullFromServer();
  });

  startDateInput.value = filterStartDate;
  endDateInput.value = filterEndDate;

  function syncExpenseDateLabels() {
    const startLabel = filterBar.querySelector(".time-filter-date-label--start");
    const endLabel = filterBar.querySelector(".time-filter-date-label--end");
    if (startLabel) startLabel.textContent = formatExpenseFilterDateKr(startDateInput.value || "");
    if (endLabel) endLabel.textContent = formatExpenseFilterDateKr(endDateInput.value || "");
  }

  if (expenseMobile) {
    syncExpenseDateLabels();
    startDateInput.addEventListener("input", syncExpenseDateLabels);
    endDateInput.addEventListener("input", syncExpenseDateLabels);
    const openExpenseRangeDate = (inp) => {
      if (!inp) return;
      try {
        inp.focus({ preventScroll: true });
      } catch (_) {
        inp.focus();
      }
      if (typeof inp.showPicker === "function") {
        try {
          inp.showPicker();
          return;
        } catch (_) {
          /* Safari 등 */
        }
      }
      inp.click();
    };
    filterBar.querySelectorAll(".time-filter-date-field").forEach((field) => {
      const inp = field.querySelector('input[type="date"]');
      if (!inp) return;
      field.addEventListener("click", () => {
        openExpenseRangeDate(inp);
      });
    });
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "asset-expense-table-wrap";
  const cardsListEl = document.createElement("div");
  cardsListEl.className = "asset-expense-cards-list asset-expense-ledger-board";
  const ledgerBoardShell = document.createElement("div");
  ledgerBoardShell.className = "asset-expense-ledger-board-shell";
  const ledgerColumnHead = document.createElement("div");
  ledgerColumnHead.className = "asset-expense-ledger-column-head";
  ledgerColumnHead.setAttribute("role", "presentation");
  ledgerColumnHead.innerHTML = `
    <span class="asset-expense-ledger-col asset-expense-ledger-col--detail">내역</span>
    <span class="asset-expense-ledger-col asset-expense-ledger-col--amount">금액</span>
    <span class="asset-expense-ledger-col asset-expense-ledger-col--date">날짜</span>
    <span class="asset-expense-ledger-col asset-expense-ledger-col--tags">태그</span>
  `;
  const ledgerBoardBody = document.createElement("div");
  ledgerBoardBody.className = "asset-expense-ledger-board-body";
  ledgerBoardShell.appendChild(ledgerColumnHead);
  ledgerBoardShell.appendChild(ledgerBoardBody);
  cardsListEl.appendChild(ledgerBoardShell);
  const summaryCardsEl = document.createElement("div");
  summaryCardsEl.className = "asset-expense-summary-cards";
  summaryCardsEl.innerHTML = `
    <div class="asset-expense-summary-card asset-expense-summary-card--income" aria-label="수입 합계">
      <span class="asset-expense-summary-card-label">수입</span>
      <span class="asset-expense-summary-card-value asset-expense-summary-card-value--income">-</span>
      <span class="asset-expense-summary-card-hint">표시 중 합계</span>
    </div>
    <div class="asset-expense-summary-card asset-expense-summary-card--expense" aria-label="지출 합계">
      <span class="asset-expense-summary-card-label">지출</span>
      <span class="asset-expense-summary-card-value asset-expense-summary-card-value--expense">-</span>
      <span class="asset-expense-summary-card-hint">표시 중 합계</span>
    </div>
    <div class="asset-expense-summary-card asset-expense-summary-card--net" aria-label="수입–지출 순액">
      <span class="asset-expense-summary-card-label">총합계</span>
      <span class="asset-expense-summary-card-value asset-expense-summary-card-value--net">-</span>
      <span class="asset-expense-summary-card-hint">표시 중 기준</span>
    </div>
  `;
  const summaryIncomeEl = summaryCardsEl.querySelector(".asset-expense-summary-card-value--income");
  const summaryExpenseEl = summaryCardsEl.querySelector(".asset-expense-summary-card-value--expense");
  const summaryNetEl = summaryCardsEl.querySelector(".asset-expense-summary-card-value--net");

  const summaryBar = document.createElement("div");
  summaryBar.className = "asset-expense-summary-bar";
  summaryBar.innerHTML = `
    <span class="asset-expense-summary-label">합계</span>
    <span class="asset-expense-summary-total">-</span>
  `;
  const totalEl = summaryBar.querySelector(".asset-expense-summary-total");

  function formatExpenseLedgerDayTitle(dateStr) {
    const slice = String(dateStr || "").slice(0, 10);
    if (!slice || !/^\d{4}-\d{2}-\d{2}$/.test(slice)) return "";
    const d = new Date(slice + "T12:00:00");
    if (isNaN(d.getTime())) return slice;
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    return `${String(mo).padStart(2, "0")}월 ${String(day).padStart(2, "0")}일 ${weekdays[d.getDay()]}요일`;
  }

  /** 행 하나의 입금(+)·지출(-) 부호 금액 (미선택·파싱 불가 시 null) */
  function expenseRowSignedAmount(rowEl) {
    const amtRaw = parseNum(rowEl.querySelector(".asset-expense-input-amount")?.value);
    const flowType = rowEl.querySelector(".asset-expense-input-flow-type")?.value || "";
    if (amtRaw === null || (flowType !== "입금" && flowType !== "지출")) return null;
    return flowType === "입금" ? Math.abs(amtRaw) : -Math.abs(amtRaw);
  }

  function syncExpenseFooterSummaryLabel() {
    const labelSpan = summaryBar.querySelector(".asset-expense-summary-label");
    if (!labelSpan) return;
    if (filterType === "month") {
      labelSpan.textContent = `${filterMonth}월 합계`;
    } else if (filterType === "day") {
      const t = formatExpenseLedgerDayTitle(filterStartDate);
      labelSpan.textContent = t ? `${t} 합계` : "합계";
    } else {
      labelSpan.textContent = "기간 합계";
    }
  }

  /** 날짜별 구역으로 카드 재배치 (표시 순서·그룹 헤더 동기화). 초기 진입 시에도 노드 트리에 붙기 전에 호출되므로 isConnected 로 막지 않음 */
  function layoutExpenseLedgerGroups() {
    if (!ledgerBoardBody) return;
    const rows = [...cardsListEl.querySelectorAll(".asset-expense-row")];
    rows.forEach((r) => r.remove());

    rows.sort((a, b) => {
      const da = (a.querySelector(".asset-expense-input-date")?.value || "").slice(0, 10);
      const db = (b.querySelector(".asset-expense-input-date")?.value || "").slice(0, 10);
      if (da !== db) return db.localeCompare(da);
      const ida = String(a.dataset.assetExpenseRowId || "");
      const idb = String(b.dataset.assetExpenseRowId || "");
      return idb.localeCompare(ida);
    });

    const byDate = new Map();
    for (const row of rows) {
      const ds = (row.querySelector(".asset-expense-input-date")?.value || "").slice(0, 10);
      const key = ds || "_nodate";
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(row);
    }

    const dates = [...byDate.keys()].sort((a, b) => {
      if (a === "_nodate") return 1;
      if (b === "_nodate") return -1;
      return b.localeCompare(a);
    });

    ledgerBoardBody.replaceChildren();

    for (const dateKey of dates) {
      const groupRows = byDate.get(dateKey);
      const group = document.createElement("section");
      group.className = "asset-expense-ledger-day-group";
      group.dataset.expenseLedgerDate = dateKey === "_nodate" ? "" : dateKey;

      const head = document.createElement("div");
      head.className = "asset-expense-ledger-day-head";
      const titleEl = document.createElement("span");
      titleEl.className = "asset-expense-ledger-day-title";
      titleEl.textContent =
        dateKey === "_nodate" ? "날짜 미입력" : formatExpenseLedgerDayTitle(dateKey);
      const ruleEl = document.createElement("span");
      ruleEl.className = "asset-expense-ledger-day-head-rule";
      ruleEl.setAttribute("aria-hidden", "true");
      const dayTotalEl = document.createElement("span");
      dayTotalEl.className = "asset-expense-ledger-day-total";
      head.appendChild(titleEl);
      head.appendChild(ruleEl);
      head.appendChild(dayTotalEl);

      const rowsWrap = document.createElement("div");
      rowsWrap.className = "asset-expense-ledger-day-rows";
      groupRows.forEach((r) => rowsWrap.appendChild(r));

      group.appendChild(head);
      group.appendChild(rowsWrap);
      ledgerBoardBody.appendChild(group);
    }

    refreshExpenseLedgerDayGroupsFromFilter();
  }

  /** 필터 반영 후 일자 블록 표시 여부·당일 순액 갱신 */
  function refreshExpenseLedgerDayGroupsFromFilter() {
    ledgerBoardBody?.querySelectorAll(".asset-expense-ledger-day-group").forEach((group) => {
      let net = 0;
      let anyVisible = false;
      group.querySelectorAll(".asset-expense-row").forEach((row) => {
        if (row.style.display === "none" || row.hidden) return;
        anyVisible = true;
        const v = expenseRowSignedAmount(row);
        if (v !== null) net += v;
      });
      group.style.display = anyVisible ? "" : "none";
      const dayTotalSpan = group.querySelector(".asset-expense-ledger-day-total");
      if (!dayTotalSpan || !anyVisible) return;
      dayTotalSpan.textContent =
        net === 0 ? "0원" : `${net > 0 ? "+" : ""}${formatNum(net)}원`;
      dayTotalSpan.classList.toggle("asset-expense-ledger-day-total--positive", net > 0);
      dayTotalSpan.classList.toggle("asset-expense-ledger-day-total--negative", net < 0);
    });
  }

  function isDateInRange(dateStr, type, y, m, start, end) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    if (type === "day" && start) {
      const sel = new Date(start + "T12:00:00");
      return d.getFullYear() === sel.getFullYear() && d.getMonth() === sel.getMonth() && d.getDate() === sel.getDate();
    }
    if (type === "week") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      d.setHours(0, 0, 0, 0);
      return d >= weekAgo && d <= today;
    }
    if (type === "month") {
      return d.getFullYear() === y && d.getMonth() === m - 1;
    }
    if (type === "range" && start && end) {
      const s = new Date(start);
      const e = new Date(end);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      d.setHours(0, 0, 0, 0);
      return d >= s && d <= e;
    }
    return true;
  }

  /** Supabase transaction_date 범위 질의용 YYYY-MM-DD (월/일/구간 탭 공통) */
  function getExpensePickerSqlBounds() {
    if (filterType === "day") {
      const d = (filterStartDate || "").slice(0, 10);
      return { from: d, to: d };
    }
    if (filterType === "month") {
      const last = new Date(filterYear, filterMonth, 0).getDate();
      const from = `${filterYear}-${String(filterMonth).padStart(2, "0")}-01`;
      const to = `${filterYear}-${String(filterMonth).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
      return { from, to };
    }
    let s = (startDateInput?.value || filterStartDate || "").slice(0, 10);
    let e = (endDateInput?.value || filterEndDate || "").slice(0, 10);
    if (s && e && s > e) [s, e] = [e, s];
    return { from: s, to: e };
  }

  function applyExpenseFilter() {
    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    cardsListEl.querySelectorAll(".asset-expense-row").forEach((rowEl) => {
      const dateInput = rowEl.querySelector(".asset-expense-input-date");
      const dateStr = dateInput?.value || "";
      const show = isDateInRange(dateStr, type, y, m, start, end);
      rowEl.style.display = show ? "" : "none";
    });
    refreshExpenseLedgerDayGroupsFromFilter();
    updateExpenseTotals();
  }

  function updateExpenseTotals() {
    let incomeSum = 0;
    let expenseSum = 0;
    cardsListEl.querySelectorAll(".asset-expense-row").forEach((tr) => {
      if (tr.style.display === "none" || tr.hidden) return;
      const amtRaw = parseNum(tr.querySelector(".asset-expense-input-amount")?.value);
      const flowType = tr.querySelector(".asset-expense-input-flow-type")?.value || "";
      if (amtRaw !== null && (flowType === "입금" || flowType === "지출")) {
        const amt = Math.abs(amtRaw);
        if (flowType === "입금") incomeSum += amt;
        else expenseSum += amt;
      }
    });
    const net = incomeSum - expenseSum;
    totalEl.textContent = net !== 0 ? `${net > 0 ? "+" : ""}${formatNum(net)}원` : "-";
    totalEl.classList.toggle("asset-expense-summary-total--positive", net > 0);
    totalEl.classList.toggle("asset-expense-summary-total--negative", net < 0);
    if (summaryIncomeEl)
      summaryIncomeEl.textContent = incomeSum !== 0 ? `+${formatNum(incomeSum)}원` : "-";
    if (summaryExpenseEl)
      summaryExpenseEl.textContent = expenseSum !== 0 ? `-${formatNum(expenseSum)}원` : "-";
    if (summaryNetEl)
      summaryNetEl.textContent =
        net !== 0 ? `${net > 0 ? "+" : ""}${formatNum(net)}원` : "-";
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "todo-list-toolbar-quick-add todo-add-btn time-ledger-add-plus-btn";
  addBtn.innerHTML = ASSET_EXPENSE_LEDGER_PLUS_SVG;
  addBtn.title = "거래 추가";
  addBtn.setAttribute("aria-label", "거래 추가");

  function getTodayDateValue() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function formatDateYYMMDD(val) {
    if (!val) return "";
    const [y, m, d] = val.split("-");
    if (!y || !m || !d) return val;
    return `${y}/${m}/${d}`;
  }

  function saveExpense() {
    const domRows = collectExpenseRowsFromDOM(cardsListEl);
    const domIds = new Set(domRows.map((r) => String(r.id || "").trim()).filter(Boolean));
    const prev = loadExpenseRows();
    const { from: pf, to: pt } = getExpensePickerSqlBounds();
    const inPicker = (dateStr) => {
      const d = String(dateStr || "").slice(0, 10);
      return pf && pt && d >= pf.slice(0, 10) && d <= pt.slice(0, 10);
    };
    const kept = prev.filter((r) => {
      const id = String(r?.id || "").trim();
      if (!id) return true;
      if (domIds.has(id)) return false;
      if (inPicker(r.date)) return false;
      return true;
    });
    const merged = [...kept, ...domRows];
    const nextIds = new Set(merged.map((r) => String(r?.id || "").trim()).filter(Boolean));
    const removedServerIds = prev
      .map((r) => String(r?.id || "").trim())
      .filter((id) => EXPENSE_ROW_UUID_RE.test(id) && !nextIds.has(id));
    saveExpenseRows(merged);
    if (removedServerIds.length) {
      void deleteAssetExpenseTransactionsFromSupabase(removedServerIds).catch(() => {});
    }
    window.dispatchEvent(new CustomEvent("asset-expense-transactions-saved"));
  }

  function openExpenseTransactionModal({
    mode,
    data = {},
    memSnapshot = null,
    replaceCardEl = null,
  }) {
    if (document.querySelector(".asset-expense-transaction-modal")) {
      showToast("입력 창을 닫은 뒤 다시 시도해 주세요.", "");
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "asset-expense-transaction-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    if (mode !== "draft") {
      const nm = String(data?.name || "").trim();
      overlay.setAttribute("aria-label", nm ? `거래 수정: ${nm}` : "거래 수정");
    } else {
      overlay.setAttribute("aria-label", "새 거래");
    }

    const backdrop = document.createElement("div");
    backdrop.className = "asset-expense-transaction-modal-backdrop";

    const panelShell = document.createElement("div");
    panelShell.className = "asset-expense-transaction-modal-panel-shell";

    if (replaceCardEl) replaceCardEl.classList.add("asset-expense-row--ledger-modal-target");

    const expenseModalCtx = {
      cancel() {
        if (replaceCardEl) replaceCardEl.classList.remove("asset-expense-row--ledger-modal-target");
        overlay.remove();
      },
      commit(d) {
        if (replaceCardEl) replaceCardEl.classList.remove("asset-expense-row--ledger-modal-target");
        overlay.remove();
        const viewRow = createExpenseRow(d, updateExpenseTotals, applyExpenseFilter, { mode: "view" });
        if (replaceCardEl) {
          replaceCardEl.replaceWith(viewRow);
        } else {
          cardsListEl.appendChild(viewRow);
        }
        saveExpense();
        layoutExpenseLedgerGroups();
        applyExpenseFilter();
      },
      deleteCard() {
        if (replaceCardEl) replaceCardEl.classList.remove("asset-expense-row--ledger-modal-target");
        overlay.remove();
        if (replaceCardEl) replaceCardEl.remove();
        saveExpense();
        layoutExpenseLedgerGroups();
        applyExpenseFilter();
      },
    };

    backdrop.addEventListener("click", () => expenseModalCtx.cancel());

    const formRoot =
      mode === "draft"
        ? createExpenseRow({}, updateExpenseTotals, applyExpenseFilter, {
            mode: "draft",
            expenseModalCtx,
          })
        : createExpenseRow({ ...data }, updateExpenseTotals, applyExpenseFilter, {
            mode: "edit",
            memSnapshot: memSnapshot || data,
            expenseModalCtx,
          });

    panelShell.appendChild(formRoot);
    overlay.appendChild(backdrop);
    overlay.appendChild(panelShell);
    document.body.appendChild(overlay);
  }

  function createExpenseRow(data = {}, onTotalsUpdate, onFilterApply, options = {}) {
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const mode =
      options.mode != null
        ? options.mode
        : (data && data.id && uuidRe.test(String(data.id).trim()) ? "view" : "draft");
    const isView = mode === "view";
    const isDraft = mode === "draft";
    const isEdit = mode === "edit";
    const expenseModalCtx = options.expenseModalCtx || null;
    const memSnapshot = isEdit
      ? options.memSnapshot
        ? { ...options.memSnapshot }
        : { ...data }
      : null;

    const usePanel = isDraft || isEdit;
    const rowEl = document.createElement(usePanel ? "div" : "article");
    rowEl.className = "asset-expense-row";
    if (isView) rowEl.classList.add("asset-expense-card");

    let rowId = "";
    if (data && data.id && uuidRe.test(String(data.id).trim())) {
      rowId = String(data.id).trim();
    } else if (!isDraft) {
      rowId = newExpenseRowId() || "";
    }
    if (rowId) rowEl.dataset.assetExpenseRowId = rowId;
    if (isDraft) rowEl.classList.add("asset-expense-row--draft");
    if (isEdit) rowEl.classList.add("asset-expense-row--editing");

    const todayValue = getTodayDateValue();
    const dateValue = data.date || todayValue;
    const dateDisplayVal = formatDateYYMMDD(dateValue);
    const flowTypeValue = data.flowType ?? (data.category === "수입" ? "입금" : data.category ? "지출" : "");
    const fieldsRowHtml = `
      <div class="asset-expense-card-inner asset-expense-card-inner--ledger">
        <div class="asset-expense-ledger-col asset-expense-ledger-col--detail">
          <div class="asset-expense-ledger-detail-inner">
            <div class="asset-expense-ledger-icon-slot" aria-hidden="true"><span class="asset-expense-ledger-icon-inner"></span></div>
            <div class="asset-expense-ledger-text-stack">
              <div class="asset-expense-cell-name"><input type="text" class="asset-expense-input-name" name="asset-expense-name" placeholder="" value="${(data.name || "").replace(/"/g, "&quot;")}" /></div>
            </div>
          </div>
        </div>
        <div class="asset-expense-ledger-col asset-expense-ledger-col--amount">
          <div class="asset-expense-cell-amount"><input type="text" class="asset-expense-input-amount" name="asset-expense-amount" placeholder="0" value="${expenseAmountInitialInputValue(data.amount || "").replace(/"/g, "&quot;")}" /></div>
        </div>
        <div class="asset-expense-ledger-col asset-expense-ledger-col--date">
          <div class="asset-expense-cell-date">
            <span class="asset-expense-date-display">${dateDisplayVal}</span>
            <input type="date" class="asset-expense-input-date" name="asset-expense-date" value="${dateValue}" tabindex="-1" />
          </div>
        </div>
        <div class="asset-expense-ledger-col asset-expense-ledger-col--tags">
          <div class="asset-expense-ledger-line asset-expense-ledger-line--chips">
            <div class="asset-expense-cell-flow-type"></div>
            <div class="asset-expense-cell-classification"></div>
            <div class="asset-expense-cell-category"></div>
            <div class="asset-expense-cell-payment"></div>
          </div>
        </div>
      </div>
    `;
    const formStackHtml = `
      <div class="asset-expense-form-stack" role="group" aria-label="거래 입력">
        <div class="asset-expense-form-row">
          <span class="asset-expense-form-label">거래일</span>
          <div class="asset-expense-form-control asset-expense-form-control--field asset-expense-cell-date">
            <span class="asset-expense-date-display" aria-hidden="true">${dateDisplayVal}</span>
            <input
              type="date"
              class="asset-expense-input-date"
              name="asset-expense-date"
              value="${dateValue}"
              aria-label="거래일"
            />
          </div>
        </div>
        <div class="asset-expense-form-row">
          <span class="asset-expense-form-label">금액</span>
          <div class="asset-expense-form-control asset-expense-form-control--field asset-expense-cell-amount">
            <input
              type="text"
              class="asset-expense-input-amount"
              name="asset-expense-amount"
              inputmode="decimal"
              placeholder="금액"
              value="${expenseAmountInitialInputValue(data.amount || "").replace(/"/g, "&quot;")}"
            />
          </div>
        </div>
        <div class="asset-expense-form-row">
          <span class="asset-expense-form-label">큰분류</span>
          <div class="asset-expense-form-control asset-expense-cell-flow-type"></div>
        </div>
        <div class="asset-expense-form-row">
          <span class="asset-expense-form-label">소비/수입 분류</span>
          <div class="asset-expense-form-control asset-expense-cell-classification"></div>
        </div>
        <div class="asset-expense-form-row">
          <span class="asset-expense-form-label">소비/수입 명</span>
          <div class="asset-expense-form-control asset-expense-form-control--field asset-expense-cell-name">
            <input
              type="text"
              class="asset-expense-input-name"
              name="asset-expense-name"
              placeholder="이름(예: 스타벅스)"
              value="${(data.name || "").replace(/"/g, "&quot;")}"
            />
          </div>
        </div>
        <div class="asset-expense-form-row">
          <span class="asset-expense-form-label">결제수단</span>
          <div class="asset-expense-form-control asset-expense-cell-payment"></div>
        </div>
        <div class="asset-expense-form-row">
          <span class="asset-expense-form-label">카테고리</span>
          <div class="asset-expense-form-control asset-expense-cell-category"></div>
        </div>
      </div>
    `;
    if (usePanel) {
      const editNameHeadHtml = () => {
        const nm = (data.name || "").trim();
        return nm ? escapeHtml(nm) : "이름 미입력";
      };
      const panelHeadInner = isDraft
        ? `<span class="asset-expense-inline-panel-title">새 거래</span>`
        : `<span class="asset-expense-inline-panel-title" aria-live="polite">${editNameHeadHtml()}</span>`;
      rowEl.classList.add("asset-expense-row--inner-panel");
      rowEl.innerHTML = `
        <div class="asset-expense-cell-panel">
          <div class="asset-expense-inline-panel">
            <div class="asset-expense-inline-panel-top">
              <div class="asset-expense-inline-panel-head-text">
                ${panelHeadInner}
              </div>
              <button type="button" class="asset-expense-inline-panel-x" aria-label="닫기">×</button>
            </div>
            <div class="asset-expense-inline-panel-body">
              ${formStackHtml}
            </div>
            <div class="asset-expense-inline-panel-bottom" aria-label="확인 작업"></div>
          </div>
        </div>
      `;
    } else {
      rowEl.innerHTML = fieldsRowHtml;
    }
    const flowTypeTd = rowEl.querySelector(".asset-expense-cell-flow-type");
    const categoryTd = rowEl.querySelector(".asset-expense-cell-category");
    const classificationTd = rowEl.querySelector(".asset-expense-cell-classification");
    const nameInput = rowEl.querySelector(".asset-expense-input-name");
    const memoInput = rowEl.querySelector(".asset-expense-input-memo");
    const actionsWrap = rowEl.querySelector(".asset-expense-actions-wrap");
    const panelFooter = rowEl.querySelector(".asset-expense-inline-panel-bottom");
    const xBtn = rowEl.querySelector(".asset-expense-inline-panel-x");

    const initialCategory = data.category || "";
    const initialClassification = data.classification || "";

    const classificationDropdown = createExpenseClassificationDropdownByFlowType(
      flowTypeValue,
      initialClassification,
      initialCategory,
      () => {
        updateCategoryDisplay();
        applyAmountSign();
        syncExpenseLedgerCardDecor();
        onTotalsUpdate?.();
      }
    );
    classificationTd.appendChild(classificationDropdown.wrap);

    const categoryDisplay = document.createElement("span");
    categoryDisplay.className = "asset-expense-category-display-readonly";
    function updateCategoryDisplay() {
      const cat = classificationDropdown.categoryInput?.value || "";
      categoryDisplay.textContent = cat || "-";
      const opt = getExpenseCategoryOptions().find((o) => o.label === cat);
      categoryDisplay.className = "asset-expense-category-display-readonly " + (opt ? opt.color : "");
    }
    categoryTd.appendChild(categoryDisplay);

    const paymentTd = rowEl.querySelector(".asset-expense-cell-payment");
    const paymentControl = createExpensePaymentInput(data.payment || "", () => {
      syncExpenseLedgerCardDecor();
      onTotalsUpdate?.();
    }, { inlineButtons: usePanel });

    function syncPaymentIncomeModeForRow() {
      const flowTypeInput = flowTypeTd.querySelector(".asset-expense-input-flow-type");
      const isDeposit = (flowTypeInput?.value || "") === "입금";
      paymentControl.setPaymentIncomeMode(isDeposit);
      if (paymentTd) {
        paymentTd.hidden = isDeposit;
        const paymentFormRow = paymentTd.closest(".asset-expense-form-row");
        if (paymentFormRow) paymentFormRow.hidden = isDeposit;
      }
    }

    const flowTypeDropdown = createExpenseFlowTypeDropdown(flowTypeValue, () => {
      const flowTypeInput = flowTypeTd.querySelector(".asset-expense-input-flow-type");
      classificationDropdown.refresh(flowTypeInput?.value || "");
      updateCategoryDisplay();
      applyAmountSign();
      syncExpenseLedgerCardDecor();
      syncPaymentIncomeModeForRow();
      onTotalsUpdate?.();
    });
    flowTypeTd.appendChild(flowTypeDropdown);

    paymentTd.appendChild(paymentControl.wrap);
    syncPaymentIncomeModeForRow();

    const amountInput = rowEl.querySelector(".asset-expense-input-amount");

    function applyAmountSign() {
      const flowTypeInput = flowTypeTd.querySelector(".asset-expense-input-flow-type");
      const flowType = flowTypeInput?.value || "";
      const raw = parseNum(amountInput.value);
      if (raw === null) return;
      if (flowType !== "입금" && flowType !== "지출") return;
      const signed = flowType === "입금" ? Math.abs(raw) : -Math.abs(raw);
      amountInput.value = formatExpenseLedgerAmount(signed);
      onTotalsUpdate?.();
    }

    const origRefresh = classificationDropdown.refresh;
    classificationDropdown.refresh = (flowType) => {
      origRefresh(flowType);
      updateCategoryDisplay();
      syncExpenseLedgerCardDecor();
    };
    updateCategoryDisplay();

    function syncExpenseLedgerCardDecor() {
      if (!isView) return;
      const ledgerInner = rowEl.querySelector(".asset-expense-card-inner--ledger");
      if (!ledgerInner) return;
      const iconInner = ledgerInner.querySelector(".asset-expense-ledger-icon-inner");
      const clsInp = rowEl.querySelector(".asset-expense-input-classification");
      const flowInp = rowEl.querySelector(".asset-expense-input-flow-type");
      const clsLabel = (clsInp?.value || "").trim();
      const flow = flowInp?.value || "";
      rowEl.classList.toggle("asset-expense-card--flow-income", flow === "입금");
      rowEl.classList.toggle("asset-expense-card--flow-expense", flow === "지출");
      if (iconInner) iconInner.innerHTML = getExpenseLedgerIconSvg(clsLabel, flow);
    }

    amountInput.addEventListener("focus", () => {
      const n = parseNum(amountInput.value);
      if (n !== null) amountInput.value = formatNum(n);
    });
    amountInput.addEventListener("blur", () => {
      applyAmountSign();
      syncExpenseLedgerCardDecor();
      onTotalsUpdate?.();
    });
    amountInput.addEventListener("input", (e) => {
      filterNumericInput(amountInput, false, e);
      syncExpenseLedgerCardDecor();
      onTotalsUpdate?.();
    });
    amountInput.addEventListener("compositionend", () => {
      filterNumericInput(amountInput, false, null);
      syncExpenseLedgerCardDecor();
      onTotalsUpdate?.();
    });
    amountInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        amountInput.blur();
      }
    });

    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameInput.blur();
      }
    });
    nameInput.addEventListener("blur", () => {
      onTotalsUpdate?.();
    });
    if (usePanel && isEdit) {
      const panelHeadTitleEl = rowEl.querySelector(
        ".asset-expense-inline-panel-head-text .asset-expense-inline-panel-title"
      );
      if (panelHeadTitleEl) {
        const syncEditPanelHeadTitle = () => {
          const t = (nameInput.value || "").trim();
          panelHeadTitleEl.textContent = t || "이름 미입력";
        };
        nameInput.addEventListener("input", syncEditPanelHeadTitle);
        nameInput.addEventListener("blur", syncEditPanelHeadTitle);
      }
    }
    if (memoInput) {
      memoInput.addEventListener("blur", () => {
        onTotalsUpdate?.();
      });

      memoInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          memoInput.blur();
        }
      });
    }

    const dateCell = rowEl.querySelector(".asset-expense-cell-date");
    const dateDisplay = rowEl.querySelector(".asset-expense-date-display");
    const dateInput = rowEl.querySelector(".asset-expense-input-date");
    dateInput.addEventListener("change", () => {
      if (dateDisplay) {
        dateDisplay.textContent = formatDateYYMMDD(dateInput.value);
      }
      onFilterApply?.();
      layoutExpenseLedgerGroups();
    });
    if (dateCell) {
      dateCell.addEventListener("click", (e) => {
        if (e.target === dateInput) return;
        e.preventDefault();
        if (isView) return;
        dateInput.focus();
        if (typeof dateInput.showPicker === "function") {
          dateInput.showPicker();
        }
      });
    }

    function setViewLock(locked) {
      rowEl.classList.toggle("asset-expense-row--view", locked);
      if (isDraft || isEdit) {
        rowEl.querySelectorAll(".asset-expense-cell-panel").forEach((cell) =>
          cell.classList.remove("asset-expense-cell--locked")
        );
        return;
      }
      const inner = rowEl.querySelector(".asset-expense-card-inner");
      if (!inner) return;
      const ledgerSel =
        ".asset-expense-cell-date, .asset-expense-cell-name, .asset-expense-cell-amount, .asset-expense-cell-flow-type, .asset-expense-cell-classification, .asset-expense-cell-payment, .asset-expense-cell-category";
      const targets = inner.classList.contains("asset-expense-card-inner--ledger")
        ? inner.querySelectorAll(ledgerSel)
        : inner.querySelectorAll(":scope > div");
      targets.forEach((cell) => {
        if (cell.classList.contains("asset-expense-cell-actions")) {
          cell.classList.remove("asset-expense-cell--locked");
        } else {
          cell.classList.toggle("asset-expense-cell--locked", locked);
        }
      });
    }
    setViewLock(isView);

    function mountRowActions() {
      if (isView) {
        rowEl.addEventListener("click", (e) => {
          if (document.querySelector(".asset-expense-transaction-modal")) return;
          if (
            e.target.closest(".asset-expense-flow-type-wrap") ||
            e.target.closest(".asset-expense-classification-wrap") ||
            e.target.closest(".asset-expense-payment-wrap") ||
            e.target.closest(".asset-expense-category-wrap")
          ) {
            return;
          }
          const d = readExpenseDataFromTr(rowEl);
          const fromMem = loadExpenseRows().find((r) => String(r.id) === String(d.id));
          const snap = fromMem || d;
          openExpenseTransactionModal({
            mode: "edit",
            data: snap,
            memSnapshot: snap,
            replaceCardEl: rowEl,
          });
        });
        rowEl.style.cursor = "pointer";
        return;
      }
      if (isDraft) {
        if (!panelFooter || !xBtn) return;
        panelFooter.textContent = "";
        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--primary";
        saveBtn.textContent = "저장";
        const doCancel = (e) => {
          e?.stopPropagation?.();
          if (expenseModalCtx) {
            expenseModalCtx.cancel();
            return;
          }
          rowEl.remove();
          onTotalsUpdate?.();
        };
        xBtn.addEventListener("click", doCancel);
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!rowEl.dataset.assetExpenseRowId) {
            const nid = newExpenseRowId() || "";
            if (!nid) {
              showToast("거래를 저장할 수 없습니다. 잠시 후 다시 시도해 주세요.", "");
              return;
            }
            rowEl.dataset.assetExpenseRowId = nid;
          }
          const d = readExpenseDataFromTr(rowEl);
          const check = canCommitAssetExpenseRow(d);
          if (!check.ok) {
            showToast(check.msg, "");
            return;
          }
          if (expenseModalCtx) {
            expenseModalCtx.commit(d);
            return;
          }
          rowEl.replaceWith(createExpenseRow(d, onTotalsUpdate, onFilterApply, { mode: "view" }));
          saveExpense();
          layoutExpenseLedgerGroups();
          applyExpenseFilter();
        });
        panelFooter.appendChild(saveBtn);
        return;
      }
      if (isEdit) {
        if (!panelFooter || !xBtn) return;
        panelFooter.textContent = "";
        const delBtn2 = document.createElement("button");
        delBtn2.type = "button";
        delBtn2.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--danger";
        delBtn2.textContent = "삭제";
        const applyBtn = document.createElement("button");
        applyBtn.type = "button";
        applyBtn.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--primary";
        applyBtn.textContent = "수정";
        const snap = memSnapshot;
        const doCancel = (e) => {
          e?.stopPropagation?.();
          if (expenseModalCtx) {
            expenseModalCtx.cancel();
            return;
          }
          if (!snap) {
            rowEl.remove();
            layoutExpenseLedgerGroups();
            applyExpenseFilter();
            onTotalsUpdate?.();
            return;
          }
          rowEl.replaceWith(createExpenseRow(snap, onTotalsUpdate, onFilterApply, { mode: "view" }));
          onTotalsUpdate?.();
          applyExpenseFilter();
        };
        xBtn.addEventListener("click", doCancel);
        applyBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const d = readExpenseDataFromTr(rowEl);
          const check = canCommitAssetExpenseRow(d);
          if (!check.ok) {
            showToast(check.msg, "");
            return;
          }
          if (expenseModalCtx) {
            expenseModalCtx.commit(d);
            return;
          }
          rowEl.replaceWith(createExpenseRow(d, onTotalsUpdate, onFilterApply, { mode: "view" }));
          saveExpense();
          layoutExpenseLedgerGroups();
          applyExpenseFilter();
        });
        delBtn2.addEventListener("click", (e) => {
          e.stopPropagation();
          confirmDeleteRow(() => {
            if (expenseModalCtx) {
              expenseModalCtx.deleteCard();
              return;
            }
            rowEl.remove();
            saveExpense();
            layoutExpenseLedgerGroups();
            applyExpenseFilter();
          });
        });
        const footInner = document.createElement("div");
        footInner.className = "asset-expense-inline-panel-bottom-inner";
        footInner.appendChild(delBtn2);
        footInner.appendChild(applyBtn);
        panelFooter.appendChild(footInner);
      }
    }
    mountRowActions();

    syncExpenseLedgerCardDecor();

    return rowEl;
  }

  scheduleExpenseMemPullFromServer = () => {
    if (expenseFilterPullTimer) clearTimeout(expenseFilterPullTimer);
    expenseFilterPullTimer = setTimeout(() => {
      expenseFilterPullTimer = null;
      void (async () => {
        if (!wrap.isConnected) return;
        const { from, to } = getExpensePickerSqlBounds();
        if (!from || !to) return;
        persistAssetExpensePullBounds(from, to);
        const ok = await pullAssetExpenseTransactionsForDateRange(from, to);
        if (!wrap.isConnected) return;
        ledgerBoardBody.replaceChildren();
        const start = startDateInput.value || filterStartDate;
        const end = endDateInput.value || filterEndDate;
        const rows = loadExpenseRows().filter((data) =>
          isDateInRange(data.date, filterType, filterYear, filterMonth, start, end),
        );
        rows.forEach((data) => {
          ledgerBoardBody.appendChild(
            createExpenseRow(data, updateExpenseTotals, applyExpenseFilter, { mode: "view" })
          );
        });
        layoutExpenseLedgerGroups();
        applyExpenseFilter();
      })();
    }, 400);
  };

  addBtn.addEventListener("click", () => {
    if (document.querySelector(".asset-expense-transaction-modal")) {
      showToast("입력 창을 닫은 뒤 새 거래를 추가해 주세요.", "");
      return;
    }
    openExpenseTransactionModal({ mode: "draft" });
  });

  const expenseTabsRoot = !expenseMobile ? filterBar.querySelector(".time-filter-tabs.time-view-tabs--segmented") : null;
  function syncAssetExpenseSegmentThumb() {
    if (!expenseTabsRoot?.classList.contains("time-view-tabs--segmented")) return;
    const btns = [...expenseTabsRoot.querySelectorAll(".time-view-tab")];
    const n = Math.max(1, btns.length);
    const idx = Math.max(
      0,
      btns.findIndex((b) => b.classList.contains("active")),
    );
    expenseTabsRoot.style.setProperty("--time-segment-count", String(n));
    expenseTabsRoot.style.setProperty("--thumb-col-start", String(idx + 1));
  }

  filterBar.querySelectorAll(".time-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filterType = btn.dataset.filter;
      filterBar.querySelectorAll(".time-filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      dayWrap.style.display = filterType === "day" ? "" : "none";
      monthWrap.style.display = filterType === "month" ? "" : "none";
      rangeWrap.style.display = filterType === "range" ? "" : "none";
      if (filterType === "day") updateDayDisplay();
      applyExpenseFilter();
      syncExpenseFooterSummaryLabel();
      scheduleExpenseMemPullFromServer();
      syncAssetExpenseSegmentThumb();
    });
  });
  syncAssetExpenseSegmentThumb();
  startDateInput.addEventListener("change", () => {
    applyExpenseFilter();
    syncExpenseFooterSummaryLabel();
    scheduleExpenseMemPullFromServer();
  });
  endDateInput.addEventListener("change", () => {
    applyExpenseFilter();
    syncExpenseFooterSummaryLabel();
    scheduleExpenseMemPullFromServer();
  });

  const startForInit = startDateInput.value || filterStartDate;
  const endForInit = endDateInput.value || filterEndDate;
  const initialRows = loadExpenseRows().filter((data) =>
    isDateInRange(data.date, filterType, filterYear, filterMonth, startForInit, endForInit),
  );
  if (initialRows.length > 0) {
    initialRows.forEach((data) => {
      const row = createExpenseRow(data, updateExpenseTotals, applyExpenseFilter, { mode: "view" });
      ledgerBoardBody.appendChild(row);
    });
  }
  layoutExpenseLedgerGroups();
  applyExpenseFilter();
  syncExpenseFooterSummaryLabel();
  {
    const b = getExpensePickerSqlBounds();
    if (b.from && b.to) persistAssetExpensePullBounds(b.from, b.to);
  }

  tableWrap.appendChild(summaryCardsEl);
  tableWrap.appendChild(cardsListEl);
  tableWrap.appendChild(summaryBar);

  const expenseTableContainer = document.createElement("div");
  expenseTableContainer.className = "asset-expense-table-container";
  expenseTableContainer.appendChild(tableWrap);

  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "asset-expense-settings-btn";
  settingsBtn.setAttribute("aria-label", "가계부 설정");
  settingsBtn.innerHTML = `<svg class="asset-expense-settings-icon" width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m19.845 13.561c.1-.505.155-1.027.155-1.561s-.055-1.056-.155-1.561l1.806-1.489c.502-.414.632-1.132.307-1.696l-.869-1.508c-.325-.564-1.011-.811-1.62-.582l-2.198.825c-.779-.684-1.689-1.218-2.691-1.559l-.385-2.316c-.108-.643-.663-1.114-1.314-1.114h-1.738c-.651 0-1.206.471-1.313 1.114l-.386 2.316c-1.002.341-1.912.875-2.691 1.559l-2.198-.825c-.61-.228-1.295.018-1.62.582l-.87 1.508c-.325.564-.195 1.282.307 1.696l1.806 1.489c-.1.505-.155 1.026-.155 1.561s.055 1.056.155 1.561l-1.806 1.489c-.502.414-.632 1.132-.307 1.696l.869 1.508c.325.564 1.011.811 1.62.582l2.198-.825c.779.684 1.689 1.218 2.691 1.559l.385 2.316c.109.643.664 1.114 1.315 1.114h1.738c.651 0 1.206-.471 1.313-1.114l.385-2.316c1.002-.341 1.913-.875 2.691-1.559l2.198.825c.609.229 1.295-.017 1.62-.582l.869-1.508c.325-.564.196-1.282-.307-1.696z"/><circle cx="12.012" cy="12" r="3"/></g></svg>`;
  if (options?.onOpenSettings) {
    settingsBtn.addEventListener("click", options.onOpenSettings);
  }
  const filterActions = document.createElement("div");
  filterActions.className = "asset-expense-filter-actions";
  filterActions.appendChild(addBtn);
  filterActions.appendChild(settingsBtn);
  filterBar.appendChild(filterActions);

  wrap.appendChild(filterBar);
  wrap.appendChild(expenseTableContainer);
  return wrap;
}

const DEFAULT_CAT_COLOR = "expense-cat-teal";
const DEFAULT_CLS_COLOR = "expense-cls-teal";
const DEFAULT_CATEGORY_LABELS = ["고정비", "변동비", "저축", "투자", "수입"];

/** 가계부 설정 텍스트 입력: 한글 IME 조합 중 input으로 상태 꼬임·마지막 글자 중복 방지 */
function bindAssetSettingsInputImeSafe(input, onCommitValue) {
  let composing = false;
  const commit = () => onCommitValue((input.value || "").trim());
  input.addEventListener("compositionstart", () => {
    composing = true;
  });
  input.addEventListener("compositionend", () => {
    composing = false;
    commit();
  });
  input.addEventListener("input", () => {
    if (composing) return;
    commit();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (e.isComposing || composing) return;
    e.preventDefault();
    input.blur();
  });
}

function createAssetSettingsModal(onSave) {
  const modal = document.createElement("div");
  modal.className = "asset-settings-modal";
  modal.innerHTML = `
    <div class="asset-settings-backdrop"></div>
    <div class="asset-settings-panel">
      <div class="asset-settings-header">
        <h3 class="asset-settings-title">가계부 설정</h3>
        <button type="button" class="asset-settings-close" aria-label="닫기">×</button>
      </div>
      <div class="asset-settings-tabs">
        <button type="button" class="asset-settings-tab-btn active" data-tab="classification">분류설정</button>
        <button type="button" class="asset-settings-tab-btn" data-tab="payment">결제수단 설정</button>
      </div>
      <div class="asset-settings-body">
        <div class="asset-settings-tab-panel asset-settings-tab-classification" data-tab="classification">
          <div class="asset-settings-two-col">
            <div class="asset-settings-col asset-settings-col-left">
              <h4 class="asset-settings-col-title">카테고리</h4>
              <div class="asset-settings-category-list"></div>
            </div>
            <div class="asset-settings-col asset-settings-col-right">
              <h4 class="asset-settings-col-title">소비/수입 분류 <span class="asset-settings-selected-cat"></span></h4>
              <div class="asset-settings-classification-list"></div>
              <button type="button" class="asset-settings-add-cls">+ 추가</button>
            </div>
          </div>
        </div>
        <div class="asset-settings-tab-panel asset-settings-tab-payment" data-tab="payment" hidden>
          <h4 class="asset-settings-col-title">결제수단</h4>
          <div class="asset-settings-payment-list"></div>
          <button type="button" class="asset-settings-add-payment">+ 추가</button>
        </div>
      </div>
      <div class="asset-settings-footer">
        <button type="button" class="asset-settings-save">저장</button>
      </div>
    </div>
  `;
  modal.hidden = true;

  const categoryList = modal.querySelector(".asset-settings-category-list");
  const classificationList = modal.querySelector(".asset-settings-classification-list");
  const selectedCatSpan = modal.querySelector(".asset-settings-selected-cat");
  const addClsBtn = modal.querySelector(".asset-settings-add-cls");
  const paymentList = modal.querySelector(".asset-settings-payment-list");
  const addPaymentBtn = modal.querySelector(".asset-settings-add-payment");
  const saveBtn = modal.querySelector(".asset-settings-save");
  const closeBtn = modal.querySelector(".asset-settings-close");
  const backdrop = modal.querySelector(".asset-settings-backdrop");
  const tabBtns = modal.querySelectorAll(".asset-settings-tab-btn");
  const tabPanels = modal.querySelectorAll(".asset-settings-tab-panel");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
      tabPanels.forEach((p) => {
        p.hidden = p.dataset.tab !== tab;
      });
      if (tab === "payment") renderPaymentList();
    });
  });

  function renderCategories(cats) {
    categoryList.innerHTML = "";
    cats.forEach((c, i) => {
      const isDefault = DEFAULT_CATEGORY_LABELS.includes(c.label || "");
      const row = document.createElement("div");
      row.className = "asset-settings-row asset-settings-cat-row" + (modal._selectedIdx === i ? " active" : "") + (isDefault ? "" : " asset-settings-cat-row--with-remove");
      row.dataset.catIdx = String(i);
      row.innerHTML = `
        <input type="text" class="asset-settings-input${isDefault ? " asset-settings-input--default" : ""}" placeholder="카테고리명" value="${(c.label || "").replace(/"/g, "&quot;")}" ${isDefault ? "readonly" : ""} />
        ${isDefault ? "" : '<button type="button" class="asset-settings-remove" title="삭제">×</button>'}
      `;
      const input = row.querySelector(".asset-settings-input");
      if (!isDefault) {
        bindAssetSettingsInputImeSafe(input, (v) => {
          cats[i].label = v;
        });
      }
      input.addEventListener("focus", (e) => {
        e.stopPropagation();
        if (modal._selectedIdx === i) return;
        modal._selectedIdx = i;
        renderCategories(cats);
        renderClassifications(cats, modal._byCat);
      });
      if (!isDefault) {
        row.querySelector(".asset-settings-remove").addEventListener("click", (e) => {
          e.stopPropagation();
          cats.splice(i, 1);
          const byCat = modal._byCat || {};
          const labels = cats.map((x) => x.label);
          Object.keys(byCat).forEach((k) => { if (!labels.includes(k)) delete byCat[k]; });
          modal._selectedIdx = Math.min(modal._selectedIdx ?? 0, Math.max(0, cats.length - 1));
          if (cats.length === 0) modal._selectedIdx = null;
          renderCategories(cats);
          renderClassifications(cats, byCat);
        });
      }
      row.addEventListener("click", (e) => {
        if (e.target.closest(".asset-settings-remove")) return;
        /* 사용자 추가 카테고리: 입력란 클릭은 편집만(전체 리렌더 방지). 시스템 카테고리는 행/텍스트 클릭 모두 선택 */
        if (!isDefault && e.target.matches(".asset-settings-input")) return;
        if (modal._selectedIdx === i) return;
        modal._selectedIdx = i;
        renderCategories(cats);
        renderClassifications(cats, modal._byCat);
      });
      categoryList.appendChild(row);
    });
  }

  function renderClassifications(cats, byCat) {
    classificationList.innerHTML = "";
    const idx = modal._selectedIdx;
    if (idx == null || !cats[idx]) {
      selectedCatSpan.textContent = "";
      const empty = document.createElement("div");
      empty.className = "asset-settings-empty";
      empty.textContent = "왼쪽에서 카테고리를 클릭하면 해당 카테고리의 소비/수입 분류를 설정할 수 있습니다.";
      classificationList.appendChild(empty);
      return;
    }
    const c = cats[idx];
    selectedCatSpan.textContent = c.label ? `(${c.label})` : "";
    const defaultLabels = (DEFAULT_EXPENSE_CLASSIFICATION_BY_CATEGORY[c.label] || []).map((x) => x.label);
    const list = byCat[c.label] || [];
    list.forEach((cls, clsIdx) => {
      const isDefault = defaultLabels.includes(cls.label || "");
      const row = document.createElement("div");
      row.className = "asset-settings-row" + (isDefault ? "" : " asset-settings-row--with-remove");
      row.innerHTML = `
        <input type="text" class="asset-settings-input${isDefault ? " asset-settings-input--default" : ""}" placeholder="분류명" value="${(cls.label || "").replace(/"/g, "&quot;")}" ${isDefault ? "readonly" : ""} />
        ${isDefault ? "" : '<button type="button" class="asset-settings-remove" title="삭제">×</button>'}
      `;
      const clsInput = row.querySelector(".asset-settings-input");
      if (!isDefault) {
        bindAssetSettingsInputImeSafe(clsInput, (v) => {
          if (!byCat[c.label]) byCat[c.label] = [];
          byCat[c.label][clsIdx].label = v;
        });
      } else {
        clsInput.setAttribute("tabindex", "-1");
        clsInput.addEventListener("mousedown", (e) => e.preventDefault());
      }
      if (!isDefault) {
        row.querySelector(".asset-settings-remove").addEventListener("click", () => {
          byCat[c.label].splice(clsIdx, 1);
          renderClassifications(cats, byCat);
          modal._byCat = byCat;
        });
      }
      classificationList.appendChild(row);
    });
  }

  function renderPaymentList() {
    const opts = modal._payments || getPaymentOptions();
    modal._payments = [...opts];
    paymentList.innerHTML = "";
    opts.forEach((name, i) => {
      const isDefault = isDefaultPaymentOption(name);
      const row = document.createElement("div");
      row.className = "asset-settings-row" + (isDefault ? "" : " asset-settings-row--with-remove");
      row.innerHTML = `
        <input type="text" class="asset-settings-input${isDefault ? " asset-settings-input--default" : ""}" placeholder="결제수단" value="${(name || "").replace(/"/g, "&quot;")}" ${isDefault ? "readonly" : ""} />
        ${isDefault ? "" : '<button type="button" class="asset-settings-remove" title="삭제">×</button>'}
      `;
      const input = row.querySelector(".asset-settings-input");
      if (!isDefault) {
        bindAssetSettingsInputImeSafe(input, (v) => {
          modal._payments[i] = v;
        });
      } else {
        input.setAttribute("tabindex", "-1");
        input.addEventListener("mousedown", (e) => e.preventDefault());
      }
      if (!isDefault) {
        row.querySelector(".asset-settings-remove").addEventListener("click", () => {
          modal._payments.splice(i, 1);
          renderPaymentList();
        });
      }
      paymentList.appendChild(row);
    });
  }

  function loadAndRender() {
    const cats = getExpenseCategoryOptions().map((o) => ({ ...o }));
    const byCat = {};
    const saved = getExpenseClassificationByCategory();
    cats.forEach((c) => {
      byCat[c.label] = (saved[c.label] || []).map((o) => ({ ...o }));
    });
    modal._cats = cats;
    modal._byCat = byCat;
    modal._selectedIdx = cats.length > 0 ? 0 : null;
    modal._payments = [...getPaymentOptions()];
    renderCategories(cats);
    renderClassifications(cats, byCat);
    renderPaymentList();
  }

  function collectFromDOM() {
    const cats = modal._cats || [];
    const byCat = JSON.parse(JSON.stringify(modal._byCat || {}));
    const newCats = [];
    categoryList.querySelectorAll(".asset-settings-row").forEach((row, i) => {
      const input = row.querySelector(".asset-settings-input");
      const label = (input?.value || "").trim();
      const orig = cats[i];
      newCats.push({ label, color: orig?.color || DEFAULT_CAT_COLOR });
    });
    const idx = modal._selectedIdx;
    if (idx != null && newCats[idx] && cats[idx]) {
      const catLabel = newCats[idx].label;
      const oldLabel = cats[idx].label;
      if (catLabel) {
        const rows = [];
        classificationList.querySelectorAll(".asset-settings-row").forEach((r) => {
          const inp = r.querySelector(".asset-settings-input");
          if (inp) rows.push((inp.value || "").trim());
        });
        const origList = byCat[catLabel] || byCat[oldLabel] || [];
        byCat[catLabel] = rows.filter((l) => l).map((label) => {
          const orig = origList.find((o) => o.label === label);
          return { label, color: orig?.color || DEFAULT_CLS_COLOR };
        });
        if (oldLabel && oldLabel !== catLabel) delete byCat[oldLabel];
      }
    }
    Object.keys(byCat).forEach((k) => {
      if (!newCats.some((c) => c.label === k)) delete byCat[k];
    });
    newCats.forEach((c) => {
      if (c.label && !byCat[c.label]) byCat[c.label] = [];
    });
    return { cats: newCats, byCat };
  }

  addClsBtn.addEventListener("click", () => {
    const cats = modal._cats || [];
    const byCat = modal._byCat || {};
    const idx = modal._selectedIdx;
    if (idx == null || !cats[idx]) return;
    const c = cats[idx];
    if (!byCat[c.label]) byCat[c.label] = [];
    byCat[c.label].push({ label: "", color: DEFAULT_CLS_COLOR });
    renderClassifications(cats, byCat);
  });

  addPaymentBtn.addEventListener("click", () => {
    if (!modal._payments) modal._payments = [...getPaymentOptions()];
    modal._payments.push("");
    renderPaymentList();
  });

  function performSave() {
    const { cats, byCat } = collectFromDOM();
    const validCats = cats.filter((c) => c.label.trim());
    if (validCats.length === 0) return;
    const finalByCat = {};
    validCats.forEach((c) => {
      const label = c.label.trim();
      const orig = getExpenseClassificationByCategory()[label];
      finalByCat[label] = (byCat[label] || []).filter((cl) => cl.label.trim()).map((cl) => ({
        label: cl.label,
        color: (orig?.find((o) => o.label === cl.label))?.color || DEFAULT_CLS_COLOR,
      }));
    });
    saveExpenseCategoryOptions(validCats.map((c) => ({ label: c.label.trim(), color: c.color })));
    saveExpenseClassificationByCategory(finalByCat);
    if (paymentList) {
      const payments = [];
      paymentList.querySelectorAll(".asset-settings-input").forEach((inp) => {
        const v = (inp.value || "").trim();
        if (v) payments.push(v);
      });
      savePaymentOptions(payments.length > 0 ? payments : DEFAULT_PAYMENT_OPTIONS);
    }
    void syncAssetExpensePrefsToSupabase().catch(() => {});
  }

  saveBtn.addEventListener("click", () => {
    performSave();
    onSave?.();
    modal.hidden = true;
  });

  closeBtn.addEventListener("click", () => { modal.hidden = true; });

  return {
    modal,
    open() {
      void (async () => {
        try {
          await pullAssetExpensePrefsFromSupabase();
        } catch (_) {}
        loadAndRender();
        modal.hidden = false;
      })();
    },
  };
}

/** 가계부에서 수입 카테고리+분류별 이번달 합계 */
function getExpenseSumByIncomeClassification(classification) {
  const rows = loadExpenseRows();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  let sum = 0;
  rows.forEach((r) => {
    const dateParts = (r.date || "").split("-");
    if (dateParts.length < 2) return;
    const rowYear = parseInt(dateParts[0], 10);
    const rowMonth = parseInt(dateParts[1], 10);
    if (rowYear !== year || rowMonth !== month) return;
    if ((r.category || "") !== "수입" || (r.classification || "") !== classification) return;
    const amt = parseNum(r.amount);
    if (amt !== null) sum += Math.abs(amt);
  });
  return sum;
}

/** 가계부에서 투자/저축 카테고리+분류별 이번달 합계 */
function getExpenseSumByInvestSavingsClassification(category, classification) {
  const rows = loadExpenseRows();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  let sum = 0;
  rows.forEach((r) => {
    const dateParts = (r.date || "").split("-");
    if (dateParts.length < 2) return;
    const rowYear = parseInt(dateParts[0], 10);
    const rowMonth = parseInt(dateParts[1], 10);
    if (rowYear !== year || rowMonth !== month) return;
    if ((r.category || "") !== category || (r.classification || "") !== classification) return;
    const amt = parseNum(r.amount);
    if (amt !== null) sum += Math.abs(amt);
  });
  return sum;
}

/** 가계부에서 고정비/변동비/기타 카테고리+분류별 이번달 합계 */
function getExpenseSumByExpenseClassification(category, classification) {
  const rows = loadExpenseRows();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  let sum = 0;
  rows.forEach((r) => {
    const dateParts = (r.date || "").split("-");
    if (dateParts.length < 2) return;
    const rowYear = parseInt(dateParts[0], 10);
    const rowMonth = parseInt(dateParts[1], 10);
    if (rowYear !== year || rowMonth !== month) return;
    if ((r.category || "") !== category || (r.classification || "") !== classification) return;
    const amt = parseNum(r.amount);
    if (amt !== null) sum += Math.abs(amt);
  });
  return sum;
}

/** 가계부 데이터에서 사용된 수입 분류 수집 (기본 옵션 + 실제 사용된 분류) */
function getPlanIncomeClassificationOptions() {
  const byCat = getExpenseClassificationByCategory();
  const base = byCat.수입 || [];
  const used = new Set(base.map((o) => o.label));
  const rows = loadExpenseRows();
  rows.forEach((r) => {
    if ((r.category || "") === "수입" && r.classification && !used.has(r.classification)) {
      used.add(r.classification);
    }
  });
  const extra = [...used].filter((l) => !base.some((o) => o.label === l)).map((label) => ({ label, color: "expense-cls-gray" }));
  return [...base, ...extra];
}

/** 수입 목표용 카테고리 드롭다운 (월급, 부업, 용돈 등) */
function createPlanIncomeCategoryDropdown(initialValue, onSelect) {
  const opts = getPlanIncomeClassificationOptions();
  const wrap = document.createElement("div");
  wrap.className = "asset-plan-category-wrap";

  const display = document.createElement("span");
  display.className = "asset-plan-category-display";
  display.textContent = initialValue || "선택";

  const panel = document.createElement("div");
  panel.className = "asset-plan-category-panel";
  panel.hidden = true;

  opts.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-plan-category-option";
    row.innerHTML = `<span class="asset-plan-category-tag ${opt.color || "expense-cls-gray"}">${opt.label}</span>`;
    row.addEventListener("click", () => {
      display.textContent = opt.label;
      panel.hidden = true;
      onSelect?.(opt.label);
    });
    panel.appendChild(row);
  });

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllDebtDropdownPanels(panel);
    const rect = display.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 120)}px`;
    document.body.appendChild(panel);
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) panel.hidden = true;
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    }
  });

  wrap.appendChild(display);
  wrap.appendChild(panel);
  return { wrap, getValue: () => display.textContent === "선택" ? "" : display.textContent };
}

/** 가계부 데이터에서 사용된 투자/저축 분류 수집 (기본 옵션 + 실제 사용된 분류) */
function getPlanInvestSavingsClassificationOptions() {
  const base = [];
  const byCat = getExpenseClassificationByCategory();
  (byCat.저축 || []).forEach((o) => base.push({ ...o, category: "저축" }));
  (byCat.투자 || []).forEach((o) => base.push({ ...o, category: "투자" }));
  const used = new Map();
  base.forEach((o) => used.set(`${o.category}:${o.label}`, o));
  const rows = loadExpenseRows();
  rows.forEach((r) => {
    const cat = r.category || "";
    if ((cat === "저축" || cat === "투자") && r.classification) {
      const key = `${cat}:${r.classification}`;
      if (!used.has(key)) used.set(key, { label: r.classification, category: cat, color: "expense-cls-gray" });
    }
  });
  return [...used.values()];
}

/** 투자/저축 목표용 카테고리 드롭다운 (저축·투자 분류 통합) */
function createPlanInvestSavingsCategoryDropdown(initialValue, onSelect) {
  const opts = getPlanInvestSavingsClassificationOptions();
  const wrap = document.createElement("div");
  wrap.className = "asset-plan-category-wrap";
  const display = document.createElement("span");
  display.className = "asset-plan-category-display";
  display.textContent = initialValue || "선택";
  const panel = document.createElement("div");
  panel.className = "asset-plan-category-panel";
  panel.hidden = true;
  opts.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-plan-category-option";
    row.innerHTML = `<span class="asset-plan-category-tag ${opt.color || "expense-cls-gray"}">${opt.label}</span>`;
    row.addEventListener("click", () => {
      display.textContent = opt.label;
      panel.hidden = true;
      onSelect?.(opt.category, opt.label);
    });
    panel.appendChild(row);
  });
  display.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllDebtDropdownPanels(panel);
    const rect = display.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 120)}px`;
    document.body.appendChild(panel);
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) panel.hidden = true;
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    }
  });
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return { wrap, getValue: () => display.textContent === "선택" ? "" : display.textContent };
}

/** 가계부 데이터에서 사용된 고정비/변동비/기타 분류 수집 (3개 카테고리 통합, 순서: 변동비→고정비→기타) */
function getPlanExpenseClassificationOptions() {
  const base = [];
  ["변동비", "고정비", "기타"].forEach((cat) => {
    const byCat = getExpenseClassificationByCategory();
    (byCat[cat] || []).forEach((o) => base.push({ ...o, category: cat }));
  });
  const used = new Map();
  base.forEach((o) => used.set(`${o.category}:${o.label}`, o));
  const rows = loadExpenseRows();
  rows.forEach((r) => {
    const cat = r.category || "";
    if ((cat === "고정비" || cat === "변동비" || cat === "기타") && r.classification) {
      const key = `${cat}:${r.classification}`;
      if (!used.has(key)) used.set(key, { label: r.classification, category: cat, color: "expense-cls-gray" });
    }
  });
  return [...used.values()];
}

/** 고정비/변동비/기타 목표용 카테고리 드롭다운 (3개 카테고리 통합) */
function createPlanExpenseCategoryDropdown(initialValue, onSelect) {
  const opts = getPlanExpenseClassificationOptions();
  const wrap = document.createElement("div");
  wrap.className = "asset-plan-category-wrap";
  const display = document.createElement("span");
  display.className = "asset-plan-category-display";
  display.textContent = initialValue || "선택";
  const panel = document.createElement("div");
  panel.className = "asset-plan-category-panel";
  panel.hidden = true;
  opts.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-plan-category-option";
    row.innerHTML = `<span class="asset-plan-category-tag ${opt.color || "expense-cls-gray"}">${opt.label}</span>`;
    row.addEventListener("click", () => {
      display.textContent = opt.label;
      panel.hidden = true;
      onSelect?.(opt.category, opt.label);
    });
    panel.appendChild(row);
  });
  display.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllDebtDropdownPanels(panel);
    const rect = display.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 120)}px`;
    document.body.appendChild(panel);
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) panel.hidden = true;
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    }
  });
  wrap.appendChild(display);
  wrap.appendChild(panel);
  return { wrap, getValue: () => display.textContent === "선택" ? "" : display.textContent };
}

function planTableTypeToStorageSection(tableType) {
  if (tableType === "investSavings") return "invest_savings";
  return tableType;
}

function savePlanMonthlyGoalsFromPlanView(planRoot) {
  if (!planRoot?.classList?.contains("asset-plan-view")) return;
  const out = [];
  planRoot.querySelectorAll(".asset-plan-section").forEach((section) => {
    const tt = section.dataset.planTableType;
    if (!tt) return;
    const sectionKey = planTableTypeToStorageSection(tt);
    const tbody = section.querySelector("tbody");
    if (!tbody) return;
    tbody.querySelectorAll("tr.asset-plan-row--view").forEach((tr, idx) => {
      const cat = (tr.dataset.planCategory || "").trim();
      const cls = (tr.dataset.planClassification || "").trim();
      const monthlyGoalStr = (tr.dataset.monthlyGoalStr || "").trim();
      if (!cls) return;
      out.push({
        section: sectionKey,
        category: cat,
        classification: cls,
        monthlyGoalStr,
        sortOrder: idx,
      });
    });
  });
  setPlanMonthlyGoalsRowsMem(out);
  window.dispatchEvent(new CustomEvent("asset-plan-monthly-goals-saved"));
}

function loadSavedPlanRowsForTableType(tableType) {
  const key = planTableTypeToStorageSection(tableType);
  try {
    const arr = getPlanMonthlyGoalsRowsMem();
    if (!Array.isArray(arr)) return [];
    return arr.filter((r) => r.section === key).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  } catch (_) {
    return [];
  }
}

function renderPlanView() {
  const wrap = document.createElement("div");
  wrap.className = "asset-plan-view";

  const createTable = (title, col1Label, col4Label, col4Calculated, goalType, tableType) => {
    const section = document.createElement("div");
    section.className = "asset-plan-section";
    section.dataset.planTableType = tableType;
    section.setAttribute("role", "group");
    section.setAttribute("aria-label", title);
    const h3 = document.createElement("h3");
    h3.className = "asset-plan-section-title";
    h3.textContent = title;
    section.appendChild(h3);
    const tableWrap = document.createElement("div");
    tableWrap.className = "asset-plan-table-wrap";
    const table = document.createElement("table");
    table.className = "asset-plan-table";
    const colgroup = document.createElement("colgroup");
    colgroup.innerHTML =
      '<col class="asset-plan-col-category" /><col class="asset-plan-col-amount" /><col class="asset-plan-col-amount" />' +
      '<col class="asset-plan-col-amount" /><col class="asset-plan-col-goal" />' +
      '<col class="asset-plan-col-action" style="width:2rem;min-width:2rem;max-width:2rem" />';
    table.appendChild(colgroup);
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>${col1Label}</th><th>월목표 금액</th><th>이번달 합계</th><th>${col4Label}</th><th>목표달성</th><th scope="col" class="asset-plan-th-action" aria-label="행 작업"></th></tr>`;
    const tbody = document.createElement("tbody");

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "asset-plan-btn-add";
    addBtn.innerHTML = '<span class="asset-plan-add-icon">+</span>';

    function persistPlanGoals() {
      savePlanMonthlyGoalsFromPlanView(wrap);
    }

    function getMonthTotalForRow(cat, cls) {
      if (tableType === "income" && cls) return getExpenseSumByIncomeClassification(cls);
      if (tableType === "investSavings" && cat && cls)
        return getExpenseSumByInvestSavingsClassification(cat, cls);
      if (tableType === "expense" && cat && cls) return getExpenseSumByExpenseClassification(cat, cls);
      return 0;
    }

    function updateDerivedInPanel(etr) {
      const gIn = etr.querySelector(".asset-plan-goal-in");
      const tot = etr.querySelector(".asset-plan-total-display");
      const d4 = etr.querySelector(".asset-plan-col4-display");
      const dAch = etr.querySelector(".asset-plan-goal-display");
      if (!gIn || !tot || !d4 || !dAch) return;
      const goal = parseNum(gIn.value);
      const tNum = parseNum(tot.textContent);
      if (col4Calculated) {
        let diff = null;
        if (goal !== null && tNum !== null) {
          diff = goal - tNum;
          if (goalType === "min" || goalType === "max") diff = Math.max(0, diff);
        }
        d4.textContent = diff !== null ? formatNum(diff) : "-";
      } else d4.textContent = "-";
      const hasV = goal !== null && tNum !== null;
      const achieved = hasV && (goalType === "min" ? tNum >= goal : tNum <= goal);
      dAch.textContent = hasV ? (achieved ? "🎉 달성" : "실패") : "-";
      dAch.className = "asset-plan-goal-display" + (achieved ? " is-achieved" : hasV ? " is-failed" : "");
    }

    function viewRowHtml(col1CellHtml, goalDisplay, totDisplay, c4, achElClass) {
      return `<tr class="asset-plan-row asset-plan-row--view">` +
        `<td class="asset-plan-col-view1">${col1CellHtml}</td>` +
        `<td>${goalDisplay || "-"}</td>` +
        `<td class="asset-plan-cell-total"><span class="asset-plan-total-display">${totDisplay || "-"}</span></td>` +
        `<td class="asset-plan-cell-col4-calc"><span class="asset-plan-col4-display">${c4}</span></td>` +
        `<td class="asset-plan-cell-goal"><span class="asset-plan-goal-display ${achElClass}">-</span></td>` +
        `<td class="asset-plan-cell-action"><div class="asset-plan-action-wrap"><button type="button" class="asset-plan-btn-edit" aria-label="이 목표 수정">수정</button></div></td>` +
        `</tr>`;
    }

    function afterViewRowPaint(tr) {
      const gStr = (tr.dataset.monthlyGoalStr || "").trim();
      const tot = tr.querySelector(".asset-plan-total-display");
      const gNum = parseNum(gStr);
      const tNum = tot ? parseNum(tot.textContent) : null;
      const d4 = tr.querySelector(".asset-plan-col4-display");
      const dAch = tr.querySelector(".asset-plan-goal-display");
      if (d4 && col4Calculated && gNum !== null && tNum !== null) {
        let diff = gNum - tNum;
        if (goalType === "min" || goalType === "max") diff = Math.max(0, diff);
        d4.textContent = formatNum(diff);
      } else if (d4) d4.textContent = "-";
      if (dAch) {
        const hasV = gNum !== null && tNum !== null;
        const achieved = hasV && (goalType === "min" ? tNum >= gNum : tNum <= gNum);
        dAch.textContent = hasV ? (achieved ? "🎉 달성" : "실패") : "-";
        dAch.className = "asset-plan-goal-display" + (achieved ? " is-achieved" : hasV ? " is-failed" : "");
      }
    }

    function col1ViewHtmlForRow(cat, cls) {
      if (tableType === "income" && cls) {
        return `<span class="asset-plan-category-tag expense-cls-gray">${cls}</span>`;
      }
      if (tableType === "investSavings" && cat && cls) {
        return (
          `<span class="asset-plan-category-view-name">${cat}</span> ` +
          `<span class="asset-plan-category-tag expense-cls-gray">${cls}</span>`
        );
      }
      if (tableType === "expense" && cat && cls) {
        return (
          `<span class="asset-plan-category-view-name">${cat}</span> ` +
          `<span class="asset-plan-category-tag expense-cls-gray">${cls}</span>`
        );
      }
      return "-";
    }

    function appendToForm(fstack, label, classExtra, el) {
      const row = document.createElement("div");
      row.className = "asset-expense-form-row";
      const lab = document.createElement("span");
      lab.className = "asset-expense-form-label";
      lab.textContent = label;
      const control = document.createElement("div");
      control.className = "asset-expense-form-control asset-expense-form-control--field" + (classExtra ? " " + classExtra : "");
      if (el) control.appendChild(el);
      row.appendChild(lab);
      row.appendChild(control);
      fstack.appendChild(row);
      return control;
    }

    function readPanel(etr) {
      const gIn = etr.querySelector(".asset-plan-goal-in");
      return {
        category: (etr.dataset.planCategory || "").trim(),
        classification: (etr.dataset.planClassification || "").trim(),
        monthlyGoalStr: (gIn?.value || "").trim(),
      };
    }

    function buildPlanEntryEditor(mode, mem) {
      const isDraft = mode === "draft";
      const tr = document.createElement("tr");
      tr.className = "asset-plan-row asset-plan-row--editing asset-expense-row--inner-panel";
      tr.innerHTML =
        '<td colspan="6" class="asset-plan-cell-panel">' +
        '<div class="asset-expense-inline-panel asset-plan-inline-panel">' +
        '<div class="asset-expense-inline-panel-top">' +
        '<span class="asset-expense-inline-panel-title">' +
        (isDraft ? "새 목표" : "목표 수정") +
        "</span>" +
        '<button type="button" class="asset-expense-inline-panel-x" aria-label="닫기">×</button>' +
        "</div>" +
        '<div class="asset-expense-inline-panel-body"></div>' +
        '<div class="asset-expense-inline-panel-bottom" aria-label="확인 작업"></div>' +
        "</div></td>";
      const memSnap = !isDraft && mem
        ? { ...mem, category: (mem.category || "").trim(), classification: (mem.classification || "").trim(), monthlyGoalStr: (mem.monthlyGoalStr || "").trim() }
        : null;
      const body = tr.querySelector(".asset-expense-inline-panel-body");
      const foot = tr.querySelector(".asset-expense-inline-panel-bottom");
      const xBtn = tr.querySelector(".asset-expense-inline-panel-x");
      const formStack = document.createElement("div");
      formStack.className = "asset-expense-form-stack";
      formStack.setAttribute("role", "group");
      formStack.setAttribute("aria-label", isDraft ? "새 목표 입력" : "목표 편집");
      body.appendChild(formStack);

      let saveBtn;
      const totalSp = document.createElement("span");
      totalSp.className = "asset-plan-total-display";
      totalSp.textContent = "-";
      const d4 = document.createElement("span");
      d4.className = "asset-plan-col4-display";
      d4.textContent = "-";
      const dAch = document.createElement("span");
      dAch.className = "asset-plan-goal-display";
      dAch.textContent = "-";

      const setTotalsFromData = (cat, cls) => {
        if (!cls) {
          tr.dataset.planCategory = cat || "";
          tr.dataset.planClassification = "";
          totalSp.textContent = "-";
          return;
        }
        tr.dataset.planCategory = tableType === "income" ? "수입" : cat || "";
        tr.dataset.planClassification = cls;
        const s =
          tableType === "income"
            ? getExpenseSumByIncomeClassification(cls)
            : tableType === "investSavings" && cat
              ? getExpenseSumByInvestSavingsClassification(cat, cls)
              : tableType === "expense" && cat
                ? getExpenseSumByExpenseClassification(cat, cls)
                : 0;
        totalSp.textContent = s > 0 ? formatNum(s) : "-";
        updateDerivedInPanel(tr);
      };

      if (tableType === "income") {
        tr.dataset.planCategory = "수입";
        const dd = createPlanIncomeCategoryDropdown(isDraft ? "" : (memSnap?.classification || ""), (classification) => {
          if (!classification) return;
          tr.dataset.planCategory = "수입";
          tr.dataset.planClassification = classification;
          setTotalsFromData("수입", classification);
        });
        const host = appendToForm(formStack, col1Label, "asset-plan-cell-cat", dd.wrap);
        void host;
      } else if (tableType === "investSavings") {
        const dd = createPlanInvestSavingsCategoryDropdown(
          isDraft ? "" : (memSnap?.classification || memSnap?.category || ""),
          (category, classification) => {
            tr.dataset.planCategory = category;
            tr.dataset.planClassification = classification;
            setTotalsFromData(category, classification);
          }
        );
        const host = appendToForm(formStack, col1Label, "asset-plan-cell-cat", dd.wrap);
        void host;
        if (memSnap && !isDraft && memSnap.category && memSnap.classification) {
          tr.dataset.planCategory = memSnap.category;
          tr.dataset.planClassification = memSnap.classification;
        }
      } else {
        const dd = createPlanExpenseCategoryDropdown(
          isDraft ? "" : (memSnap?.classification || memSnap?.category || ""),
          (category, classification) => {
            tr.dataset.planCategory = category;
            tr.dataset.planClassification = classification;
            setTotalsFromData(category, classification);
          }
        );
        const host = appendToForm(formStack, col1Label, "asset-plan-cell-cat", dd.wrap);
        void host;
        if (memSnap && !isDraft && memSnap.category && memSnap.classification) {
          tr.dataset.planCategory = memSnap.category;
          tr.dataset.planClassification = memSnap.classification;
        }
      }

      const goalIn = document.createElement("input");
      goalIn.type = "text";
      goalIn.className = "asset-plan-input asset-plan-goal-in";
      goalIn.inputMode = "numeric";
      goalIn.setAttribute("inputmode", "numeric");
      goalIn.autocomplete = "off";
      goalIn.value = memSnap ? memSnap.monthlyGoalStr : "";
      const goalCtrl = appendToForm(formStack, "월목표 금액", "asset-plan-cell-goalp", goalIn);
      void goalCtrl;
      const applyGoalNumericFilter = () => {
        filterNumericInput(goalIn, false, null);
        updateDerivedInPanel(tr);
      };
      goalIn.addEventListener("input", (e) => {
        filterNumericInput(goalIn, false, e);
        updateDerivedInPanel(tr);
      });
      goalIn.addEventListener("paste", () => {
        requestAnimationFrame(applyGoalNumericFilter);
      });
      goalIn.addEventListener("blur", () => {
        const f = formatNum(goalIn.value);
        if (f !== "") goalIn.value = f;
        updateDerivedInPanel(tr);
      });
      goalIn.addEventListener("keydown", (e) => e.key === "Enter" && goalIn.blur());

      appendToForm(formStack, "이번달 합계", "asset-plan-total", totalSp);
      appendToForm(formStack, col4Label, "asset-plan-d4", d4);
      appendToForm(formStack, "목표달성", "asset-plan-ach", dAch);

      if (!isDraft && memSnap) {
        if (tableType === "income" && memSnap.classification) setTotalsFromData("수입", memSnap.classification);
        if (tableType === "investSavings" && memSnap.category && memSnap.classification)
          setTotalsFromData(memSnap.category, memSnap.classification);
        if (tableType === "expense" && memSnap.category && memSnap.classification)
          setTotalsFromData(memSnap.category, memSnap.classification);
      }
      updateDerivedInPanel(tr);

      const runCancel = () => {
        if (isDraft) {
          tr.remove();
          return;
        }
        if (memSnap) {
          const n = buildPlanViewRowElement(memSnap);
          if (n) tr.replaceWith(n);
          else tr.remove();
        } else {
          tr.remove();
        }
      };
      if (xBtn) {
        xBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          runCancel();
        });
      }
      if (isDraft) {
        saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--primary";
        saveBtn.textContent = "저장";
        const cxl = document.createElement("button");
        cxl.type = "button";
        cxl.className = "asset-expense-inline-panel-btn";
        cxl.textContent = "취소";
        cxl.addEventListener("click", (e) => {
          e.stopPropagation();
          runCancel();
        });
        const fin = document.createElement("div");
        fin.className = "asset-expense-inline-panel-bottom-inner";
        fin.appendChild(cxl);
        fin.appendChild(saveBtn);
        foot.appendChild(fin);
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const p = readPanel(tr);
          if (!p.classification) return;
          p.category = p.category || (tableType === "income" ? "수입" : p.category);
          if (tableType === "income") p.category = "수입";
          const next = { category: p.category, classification: p.classification, monthlyGoalStr: p.monthlyGoalStr };
          const n = buildPlanViewRowElement(next);
          if (n) tr.replaceWith(n);
          else tr.remove();
          persistPlanGoals();
        });
      } else {
        saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--primary";
        saveBtn.textContent = "수정";
        const cxl = document.createElement("button");
        cxl.type = "button";
        cxl.className = "asset-expense-inline-panel-btn";
        cxl.textContent = "취소";
        cxl.addEventListener("click", (e) => {
          e.stopPropagation();
          runCancel();
        });
        const fin = document.createElement("div");
        fin.className = "asset-expense-inline-panel-bottom-inner";
        fin.appendChild(cxl);
        fin.appendChild(saveBtn);
        foot.appendChild(fin);
        saveBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const p = readPanel(tr);
          if (!p.classification) return;
          if (tableType === "income") p.category = "수입";
          const n = buildPlanViewRowElement({
            category: p.category,
            classification: p.classification,
            monthlyGoalStr: p.monthlyGoalStr,
          });
          if (n) tr.replaceWith(n);
          else tr.remove();
          persistPlanGoals();
        });
      }

      return tr;
    }

    function buildPlanViewRowElement(d) {
      if (!(d && (d.classification || "").trim())) return null;
      const t = document.createElement("tr");
      const cat = (d.category || "").trim();
      const cls = (d.classification || "").trim();
      const mStr = (d.monthlyGoalStr || "").trim();
      t.className = "asset-plan-row asset-plan-row--view";
      if (cat) t.dataset.planCategory = cat;
      if (cls) t.dataset.planClassification = cls;
      if (mStr) t.dataset.monthlyGoalStr = mStr;
      const gDisp = mStr
        ? parseNum(mStr) !== null
          ? formatNum(mStr)
          : mStr
        : "-";
      const monTot = getMonthTotalForRow(cat, cls);
      const totDisp = monTot > 0 ? formatNum(monTot) : "-";
      const c4 = col4Calculated
        ? (() => {
            const gN = parseNum(mStr);
            if (gN === null) return "-";
            const tN = monTot;
            let diff = gN - tN;
            if (goalType === "min" || goalType === "max") diff = Math.max(0, diff);
            return formatNum(diff);
          })()
        : "-";
      t.innerHTML = viewRowHtml(col1ViewHtmlForRow(cat, cls), gDisp, totDisp, c4, "");
      afterViewRowPaint(t);
      const ed = t.querySelector(".asset-plan-btn-edit");
      const mem2 = { category: cat, classification: cls, monthlyGoalStr: mStr };
      ed.addEventListener("click", (e) => {
        e.stopPropagation();
        t.replaceWith(buildPlanEntryEditor("edit", mem2));
      });
      return t;
    }

    loadSavedPlanRowsForTableType(tableType).forEach((r) => {
      if ((r.classification || "").trim()) {
        const t = buildPlanViewRowElement(r);
        if (t) tbody.appendChild(t);
      }
    });
    addBtn.addEventListener("click", () => {
      tbody.appendChild(buildPlanEntryEditor("draft", null));
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    const planTableContainer = document.createElement("div");
    planTableContainer.className = "asset-plan-table-container";
    planTableContainer.appendChild(tableWrap);
    const planAddButtonWrap = document.createElement("div");
    planAddButtonWrap.className = "asset-plan-add-button-wrap";
    planAddButtonWrap.appendChild(addBtn);
    planTableContainer.appendChild(planAddButtonWrap);
    section.appendChild(planTableContainer);
    return section;
  };

  wrap.appendChild(createTable("1. 수입 목표", "수입 카테고리", "더 벌어야 하는 금액", true, "min", "income"));
  wrap.appendChild(createTable("2. 투자/저축 목표", "투자/저축 카테고리", "더 투자/저축해야 할 금액", true, "min", "investSavings"));
  wrap.appendChild(createTable("3. 고정비/변동비/기타 목표", "소비 카테고리", "소비할 수 있는 금액", true, "max", "expense"));

  return wrap;
}

function renderCashflowView() {
  const wrap = document.createElement("div");
  wrap.className = "asset-cashflow-view";

  const now = new Date();
  let selectedYear = now.getFullYear();
  let selectedMonth = now.getMonth() + 1;

  const periodToolbar = document.createElement("div");
  periodToolbar.className = "asset-cashflow-period-toolbar";

  const periodWrap = document.createElement("div");
  periodWrap.className = "asset-cashflow-period-wrap";

  const monthWrap = document.createElement("div");
  monthWrap.className = "asset-cashflow-month-nav";
  monthWrap.setAttribute("aria-label", "월 선택");
  monthWrap.innerHTML = `
    <button type="button" class="asset-cashflow-year-btn asset-cashflow-month-prev" aria-label="이전 달">
      <img src="/toolbaricons/caret-left-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
    </button>
    <span class="asset-cashflow-month-display">${selectedMonth}월</span>
    <button type="button" class="asset-cashflow-year-btn asset-cashflow-month-next" aria-label="다음 달">
      <img src="/toolbaricons/caret-right-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
    </button>
  `;
  const monthDisplayCashflow = monthWrap.querySelector(".asset-cashflow-month-display");
  const monthPrevCashflow = monthWrap.querySelector(".asset-cashflow-month-prev");
  const monthNextCashflow = monthWrap.querySelector(".asset-cashflow-month-next");

  const yearWrap = document.createElement("div");
  yearWrap.className = "asset-cashflow-year-nav";
  yearWrap.setAttribute("aria-label", "연도 선택");
  yearWrap.innerHTML = `
    <button type="button" class="asset-cashflow-year-btn" aria-label="이전 연도">
      <img src="/toolbaricons/caret-left-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
    </button>
    <span class="asset-cashflow-year-display">${selectedYear}</span>
    <button type="button" class="asset-cashflow-year-btn" aria-label="다음 연도">
      <img src="/toolbaricons/caret-right-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
    </button>
  `;
  const yearPrevBtn = yearWrap.querySelector(".asset-cashflow-year-btn:first-child");
  const yearNextBtn = yearWrap.querySelector(".asset-cashflow-year-btn:last-child");
  const yearDisplay = yearWrap.querySelector(".asset-cashflow-year-display");

  periodWrap.appendChild(monthWrap);
  periodWrap.appendChild(yearWrap);
  periodToolbar.appendChild(periodWrap);
  wrap.appendChild(periodToolbar);

  const dashboard = document.createElement("div");
  dashboard.className = "time-dashboard-view";

  function syncCashflowPeriodLabels() {
    if (monthDisplayCashflow) monthDisplayCashflow.textContent = `${selectedMonth}월`;
    if (yearDisplay) yearDisplay.textContent = String(selectedYear);
  }

  monthPrevCashflow.addEventListener("click", () => {
    selectedMonth -= 1;
    if (selectedMonth < 1) {
      selectedMonth = 12;
      selectedYear -= 1;
    }
    syncCashflowPeriodLabels();
    renderChart();
  });
  monthNextCashflow.addEventListener("click", () => {
    selectedMonth += 1;
    if (selectedMonth > 12) {
      selectedMonth = 1;
      selectedYear += 1;
    }
    syncCashflowPeriodLabels();
    renderChart();
  });

  yearPrevBtn.addEventListener("click", () => {
    selectedYear -= 1;
    syncCashflowPeriodLabels();
    renderChart();
  });
  yearNextBtn.addEventListener("click", () => {
    selectedYear += 1;
    syncCashflowPeriodLabels();
    renderChart();
  });

  wrap.appendChild(dashboard);

  function aggregateByCategory(rows, year, month) {
    const 소비 = { label: "소비", value: 0, color: "#C4D8F2" };
    const 저축 = { label: "저축", value: 0, color: "#F2D9C4" };
    const 투자 = { label: "투자", value: 0, color: "#C8D0D8" };
    const 수입 = { label: "수입", value: 0, color: "#E0C4E8" };

    rows.forEach((r) => {
      const dateParts = (r.date || "").split("-");
      if (dateParts.length < 2) return;
      const rowYear = parseInt(dateParts[0], 10);
      const rowMonth = parseInt(dateParts[1], 10);
      if (rowYear !== year || rowMonth !== month) return;

      const amtRaw = parseNum(r.amount);
      if (amtRaw === null) return;
      const amt = Math.abs(amtRaw);
      const cat = r.category || "";

      if (cat === "수입") {
        수입.value += amt;
      } else if (cat === "고정비" || cat === "변동비" || cat === "기타") {
        소비.value += amt;
      } else if (cat === "저축") {
        저축.value += amt;
      } else if (cat === "투자") {
        투자.value += amt;
      }
    });

    return [소비, 저축, 투자, 수입];
  }

  /** 현금흐름 세로 흐름용: 수입, 고정비, 변동비, 저축, 기타 */
  function aggregateByCategoryDetailed(rows, year, month) {
    const 수입 = { label: "수입", value: 0, color: "#E0C4E8", desc: "월급, 부업, 용돈, 보너스, 임대소득, 투자소득" };
    const 고정비 = { label: "고정비", value: 0, color: "#C4DCC8", desc: "월세, 보험, 통신비, 관리비" };
    const 변동비 = { label: "변동비", value: 0, color: "#C4E0DC", desc: "식비, 교통비, 쇼핑" };
    const 저축 = { label: "저축/투자", value: 0, color: "#F2D9C4", desc: "예적금, 주식, 연금, 펀드" };
    const 기타 = { label: "기타", value: 0, color: "#F2E8C4", desc: "경조사비, 선물비, Me 비용" };

    rows.forEach((r) => {
      const dateParts = (r.date || "").split("-");
      if (dateParts.length < 2) return;
      const rowYear = parseInt(dateParts[0], 10);
      const rowMonth = parseInt(dateParts[1], 10);
      if (rowYear !== year || rowMonth !== month) return;

      const amtRaw = parseNum(r.amount);
      if (amtRaw === null) return;
      const amt = Math.abs(amtRaw);
      const cat = r.category || "";

      if (cat === "수입") {
        수입.value += amt;
      } else if (cat === "고정비") {
        고정비.value += amt;
      } else if (cat === "변동비") {
        변동비.value += amt;
      } else if (cat === "저축" || cat === "투자") {
        저축.value += amt;
      } else if (cat === "기타") {
        기타.value += amt;
      }
    });

    return [수입, 고정비, 변동비, 저축, 기타];
  }

  /** 카테고리별 지출분류(세부분류) 집계 - 옆 공간 breakdown용 */
  function aggregateByClassification(categoryKeys, rows, year, month) {
    const keys = Array.isArray(categoryKeys) ? categoryKeys : [categoryKeys];
    const byCat = getExpenseClassificationByCategory();
    const classifications = keys.flatMap((k) => byCat[k] || []);
    const seen = new Set();
    const unique = classifications.filter((c) => {
      if (seen.has(c.label)) return false;
      seen.add(c.label);
      return true;
    });
    const map = Object.fromEntries(unique.map((c) => [c.label, { ...c, value: 0 }]));
    let 기타합계 = 0;

    rows.forEach((r) => {
      const dateParts = (r.date || "").split("-");
      if (dateParts.length < 2) return;
      const rowYear = parseInt(dateParts[0], 10);
      const rowMonth = parseInt(dateParts[1], 10);
      if (rowYear !== year || rowMonth !== month) return;
      const cat = (r.category || "").trim();
      if (!keys.includes(cat)) return;

      const amtRaw = parseNum(r.amount);
      if (amtRaw === null) return;
      const amt = Math.abs(amtRaw);
      const cls = (r.classification || "").trim();

      if (cls && map[cls]) {
        map[cls].value += amt;
      } else {
        기타합계 += amt;
      }
    });

    const result = unique.map((c) => ({ ...c, value: map[c.label]?.value ?? 0 }));
    const 기타Entry = result.find((r) => r.label === "기타");
    if (기타Entry) {
      기타Entry.value += 기타합계;
    } else if (기타합계 > 0) {
      result.push({ label: "미분류", color: "expense-cls-gray", value: 기타합계 });
    }
    return result;
  }

  function aggregateFixedExpenseByClassification(rows, year, month) {
    const byCat = getExpenseClassificationByCategory();
    const classifications = byCat.고정비 || [];
    const map = Object.fromEntries(classifications.map((c) => [c.label, { ...c, value: 0 }]));
    let 기타합계 = 0;

    rows.forEach((r) => {
      const dateParts = (r.date || "").split("-");
      if (dateParts.length < 2) return;
      const rowYear = parseInt(dateParts[0], 10);
      const rowMonth = parseInt(dateParts[1], 10);
      if (rowYear !== year || rowMonth !== month) return;
      if ((r.category || "").trim() !== "고정비") return;

      const amtRaw = parseNum(r.amount);
      if (amtRaw === null) return;
      const amt = Math.abs(amtRaw);
      const cls = (r.classification || "").trim();

      if (cls && map[cls]) {
        map[cls].value += amt;
      } else if (cls) {
        기타합계 += amt;
      }
    });

    const result = classifications.map((c) => ({ ...c, value: map[c.label]?.value ?? 0 }));
    if (기타합계 > 0) {
      result.push({ label: "기타", color: "expense-cls-gray", value: 기타합계 });
    }
    return result;
  }

  function getSubscriptionExpenseRows(rows, year, month) {
    return rows.filter((r) => {
      const dateParts = (r.date || "").split("-");
      if (dateParts.length < 2) return false;
      const rowYear = parseInt(dateParts[0], 10);
      const rowMonth = parseInt(dateParts[1], 10);
      if (rowYear !== year || rowMonth !== month) return false;
      if ((r.category || "").trim() !== "고정비") return false;
      if ((r.classification || "").trim() !== "구독료") return false;
      return true;
    });
  }

  const VARIABLE_EXPENSE_CLASSIFICATIONS = ["식비", "교통비", "쇼핑", "취미/여가", "의료비"];
  const VARIABLE_BAR_COLORS = [
    "rgba(13, 148, 136, 0.55)",
    "rgba(59, 130, 246, 0.55)",
    "rgba(34, 197, 94, 0.55)",
    "rgba(139, 92, 246, 0.55)",
    "rgba(249, 115, 22, 0.55)",
    "rgba(107, 114, 128, 0.5)",
  ];

  function getVariableExpenseRows(rows, year, month) {
    if (!Array.isArray(rows)) return [];
    return rows.filter((r) => {
      const dateParts = (r.date || "").split("-");
      if (dateParts.length < 2) return false;
      const rowYear = parseInt(dateParts[0], 10);
      const rowMonth = parseInt(dateParts[1], 10);
      if (rowYear !== year || rowMonth !== month) return false;
      if ((r.category || "").trim() !== "변동비") return false;
      const cls = (r.classification || "").trim();
      return VARIABLE_EXPENSE_CLASSIFICATIONS.includes(cls) || cls === "";
    });
  }

  function renderChart() {
    const rows = loadExpenseRows();
    const data = aggregateByCategory(rows, selectedYear, selectedMonth);
    const [소비, 저축, 투자, 수입] = data;
    const flowData = aggregateByCategoryDetailed(rows, selectedYear, selectedMonth);
    const periodLabel = `${selectedYear}년 ${selectedMonth}월`;
    const chartData = [소비, 저축, 투자];
    const maxVal = Math.max(...chartData.map((d) => d.value), 1);

    const categoryKeyMap = {
      수입: ["수입"],
      고정비: ["고정비"],
      변동비: ["변동비"],
      "저축/투자": ["저축", "투자"],
      기타: ["기타"],
    };

    const catTagStyle = {
      수입: { bg: "rgba(224,196,232,0.4)", color: "#6b21a8" },
      고정비: { bg: "rgba(196,220,200,0.4)", color: "#2d5a3d" },
      변동비: { bg: "rgba(196,224,220,0.4)", color: "#0d5c5c" },
      "저축/투자": { bg: "rgba(242,217,196,0.4)", color: "#9a5a2e" },
      기타: { bg: "rgba(242,232,196,0.4)", color: "#b45309" },
    };
    const flowItems = flowData
      .map(
        (d, i) => {
          const hasArrow = i < flowData.length - 1;
          const keys = categoryKeyMap[d.label] || [];
          const breakdown = aggregateByClassification(keys, rows, selectedYear, selectedMonth);
          const tagStyle = catTagStyle[d.label] || catTagStyle.기타;
          const breakdownHtml =
            breakdown.length > 0
              ? breakdown
                  .map(
                    (b) =>
                      `<div class="asset-cashflow-breakdown-row"><span class="asset-expense-classification-tag" style="background:${tagStyle.bg};color:${tagStyle.color}">${b.label}</span><span class="asset-cashflow-breakdown-amt">${b.value > 0 ? formatNum(b.value) + "원" : "—"}</span></div>`
                  )
                  .join("")
              : '<div class="asset-cashflow-breakdown-empty">—</div>';

          return `
      <div class="asset-cashflow-flow-row ${hasArrow ? "has-arrow" : ""}">
        <div class="asset-cashflow-flow-item" data-flow="${d.label}" style="background:${d.color}1a;border-color:${d.color}40">
          <div class="asset-cashflow-flow-icon" style="background:${d.color}38;color:${d.color}">
            ${d.label === "수입" ? "↑" : d.label === "고정비" ? "⌂" : d.label === "변동비" ? "×" : d.label === "저축/투자" ? "○" : "✦"}
          </div>
          <div class="asset-cashflow-flow-content">
            <div class="asset-cashflow-flow-title">${d.label}</div>
            <div class="asset-cashflow-flow-value">${d.value > 0 ? formatNum(d.value) + "원" : "—"}</div>
            <div class="asset-cashflow-flow-desc">${d.desc}</div>
          </div>
          ${hasArrow ? '<div class="asset-cashflow-flow-arrow">↓</div>' : ""}
        </div>
        <div class="asset-cashflow-flow-breakdown">
          ${breakdownHtml}
        </div>
      </div>
    `;
        }
      )
      .join("");

    const rowTop = document.createElement("div");
    rowTop.className = "asset-cashflow-flow-wrap";
    rowTop.innerHTML = `
      <div class="asset-cashflow-flow-header">${periodLabel} 현금 흐름</div>
      <div class="asset-cashflow-flow-body">
        <div class="asset-cashflow-flow-list">
          ${flowItems}
        </div>
      </div>
    `;

    const pad = 0.15;
    const yMax = maxVal * (1 + pad);

    const chartW = 600;
    const chartH = 280;
    const padLeft = 45;
    const padRight = 20;
    const padTop = 18;
    const padBottom = 40;
    const plotW = chartW - padLeft - padRight;
    const plotH = chartH - padTop - padBottom;

    const barCount = 3;
    const barGap = 16;
    const barTotalW = plotW / barCount;
    const barW = Math.max(40, barTotalW - barGap);

    const bars = chartData
      .map((d, i) => {
        const x = padLeft + i * barTotalW + (barTotalW - barW) / 2;
        const barH = d.value > 0 ? (d.value / yMax) * plotH : 0;
        const y = padTop + plotH - barH;
        return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" ry="4" fill="${d.color}" class="asset-cashflow-bar"/>`;
      })
      .join("");

    const xLabels = chartData
      .map((d, i) => {
        const x = padLeft + (i + 0.5) * barTotalW;
        const y = chartH - 6;
        return `<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="#374151">${d.label}</text>`;
      })
      .join("");

    const yTicks = [];
    const step = Math.ceil(yMax / 5 / 10000) * 10000 || 10000;
    for (let v = 0; v <= yMax; v += step) {
      yTicks.push(v);
    }
    if (yTicks.length === 0) yTicks.push(0);

    const yLabels = yTicks
      .map((v) => {
        const y = padTop + plotH - (v / yMax) * plotH;
        return `<text x="${padLeft - 5}" y="${y + 4}" text-anchor="end" font-size="9" fill="#6b7280">${v >= 10000 ? v / 10000 + "만" : v.toLocaleString()}</text>`;
      })
      .join("");

    const valueLabels = chartData
      .map((d, i) => {
        const x = padLeft + (i + 0.5) * barTotalW;
        const pct = 수입.value > 0 ? Math.round((d.value / 수입.value) * 100) : 0;
        const barH = d.value > 0 ? (d.value / yMax) * plotH : 0;
        const y = padTop + plotH - barH - 4;
        if (d.value === 0) return "";
        return `<text x="${x}" y="${y}" text-anchor="middle" font-size="10" fill="#374151" font-weight="500">${pct}% · ${formatNum(d.value)}</text>`;
      })
      .filter(Boolean)
      .join("");

    const gridLines = yTicks
      .map((v) => {
        const y = padTop + plotH - (v / yMax) * plotH;
        return `<line x1="${padLeft}" y1="${y}" x2="${padLeft + plotW}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`;
      })
      .join("");

    const chartWidget = document.createElement("div");
    chartWidget.className = "time-dashboard-widget time-dashboard-widget-cashflow-chart";
    chartWidget.innerHTML = `
      <div class="time-dashboard-widget-title">월급 흐름 시각화 (${periodLabel}) · 월급 대비 퍼센트, 금액</div>
      <div class="asset-cashflow-chart-wrap">
        <svg class="asset-cashflow-chart" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMinYMid meet">
          ${gridLines}
          ${bars}
          ${yLabels}
          ${xLabels}
          ${valueLabels}
        </svg>
      </div>
    `;

    const fixedExpenseData = aggregateFixedExpenseByClassification(rows, selectedYear, selectedMonth);
    const 고정비TagStyle = { bg: "rgba(196,220,200,0.4)", color: "#2d5a3d" };
    const fixedExpenseTableRows = fixedExpenseData
      .map(
        (d) =>
          `<tr><td class="asset-fixed-expense-cls"><span class="asset-expense-classification-tag" style="background:${고정비TagStyle.bg};color:${고정비TagStyle.color}">${d.label}</span></td><td class="asset-fixed-expense-amt">${d.value > 0 ? formatNum(d.value) + "원" : "—"}</td></tr>`
      )
      .join("");
    const fixedExpenseTotal = fixedExpenseData.reduce((s, d) => s + d.value, 0);

    const fixedExpenseWidget = document.createElement("div");
    fixedExpenseWidget.className = "time-dashboard-widget time-dashboard-widget-placeholder";
    fixedExpenseWidget.innerHTML = `
      <div class="time-dashboard-widget-title">이번달 고정비</div>
      <div class="time-dashboard-widget-desc" style="color:#6b7280;margin-top:0.25rem;margin-bottom:0.75rem;">${periodLabel} · 세부지출분류별</div>
      <table class="asset-fixed-expense-table">
        <thead><tr><th>세부지출분류</th><th>금액</th></tr></thead>
        <tbody>
          ${fixedExpenseTableRows || '<tr><td colspan="2" class="asset-fixed-expense-empty">데이터 없음</td></tr>'}
        </tbody>
        <tfoot><tr><td>합계</td><td class="asset-fixed-expense-amt">${fixedExpenseTotal > 0 ? formatNum(fixedExpenseTotal) + "원" : "—"}</td></tr></tfoot>
      </table>
    `;

    const subscriptionRows = getSubscriptionExpenseRows(rows, selectedYear, selectedMonth);
    let subscriptionTotal = 0;
    const subscriptionTableRows = subscriptionRows
      .map((r) => {
        const amt = parseNum(r.amount);
        const val = amt !== null ? Math.abs(amt) : 0;
        subscriptionTotal += val;
        const amtStr = amt !== null ? formatNum(val) + "원" : "—";
        const name = (r.name || "").trim() || "—";
        return `<tr><td class="asset-subscription-name">${escapeHtml(name)}</td><td class="asset-subscription-amt">${amtStr}</td></tr>`;
      })
      .join("");

    const subscriptionWidget = document.createElement("div");
    subscriptionWidget.className = "time-dashboard-widget time-dashboard-widget-subscription";
    subscriptionWidget.innerHTML = `
      <div class="time-dashboard-widget-title">이번달 구독료 목록</div>
      <div class="time-dashboard-widget-desc" style="color:#6b7280;margin-top:0.25rem;margin-bottom:0.75rem;">${periodLabel} · 구독료 지출분류</div>
      <table class="asset-subscription-table">
        <thead><tr><th>지출명</th><th>금액</th></tr></thead>
        <tbody>
          ${subscriptionTableRows || '<tr><td colspan="2" class="asset-subscription-empty">데이터 없음</td></tr>'}
        </tbody>
        <tfoot><tr><td>합계</td><td class="asset-subscription-amt">${subscriptionTotal > 0 ? formatNum(subscriptionTotal) + "원" : "—"}</td></tr></tfoot>
      </table>
    `;

    let variableExpenseWidget;
    try {
      const varRows = getVariableExpenseRows(rows, selectedYear, selectedMonth);
      const grouped = {};
      (varRows || []).forEach((r) => {
        const cls = (r.classification || "").trim() || "기타";
        if (!grouped[cls]) grouped[cls] = 0;
        const amt = parseNum(r.amount);
        grouped[cls] += amt !== null ? Math.abs(amt) : 0;
      });
      const order = [...VARIABLE_EXPENSE_CLASSIFICATIONS];
      const barEntries = [...order.filter((c) => (grouped[c] || 0) > 0), ...Object.keys(grouped).filter((c) => !order.includes(c))].map((cls, i) => ({
        label: cls,
        value: grouped[cls] || 0,
        color: VARIABLE_BAR_COLORS[i % VARIABLE_BAR_COLORS.length],
      }));
      const totalVariable = barEntries.reduce((s, d) => s + d.value, 0);
      const maxVal = Math.max(...barEntries.map((d) => d.value), 1);

      const barHtml = barEntries
        .map(
          (x) => `<div class="asset-variable-bar-row"><span class="asset-variable-bar-label">${escapeHtml(x.label)}</span><div class="asset-variable-bar-track"><div class="asset-variable-bar-fill" style="width:${(x.value / maxVal) * 100}%;background:${x.color}"></div></div><span class="asset-variable-bar-value">${formatNum(x.value)}원</span></div>`
        )
        .join("");

      variableExpenseWidget = document.createElement("div");
      variableExpenseWidget.className = "time-dashboard-widget asset-variable-expense-widget";
      variableExpenseWidget.innerHTML = `<div class="time-dashboard-widget-title">이번달 변동비</div><div class="time-dashboard-widget-desc" style="color:#6b7280;margin-top:0.25rem;margin-bottom:0.5rem;">${periodLabel} · 세부카테고리별</div><div class="asset-variable-bar-total">총 ${formatNum(totalVariable)}원</div><div class="asset-variable-bar-list">${barEntries.length ? barHtml : '<div class="asset-variable-bar-empty">데이터 없음</div>'}</div>`;
    } catch (err) {
      variableExpenseWidget = document.createElement("div");
      variableExpenseWidget.className = "time-dashboard-widget time-dashboard-widget-placeholder";
      variableExpenseWidget.innerHTML = `<div class="time-dashboard-widget-title">추가 위젯</div><div class="time-dashboard-widget-desc" style="color:#9ca3af;margin-top:0.5rem;">여기에 다른 위젯을 배치할 수 있습니다.</div>`;
    }

    const chartRow = document.createElement("div");
    chartRow.className = "time-dashboard-row-chart";
    chartRow.appendChild(chartWidget);
    chartRow.appendChild(variableExpenseWidget);

    const subscriptionRow = document.createElement("div");
    subscriptionRow.className = "time-dashboard-row-chart";
    subscriptionRow.appendChild(fixedExpenseWidget);
    subscriptionRow.appendChild(subscriptionWidget);

    dashboard.innerHTML = "";
    dashboard.appendChild(rowTop);
    dashboard.appendChild(chartRow);
    dashboard.appendChild(subscriptionRow);
  }

  renderChart();
  /* 현금흐름은 연·월별 집계에 전체 거래가 필요함 — 가계부는 구간 pull만 해 두었을 수 있어 보조로 전체 스냅샷 1회 */
  void pullAssetExpenseTransactionsFromSupabase()
    .then(() => {
      if (!wrap.isConnected) return;
      renderChart();
    })
    .catch(() => {});

  return wrap;
}

export {
  loadExpenseRows,
  saveExpenseRows,
  newExpenseRowId,
  getExpenseCategoryOptions,
  getExpenseClassificationByCategory,
  getExpenseClassificationOptions,
  getClassificationToCategoryMap,
  getClassificationsByFlowType,
  getPaymentOptions,
};

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content asset-view";

  const mobileViewport =
    typeof window !== "undefined" && window.matchMedia("(max-width: 48rem)").matches;
  if (mobileViewport) {
    el.classList.add("asset-view--mobile");
  }

  if (!mobileViewport) {
    const header = document.createElement("header");
    header.className = "dream-view-header asset-header";
    const label = document.createElement("span");
    label.className = "dream-view-label";
    label.textContent = "ASSET";
    const h = document.createElement("h1");
    h.className = "dream-view-title asset-title";
    h.textContent = "자산관리";
    header.appendChild(label);
    header.appendChild(h);
    el.appendChild(header);
  }
  /* 모바일: 상단 ASSET·자산관리 제거 — 가계부 등 탭부터 */

  const viewTabs = document.createElement("div");
  viewTabs.className = "asset-view-tabs";
  viewTabs.innerHTML = `
    <button type="button" class="asset-view-tab" data-view="expense">가계부</button>
    <button type="button" class="asset-view-tab" data-view="cashflow">현금흐름</button>
    <button type="button" class="asset-view-tab" data-view="networth">순자산</button>
    <button type="button" class="asset-view-tab" data-view="plan">자산관리계획</button>
  `;
  const initialView = readSavedAssetSubView() || "expense";
  viewTabs.querySelectorAll(".asset-view-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === initialView);
  });
  el.appendChild(viewTabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = "asset-content-wrap";
  el.appendChild(contentWrap);

  const assetSettings = createAssetSettingsModal(() => {
    const activeTab = viewTabs.querySelector(".asset-view-tab.active");
    if (activeTab?.dataset?.view === "expense") {
      renderView("expense");
    }
  });
  el.appendChild(assetSettings.modal);

  function renderView(view) {
    if (view !== "expense") {
      const expenseList = contentWrap.querySelector(".asset-expense-cards-list");
      if (expenseList) {
        const prevRows = loadExpenseRows();
        const rows = collectExpenseRowsFromDOM(expenseList);
        const nextIds = new Set(rows.map((r) => String(r?.id || "").trim()).filter(Boolean));
        const removedServerIds = prevRows
          .map((r) => String(r?.id || "").trim())
          .filter((id) => EXPENSE_ROW_UUID_RE.test(id) && !nextIds.has(id));
        saveExpenseRows(rows);
        if (removedServerIds.length) {
          void deleteAssetExpenseTransactionsFromSupabase(removedServerIds).catch(() => {});
        }
      }
    }
    const prevPlan = contentWrap.querySelector(".asset-plan-view");
    if (prevPlan) savePlanMonthlyGoalsFromPlanView(prevPlan);
    contentWrap.innerHTML = "";
    if (view === "networth") {
      contentWrap.appendChild(renderNetworthView());
    } else if (view === "expense") {
      contentWrap.appendChild(renderExpenseView({ onOpenSettings: () => assetSettings.open() }));
    } else if (view === "cashflow") {
      contentWrap.appendChild(renderCashflowView());
    } else if (view === "plan") {
      contentWrap.appendChild(renderPlanView());
    } else {
      const p = document.createElement("p");
      p.className = "asset-placeholder";
      p.textContent = "준비 중";
      contentWrap.appendChild(p);
    }
  }

  function switchView(view) {
    viewTabs.querySelectorAll(".asset-view-tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === view);
    });
    saveAssetSubView(view);
    renderView(view);
    void (async () => {
      try {
        await pullAllAssetFromCloud(() => "asset", { forceExpensePull: true });
      } catch (_) {}
      if (!contentWrap.isConnected) return;
      const still = viewTabs.querySelector(".asset-view-tab.active")?.dataset?.view;
      if (still === view) renderView(view);
    })();
  }

  viewTabs.querySelectorAll(".asset-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  attachAssetExpenseTransactionsSaveListener();
  attachAssetExpensePrefsSaveListener();
  attachAssetNetWorthGoalSaveListener();
  attachAssetStockCategoryOptionsSaveListener();
  attachAssetPlanMonthlyGoalsSaveListener();
  attachAssetNetWorthBundleSaveListener();

  /* 행이 0건이어도 «불러오는 중»을 띄우지 않음 — 빈 가계부는 미리 로드된 상태와 구분 불가했고, 상위 탭 전환 시 App에서 이미 pull 후 렌더되는 경우가 많음 */
  renderView(initialView);

  if (typeof window !== "undefined" && window.__lpAssetNeedDeferredInitialPull) {
    try {
      window.__lpAssetNeedDeferredInitialPull = false;
    } catch (_) {}
    void (async () => {
      try {
        await pullAllAssetFromCloud(() => "asset", { forceExpensePull: true });
      } catch (_) {}
      if (!contentWrap.isConnected) return;
      const v = viewTabs.querySelector(".asset-view-tab.active")?.dataset?.view || initialView;
      renderView(v);
    })();
  }

  setupScrollClosePanels();

  return el;
}
