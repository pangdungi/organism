/**
 * 자산관리 - 순자산(총 부채), 지출입력장, 현금흐름
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
import { attachAssetStockCategoryOptionsSaveListener } from "../utils/assetStockCategorySupabase.js";
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

import { getExpenseLedgerIconSvg } from "../utils/expenseLedgerIcons.js";
import { showToast } from "../utils/showToast.js";

const DEBT_ROWS_KEY = "asset_debt_rows";
const ASSET_ROWS_KEY = "asset_asset_rows";
const REAL_ESTATE_ROWS_KEY = "asset_real_estate_rows";
const STOCK_ROWS_KEY = "asset_stock_rows";
const INSURANCE_ROWS_KEY = "asset_insurance_rows";
const ANNUITY_ROWS_KEY = "asset_annuity_rows";
/** 순자산 합계에서 예·적금에 만기예상액(이자 포함)을 쓸지 — 로컬만 저장 */
const NW_INCLUDE_DEPOSIT_INTEREST_KEY = "asset_nw_include_deposit_interest";

function loadNwIncludeDepositInterest() {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(NW_INCLUDE_DEPOSIT_INTEREST_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function saveNwIncludeDepositInterest(on) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(NW_INCLUDE_DEPOSIT_INTEREST_KEY, on ? "1" : "0");
  } catch (_) {}
}

/** renderMain으로 패널이 다시 그려져도 가계부/현금흐름 등 하위 탭 유지 (근무표 `lp_work_schedule_subview` 와 동일 패턴) */
const SESSION_ASSET_SUBVIEW_KEY = "lp_asset_subview";
const ASSET_SUBVIEWS = new Set(["expense", "cashflow", "networth"]);

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
  { label: "청약·출금제한", color: "asset-asset-category-indigo" },
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
    { label: "교육(고정비)", color: "expense-cls-teal" },
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
    if (out.변동비 && Array.isArray(out.변동비)) {
      const migrated = out.변동비.map((o) =>
        o.label === "교육" ? { ...o, label: "교육(고정비)" } : o,
      );
      const seen = new Set();
      out.변동비 = migrated.filter((o) => {
        if (!o.label || seen.has(o.label)) return false;
        seen.add(o.label);
        return true;
      });
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
  if (!map["교육"]) map["교육"] = "변동비";
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

function readDebtDataFromRoot(root) {
  if (!root) {
    return {
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
    };
  }
  const nameInput = root.querySelector(".asset-debt-input-name");
  const debtTypeInput = root.querySelector(".asset-debt-input-type");
  const repaymentInput = root.querySelector(".asset-debt-input-repayment");
  const periodInput = root.querySelector(".asset-debt-input-period");
  const rateInput = root.querySelector(".asset-debt-input-rate");
  const principalInput = root.querySelector(".asset-debt-input-principal");
  const startDateInput = root.querySelector(".asset-debt-input-start-date");
  const endDateInput = root.querySelector(".asset-debt-input-end-date");
  const paidDisplay = root.querySelector(".asset-debt-paid-display");
  const extraPaidInput = root.querySelector(".asset-debt-input-extra-paid");
  return {
    name: nameInput?.value || "",
    debtType: debtTypeInput?.value || "",
    repayment: repaymentInput?.value || "",
    periodYears: periodInput?.value || "",
    interestRate: rateInput?.value || "",
    principal: principalInput?.value || "",
    startDate: startDateInput?.value || "",
    endDate: endDateInput?.value || "",
    paid:
      paidDisplay?.textContent?.trim() && paidDisplay.textContent !== "-"
        ? paidDisplay.textContent.trim()
        : "",
    extraPaid: extraPaidInput?.value || "",
  };
}

function readDebtDataFromTr(tr) {
  return readDebtDataFromRoot(tr);
}

function collectDebtRowsFromDOM(debtWrap) {
  const rows = [];
  const host =
    debtWrap?.querySelector?.(".asset-debt-cards-list") ||
    debtWrap?.querySelector?.("tbody") ||
    debtWrap;
  if (!host) return rows;
  host.querySelectorAll(":scope > .asset-debt-row.asset-debt-row--view").forEach((row) => {
    if (row.classList.contains("asset-debt-row--draft")) return;
    rows.push(readDebtDataFromRoot(row));
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
        withdrawn: r.withdrawn === true,
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
    withdrawn: false,
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
    const currentPriceInput = tr.querySelector(".asset-stock-input-current-price");
    const avgPriceInput = tr.querySelector(".asset-stock-input-avg-price");
    const quantityInput = tr.querySelector(".asset-stock-input-quantity");
    const holdingInput = tr.querySelector(".asset-stock-input-holding");
    rows.push({
      name: nameInput?.value || "",
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
      surrenderValue: tr.querySelector(".asset-annuity-input-surrender")?.value || "",
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

/**
 * 부동산 순자산(총자산 합산).
 * owner: 시세 − 대출
 * landlord: 시세 − 대출 − 임대 보증금
 * tenant: 낸 전·월세 보증금만(거주자 입장)
 */
function computeRealEstateNetFromInputs(saleStr, loanStr, leaseDepositStr, occupancyMode) {
  const mode = occupancyMode || "owner";
  const leaseStrForCalc = mode === "owner" ? "" : leaseDepositStr;
  const depN = parseNum(leaseStrForCalc);
  const dep = depN !== null ? depN : 0;
  const sale = parseNum(saleStr);
  const loanN = parseNum(loanStr);
  const loan = loanN !== null ? loanN : 0;
  if (mode === "tenant") return dep;
  if (sale === null) return null;
  if (mode === "landlord") return sale - loan - dep;
  return sale - loan;
}

function formatRealEstateHoldingPeriod(acquisitionDateStr) {
  const d0 = parseDate(acquisitionDateStr);
  if (!d0) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(d0.getTime());
  d.setHours(0, 0, 0, 0);
  if (today < d) return "";
  let months =
    (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
  if (today.getDate() < d.getDate()) months -= 1;
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const mo = months % 12;
  const parts = [];
  if (years > 0) parts.push(`${years}년`);
  if (mo > 0) parts.push(`${mo}개월`);
  if (parts.length === 0) parts.push("1개월 미만");
  return parts.join(" ");
}

function readRealEstateDataFromTr(tr) {
  const contractInput = tr.querySelector(".asset-asset-input-contract");
  const salePriceInput = tr.querySelector(".asset-asset-input-sale-price");
  const loanInput = tr.querySelector(".asset-asset-input-loan");
  const propertyTypeInput = tr.querySelector(".asset-real-estate-input-property-type");
  const acquisitionDateInput = tr.querySelector(".asset-real-estate-input-acquisition-date");
  const purchasePriceInput = tr.querySelector(".asset-real-estate-input-purchase-price");
  const areaSqmInput = tr.querySelector(".asset-real-estate-input-area-sqm");
  const occupancyInput = tr.querySelector(".asset-real-estate-input-occupancy");
  const leaseDepositInput = tr.querySelector(".asset-real-estate-input-lease-deposit");
  const monthlyRentInput = tr.querySelector(".asset-real-estate-input-monthly-rent");
  const occ = occupancyInput?.value || "owner";
  const leaseDepositRaw = leaseDepositInput?.value ?? "";
  const monthlyRentRaw = monthlyRentInput?.value ?? "";
  return {
    contract: contractInput?.value || "",
    salePrice: salePriceInput?.value || "",
    loan: loanInput?.value || "",
    propertyType: propertyTypeInput?.value || "",
    acquisitionDate: acquisitionDateInput?.value || "",
    purchasePrice: purchasePriceInput?.value || "",
    areaSqm: areaSqmInput?.value || "",
    occupancy: occ,
    leaseDeposit: occ === "owner" ? "" : leaseDepositRaw,
    monthlyRent: occ !== "landlord" ? "" : monthlyRentRaw,
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
    const isDeposit = tr.classList.contains("asset-asset-row--deposit");
    let assetType = "";
    let assetCategory = "";
    if (isSavings) {
      assetType = tr.querySelector(".asset-asset-input-type")?.value || "예적금잔고";
      assetCategory = "";
    } else if (isDeposit) {
      assetType = tr.querySelector(".asset-asset-input-type")?.value || "";
      assetCategory = "현금 및 예금";
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
      withdrawn: tr.dataset.withdrawn === "true",
    });
  });
  return rows;
}



/** 다른 드롭다운 패널 모두 닫기 (겹침 방지) */
function closeAllDebtDropdownPanels(exceptPanel = null) {
  const selectors =
    ".asset-debt-type-panel, .asset-debt-repayment-panel, .asset-stock-category-panel, .asset-insurance-kind-panel, .asset-asset-type-panel, .asset-asset-category-panel, .asset-asset-savings-goal-panel, .asset-expense-flow-type-panel, .asset-expense-category-panel, .asset-expense-classification-panel, .asset-expense-payment-panel";
  document.querySelectorAll(selectors).forEach((p) => {
    if (p !== exceptPanel) {
      p.hidden = true;
      restoreFixedDropdownPanelHome(p);
    }
  });
}

/** 모달 등 transform 조상 때문에 fixed 패널이 어긋날 때 body에 붙였다가 복귀 */
const _dropdownPanelHomeWrapByPanel = new WeakMap();

function attachFixedDropdownPanelToBody(panel, wrap) {
  _dropdownPanelHomeWrapByPanel.set(panel, wrap);
  if (panel.parentNode !== document.body) document.body.appendChild(panel);
}

function restoreFixedDropdownPanelHome(panel) {
  const wrap = _dropdownPanelHomeWrapByPanel.get(panel);
  if (panel.parentNode !== document.body) return;
  if (wrap && wrap.isConnected) {
    wrap.appendChild(panel);
  } else {
    panel.remove();
  }
}

function hideFixedDropdown(panel, wrap) {
  panel.hidden = true;
  restoreFixedDropdownPanelHome(panel);
}

let _scrollCloseHandlerAttached = false;
const DROPDOWN_PANEL_SELECTOR =
  ".asset-debt-type-panel, .asset-debt-repayment-panel, .asset-stock-category-panel, .asset-insurance-kind-panel, .asset-asset-type-panel, .asset-asset-category-panel, .asset-asset-savings-goal-panel, .asset-expense-flow-type-panel, .asset-expense-category-panel, .asset-expense-classification-panel, .asset-expense-payment-panel";
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

/** 부채유형 드롭다운 - 상환방식과 동일 패턴 */
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

  const panel = document.createElement("div");
  panel.className = "asset-debt-type-panel";
  panel.hidden = true;

  function updatePanelPosition() {
    const rect = display.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 180)}px`;
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      updatePanelPosition();
      attachFixedDropdownPanelToBody(panel, wrap);
      panel.hidden = false;
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) hideFixedDropdown(panel, wrap);
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      hideFixedDropdown(panel, wrap);
    }
  });

  DEBT_TYPE_OPTIONS.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-debt-type-option";
    row.textContent = opt.label;
    row.addEventListener("click", () => {
      input.value = opt.label;
      updateDisplay();
      hideFixedDropdown(panel, wrap);
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

  const panel = document.createElement("div");
  panel.className = "asset-debt-repayment-panel";
  panel.hidden = true;

  function updatePanelPosition() {
    const rect = display.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 140)}px`;
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      closeAllDebtDropdownPanels(panel);
      updatePanelPosition();
      attachFixedDropdownPanelToBody(panel, wrap);
      panel.hidden = false;
      const handler = (ev) => {
        document.removeEventListener("click", handler);
        if (!wrap.contains(ev.target) && !panel.contains(ev.target)) hideFixedDropdown(panel, wrap);
      };
      setTimeout(() => document.addEventListener("click", handler), 0);
    } else {
      hideFixedDropdown(panel, wrap);
    }
  });

  REPAYMENT_OPTIONS.forEach((opt) => {
    const row = document.createElement("div");
    row.className = "asset-debt-repayment-option";
    row.textContent = opt;
    row.addEventListener("click", () => {
      input.value = opt;
      updateDisplay();
      hideFixedDropdown(panel, wrap);
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
/** 큰분류 — 목록 카드는 드롭다운, 패널/모달(새 거래)만 결제수단과 같은 필 버튼 */
function createExpenseFlowTypeDropdown(initialValue, onUpdate, opts = {}) {
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

  if (opts.inlineButtons) {
    wrap.classList.add("asset-expense-flow-type-wrap--modal-btns");
    const group = document.createElement("div");
    group.className = "asset-expense-flow-type-btn-group";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", "큰분류");

    const btnByValue = new Map();

    function syncButtonSelection() {
      const val = input.value || "";
      FLOW_OPTIONS.forEach(({ value }) => {
        const btn = btnByValue.get(value);
        if (!btn) return;
        const sel = val === value;
        btn.classList.toggle("is-selected", sel);
        btn.setAttribute("aria-pressed", sel ? "true" : "false");
      });
    }

    FLOW_OPTIONS.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `asset-expense-flow-type-btn ${opt.color}`;
      btn.dataset.value = opt.value;
      btn.textContent = opt.label;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = opt.value;
        syncButtonSelection();
        onUpdate?.();
      });
      group.appendChild(btn);
      btnByValue.set(opt.value, btn);
    });

    syncButtonSelection();
    wrap.appendChild(input);
    wrap.appendChild(group);
    return wrap;
  }

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

  /** 새 거래 모달·인라인 패널: 좌표·너비(모달에서는 작은 카드 크기·세로 스크롤 허용) */
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
        const shellInnerW = maxRight - minLeft;
        width = Math.min(Math.max(248, shellInnerW - 16), 392);
        left = minLeft + (shellInnerW - width) / 2;
        const capH = Math.max(140, Math.min(Math.floor(sr.height * 0.4), 268));
        panel.style.maxHeight = `${capH}px`;
        panel.style.overflow = "hidden";
        panel.style.overflowY = "auto";
        panel.style.webkitOverflowScrolling = "touch";
        panel.classList.add("asset-expense-classification-panel--modal-popover");
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
        const btn = document.createElement("button");
        btn.type = "button";
        const colorCls = opt.color || getCategoryColorClass(category);
        btn.className = "asset-expense-classification-chip-btn " + colorCls;
        btn.textContent = opt.label;
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

const KO_DIGIT = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

/** 1~9999만 한글 읽기 (만·억 조각용) */
function readKoreanUnder10000(n) {
  const x = Math.floor(Number(n));
  if (x <= 0 || x >= 10000) return "";
  let s = "";
  let r = x;
  const q1000 = Math.floor(r / 1000);
  if (q1000 > 0) {
    s += q1000 === 1 ? "천" : KO_DIGIT[q1000] + "천";
    r %= 1000;
  }
  const q100 = Math.floor(r / 100);
  if (q100 > 0) {
    s += q100 === 1 ? "백" : KO_DIGIT[q100] + "백";
    r %= 100;
  }
  const q10 = Math.floor(r / 10);
  if (q10 > 0) {
    s += q10 === 1 ? "십" : KO_DIGIT[q10] + "십";
    r %= 10;
  }
  if (r > 0) s += KO_DIGIT[r];
  return s;
}

/** 원 단위 숫자 → (이백오십만원) */
function formatKoreanWonParenthetical(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  const x = Math.floor(Math.abs(Number(n)));
  if (x === 0) return "(영원)";
  let rem = x;
  let out = "";
  const eok = Math.floor(rem / 100000000);
  if (eok > 0) {
    out += readKoreanUnder10000(eok) + "억";
    rem %= 100000000;
  }
  const man = Math.floor(rem / 10000);
  if (man > 0) {
    out += readKoreanUnder10000(man) + "만";
    rem %= 10000;
  }
  if (rem > 0) out += readKoreanUnder10000(rem);
  return "(" + out + "원)";
}

/** 순자산 상단 카드 등: 숫자 아래 보조 줄. 0은 빈 문자열. 음수는 (마이너스 …원) 형태 */
function formatKoreanWonHintLine(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "";
  const num = Number(n);
  if (num === 0) return "";
  const ko = formatKoreanWonParenthetical(Math.abs(Math.floor(num)));
  if (!ko) return "";
  if (num < 0) return ko.replace(/^\(/u, "(마이너스 ");
  return ko;
}

function setNetworthDashboardKoLine(el, n) {
  if (!el) return;
  const line = formatKoreanWonHintLine(n);
  el.textContent = line;
  el.hidden = line === "";
  el.setAttribute("aria-hidden", "true");
}

function setAssetDebtCardHeroWon(faceRoot, displayText, numericWonOrNull) {
  const bal = faceRoot.querySelector(".asset-debt-card-balance");
  const ko = faceRoot.querySelector(".asset-debt-card-balance-ko");
  if (bal) {
    bal.textContent = displayText;
    const neg =
      numericWonOrNull !== null &&
      numericWonOrNull !== undefined &&
      !Number.isNaN(Number(numericWonOrNull)) &&
      Number(numericWonOrNull) < 0;
    bal.classList.toggle("asset-debt-card-balance--negative-net", neg);
  }
  if (!ko) return;
  if (displayText === "—" || numericWonOrNull === null || numericWonOrNull === undefined || Number.isNaN(numericWonOrNull)) {
    ko.textContent = "";
    ko.hidden = true;
    ko.setAttribute("aria-hidden", "true");
  } else {
    ko.textContent = formatKoreanWonParenthetical(numericWonOrNull);
    ko.hidden = false;
    ko.setAttribute("aria-hidden", "true");
  }
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

/** 숫자 전용 입력: 비숫자 문자 제거 (allowDecimal: 소수점 허용 여부).
 *  opts.ignoreIMEComposition: true면 IME 조합 중에도 즉시 걸러냄(가계부 금액 등). */
function filterNumericInput(el, allowDecimal, inputEvent, opts) {
  opts = opts || {};
  const ignoreComposition = opts.ignoreIMEComposition === true;
  if (inputEvent && inputEvent.isComposing && !ignoreComposition) return;
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

/** 달력 기준으로 만 개월 더한 날짜(YYYY-MM-DD). 말일(1/31 등)은 해당 월 말일로 클램프 → setMonth 누각 방지 */
function formatDateInputFromLocalDate(d) {
  if (!d || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addCalendarMonthsClamped(startDateStrOrDate, wholeMonths) {
  const start = typeof startDateStrOrDate === "string" ? parseDate(startDateStrOrDate) : startDateStrOrDate;
  const delta = Math.floor(Number(wholeMonths));
  if (!start || isNaN(delta) || delta <= 0) return "";
  const y = start.getFullYear();
  const mo = start.getMonth();
  const day = start.getDate();
  const targetMonths = y * 12 + mo + delta;
  const ny = Math.floor(targetMonths / 12);
  const nm = targetMonths - ny * 12;
  const lastDayOfMonth = new Date(ny, nm + 1, 0).getDate();
  const nd = Math.min(day, lastDayOfMonth);
  return formatDateInputFromLocalDate(new Date(ny, nm, nd));
}

/** 개설(기준)일~종료일 사이 완료 월 수. 종료일의 일이 시작일보다 작으면 1개월 차감(적금·대출 회차와 동일). */
function calendarMonthsCompleted(start, end) {
  if (!start || !end) return null;
  if (end < start) return null;
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return months;
}

/** 연체·만기 처리와 동일한 기준으로, 가입일~기준일 사이 확정 회차 월 상환 회수(0 이상 · cap n). */
function countLoanPaymentsMade(startDateStr, loanEndDateStr, periodStr) {
  const start = parseDate(startDateStr);
  const loanEnd = parseDate(loanEndDateStr);
  const n = parseLoanPeriodToMonths(periodStr);
  if (!start || n <= 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s = new Date(start.getTime());
  s.setHours(0, 0, 0, 0);
  let le = loanEnd ? new Date(loanEnd.getTime()) : null;
  if (le) le.setHours(0, 0, 0, 0);

  const end = !le ? today : le < today ? le : today;
  if (end < s) return 0;

  const monthsElapsed = calendarMonthsCompleted(s, end);
  if (monthsElapsed === null) return 0;
  return Math.min(Math.max(0, monthsElapsed), n);
}

/** 원리금균등 분모 (1+r)^n − 1·/r 근처 수치 불안 시 선형 근사. */
function isMonthlyRateNegligibleForAmort(rateAnnualPercent, monthlyR) {
  if (monthlyR == null || monthlyR < 0) return true;
  return Math.abs(monthlyR) < 1e-14 || (rateAnnualPercent != null && rateAnnualPercent <= 1e-12);
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
  now.setHours(0, 0, 0, 0);
  const openZ = new Date(open.getTime());
  openZ.setHours(0, 0, 0, 0);
  const matZ = new Date(maturity.getTime());
  matZ.setHours(0, 0, 0, 0);
  const endDate = now < matZ ? now : matZ;
  if (endDate <= openZ) return 0;
  const elapsedMonths = calendarMonthsCompleted(openZ, endDate);
  if (elapsedMonths === null || elapsedMonths <= 0) return 0;
  return Math.round(monthlyAmt * elapsedMonths);
}

/** 예금 만기예상액, 이자 계산 (원금, 개설일, 만기일, 이자율) — 연 단리, 개설~만기 일수/365 (참고용) */
function calcDepositMaturityAmount(principal, openDate, maturityDate, rateStr) {
  const principalAmt = parseNum(principal);
  const open = parseDate(openDate);
  const maturity = parseDate(maturityDate);
  if (principalAmt === null || principalAmt <= 0 || !open || !maturity || maturity <= open) return null;
  const rate = parseRate(rateStr);
  const dayMs = 86400000;
  const days = Math.max(0, Math.round((maturity.getTime() - open.getTime()) / dayMs));
  if (days <= 0) return { maturityAmount: Math.round(principalAmt), interest: 0 };
  if (rate === null || rate === 0) return { maturityAmount: Math.round(principalAmt), interest: 0 };
  const interest = principalAmt * (rate / 100) * (days / 365);
  return { maturityAmount: Math.round(principalAmt + interest), interest: Math.round(interest) };
}

/** 적금 행에서 약정 개월 수 (표시된 만기예상 계산과 동일 기준) */
function getTotalMonthsForSavingsAssetRow(tr) {
  if (!tr) return null;
  const m = parseNum(tr.querySelector(".asset-asset-input-months")?.value);
  if (m !== null && m > 0) return m;
  const open = parseDate(tr.querySelector(".asset-asset-input-open-date")?.value);
  const maturity = parseDate(tr.querySelector(".asset-asset-input-maturity-date")?.value);
  if (!open || !maturity || maturity <= open) return null;
  const openZ = new Date(open.getTime());
  openZ.setHours(0, 0, 0, 0);
  const matZ = new Date(maturity.getTime());
  matZ.setHours(0, 0, 0, 0);
  const months = calendarMonthsCompleted(openZ, matZ);
  if (months === null || months <= 0) return null;
  return months;
}

/**
 * 예·적금 행 기준 총자산 합산액 (원금 또는 만기예상)
 */
function getDepositLikeAmountForNetWorth(tr, includeInterest) {
  if (tr.dataset.withdrawn === "true") return 0;
  const principal = parseNum(tr.querySelector(".asset-asset-input-principal")?.value);
  if (principal === null) return 0;
  const isDep = tr.classList.contains("asset-asset-row--deposit");
  const isSav = tr.dataset.savings === "true";
  if (!includeInterest || (!isDep && !isSav)) return principal;
  const matParsed = parseNum(tr.querySelector(".asset-asset-maturity-amt-display")?.textContent);
  if (matParsed !== null && matParsed > 0) return matParsed;
  if (isDep) {
    const calc = calcDepositMaturityAmount(
      tr.querySelector(".asset-asset-input-principal")?.value,
      tr.querySelector(".asset-asset-input-open-date")?.value,
      tr.querySelector(".asset-asset-input-maturity-date")?.value,
      tr.querySelector(".asset-asset-input-rate")?.value,
    );
    if (calc !== null && calc.maturityAmount > 0) return calc.maturityAmount;
  }
  if (isSav) {
    const totalM = getTotalMonthsForSavingsAssetRow(tr);
    const calc = calcMaturityAmountAndInterest(
      tr.querySelector(".asset-asset-input-monthly")?.value,
      totalM,
      tr.querySelector(".asset-asset-input-rate")?.value,
    );
    if (calc !== null && calc.maturityAmount > 0) return calc.maturityAmount;
  }
  return principal;
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
    const denom = Math.pow(1 + r, n) - 1;
    if (isMonthlyRateNegligibleForAmort(rate, r) || denom <= 1e-18) return 0;
    const m = (P * r * Math.pow(1 + r, n)) / denom;
    return Math.round(m * n - P);
  }
  if (method === "원금균등상환") {
    /* 닫힌 식 Σ(P−k·P/n)·r , k=0..n−1 = P·r·(n+1)/2 */
    return Math.round(P * r * ((n + 1) / 2));
  }
  if (method === "만기일시상환") {
    return Math.round(P * (rate / 100) * (n / 12));
  }
  /* 분할상환·기타: 실제 회차·수수료·선·후 불일치 가능 — 단순 근사(표시용) */
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
    if (isMonthlyRateNegligibleForAmort(rate, r)) return { monthlyPrincipal: Math.round(P / n), monthlyInterest: 0 };
    const denom = Math.pow(1 + r, n) - 1;
    if (denom <= 1e-18) return { monthlyPrincipal: Math.round(P / n), monthlyInterest: 0 };
    const m = (P * r * Math.pow(1 + r, n)) / denom;
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
  /* 분할상환·기타: 원리금균등과 동일 추정(실제 약정과 다를 수 있음) */
  if (isMonthlyRateNegligibleForAmort(rate, r)) return { monthlyPrincipal: Math.round(P / n), monthlyInterest: 0 };
  const denom2 = Math.pow(1 + r, n) - 1;
  if (denom2 <= 1e-18) return { monthlyPrincipal: Math.round(P / n), monthlyInterest: 0 };
  const m2 = (P * r * Math.pow(1 + r, n)) / denom2;
  const firstMonthInterest2 = P * r;
  return { monthlyPrincipal: Math.round(m2 - firstMonthInterest2), monthlyInterest: Math.round(firstMonthInterest2) };
}

/** 중도상환 반영 시: 잔존 원금·남은 약정 회차 기준으로 월 원금·이자(첫 달 표시와 동일 관례) */
function calcMonthlyPrincipalAndInterestForRemaining(principalEff, rateStr, remainingMonths, repaymentMethod) {
  const P = parseNum(principalEff);
  const rate = parseRate(rateStr);
  const nRem = Math.floor(Number(remainingMonths));
  if (P === null || P <= 0 || !Number.isFinite(nRem) || nRem <= 0) return null;
  const r = rate !== null && rate >= 0 ? rate / 100 / 12 : 0;
  const method = String(repaymentMethod || "").trim();
  if (method === "원리금균등상환") {
    if (isMonthlyRateNegligibleForAmort(rate, r)) return { monthlyPrincipal: Math.round(P / nRem), monthlyInterest: 0 };
    const denom = Math.pow(1 + r, nRem) - 1;
    if (denom <= 1e-18) return { monthlyPrincipal: Math.round(P / nRem), monthlyInterest: 0 };
    const m = (P * r * Math.pow(1 + r, nRem)) / denom;
    const firstMonthInterest = P * r;
    return { monthlyPrincipal: Math.round(m - firstMonthInterest), monthlyInterest: Math.round(firstMonthInterest) };
  }
  if (method === "원금균등상환") {
    const mp = P / nRem;
    return { monthlyPrincipal: Math.round(mp), monthlyInterest: Math.round(P * r) };
  }
  if (method === "만기일시상환") {
    return { monthlyPrincipal: 0, monthlyInterest: Math.round(P * r) };
  }
  if (isMonthlyRateNegligibleForAmort(rate, r)) return { monthlyPrincipal: Math.round(P / nRem), monthlyInterest: 0 };
  const denom3 = Math.pow(1 + r, nRem) - 1;
  if (denom3 <= 1e-18) return { monthlyPrincipal: Math.round(P / nRem), monthlyInterest: 0 };
  const m3 = (P * r * Math.pow(1 + r, nRem)) / denom3;
  const fi3 = P * r;
  return { monthlyPrincipal: Math.round(m3 - fi3), monthlyInterest: Math.round(fi3) };
}

/** 시작일~기준일 기준 상환금액 자동 계산 (지금까지 갚은 금액)
 *  endDate: 만기일(대출만기). 실제 계산은 min(오늘, 만기일)로 함 → "지금까지 갚은 금액" */
function calcRepaidAmountFromDates(principal, rateStr, periodStr, repaymentMethod, startDate, endDate) {
  const P = parseNum(principal);
  const rate = parseRate(rateStr);
  const n = parseLoanPeriodToMonths(periodStr);
  if (P === null || P <= 0 || !parseDate(startDate)) return null;
  if (n <= 0) return null;
  const r = rate !== null && rate >= 0 ? rate / 100 / 12 : 0;

  const paymentsMade = countLoanPaymentsMade(startDate, endDate, periodStr);
  if (paymentsMade === null) return null;
  if (paymentsMade <= 0) return 0;

  const method = String(repaymentMethod || "").trim();
  if (method === "원리금균등상환") {
    if (isMonthlyRateNegligibleForAmort(rate, r)) return Math.round((P / n) * paymentsMade);
    const denom = Math.pow(1 + r, n) - 1;
    if (denom <= 1e-18) return Math.round((P / n) * paymentsMade);
    const m = (P * r * Math.pow(1 + r, n)) / denom;
    return Math.round(m * paymentsMade);
  }
  if (method === "원금균등상환") {
    const k = paymentsMade;
    const mp = P / n;
    const total = k * mp + r * P * k - r * mp * ((k * (k - 1)) / 2);
    return Math.round(total);
  }
  if (method === "만기일시상환") {
    const monthlyInterest = P * r;
    return Math.round(monthlyInterest * paymentsMade);
  }
  /* 분할상환·기타: 단리 근사(표시용) */
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
  if (P === null || P <= 0 || !start) return null;
  if (n <= 0) return null;
  const r = rate !== null && rate >= 0 ? rate / 100 / 12 : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const loanEnd = parseDate(endDate);

  let le = loanEnd ? new Date(loanEnd.getTime()) : null;
  if (le) le.setHours(0, 0, 0, 0);
  const s = new Date(start.getTime());
  s.setHours(0, 0, 0, 0);
  const end = !le ? today : le < today ? le : today;
  if (end < s) return Math.round(P);

  const paymentsMade = countLoanPaymentsMade(startDate, endDate, periodStr);
  if (paymentsMade === null) return null;

  const method = String(repaymentMethod || "").trim();
  if (method === "원리금균등상환") {
    if (isMonthlyRateNegligibleForAmort(rate, r)) return Math.round(Math.max(0, P - (P / n) * paymentsMade));
    const denom = Math.pow(1 + r, n) - 1;
    if (denom <= 1e-18) return Math.round(Math.max(0, P - (P / n) * paymentsMade));
    const m = (P * r * Math.pow(1 + r, n)) / denom;
    const pk = Math.pow(1 + r, paymentsMade);
    const remaining = P * pk - (m * (pk - 1)) / r;
    return Math.round(Math.max(0, remaining));
  }
  if (method === "원금균등상환") {
    const remaining = P - (P / n) * paymentsMade;
    return Math.round(Math.max(0, remaining));
  }
  if (method === "만기일시상환") {
    return paymentsMade >= n ? 0 : Math.round(P);
  }
  /* 분할상환·기타: 원리금균등 근사(표시용) */
  if (isMonthlyRateNegligibleForAmort(rate, r)) return Math.round(Math.max(0, P - (P / n) * paymentsMade));
  const denom2 = Math.pow(1 + r, n) - 1;
  if (denom2 <= 1e-18) return Math.round(Math.max(0, P - (P / n) * paymentsMade));
  const m2 = (P * r * Math.pow(1 + r, n)) / denom2;
  const pk2 = Math.pow(1 + r, paymentsMade);
  const remaining2 = P * pk2 - (m2 * (pk2 - 1)) / r;
  return Math.round(Math.max(0, remaining2));
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
        <span class="asset-networth-dashboard-formula-label">총 자산</span>
        <div class="asset-networth-dashboard-formula-value-stack">
          <span class="asset-networth-dashboard-formula-value asset-networth-dashboard-assets-value">-</span>
          <span class="asset-networth-dashboard-formula-value-ko asset-networth-dashboard-assets-ko" hidden aria-hidden="true"></span>
        </div>
      </div>
      <span class="asset-networth-dashboard-formula-op">−</span>
      <div class="asset-networth-dashboard-formula-item">
        <span class="asset-networth-dashboard-formula-label">총 부채</span>
        <div class="asset-networth-dashboard-formula-value-stack">
          <span class="asset-networth-dashboard-formula-value asset-networth-dashboard-debt-value">-</span>
          <span class="asset-networth-dashboard-formula-value-ko asset-networth-dashboard-debt-ko" hidden aria-hidden="true"></span>
        </div>
      </div>
      <span class="asset-networth-dashboard-formula-eq">=</span>
      <div class="asset-networth-dashboard-formula-item asset-networth-dashboard-result">
        <span class="asset-networth-dashboard-formula-label">총 순자산</span>
        <div class="asset-networth-dashboard-formula-value-stack">
          <span class="asset-networth-dashboard-formula-value asset-networth-dashboard-value">-</span>
          <span class="asset-networth-dashboard-formula-value-ko asset-networth-dashboard-net-ko" hidden aria-hidden="true"></span>
        </div>
      </div>
    </div>
    <div class="asset-networth-dashboard-target">
      <label class="asset-networth-dashboard-target-label" for="asset-networth-dashboard-target-input">목표 순자산</label>
      <div class="asset-networth-dashboard-target-stack">
        <input type="text" id="asset-networth-dashboard-target-input" class="asset-networth-dashboard-target-input" placeholder="예: 100,000,000" />
        <span class="asset-networth-dashboard-target-ko" hidden aria-hidden="true"></span>
      </div>
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
  const assetsKoEl = netWorthDashboard.querySelector(".asset-networth-dashboard-assets-ko");
  const debtKoEl = netWorthDashboard.querySelector(".asset-networth-dashboard-debt-ko");
  const netKoEl = netWorthDashboard.querySelector(".asset-networth-dashboard-net-ko");
  const targetInput = netWorthDashboard.querySelector(".asset-networth-dashboard-target-input");
  const targetKoEl = netWorthDashboard.querySelector(".asset-networth-dashboard-target-ko");
  const remainingTextEl = netWorthDashboard.querySelector(".asset-networth-dashboard-remaining-text");
  const targetProgressFill = netWorthDashboard.querySelector(".asset-networth-dashboard-progress-fill");
  targetInput.value = loadNetWorthTarget();
  targetInput.addEventListener("input", () => {
    saveNetWorthTarget(targetInput.value);
    updateNetWorthDashboard();
  });
  targetInput.addEventListener("keydown", (e) => e.key === "Enter" && targetInput.blur());
  targetInput.addEventListener("blur", () => {
    const n = parseNum(targetInput.value);
    if (n !== null) targetInput.value = formatNum(n);
    saveNetWorthTarget(targetInput.value);
    updateNetWorthDashboard();
  });
  let updateNetWorthDashboard = () => {};

  const debtSection = document.createElement("div");
  debtSection.className = "asset-debt-section";

  const debtHeader = document.createElement("div");
  debtHeader.className = "asset-debt-header";
  debtHeader.innerHTML = `
    <span class="asset-debt-title"><img src="/toolbaricons/wallet.svg" alt="" class="asset-networth-section-title-icon" width="18" height="18" aria-hidden="true">총 부채</span>
    <span class="asset-debt-count">0</span>
    <button type="button" class="asset-debt-add-inline-btn">+ 추가</button>
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

  const cardsList = document.createElement("div");
  cardsList.className = "asset-debt-cards-list";
  cardsList.setAttribute("role", "list");

  tableWrap.appendChild(cardsList);

  /** 인라인 편집 패널을 래퍼 안에서 보이게 스크롤 */
  function bringDebtRowPanelIntoView(tr) {
    if (!tr) return;
    const run = () => {
      const panel = tr.querySelector(".asset-expense-inline-panel");
      const wrap = tr.closest(".asset-debt-table-wrap");
      const el = panel || tr;
      if (el.scrollIntoView) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
      if (!wrap) return;
      requestAnimationFrame(() => {
        const pr = el.getBoundingClientRect();
        const wr = wrap.getBoundingClientRect();
        if (pr.left < wr.left) wrap.scrollLeft += pr.left - wr.left;
        if (pr.right > wr.right) wrap.scrollLeft += pr.right - wr.right;
      });
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
  }

  /** 금리·원금 입력칸 우측에 % / 원 표시 */
  function wrapDebtInputWithSuffix(inputEl, unitText) {
    const wrap = document.createElement("div");
    wrap.className = "asset-debt-input-suffix-wrap";
    const unit = document.createElement("span");
    unit.className = "asset-debt-input-suffix-unit";
    unit.textContent = unitText;
    unit.setAttribute("aria-hidden", "true");
    wrap.appendChild(inputEl);
    wrap.appendChild(unit);
    return wrap;
  }

  function createDebtRow(data = {}, onUpdate, options = {}) {
    const mode = options.mode != null ? options.mode : "view";
    const isView = mode === "view";
    const isDraft = mode === "draft";
    const isEdit = mode === "edit";
    const debtModalHandlers = options.debtModalHandlers || null;
    const debtPhantomTableRow = options.debtPhantomTableRow === true;
    /** 떠 있는 모달 안에서만: 자동 계산 표시 줄은 빼고 입력란만 보이게(값은 저장용으로 숨김 블록에 유지) */
    const hideDebtFloatingModalComputedUi = !!debtModalHandlers;
    const memSnapshot = isEdit
      ? options.memSnapshot
        ? { ...options.memSnapshot }
        : { ...data }
      : null;
    const inPanel = isDraft || isEdit;
    const inRowUpdate = isView ? () => {} : onUpdate;
    const debtCardView = isView;
    const useDebtFormRows = inPanel || debtCardView;

    let tr;
    let dataRowTarget;
    let panelFooter = null;
    let xBtn = null;
    /** 카드 상단 요약 갱신용 (필드 생성 후 paint 연결) */
    let debtCardUi = null;
    let paintDebtCardFaceRef = null;
    /** 새 대출/수정 떠 있는 모달: 계산 결과 스팬 저장용 숨김 컨테이너(readDebt/query 대비) */
    let debtFloatingModalComputedSink = null;

    if (debtCardView) {
      tr = document.createElement("article");
      tr.className = "asset-debt-row asset-debt-row--view asset-debt-card";
      tr.setAttribute("role", "listitem");

      const face = document.createElement("div");
      face.className = "asset-debt-card-face";
      const main = document.createElement("div");
      main.className = "asset-debt-card-main";
      const copy = document.createElement("div");
      copy.className = "asset-debt-card-copy";
      const head = document.createElement("div");
      head.className = "asset-debt-card-headline";
      const nameFace = document.createElement("span");
      nameFace.className = "asset-debt-card-name";
      head.appendChild(nameFace);
      const subEl = document.createElement("p");
      subEl.className = "asset-debt-card-sub";
      const tagsEl = document.createElement("div");
      tagsEl.className = "asset-debt-card-tags";
      const metaRow = document.createElement("div");
      metaRow.className = "asset-debt-card-meta";
      metaRow.appendChild(subEl);
      metaRow.appendChild(tagsEl);
      copy.appendChild(head);
      copy.appendChild(metaRow);
      const figures = document.createElement("div");
      figures.className = "asset-debt-card-figures";
      const balanceFigure = document.createElement("span");
      balanceFigure.className = "asset-debt-card-balance";
      const balanceKoFigure = document.createElement("span");
      balanceKoFigure.className = "asset-debt-card-balance-ko";
      balanceKoFigure.hidden = true;
      balanceKoFigure.setAttribute("aria-hidden", "true");
      const maturityFigure = document.createElement("span");
      maturityFigure.className = "asset-debt-card-maturity";
      maturityFigure.hidden = true;
      maturityFigure.setAttribute("aria-hidden", "true");
      figures.appendChild(balanceFigure);
      figures.appendChild(balanceKoFigure);
      figures.appendChild(maturityFigure);
      main.appendChild(copy);
      main.appendChild(figures);
      face.appendChild(main);

      const cardStatsWrap = document.createElement("div");
      cardStatsWrap.className = "asset-debt-card-stats";
      function appendDebtCardStat(parentEl, labelText) {
        const wrap = document.createElement("div");
        wrap.className = "asset-debt-card-stat";
        const lab = document.createElement("span");
        lab.className = "asset-debt-card-stat-label";
        lab.textContent = labelText;
        const val = document.createElement("span");
        val.className = "asset-debt-card-stat-value";
        val.textContent = "—";
        wrap.appendChild(lab);
        wrap.appendChild(val);
        parentEl.appendChild(wrap);
        return val;
      }
      const statsGridTop = document.createElement("div");
      statsGridTop.className = "asset-debt-card-stats-grid";
      const cardStatMonthlyPrincipal = appendDebtCardStat(statsGridTop, "월 원금");
      const cardStatMonthlyInterest = appendDebtCardStat(statsGridTop, "월 이자");
      const cardStatLoanPrincipalTop = appendDebtCardStat(statsGridTop, "대출 원금");
      const cardStatPaidAmt = appendDebtCardStat(statsGridTop, "누적 상환금액");
      const statsGridBottom = document.createElement("div");
      statsGridBottom.className =
        "asset-debt-card-stats-grid asset-debt-card-stats-grid--secondary";
      const cardStatMaturityDate = appendDebtCardStat(statsGridBottom, "만기일");
      const cardStatStartDate = appendDebtCardStat(statsGridBottom, "가입일");
      const cardStatTotalInterest = appendDebtCardStat(statsGridBottom, "총 대출 이자");
      const cardStatLoanPrincipalBottom = appendDebtCardStat(statsGridBottom, "대출 원금");
      cardStatsWrap.appendChild(statsGridTop);
      cardStatsWrap.appendChild(statsGridBottom);
      face.appendChild(cardStatsWrap);

      const progress = document.createElement("div");
      progress.className = "asset-debt-card-progress";
      const plab = document.createElement("span");
      plab.className = "asset-debt-card-progress-label";
      plab.textContent = "상환 진행";
      const pbar = document.createElement("div");
      pbar.className = "asset-debt-card-progress-bar";
      const pfill = document.createElement("div");
      pfill.className = "asset-debt-card-progress-fill";
      pbar.appendChild(pfill);
      const ppct = document.createElement("span");
      ppct.className = "asset-debt-card-progress-pct";
      ppct.textContent = "0%";
      progress.appendChild(plab);
      progress.appendChild(pbar);
      progress.appendChild(ppct);
      face.appendChild(progress);

      const fieldRoot = document.createElement("div");
      fieldRoot.className = "asset-debt-card-fields";
      fieldRoot.setAttribute("aria-hidden", "true");
      const formStack = document.createElement("div");
      formStack.className = "asset-expense-form-stack";
      formStack.setAttribute("role", "group");
      formStack.setAttribute("aria-label", "대출 입력");
      fieldRoot.appendChild(formStack);
      tr.appendChild(face);
      tr.appendChild(fieldRoot);
      dataRowTarget = formStack;

      debtCardUi = {
        cardFaceRoot: face,
        nameFace,
        subEl,
        tagsEl,
        balanceFigure,
        maturityFigure,
        cardStatMonthlyPrincipal,
        cardStatMonthlyInterest,
        cardStatLoanPrincipalTop,
        cardStatPaidAmt,
        cardStatMaturityDate,
        cardStatStartDate,
        cardStatTotalInterest,
        cardStatLoanPrincipalBottom,
        progressFillMini: pfill,
        progressPctMini: ppct,
      };

      face.addEventListener("click", () => openDebtEditModal(tr));
    } else if (inPanel) {
      tr = document.createElement(debtPhantomTableRow ? "tr" : "div");
      tr.className = "asset-debt-row asset-debt-row--inner-panel";
      if (isDraft) tr.classList.add("asset-debt-row--draft");
      if (isEdit) tr.classList.add("asset-debt-row--editing");

      const panelTitle = isDraft ? "새 대출" : "대출 수정";
      const inlinePanelShell =
        '<div class="asset-expense-inline-panel asset-debt-inline-panel">' +
        '<div class="asset-expense-inline-panel-top">' +
        '<div class="asset-expense-inline-panel-head-text">' +
        '<span class="asset-expense-inline-panel-title">' +
        panelTitle +
        "</span>" +
        "</div>" +
        '<button type="button" class="asset-expense-inline-panel-x" aria-label="닫기">×</button>' +
        "</div>" +
        '<div class="asset-expense-inline-panel-body"></div>' +
        '<div class="asset-expense-inline-panel-bottom" aria-label="확인 작업"></div>' +
        "</div>";

      tr.innerHTML = debtPhantomTableRow
        ? '<td colspan="15" class="asset-debt-cell-panel">' + inlinePanelShell + "</td>"
        : '<div class="asset-debt-cell-panel">' + inlinePanelShell + "</div>";

      const panelBody = tr.querySelector(".asset-expense-inline-panel-body");
      panelFooter = tr.querySelector(".asset-expense-inline-panel-bottom");
      xBtn = tr.querySelector(".asset-expense-inline-panel-x");
      const formStackPanel = document.createElement("div");
      formStackPanel.className = "asset-expense-form-stack";
      formStackPanel.setAttribute("role", "group");
      formStackPanel.setAttribute("aria-label", "대출 입력");
      panelBody.appendChild(formStackPanel);
      dataRowTarget = formStackPanel;
      if (hideDebtFloatingModalComputedUi) {
        debtFloatingModalComputedSink = document.createElement("div");
        debtFloatingModalComputedSink.className = "asset-debt-modal-computed-sink";
        debtFloatingModalComputedSink.hidden = true;
        debtFloatingModalComputedSink.setAttribute("aria-hidden", "true");
        tr.querySelector(".asset-expense-inline-panel")?.appendChild(debtFloatingModalComputedSink);
      }
    } else {
      tr = document.createElement("div");
      tr.className = "asset-debt-row";
      dataRowTarget = tr;
    }

    function appendToRow(label, tdClass, node, opts = {}) {
      const isComputedPanel = useDebtFormRows && opts.computed === true;
      if (useDebtFormRows) {
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
      if (useDebtFormRows) {
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

    /** 부채 패널·카드용: 한 줄에 필드 2개(라벨+입력 쌍) */
    function appendDebtFormSplitPair(leftSpec, rightSpec) {
      if (!useDebtFormRows) {
        const l = appendToRow(leftSpec.label, leftSpec.tdClass, leftSpec.node, leftSpec.opts || {});
        const r = appendToRow(rightSpec.label, rightSpec.tdClass, rightSpec.node, rightSpec.opts || {});
        return { leftControl: l, rightControl: r };
      }
      const wrap = document.createElement("div");
      wrap.className = "asset-debt-form-split-row";

      function buildCell(spec) {
        const isComputedPanel = !!(spec.opts && spec.opts.computed);
        const row = document.createElement("div");
        row.className = "asset-expense-form-row asset-debt-form-split-col";
        const lab = document.createElement("span");
        lab.className = "asset-expense-form-label";
        lab.textContent = spec.label;
        const control = document.createElement("div");
        control.className =
          "asset-expense-form-control asset-expense-form-control--field" +
          (isComputedPanel ? " asset-debt-panel-value--computed" : "") +
          (spec.tdClass ? " " + spec.tdClass : "");
        if (isComputedPanel) control.setAttribute("data-debt-value-kind", "computed");
        if (spec.node) control.appendChild(spec.node);
        row.appendChild(lab);
        row.appendChild(control);
        wrap.appendChild(row);
        return control;
      }

      const leftControl = buildCell(leftSpec);
      const rightControl = buildCell(rightSpec);
      dataRowTarget.appendChild(wrap);
      return { leftControl, rightControl };
    }

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "asset-debt-input-name";
    nameInput.value = data.name || "";
    nameInput.placeholder = "";
    bindNetWorthTextInput(nameInput, inRowUpdate);
    nameInput.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && nameInput.blur());
    appendToRow("대출 이름", "asset-debt-cell-name", nameInput);

    const debtTypeDd = createDebtTypeDropdown(data.debtType || "", () => {
      inRowUpdate();
      paintDebtCardFaceRef?.();
    });

    let repaymentHost;
    {
      const pair = appendDebtFormSplitPair(
        { label: "부채유형", tdClass: "asset-debt-cell-type", node: debtTypeDd },
        { label: "상환방식", tdClass: "asset-debt-cell-repayment", node: null },
      );
      repaymentHost = pair.rightControl;
    }

    const periodInput = document.createElement("input");
    periodInput.type = "text";
    periodInput.inputMode = "numeric";
    periodInput.pattern = "[0-9,]*";
    periodInput.autocomplete = "off";
    periodInput.className = "asset-debt-input-period";
    periodInput.value = data.periodYears ?? "";
    periodInput.placeholder = "-";
    periodInput.addEventListener("input", (e) =>
      filterNumericInput(periodInput, false, e, { ignoreIMEComposition: true }),
    );
    periodInput.addEventListener("keydown", (e) => e.key === "Enter" && periodInput.blur());

    const rateInput = document.createElement("input");
    rateInput.type = "text";
    rateInput.inputMode = "decimal";
    rateInput.autocomplete = "off";
    rateInput.className = "asset-debt-input-rate";
    rateInput.value = data.interestRate ?? "";
    rateInput.placeholder = "예: 4.2";
    rateInput.title = "연 금리, 퍼센트 숫자만 (4.2 = 4.2%, % 생략 가능)";
    rateInput.addEventListener("input", (e) =>
      filterNumericInput(rateInput, true, e, { ignoreIMEComposition: true }),
    );
    rateInput.addEventListener("keydown", (e) => e.key === "Enter" && rateInput.blur());

    const principalInput = document.createElement("input");
    principalInput.type = "text";
    principalInput.inputMode = "numeric";
    principalInput.pattern = "[0-9,]*";
    principalInput.autocomplete = "off";
    principalInput.className = "asset-debt-input-principal";
    principalInput.value = data.principal ? (formatNum(data.principal) || data.principal) : "";
    principalInput.placeholder = "-";
    principalInput.addEventListener("input", (e) =>
      filterNumericInput(principalInput, false, e, { ignoreIMEComposition: true }),
    );
    principalInput.addEventListener("blur", () => {
      const formatted = formatNum(principalInput.value);
      if (formatted !== "") principalInput.value = formatted;
    });
    principalInput.addEventListener("keydown", (e) => e.key === "Enter" && principalInput.blur());

    const rateInputWrap = wrapDebtInputWithSuffix(rateInput, "%");
    const principalInputWrap = wrapDebtInputWithSuffix(principalInput, "원");

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
      paintDebtCardFaceRef?.();
    }

    let updatePaidFromDatesRef;
    let updateBalanceRef;
    let updateMonthlyBreakdownRef;
    const repaymentOnUpdate = () => {
      updateInterest();
      updatePaidFromDatesRef?.();
      updateBalanceRef?.();
      inRowUpdate();
      paintDebtCardFaceRef?.();
    };
    repaymentHost.replaceChildren();
    repaymentHost.appendChild(createDebtRepaymentDropdown(data.repayment || "", repaymentOnUpdate));
    updateInterest();

    if (hideDebtFloatingModalComputedUi) {
      appendToRow("약정 개월", "asset-debt-cell-period", periodInput);
      appendDebtFormSplitPair(
        { label: "금리(%)", tdClass: "asset-debt-cell-rate", node: rateInputWrap },
        { label: "대출 원금", tdClass: "asset-debt-cell-principal", node: principalInputWrap },
      );
      debtFloatingModalComputedSink?.appendChild(interestSpan);
    } else {
      appendDebtFormSplitPair(
        { label: "약정 개월", tdClass: "asset-debt-cell-period", node: periodInput },
        { label: "금리(%)", tdClass: "asset-debt-cell-rate", node: rateInputWrap },
      );
      appendDebtFormSplitPair(
        { label: "대출 원금", tdClass: "asset-debt-cell-principal", node: principalInputWrap },
        {
          label: "총 대출 이자",
          tdClass: "asset-debt-cell-interest",
          node: interestSpan,
          opts: { computed: true },
        },
      );
    }

    const monthlyPrincipalSpan = document.createElement("span");
    monthlyPrincipalSpan.className = "asset-debt-monthly-principal-display";

    const monthlyInterestSpan = document.createElement("span");
    monthlyInterestSpan.className = "asset-debt-monthly-interest-display";

    function updateMonthlyBreakdown() {
      const repaymentInput = tr.querySelector(".asset-debt-input-repayment");
      const method = repaymentInput?.value?.trim() || "";
      const extraEl = tr.querySelector(".asset-debt-input-extra-paid");
      const extraPaid = parseNum(extraEl?.value) ?? 0;
      const n = parseLoanPeriodToMonths(periodInput.value);

      let result = calcMonthlyPrincipalAndInterest(
        principalInput.value,
        rateInput.value,
        periodInput.value,
        repaymentInput?.value
      );

      const startEl = tr.querySelector(".asset-debt-input-start-date");
      const endEl = tr.querySelector(".asset-debt-input-end-date");
      const startStr = startEl?.value?.trim();
      const endStr = endEl?.value?.trim();
      if (extraPaid > 0 && n > 0 && startStr && endStr) {
        const scheduleBal = calcRemainingBalance(
          principalInput.value,
          rateInput.value,
          periodInput.value,
          method,
          startStr,
          endStr
        );
        if (scheduleBal !== null) {
          const Peff = Math.max(0, scheduleBal - extraPaid);
          const k = countLoanPaymentsMade(startStr, endStr, periodInput.value);
          if (k !== null) {
            const nRem = Math.max(1, n - k);
            if (Peff <= 0) result = { monthlyPrincipal: 0, monthlyInterest: 0 };
            else {
              const adj = calcMonthlyPrincipalAndInterestForRemaining(Peff, rateInput.value, nRem, method);
              if (adj !== null) result = adj;
            }
          }
        }
      }

      if (result !== null) {
        monthlyPrincipalSpan.textContent = formatNum(result.monthlyPrincipal) || "";
        monthlyInterestSpan.textContent = formatNum(result.monthlyInterest) || "";
      } else {
        monthlyPrincipalSpan.textContent = "";
        monthlyInterestSpan.textContent = "";
      }
      paintDebtCardFaceRef?.();
    }

    if (hideDebtFloatingModalComputedUi) {
      debtFloatingModalComputedSink?.appendChild(monthlyPrincipalSpan);
      debtFloatingModalComputedSink?.appendChild(monthlyInterestSpan);
    } else {
      appendDebtFormSplitPair(
        {
          label: "월 원금",
          tdClass: "asset-debt-cell-monthly-principal",
          node: monthlyPrincipalSpan,
          opts: { computed: true },
        },
        {
          label: "월 이자",
          tdClass: "asset-debt-cell-monthly-interest",
          node: monthlyInterestSpan,
          opts: { computed: true },
        },
      );
    }
    updateMonthlyBreakdownRef = updateMonthlyBreakdown;

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
      const months = parseLoanPeriodToMonths(periodInput.value);
      const startStr = startDateInput.value?.trim();
      if (startStr && months > 0) {
        const out = addCalendarMonthsClamped(startStr, months);
        if (out) {
          endDateInput.value = out;
          updateEndDateDisplay();
        }
      }
    }

    startDateInput.addEventListener("change", () => {
      updateStartDateDisplay();
      updateEndDateFromStartDate();
      updateMonthlyBreakdownRef?.();
      updatePaidFromDates();
      inRowUpdate();
      paintDebtCardFaceRef?.();
    });
    const startHost = appendManyToRow("가입일", "asset-debt-cell-start-date asset-debt-date-cell", startDateDisplay, startDateInput);
    startHost.addEventListener("click", (e) => {
      e.preventDefault();
      startDateInput.focus();
      if (typeof startDateInput.showPicker === "function") startDateInput.showPicker();
    });

    endDateInput.addEventListener("change", () => {
      updateEndDateDisplay();
      updateMonthlyBreakdownRef?.();
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
      paintDebtCardFaceRef?.();
    }
    updatePaidFromDatesRef = updatePaidFromDates;

    rateInput.addEventListener("input", () => {
      updateInterest();
      updatePaidFromDates();
      inRowUpdate();
    });
    periodInput.addEventListener("input", () => {
      updateInterest();
      updateEndDateFromStartDate();
      updatePaidFromDates();
      inRowUpdate();
    });
    principalInput.addEventListener("input", () => {
      updateInterest();
      updatePaidFromDates();
      inRowUpdate();
    });
    const extraPaidInput = document.createElement("input");
    extraPaidInput.type = "text";
    extraPaidInput.inputMode = "numeric";
    extraPaidInput.pattern = "[0-9,]*";
    extraPaidInput.autocomplete = "off";
    extraPaidInput.className = "asset-debt-input-extra-paid";
    extraPaidInput.value = data.extraPaid ? (formatNum(data.extraPaid) || data.extraPaid) : "";
    extraPaidInput.placeholder = "-";
    extraPaidInput.title = "중도상환 금액 (수수료 제외)";
    extraPaidInput.addEventListener("input", (e) => {
      filterNumericInput(extraPaidInput, false, e, { ignoreIMEComposition: true });
      inRowUpdate();
    });
    extraPaidInput.addEventListener("blur", () => {
      const formatted = formatNum(extraPaidInput.value);
      if (formatted !== "") extraPaidInput.value = formatted;
      updateBalance();
    });
    extraPaidInput.addEventListener("keydown", (e) => e.key === "Enter" && extraPaidInput.blur());

    if (hideDebtFloatingModalComputedUi) {
      appendToRow("중도상환(수수료 제외)", "asset-debt-cell-extra-paid", extraPaidInput);
      debtFloatingModalComputedSink?.appendChild(paidSpan);
    } else {
      appendDebtFormSplitPair(
        {
          label: "상환금액",
          tdClass: "asset-debt-cell-paid",
          node: paidSpan,
          opts: { computed: true },
        },
        { label: "중도상환(수수료 제외)", tdClass: "asset-debt-cell-extra-paid", node: extraPaidInput },
      );
    }

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
      paintDebtCardFaceRef?.();
      updateMonthlyBreakdownRef?.();
    }

    principalInput.addEventListener("input", updateBalance);
    extraPaidInput.addEventListener("input", updateBalance);
    rateInput.addEventListener("input", updateBalance);
    periodInput.addEventListener("input", updateBalance);
    updateBalanceRef = updateBalance;
    startDateInput.addEventListener("change", updateBalance);
    endDateInput.addEventListener("change", updateBalance);
    updateBalance();

    if (hideDebtFloatingModalComputedUi) {
      debtFloatingModalComputedSink?.appendChild(balanceSpan);
    } else {
      appendToRow("잔여 원금", "asset-debt-cell-balance", balanceSpan, { computed: true });
    }

    if (startDateInput.value && !endDateInput.value) {
      updateEndDateFromStartDate();
    }
    if (startDateInput.value && endDateInput.value) {
      updatePaidFromDates();
    }
    updateMonthlyBreakdownRef?.();


    if (inPanel) {
      const doCancel = (e) => {
        e?.stopPropagation?.();
        if (debtModalHandlers?.onCancel) {
          debtModalHandlers.onCancel();
          return;
        }
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
            const pane =
              e.currentTarget.closest(".asset-expense-inline-panel") ||
              tr.querySelector(".asset-expense-inline-panel") ||
              tr;
            if (debtModalHandlers?.onDraftSave) {
              debtModalHandlers.onDraftSave(readDebtDataFromRoot(pane));
              return;
            }
            const d = readDebtDataFromRoot(pane);
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
              if (debtModalHandlers?.onEditDelete) {
                debtModalHandlers.onEditDelete();
                return;
              }
              tr.remove();
              onUpdate();
            });
          });
          applyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const pane =
              e.currentTarget.closest(".asset-expense-inline-panel") ||
              tr.querySelector(".asset-expense-inline-panel") ||
              tr;
            if (debtModalHandlers?.onEditApply) {
              debtModalHandlers.onEditApply(readDebtDataFromRoot(pane));
              return;
            }
            const d = readDebtDataFromRoot(pane);
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
    }

    if (debtCardUi) {
      function paintDebtCardFace() {
        const u = debtCardUi;
        if (!u) return;

        const repay = tr.querySelector(".asset-debt-input-repayment")?.value?.trim() || "";
        const dtype = tr.querySelector(".asset-debt-input-type")?.value?.trim() || "";
        const nm = nameInput.value?.trim();
        u.nameFace.textContent = nm || dtype || "대출 이름";
        if (nm) {
          const line = [repay, dtype].filter(Boolean);
          u.subEl.textContent = line.join(" · ") || "—";
        } else {
          u.subEl.textContent = repay || "—";
        }

        u.tagsEl.replaceChildren();
        const rateTxt = rateInput.value?.trim();
        if (rateTxt) {
          const ch = document.createElement("span");
          ch.className = "asset-debt-card-chip";
          ch.textContent = `금리 ${rateTxt}%`;
          u.tagsEl.appendChild(ch);
        }
        const perMonths = parseNum(periodInput.value);
        if (perMonths !== null && perMonths > 0) {
          const ch2 = document.createElement("span");
          ch2.className = "asset-debt-card-chip asset-debt-card-chip--period";
          ch2.textContent = `${formatNum(perMonths)}개월`;
          u.tagsEl.appendChild(ch2);
        }

        const fmtWonChip = (raw) => {
          const s = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
          if (!s || s === "-" || s === "—") return "—";
          const n = parseNum(s.replace(/,/g, ""));
          if (n !== null && n !== 0) return `${formatNum(n)}원`;
          if (n === 0) return "0원";
          return /원\b/u.test(s) ? s : `${s}원`;
        };

        const principalWon = () => {
          const raw = principalInput.value?.trim() ?? "";
          if (!raw) return "—";
          const pv = parseNum(raw);
          return pv !== null ? `${formatNum(pv)}원` : `${raw}원`;
        };

        u.cardStatMonthlyPrincipal.textContent = fmtWonChip(monthlyPrincipalSpan.textContent);
        u.cardStatMonthlyInterest.textContent = fmtWonChip(monthlyInterestSpan.textContent);
        const pW = principalWon();
        u.cardStatLoanPrincipalTop.textContent = pW;
        u.cardStatLoanPrincipalBottom.textContent = pW;
        u.cardStatPaidAmt.textContent = fmtWonChip(paidSpan.textContent);
        u.cardStatMaturityDate.textContent = endDateInput.value ? formatDateYYMMDD(endDateInput.value) : "—";
        u.cardStatStartDate.textContent = startDateInput.value ? formatDateYYMMDD(startDateInput.value) : "—";
        u.cardStatTotalInterest.textContent = fmtWonChip(interestSpan.textContent);

        let balShown = null;
        const balStr = balanceSpan.textContent?.trim();
        if (balStr && balStr !== "-") {
          const bn = parseNum(balStr);
          balShown =
            bn !== null
              ? `${formatNum(bn) || balStr}원`
              : `${balStr.replace(/,/g, "").replace(/\s+/g, "").replace(/원$/, "")}원`;
        }
        if (!balShown && principalInput.value?.trim()) {
          const pv = parseNum(principalInput.value);
          balShown = pv !== null ? `${formatNum(pv)}원` : `${principalInput.value.trim()}원`;
        }

        let heroKoNum = null;
        if (balStr && balStr !== "-" && balStr !== "—") {
          const bnKo = parseNum(balStr.replace(/,/g, ""));
          if (bnKo !== null && !Number.isNaN(bnKo)) heroKoNum = bnKo;
        }
        if (heroKoNum === null && principalInput.value?.trim()) {
          const pvKo = parseNum(principalInput.value);
          if (pvKo !== null && !Number.isNaN(pvKo)) heroKoNum = pvKo;
        }
        const heroDisp = balShown || "—";
        setAssetDebtCardHeroWon(
          u.cardFaceRoot,
          heroDisp,
          heroDisp === "—" ? null : heroKoNum,
        );

        const pv = parseNum(principalInput.value) ?? 0;
        const balNum =
          balStr && balStr !== "-" && balStr !== "—"
            ? parseNum(balStr.replace(/,/g, ""))
            : null;
        const balForProgress = balNum !== null && !Number.isNaN(balNum) ? Math.max(0, balNum) : pv;
        const pct = pv > 0 ? Math.min(100, Math.max(0, ((pv - Math.min(pv, balForProgress)) / pv) * 100)) : 0;
        u.progressFillMini.style.width = `${pct}%`;
        u.progressPctMini.textContent = `${Math.round(pct)}%`;
      }
      paintDebtCardFaceRef = paintDebtCardFace;
      nameInput.addEventListener("input", paintDebtCardFace);
      paintDebtCardFace();
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
    const count = cardsList.querySelectorAll(".asset-debt-row.asset-debt-row--view").length;
    debtHeader.querySelector(".asset-debt-count").textContent = count ? `${count}건` : "0건";
  }

  function updateTotals() {
    let sumPrincipal = 0;
    let sumBalance = 0;
    cardsList.querySelectorAll(".asset-debt-row.asset-debt-row--view").forEach((tr) => {
      const p = parseNum(tr.querySelector(".asset-debt-input-principal")?.value);
      const balanceEl = tr.querySelector(".asset-debt-balance-display");
      const balance = parseNum(balanceEl?.textContent);
      if (p !== null) sumPrincipal += p;
      if (balance !== null) sumBalance += balance;
    });

    /* 프로그레스 바: 잔존 원금(표시) 비율 기준 — 원금 대비 상환된 비율 근사 */
    const principalProgress =
      sumPrincipal > 0 ? Math.min(100, Math.max(0, ((sumPrincipal - Math.max(0, sumBalance)) / sumPrincipal) * 100)) : 0;
    progressFill.style.width = `${principalProgress}%`;
    progressPercent.textContent = `${Math.round(principalProgress)}%`;
    progressRemainingValue.textContent = sumBalance !== 0 ? `${formatNum(sumBalance)}원` : "-";
  }

  const onUpdate = () => {
    save();
    updateCount();
    updateTotals();
    updateNetWorthDashboard();
  };

  /** 가계부와 동일: 전역 모달 레이어 — 기존 대출 카드 수정 */
  function openDebtEditModal(viewArticle) {
    if (document.querySelector(".asset-networth-debt-modal")) {
      showToast("입력 창을 닫은 뒤 다시 시도해 주세요.", "");
      return;
    }
    if (!viewArticle?.classList.contains("asset-debt-row--view")) return;
    const initial = readDebtDataFromRoot(viewArticle);
    const overlay = document.createElement("div");
    overlay.className = "asset-expense-transaction-modal asset-networth-debt-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "대출 수정");
    const backdrop = document.createElement("div");
    backdrop.className = "asset-expense-transaction-modal-backdrop";
    const panelShell = document.createElement("div");
    panelShell.className = "asset-expense-transaction-modal-panel-shell";

    function closeDebtModalOverlay() {
      closeAllDebtDropdownPanels();
      overlay.remove();
    }

    const phantom = createDebtRow(initial, onUpdate, {
      mode: "edit",
      memSnapshot: { ...initial },
      debtPhantomTableRow: false,
      debtModalHandlers: {
        onCancel: () => closeDebtModalOverlay(),
        onEditApply: (d) => {
          closeDebtModalOverlay();
          viewArticle.replaceWith(createDebtRow(d, onUpdate, { mode: "view" }));
          onUpdate();
        },
        onEditDelete: () => {
          closeDebtModalOverlay();
          viewArticle.remove();
          onUpdate();
        },
      },
    });
    const panel = phantom.querySelector(".asset-expense-inline-panel");
    phantom.remove();
    if (!panel) {
      showToast("대출 입력창을 열 수 없습니다. 잠시 후 다시 시도해 주세요.", "");
      overlay.remove();
      return;
    }
    panelShell.appendChild(panel);
    overlay.appendChild(backdrop);
    overlay.appendChild(panelShell);
    document.body.appendChild(overlay);
  }

  /** 가계부와 동일: 전역 모달 레이어에 대출 초안 패널 */
  function openDebtDraftModal() {
    if (document.querySelector(".asset-networth-debt-modal")) {
      showToast("입력 창을 닫은 뒤 다시 시도해 주세요.", "");
      return;
    }
    const overlay = document.createElement("div");
    overlay.className = "asset-expense-transaction-modal asset-networth-debt-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "새 대출");
    const backdrop = document.createElement("div");
    backdrop.className = "asset-expense-transaction-modal-backdrop";
    const panelShell = document.createElement("div");
    panelShell.className = "asset-expense-transaction-modal-panel-shell";

    function closeDebtModalOverlay() {
      closeAllDebtDropdownPanels();
      overlay.remove();
    }

    const phantom = createDebtRow(
      {},
      onUpdate,
      {
        mode: "draft",
        /* table 밖 <tr> + innerHTML 은 브라우저가 TD 내용을 버릴 수 있어 패널이 비어 보임 → div 사용 */
        debtPhantomTableRow: false,
        debtModalHandlers: {
          onCancel: () => closeDebtModalOverlay(),
          onDraftSave: (d) => {
            closeDebtModalOverlay();
            const vt = createDebtRow(d, onUpdate, { mode: "view" });
            cardsList.appendChild(vt);
            onUpdate();
          },
        },
      },
    );
    const panel = phantom.querySelector(".asset-expense-inline-panel");
    phantom.remove();
    if (!panel) {
      showToast("대출 입력창을 열 수 없습니다. 잠시 후 다시 시도해 주세요.", "");
      overlay.remove();
      return;
    }
    panelShell.appendChild(panel);
    overlay.appendChild(backdrop);
    overlay.appendChild(panelShell);
    document.body.appendChild(overlay);
  }

  debtHeader.querySelector(".asset-debt-add-inline-btn")?.addEventListener("click", () => openDebtDraftModal());

  const initialRows = loadDebtRows();
  initialRows.forEach((row) => {
    const tr = createDebtRow(row, onUpdate, { mode: "view" });
    cardsList.appendChild(tr);
  });

  updateCount();
  updateTotals();
  const debtTableContainer = document.createElement("div");
  debtTableContainer.className = "asset-debt-table-container";
  debtTableContainer.appendChild(tableWrap);
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
    <span class="asset-asset-title"><img src="/toolbaricons/money-circle.svg" alt="" class="asset-networth-section-title-icon" width="18" height="18" aria-hidden="true">총 자산</span>
    <span class="asset-asset-count">0</span>
    <button type="button" class="asset-asset-add-inline-btn">+ 추가</button>
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

  /** 총 자산 카드 좌측 아이콘: ①예·적·연 / ②부동산 / ③주식·투자보험 */
  const ASSET_GROUP_CARD_ICON_SRC = {
    예금: "/asset-icons/networth-group-bank.png",
    적금: "/asset-icons/networth-group-bank.png",
    연금: "/asset-icons/networth-group-bank.png",
    부동산: "/asset-icons/networth-group-realestate.png",
    주식: "/asset-icons/networth-group-invest.png",
    보험: "/asset-icons/networth-group-invest.png",
  };
  function assetGroupCardIconSrc(groupKey) {
    const k = typeof groupKey === "string" ? groupKey.trim() : "";
    return ASSET_GROUP_CARD_ICON_SRC[k] || "/toolbaricons/money-circle.svg";
  }

  const assetCardsList = document.createElement("div");
  assetCardsList.className = "asset-asset-cards-list";
  assetCardsList.setAttribute("role", "list");
  assetTableWrap.appendChild(assetCardsList);

  /** 예·적금 총자산 반영 옵션: 순자산 요약이 아니라 총 자산(카드) 구역에 둠 */
  const assetDepositNwOpts = document.createElement("div");
  assetDepositNwOpts.className = "asset-asset-deposit-nw-opts";
  assetDepositNwOpts.innerHTML = `
    <label class="asset-networth-dashboard-checkbox-label">
      <input type="checkbox" class="asset-networth-dashboard-include-deposit-interest" />
      예·적금 만기예상(이자 포함)을 총 자산에 반영
    </label>
    <p class="asset-networth-dashboard-deposit-opts-hint">이자·만기예상은 참고용입니다. 은행 약정·일수 계산과 다를 수 있습니다.</p>
  `;
  const nwIncludeDepositInterestInput = assetDepositNwOpts.querySelector(
    ".asset-networth-dashboard-include-deposit-interest",
  );
  if (nwIncludeDepositInterestInput) {
    nwIncludeDepositInterestInput.checked = loadNwIncludeDepositInterest();
    nwIncludeDepositInterestInput.addEventListener("change", () => {
      saveNwIncludeDepositInterest(nwIncludeDepositInterestInput.checked);
      updateNetWorthDashboard();
    });
  }

  /** 아래 대입 전까지 카드 헬퍼에서 참조 가능하도록 플레이스홀더 */
  let onAssetUpdate = () => {};

  function assetModalCollectHost(el) {
    return {
      querySelectorAll(sel) {
        try {
          return el.matches(sel) ? [el] : [];
        } catch (_) {
          return [];
        }
      },
    };
  }

  function readAssetStockFromRoot(root) {
    return {
      name: root.querySelector(".asset-stock-input-name")?.value || "",
      currentPrice: root.querySelector(".asset-stock-input-current-price")?.value || "",
      avgPrice: root.querySelector(".asset-stock-input-avg-price")?.value || "",
      quantity: root.querySelector(".asset-stock-input-quantity")?.value || "",
      holdingStatus: root.querySelector(".asset-stock-input-holding")?.value || "보유중",
    };
  }

  function readAssetCardPayload(articleEl) {
    if (articleEl.classList.contains("asset-asset-row-stock")) {
      return { groupKey: "주식", stock: readAssetStockFromRoot(articleEl) };
    }
    if (articleEl.classList.contains("asset-asset-row-insurance")) {
      return {
        groupKey: "보험",
        insurance: {
          name: articleEl.querySelector(".asset-insurance-input-name")?.value || "",
          kind: articleEl.querySelector(".asset-insurance-input-kind")?.value || "",
          contractDate: articleEl.querySelector(".asset-insurance-input-contract-date")?.value || "",
          maturityDate: articleEl.querySelector(".asset-insurance-input-maturity-date")?.value || "",
          monthly: articleEl.querySelector(".asset-insurance-input-monthly")?.value || "",
          surrenderValue: articleEl.querySelector(".asset-insurance-input-surrender")?.value || "",
          coverage: articleEl.querySelector(".asset-insurance-input-coverage")?.value || "",
        },
      };
    }
    if (articleEl.classList.contains("asset-asset-row-annuity")) {
      return {
        groupKey: "연금",
        annuity: {
          name: articleEl.querySelector(".asset-annuity-input-name")?.value || "",
          kind: articleEl.querySelector(".asset-annuity-input-kind")?.value || "",
          paymentStartDate: articleEl.querySelector(".asset-annuity-input-payment-start")?.value || "",
          paymentEndDate: articleEl.querySelector(".asset-annuity-input-payment-end")?.value || "",
          monthly: articleEl.querySelector(".asset-annuity-input-monthly")?.value || "",
          receiptStartDate: articleEl.querySelector(".asset-annuity-input-receipt-start")?.value || "",
          monthlyReceipt: articleEl.querySelector(".asset-annuity-input-monthly-receipt")?.value || "",
          surrenderValue: articleEl.querySelector(".asset-annuity-input-surrender")?.value || "",
        },
      };
    }
    if (articleEl.classList.contains("asset-asset-row-real-estate")) {
      return {
        groupKey: "부동산",
        realEstate: readRealEstateDataFromTr(articleEl),
      };
    }
    const nameInput = articleEl.querySelector(".asset-asset-input-name");
    const principalInput = articleEl.querySelector(".asset-asset-input-principal");
    const monthlyInput = articleEl.querySelector(".asset-asset-input-monthly");
    const rateInput = articleEl.querySelector(".asset-asset-input-rate");
    const monthsInput = articleEl.querySelector(".asset-asset-input-months");
    const openDateInput = articleEl.querySelector(".asset-asset-input-open-date");
    const maturityDateInput = articleEl.querySelector(".asset-asset-input-maturity-date");
    const isSavings = articleEl.dataset.savings === "true";
    const isDeposit = articleEl.classList.contains("asset-asset-row--deposit");
    let assetType = "";
    let assetCategory = "";
    if (isSavings) {
      assetType = articleEl.querySelector(".asset-asset-input-type")?.value || "예적금잔고";
      assetCategory = "";
    } else if (isDeposit) {
      assetType = articleEl.querySelector(".asset-asset-input-type")?.value || "";
      assetCategory = "현금 및 예금";
    } else {
      assetType = articleEl.querySelector(".asset-asset-input-type")?.value || "";
      assetCategory = articleEl.querySelector(".asset-asset-input-category")?.value || "";
    }
    return {
      groupKey: articleEl.dataset.assetCardGroup || "예금",
      depositLike: {
        name: nameInput?.value || "",
        assetType,
        assetCategory,
        principal: principalInput?.value || "",
        monthly: monthlyInput?.value || "",
        rate: rateInput?.value || "",
        months: monthsInput?.value || "",
        openDate: openDateInput?.value || "",
        maturityDate: maturityDateInput?.value || "",
        matured: articleEl.dataset.matured === "true",
        withdrawn: articleEl.dataset.withdrawn === "true",
      },
    };
  }

  function buildAssetDebtStyleFaceInnerHtml(style) {
    const st = ["savings", "deposit", "stock", "realestate", "insurance", "annuity"].includes(style)
      ? style
      : "deposit";
    function statPair(label) {
      const lab = label.trim() || "—";
      return (
        '<div class="asset-debt-card-stat">' +
        `<span class="asset-debt-card-stat-label">${lab}</span>` +
        '<span class="asset-debt-card-stat-value asset-asset-debtface-stat-val">—</span>' +
        "</div>"
      );
    }
    function emptyFillerStatPair() {
      return (
        '<div class="asset-debt-card-stat asset-debt-card-stat--blank" aria-hidden="true">' +
        '<span class="asset-debt-card-stat-label"></span>' +
        '<span class="asset-debt-card-stat-value asset-asset-debtface-stat-val"></span>' +
        "</div>"
      );
    }
    const layout = {
      savings: {
        top: ["월 납입", "금리", "약정 개월", "납입 누적"],
        bot: ["가입일", "만기일", "이자(추정)", "만기 예상액"],
        progress: "만기율",
        botTailFillers: 0,
      },
      deposit: {
        top: ["예치금", "금리", "이자(추정)", "만기 예상액"],
        bot: ["가입일", "만기일"],
        progress: "만기율",
        botTailFillers: 2,
      },
      stock: {
        top: ["매수평균가", "현재가", "보유수량", "매입금액"],
        bot: ["평가금액", "평가손익", "수익률", "참고"],
        botTailFillers: 0,
      },
      realestate: {
        top: ["시세", "대출", "순자산", "유형"],
        bot: ["취득일", "매입가", "면적(㎡)", "거주·보증"],
        botTailFillers: 0,
      },
      insurance: {
        top: ["종류", "월납입", "계약일", "만기일"],
        bot: ["해지환급금", "보장(요약)"],
        progress: "참고",
        botTailFillers: 2,
      },
      annuity: {
        top: ["종류", "해지환급금", "월 납입", "납입 시작"],
        bot: ["납입 종료", "누적 납입", "수령 시작", "월 수령"],
        botTailFillers: 0,
      },
    };
    const L = layout[st];
    const topGrid = L.top.map(statPair).join("");
    let botGrid = L.bot.map(statPair).join("");
    for (let i = 0; i < (L.botTailFillers || 0); i++) botGrid += emptyFillerStatPair();
    const progressLabel = "progress" in L ? L.progress : "";
    const showProgressBar = st !== "realestate" && progressLabel !== "";
    const progressBlock = showProgressBar
      ? '<div class="asset-debt-card-progress">' +
        `<span class="asset-debt-card-progress-label">${progressLabel}</span>` +
        '<div class="asset-debt-card-progress-bar">' +
        '<div class="asset-debt-card-progress-fill"></div>' +
        "</div>" +
        '<span class="asset-debt-card-progress-pct">0%</span>' +
        "</div>"
      : "";
    return (
      '<div class="asset-debt-card-main">' +
      '<div class="asset-debt-card-copy">' +
      '<div class="asset-debt-card-headline">' +
      '<span class="asset-debt-card-name"></span>' +
      "</div>" +
      '<div class="asset-debt-card-meta">' +
      '<p class="asset-debt-card-sub"></p>' +
      '<div class="asset-debt-card-tags"></div>' +
      "</div>" +
      "</div>" +
      '<div class="asset-debt-card-figures">' +
      '<span class="asset-debt-card-balance"></span>' +
      '<span class="asset-debt-card-balance-ko" hidden aria-hidden="true"></span>' +
      '<span class="asset-debt-card-maturity" hidden aria-hidden="true"></span>' +
      "</div>" +
      "</div>" +
      '<div class="asset-debt-card-stats">' +
      '<div class="asset-debt-card-stats-grid">' +
      topGrid +
      "</div>" +
      '<div class="asset-debt-card-stats-grid asset-debt-card-stats-grid--secondary">' +
      botGrid +
      "</div>" +
      "</div>" +
      progressBlock
    );
  }

  /** @deprecated 호환용 — buildAssetDebtStyleFaceInnerHtml 사용 */
  function buildAssetDepositDebtFaceInnerHtml(isSavings) {
    return buildAssetDebtStyleFaceInnerHtml(isSavings ? "savings" : "deposit");
  }

  function paintDepositLikeDebtFace(articleEl, face) {
    const isSavings = articleEl.dataset.savings === "true";
    const vals = face.querySelectorAll(".asset-asset-debtface-stat-val");
    if (vals.length < 8) return;

    const gLab = ASSET_GROUPS.find((g) => g.key === articleEl.dataset.assetCardGroup)?.label || "";

    const fmtWonChip = (raw) => {
      const s = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
      if (!s || s === "-" || s === "—") return "—";
      const n = parseNum(s.replace(/,/g, ""));
      if (n !== null && n !== 0) return `${formatNum(n)}원`;
      if (n === 0) return "0원";
      return /원\b/u.test(s) ? s : `${s}원`;
    };

    const nm = articleEl.querySelector(".asset-asset-input-name")?.value?.trim() || "";
    const nameFace = face.querySelector(".asset-debt-card-name");
    if (nameFace) nameFace.textContent = nm || (isSavings ? "적금" : "예금");

    const subEl = face.querySelector(".asset-debt-card-sub");
    if (subEl) subEl.textContent = gLab || (isSavings ? "적금" : "예금");

    const openIn = articleEl.querySelector(".asset-asset-input-open-date")?.value?.trim();
    const matIn = articleEl.querySelector(".asset-asset-input-maturity-date")?.value?.trim();
    const rateRaw = articleEl.querySelector(".asset-asset-input-rate")?.value?.trim() ?? "";
    const monthlyRaw = articleEl.querySelector(".asset-asset-input-monthly")?.value?.trim() ?? "";
    const monthsRaw = articleEl.querySelector(".asset-asset-input-months")?.value?.trim() ?? "";
    const prInputStr = articleEl.querySelector(".asset-asset-input-principal")?.value ?? "";

    const rateDisp = rateRaw ? (rateRaw.includes("%") ? rateRaw : `${rateRaw}%`) : "—";

    let intDisp = (articleEl.querySelector(".asset-asset-interest-display")?.textContent || "").trim();
    let matAmtDisp = (articleEl.querySelector(".asset-asset-maturity-amt-display")?.textContent || "").trim();

    if (isSavings) {
      if (!intDisp || !matAmtDisp) {
        const totalM = getTotalMonthsForSavingsAssetRow(articleEl);
        const calcSav = calcMaturityAmountAndInterest(monthlyRaw, totalM, rateRaw);
        if (calcSav) {
          if (!intDisp && calcSav.interest > 0) intDisp = formatNum(calcSav.interest);
          if (!matAmtDisp && calcSav.maturityAmount > 0) matAmtDisp = formatNum(calcSav.maturityAmount);
        }
      }
    } else {
      if (!intDisp || !matAmtDisp) {
        const calcDep = calcDepositMaturityAmount(prInputStr, openIn, matIn, rateRaw);
        if (calcDep) {
          if (!intDisp && calcDep.interest > 0) intDisp = formatNum(calcDep.interest);
          if (!matAmtDisp && calcDep.maturityAmount > 0) matAmtDisp = formatNum(calcDep.maturityAmount);
        }
      }
    }

    let intWon = "—";
    if (intDisp) {
      const intNum = parseNum(intDisp.replace(/원\s*$/u, "").replace(/,/g, ""));
      intWon =
        intNum !== null
          ? `${formatNum(intNum)}원`
          : intDisp.includes("원")
            ? intDisp
            : `${intDisp}원`;
    }
    let matWon = "—";
    if (matAmtDisp) {
      const matNum = parseNum(matAmtDisp.replace(/원\s*$/u, "").replace(/,/g, ""));
      matWon =
        matNum !== null
          ? `${formatNum(matNum)}원`
          : matAmtDisp.includes("원")
            ? matAmtDisp
            : `${matAmtDisp}원`;
    }

    const openDisp = openIn ? formatDateYYMMDD(openIn) : "—";
    const matDateDisp = matIn ? formatDateYYMMDD(matIn) : "—";
    const prNum = parseNum(prInputStr);

    if (isSavings) {
      vals[0].textContent = monthlyRaw.trim() ? fmtWonChip(monthlyRaw) : "—";
      vals[1].textContent = rateDisp;
      const tm = getTotalMonthsForSavingsAssetRow(articleEl);
      vals[2].textContent =
        tm !== null && tm > 0 ? `${formatNum(tm)}개월` : monthsRaw.trim() ? `${monthsRaw}개월` : "—";
      vals[3].textContent = prNum !== null ? fmtWonChip(prInputStr) : "—";
      vals[4].textContent = openDisp;
      vals[5].textContent = matDateDisp;
      vals[6].textContent = intWon;
      vals[7].textContent = matWon;
    } else {
      vals[0].textContent = prInputStr.trim() ? fmtWonChip(prInputStr) : "—";
      vals[1].textContent = rateDisp;
      vals[2].textContent = intWon;
      vals[3].textContent = matWon;
      vals[4].textContent = openIn ? formatDateYYMMDD(openIn) : "";
      vals[5].textContent = matIn ? formatDateYYMMDD(matIn) : "";
      vals[6].textContent = "";
      vals[7].textContent = "";
    }

    const balanceFigure = face.querySelector(".asset-debt-card-balance");
    if (balanceFigure) {
      const heroText = isSavings
        ? monthlyRaw.trim()
          ? fmtWonChip(monthlyRaw)
          : "—"
        : prInputStr.trim()
          ? fmtWonChip(prInputStr)
          : "—";
      const heroNum = isSavings ? parseNum(monthlyRaw) : prNum;
      setAssetDebtCardHeroWon(face, heroText, heroText === "—" ? null : heroNum);
    }

    const tagsEl = face.querySelector(".asset-debt-card-tags");
    if (tagsEl) {
      tagsEl.replaceChildren();
      if (articleEl.dataset.withdrawn === "true") {
        const st = document.createElement("span");
        st.className = "asset-debt-card-chip";
        st.textContent = "출금 완료";
        tagsEl.appendChild(st);
      } else if (articleEl.dataset.matured === "true") {
        const st = document.createElement("span");
        st.className = "asset-debt-card-chip asset-debt-card-chip--period";
        st.textContent = "만기(보유)";
        tagsEl.appendChild(st);
      }
    }

    const pfill = face.querySelector(".asset-debt-card-progress-fill");
    const ppct = face.querySelector(".asset-debt-card-progress-pct");
    let pctVal = null;
    if (articleEl.dataset.withdrawn === "true") {
      pctVal = 100;
    } else {
      pctVal = calcMaturityRate(openIn, matIn);
    }
    if (pfill && ppct) {
      if (pctVal === null) {
        pfill.style.width = "0%";
        ppct.textContent = "—";
      } else {
        const w = Math.min(100, Math.max(0, pctVal));
        pfill.style.width = `${w}%`;
        ppct.textContent = `${Math.round(w)}%`;
      }
    }

    articleEl.classList.toggle("asset-asset-card--withdrawn", articleEl.dataset.withdrawn === "true");
  }

  function paintAssetCard(articleEl) {
    const face = articleEl.querySelector(".asset-asset-card-face");
    if (!face) return;

    function cardMoneyFromRaw(raw, suffixWon = true) {
      const t = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
      if (!t) return "";
      const n = parseNum(t);
      if (n !== null) return suffixWon ? `${formatNum(n)}원` : formatNum(n);
      return suffixWon ? (t.endsWith("원") ? t : `${t}원`) : t;
    }

    function resolveAssetDebtStyleCard(el) {
      if (el.dataset.assetCardDebtStyle) return el.dataset.assetCardDebtStyle;
      if (el.dataset.assetCardDepositDebt === "1") {
        return el.dataset.savings === "true" ? "savings" : "deposit";
      }
      return "";
    }

    function paintDebtStyleAssetFace(faceRoot) {
      const style = resolveAssetDebtStyleCard(articleEl);
      if (!style || !faceRoot.querySelector(".asset-asset-debtface-stat-val")) return;
      if (style === "savings" || style === "deposit") {
        paintDepositLikeDebtFace(articleEl, faceRoot);
        return;
      }

      const vals = faceRoot.querySelectorAll(".asset-asset-debtface-stat-val");
      if (vals.length < 8) return;

      const fmtWonChip = (raw) => {
        const s = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
        if (!s || s === "-" || s === "—") return "—";
        const n = parseNum(s.replace(/,/g, ""));
        if (n !== null && n !== 0) return `${formatNum(n)}원`;
        if (n === 0) return "0원";
        return /원\b/u.test(s) ? s : `${s}원`;
      };

      const nameFace = faceRoot.querySelector(".asset-debt-card-name");
      const subEl = faceRoot.querySelector(".asset-debt-card-sub");
      const tagsEl = faceRoot.querySelector(".asset-debt-card-tags");
      const pfill = faceRoot.querySelector(".asset-debt-card-progress-fill");
      const ppct = faceRoot.querySelector(".asset-debt-card-progress-pct");

      const setProgress = (widthPct, pctText) => {
        if (pfill)
          pfill.style.width =
            typeof widthPct === "number" ? `${Math.min(100, Math.max(0, widthPct))}%` : "0%";
        if (ppct) ppct.textContent = pctText ?? "—";
      };

      if (style === "stock") {
        const nm = articleEl.querySelector(".asset-stock-input-name")?.value?.trim() || "";
        if (nameFace) nameFace.textContent = nm || "종목명";
        if (subEl) subEl.textContent = "주식";

        const avg = articleEl.querySelector(".asset-stock-input-avg-price")?.value;
        const curRaw = articleEl.querySelector(".asset-stock-input-current-price")?.value ?? "";
        const cur = curRaw.trim() === "" ? null : parseNum(curRaw);
        const qtyRaw = articleEl.querySelector(".asset-stock-input-quantity")?.value?.trim() ?? "";
        const qtyN = parseNum(qtyRaw);
        const qtyDisp = qtyRaw === "" ? "—" : qtyN !== null ? `${formatNum(qtyN)}주` : `${qtyRaw}주`;

        const purchaseTxt =
          articleEl.querySelector(".asset-stock-purchase-amt-display")?.textContent?.trim() || "";
        const appraisalTxt =
          articleEl.querySelector(".asset-stock-appraisal-amt-display")?.textContent?.trim() || "";
        const purchaseDisp = purchaseTxt ? cardMoneyFromRaw(purchaseTxt.replace(/,/g, ""), true) : "—";
        const appraisalDisp = appraisalTxt ? cardMoneyFromRaw(appraisalTxt.replace(/,/g, ""), true) : "—";

        const plTxtRaw =
          articleEl.querySelector(".asset-stock-profit-loss-display")?.textContent?.trim()?.replace(/^—$/, "") ||
          "";
        const plNumOnly = parseNum(plTxtRaw);
        let plDisp = plTxtRaw;
        if (plTxtRaw && plNumOnly !== null && !/원/.test(plTxtRaw)) {
          plDisp = `${formatNum(plNumOnly)}원`;
        }
        if (!plDisp) plDisp = "—";

        const rateStrRaw =
          articleEl.querySelector(".asset-stock-return-rate-display")?.textContent?.trim() || "";
        const rateParsed = parseNum(rateStrRaw.replace(/%/gu, ""));
        const rateN = rateParsed === null ? null : rateParsed;

        vals[0].textContent = avg?.trim() ? fmtWonChip(avg) : "—";
        vals[1].textContent = curRaw.trim() !== "" && cur !== null ? fmtWonChip(curRaw) : "—";
        vals[2].textContent = qtyDisp;
        vals[3].textContent = purchaseDisp;
        vals[4].textContent = appraisalDisp;
        vals[5].textContent = plDisp;
        vals[6].textContent =
          rateStrRaw === "" ? "—" : /%/.test(rateStrRaw) ? rateStrRaw : `${rateStrRaw}%`;

        const clearStockStatTone = (el) => {
          el.classList.remove(
            "asset-debt-card-stat-val--gain",
            "asset-debt-card-stat-val--loss",
            "asset-debt-card-stat-val--flat",
          );
        };
        const applyStockStatTone = (el, n) => {
          clearStockStatTone(el);
          if (n === null || n === undefined || Number.isNaN(n)) return;
          if (n > 0) el.classList.add("asset-debt-card-stat-val--gain");
          else if (n < 0) el.classList.add("asset-debt-card-stat-val--loss");
          else el.classList.add("asset-debt-card-stat-val--flat");
        };
        applyStockStatTone(vals[5], plNumOnly);
        applyStockStatTone(vals[6], rateN);

        const nwBasis = articleEl.dataset.assetStockNetWorthBasis || "";
        vals[7].textContent =
          nwBasis === "purchase"
            ? "현재가 미입력·총자산은 매입 기준"
            : nwBasis === "appraisal"
              ? "평가(현재가×수량) 기준"
              : "—";

        const app = parseNum(articleEl.querySelector(".asset-stock-appraisal-amt-display")?.textContent);
        const pur = parseNum(articleEl.querySelector(".asset-stock-purchase-amt-display")?.textContent);
        let heroDisp = "—";
        let heroNum = null;
        if (nwBasis === "appraisal" && app !== null) {
          heroDisp = `${formatNum(app)}원`;
          heroNum = app;
        } else if (nwBasis === "purchase" && pur !== null) {
          heroDisp = `${formatNum(pur)}원`;
          heroNum = pur;
        } else if (app !== null) {
          heroDisp = `${formatNum(app)}원`;
          heroNum = app;
        } else if (pur !== null) {
          heroDisp = `${formatNum(pur)}원`;
          heroNum = pur;
        }
        setAssetDebtCardHeroWon(faceRoot, heroDisp, heroNum);

        if (tagsEl) {
          tagsEl.replaceChildren();
          const c0 = document.createElement("span");
          c0.className = "asset-debt-card-chip";
          c0.textContent = "주식";
          tagsEl.appendChild(c0);
          if (nwBasis === "purchase") {
            const cw = document.createElement("span");
            cw.className = "asset-debt-card-chip asset-debt-card-chip--period";
            cw.textContent = "현재가 미입력·매입 기준";
            tagsEl.appendChild(cw);
          }
          if (rateStrRaw) {
            const c2 = document.createElement("span");
            let chipCls = "asset-debt-card-chip";
            if (rateN !== null) {
              chipCls +=
                rateN > 0
                  ? " asset-debt-card-chip--gain"
                  : rateN < 0
                    ? " asset-debt-card-chip--loss"
                    : " asset-debt-card-chip--flat";
            }
            c2.className = chipCls;
            c2.textContent = /%/.test(rateStrRaw) ? `수익률 ${rateStrRaw}` : `수익률 ${rateStrRaw}%`;
            tagsEl.appendChild(c2);
          }
        }

        return;
      }

      if (style === "realestate") {
        const gLab = ASSET_GROUPS.find((g) => g.key === articleEl.dataset.assetCardGroup)?.label || "";
        const ct = articleEl.querySelector(".asset-asset-input-contract")?.value?.trim() || "";
        if (nameFace) nameFace.textContent = ct || "부동산";
        if (subEl) subEl.textContent = gLab || "부동산";

        const occ = articleEl.querySelector(".asset-real-estate-input-occupancy")?.value || "owner";
        const saleStr = articleEl.querySelector(".asset-asset-input-sale-price")?.value;
        const loanStr = articleEl.querySelector(".asset-asset-input-loan")?.value;
        const leaseStr = articleEl.querySelector(".asset-real-estate-input-lease-deposit")?.value ?? "";
        const val = computeRealEstateNetFromInputs(saleStr, loanStr, leaseStr, occ);

        const pType = articleEl.querySelector(".asset-real-estate-input-property-type")?.value || "";
        const propTypeLabels = {
          apartment: "아파트",
          villa: "빌라·연립",
          officetel: "오피스텔",
          retail: "상가",
          land: "토지",
          other: "기타",
        };

        vals[0].textContent = saleStr?.trim() ? fmtWonChip(saleStr) : "—";
        vals[1].textContent = loanStr?.trim() ? fmtWonChip(loanStr) : "—";
        vals[2].textContent = val !== null && !Number.isNaN(val) ? `${formatNum(val)}원` : "—";
        vals[2].classList.remove("asset-debt-card-stat-val--net-negative");
        if (val !== null && !Number.isNaN(val) && val < 0) vals[2].classList.add("asset-debt-card-stat-val--net-negative");

        vals[3].textContent = pType && propTypeLabels[pType] ? propTypeLabels[pType] : "—";

        const acq = articleEl.querySelector(".asset-real-estate-input-acquisition-date")?.value?.trim();
        const purStr = articleEl.querySelector(".asset-real-estate-input-purchase-price")?.value ?? "";
        const areaStr = articleEl.querySelector(".asset-real-estate-input-area-sqm")?.value ?? "";
        vals[4].textContent = acq ? formatDateYYMMDD(acq) : "";
        vals[5].textContent = purStr.trim() ? fmtWonChip(purStr) : "—";
        const areaN = parseNum(areaStr);
        vals[6].textContent =
          areaStr.trim() !== "" ? (areaN !== null ? `${formatNum(areaN)}㎡` : `${areaStr}㎡`) : "—";

        let occDisp = occ === "owner" ? "직접 거주" : occ === "landlord" ? "임대" : "전·월세 거주";
        if ((occ === "landlord" || occ === "tenant") && leaseStr.trim()) {
          occDisp += ` · ${fmtWonChip(leaseStr)}`;
        }
        vals[7].textContent = occDisp;

        setAssetDebtCardHeroWon(
          faceRoot,
          val !== null && !Number.isNaN(val) ? `${formatNum(val)}원` : "—",
          val !== null && !Number.isNaN(val) ? val : null,
        );

        if (tagsEl) {
          tagsEl.replaceChildren();
          if (pType && propTypeLabels[pType]) {
            const t1 = document.createElement("span");
            t1.className = "asset-debt-card-chip asset-debt-card-chip--period";
            t1.textContent = propTypeLabels[pType];
            tagsEl.appendChild(t1);
          }
        }

        return;
      }

      if (style === "insurance") {
        const nm = articleEl.querySelector(".asset-insurance-input-name")?.value?.trim() || "";
        const kind =
          articleEl.querySelector(".asset-insurance-kind-display")?.textContent?.trim() ||
          articleEl.querySelector(".asset-insurance-input-kind")?.value?.trim() ||
          "";
        if (nameFace) nameFace.textContent = nm || "보험";
        if (subEl) subEl.textContent = "투자성 보험";

        const monthlyRaw = articleEl.querySelector(".asset-insurance-input-monthly")?.value?.trim() || "";
        const cStr = articleEl.querySelector(".asset-insurance-input-contract-date")?.value?.trim();
        const mStr = articleEl.querySelector(".asset-insurance-input-maturity-date")?.value?.trim();
        const surRaw = articleEl.querySelector(".asset-insurance-input-surrender")?.value ?? "";
        const cov = (articleEl.querySelector(".asset-insurance-input-coverage")?.value || "").trim();

        vals[0].textContent = kind || "—";
        vals[1].textContent = monthlyRaw ? fmtWonChip(monthlyRaw) : "—";
        vals[2].textContent = cStr ? formatDateYYMMDD(cStr) : "—";
        vals[3].textContent = mStr ? formatDateYYMMDD(mStr) : "—";
        vals[4].textContent = surRaw.trim() ? fmtWonChip(surRaw) : "—";
        vals[5].textContent = cov ? (cov.length > 22 ? `${cov.slice(0, 22)}…` : cov) : "—";
        vals[6].textContent = "";
        vals[7].textContent = "";

        const sur = parseNum(surRaw);
        setAssetDebtCardHeroWon(faceRoot, sur !== null ? `${formatNum(sur)}원` : "—", sur);

        if (tagsEl) {
          tagsEl.replaceChildren();
          if (kind) {
            const x = document.createElement("span");
            x.className = "asset-debt-card-chip";
            x.textContent = kind;
            tagsEl.appendChild(x);
          }
          const x2 = document.createElement("span");
          x2.className = "asset-debt-card-chip asset-debt-card-chip--period";
          x2.textContent = "투자성 보험";
          tagsEl.appendChild(x2);
        }
        setProgress(0, "—");
        return;
      }

      if (style === "annuity") {
        faceRoot.querySelector(".asset-debt-card-progress")?.remove();
        const nm = articleEl.querySelector(".asset-annuity-input-name")?.value?.trim() || "";
        const kind = articleEl.querySelector(".asset-annuity-input-kind")?.value?.trim() || "";
        if (nameFace) nameFace.textContent = nm || "연금";
        if (subEl) subEl.textContent = "연금";

        const surRaw = articleEl.querySelector(".asset-annuity-input-surrender")?.value ?? "";
        const monthlyRaw = articleEl.querySelector(".asset-annuity-input-monthly")?.value?.trim() || "";
        const ps = articleEl.querySelector(".asset-annuity-input-payment-start")?.value?.trim();
        const pe = articleEl.querySelector(".asset-annuity-input-payment-end")?.value?.trim();
        const rs = articleEl.querySelector(".asset-annuity-input-receipt-start")?.value?.trim();
        const mr = articleEl.querySelector(".asset-annuity-input-monthly-receipt")?.value?.trim() || "";
        const paidTxt = articleEl.querySelector(".asset-annuity-total-paid-display")?.textContent?.trim() || "";

        vals[0].textContent = kind || "—";
        vals[1].textContent = surRaw.trim() ? fmtWonChip(surRaw) : "—";
        vals[2].textContent = monthlyRaw ? fmtWonChip(monthlyRaw) : "—";
        vals[3].textContent = ps ? formatDateYYMMDD(ps) : "—";
        vals[4].textContent = pe ? formatDateYYMMDD(pe) : "—";
        vals[5].textContent = paidTxt ? `${paidTxt}원` : "—";
        vals[6].textContent = rs ? formatDateYYMMDD(rs) : "—";
        vals[7].textContent = mr ? fmtWonChip(mr) : "—";

        const surN = parseNum(surRaw);
        const paid = parseNum(articleEl.querySelector(".asset-annuity-total-paid-display")?.textContent);
        const heroNum = surN !== null ? surN : paid;
        const heroDisp = heroNum !== null ? `${formatNum(heroNum)}원` : "—";
        setAssetDebtCardHeroWon(faceRoot, heroDisp, heroNum !== null && !Number.isNaN(heroNum) ? heroNum : null);

        if (tagsEl) {
          tagsEl.replaceChildren();
          const x2 = document.createElement("span");
          x2.className = "asset-debt-card-chip";
          x2.textContent = "연금";
          tagsEl.appendChild(x2);
          if (surN !== null) {
            const x3 = document.createElement("span");
            x3.className = "asset-debt-card-chip asset-debt-card-chip--period";
            x3.textContent = "총자산=해지환급금";
            tagsEl.appendChild(x3);
          }
        }
      }
    }

    /** 예·적금 카드: 가입~만기 기준 만기율 (%·프로그레스) */
    function paintDepositLikeMaturityProgressBar(faceMain, openStr, matStr) {
      if (!faceMain) return;
      const pct = calcMaturityRate(openStr, matStr);
      let wrap = faceMain.querySelector(".asset-asset-card-maturity-progress");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "asset-asset-card-maturity-progress";
        wrap.setAttribute("aria-label", "만기까지 납입 진행률");
        const track = document.createElement("div");
        track.className = "asset-asset-card-maturity-progress-track";
        const fill = document.createElement("div");
        fill.className = "asset-asset-card-maturity-progress-fill";
        track.appendChild(fill);
        const cap = document.createElement("span");
        cap.className = "asset-asset-card-maturity-progress-caption";
        wrap.appendChild(track);
        wrap.appendChild(cap);
        const fig = faceMain.querySelector(".asset-asset-card-figures");
        if (fig) fig.before(wrap);
        else faceMain.appendChild(wrap);
      }
      const fill = wrap.querySelector(".asset-asset-card-maturity-progress-fill");
      const cap = wrap.querySelector(".asset-asset-card-maturity-progress-caption");
      if (pct === null) {
        if (fill) fill.style.width = "0%";
        if (cap) cap.textContent = "";
        wrap.hidden = true;
        return;
      }
      wrap.hidden = false;
      if (fill) fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
      if (cap) cap.textContent = `만기율 ${pct}%`;
    }

    face.querySelector(".asset-asset-card-details")?.remove();
    if (resolveAssetDebtStyleCard(articleEl)) {
      paintDebtStyleAssetFace(face);
      return;
    }

    const titleEl = face.querySelector(".asset-asset-card-title");
    const gLabel = ASSET_GROUPS.find((g) => g.key === articleEl.dataset.assetCardGroup)?.label || "";

    /** @type {{ text: string, mod?: string }[]} */
    let faceTags = [];
    let dateSubline = "";
    let iconSrc = assetGroupCardIconSrc(articleEl.dataset.assetCardGroup || "");
    let title = "";
    let hint = "";
    let realEstateHintNegative = false;

    if (articleEl.classList.contains("asset-asset-row-insurance")) {
      const nm = articleEl.querySelector(".asset-insurance-input-name")?.value?.trim();
      const kind = articleEl.querySelector(".asset-insurance-input-kind")?.value?.trim();
      title = nm || "투자성 보험";
      const sur = parseNum(articleEl.querySelector(".asset-insurance-input-surrender")?.value);
      hint = sur !== null ? `${formatNum(sur)}원` : "잔액 미입력";
      const cStr = articleEl.querySelector(".asset-insurance-input-contract-date")?.value?.trim();
      const mStr = articleEl.querySelector(".asset-insurance-input-maturity-date")?.value?.trim();
      const monthlyRaw = articleEl.querySelector(".asset-insurance-input-monthly")?.value?.trim() || "";
      iconSrc = assetGroupCardIconSrc("보험");
      faceTags = [];
      if (kind) faceTags.push({ text: kind, mod: "rose" });
      faceTags.push({ text: "투자성 보험", mod: "slate" });
      if (monthlyRaw.trim()) {
        const mn = parseNum(monthlyRaw);
        faceTags.push({
          text: mn !== null ? `월 ${formatNum(mn)}원` : `월 ${monthlyRaw}`,
          mod: "amber",
        });
      }
      dateSubline =
        (mStr && `만기 ${formatDateYYMMDD(mStr)}`) ||
        (cStr && `계약 ${formatDateYYMMDD(cStr)}`) ||
        "날짜 미입력";
    } else if (articleEl.classList.contains("asset-asset-row-annuity")) {
      const nm = articleEl.querySelector(".asset-annuity-input-name")?.value?.trim();
      title = nm || "연금";
      const surN = parseNum(articleEl.querySelector(".asset-annuity-input-surrender")?.value);
      const paid = parseNum(articleEl.querySelector(".asset-annuity-total-paid-display")?.textContent);
      const heroAmt = surN !== null ? surN : paid;
      hint = heroAmt !== null ? `${formatNum(heroAmt)}원` : "입력 후 반영";
      const ps = articleEl.querySelector(".asset-annuity-input-payment-start")?.value?.trim();
      const pe = articleEl.querySelector(".asset-annuity-input-payment-end")?.value?.trim();
      const rs = articleEl.querySelector(".asset-annuity-input-receipt-start")?.value?.trim();
      const monthlyRaw = articleEl.querySelector(".asset-annuity-input-monthly")?.value?.trim() || "";
      iconSrc = assetGroupCardIconSrc("연금");
      faceTags = [];
      faceTags.push({ text: "연금", mod: "slate" });
      if (monthlyRaw.trim()) {
        const mn = parseNum(monthlyRaw);
        faceTags.push({
          text: mn !== null ? `월 납입 ${formatNum(mn)}원` : `월 납입 ${monthlyRaw}`,
          mod: "amber",
        });
      }
      dateSubline =
        (rs && `수령 ${formatDateYYMMDD(rs)}`) ||
        (pe && `납입 종료 ${formatDateYYMMDD(pe)}`) ||
        (ps && `납입 시작 ${formatDateYYMMDD(ps)}`) ||
        "날짜 미입력";
    } else if (articleEl.classList.contains("asset-asset-row-real-estate")) {
      const ct = articleEl.querySelector(".asset-asset-input-contract")?.value?.trim();
      title = ct || "부동산";
      const occ = articleEl.querySelector(".asset-real-estate-input-occupancy")?.value || "owner";
      const saleStr = articleEl.querySelector(".asset-asset-input-sale-price")?.value;
      const loanStr = articleEl.querySelector(".asset-asset-input-loan")?.value;
      const leaseStr = articleEl.querySelector(".asset-real-estate-input-lease-deposit")?.value ?? "";
      const val = computeRealEstateNetFromInputs(saleStr, loanStr, leaseStr, occ);
      hint = val !== null && !Number.isNaN(val) ? `${formatNum(val)}원` : "입력 후 반영";
      realEstateHintNegative = val !== null && !Number.isNaN(val) && val < 0;

      const pType = articleEl.querySelector(".asset-real-estate-input-property-type")?.value || "";
      const propTypeLabels = {
        apartment: "아파트",
        villa: "빌라",
        officetel: "오피스텔",
        retail: "상가",
        land: "토지",
        other: "기타",
      };
      iconSrc = assetGroupCardIconSrc("부동산");
      faceTags = [];
      if (pType && propTypeLabels[pType]) {
        faceTags.push({ text: propTypeLabels[pType], mod: "slate" });
      }
      const sale = parseNum(saleStr);
      const loan = parseNum(loanStr);
      if (sale !== null && occ !== "tenant") {
        faceTags.push({ text: `시세 ${formatNum(sale)}원`, mod: "teal" });
      }
      if (loan !== null && loan > 0 && occ !== "tenant") {
        faceTags.push({ text: `대출 ${formatNum(loan)}원`, mod: "indigo" });
      }
      if (occ === "landlord") {
        faceTags.push({ text: "임대", mod: "amber" });
      } else if (occ === "tenant") {
        faceTags.push({ text: "전·월세 거주", mod: "amber" });
      }
      const acq = articleEl.querySelector(".asset-real-estate-input-acquisition-date")?.value;
      const hold = formatRealEstateHoldingPeriod(acq);
      dateSubline = hold ? `취득 후 ${hold}` : "취득일 입력 시 보유 기간·세금 참고";
    } else {
      title = gLabel || "자산";
      hint = "—";
      iconSrc = assetGroupCardIconSrc(articleEl.dataset.assetCardGroup || "예금");
      faceTags = [];
      dateSubline = "—";
    }

    const tagsEl = face.querySelector(".asset-asset-card-tags");
    const balanceEl = face.querySelector(".asset-asset-card-balance");
    const sublineEl = face.querySelector(".asset-asset-card-subline");
    const iconImg = face.querySelector(".asset-asset-card-icon-img");

    if (titleEl) titleEl.textContent = title || "—";
    if (balanceEl) {
      balanceEl.textContent = hint || "—";
      balanceEl.classList.toggle("asset-asset-card-balance--negative", realEstateHintNegative);
    }
    if (sublineEl) sublineEl.textContent = dateSubline || "—";
    if (iconImg) iconImg.src = iconSrc;

    if (tagsEl) {
      tagsEl.replaceChildren();
      faceTags.forEach(({ text, mod }) => {
        if (!text) return;
        const s = document.createElement("span");
        if (mod === "realestate-chip") {
          s.className = "asset-asset-card-chip asset-asset-card-chip--realestate";
        } else {
          s.className = "asset-asset-face-chip" + (mod ? ` asset-asset-face-chip--${mod}` : "");
        }
        s.textContent = text;
        tagsEl.appendChild(s);
      });
    }

    const intHintEl = face.querySelector(".asset-asset-card-int-hint");
    if (intHintEl) {
      if (articleEl.classList.contains("asset-asset-row-real-estate")) {
        const purchase = parseNum(articleEl.querySelector(".asset-real-estate-input-purchase-price")?.value);
        const saleN = parseNum(articleEl.querySelector(".asset-asset-input-sale-price")?.value);
        if (purchase !== null && saleN !== null) {
          const g = saleN - purchase;
          intHintEl.textContent =
            g === 0 ? "매입가 대비 변동 없음" : `매입가 대비 ${g > 0 ? "+" : ""}${formatNum(g)}원`;
        } else {
          intHintEl.textContent = "";
        }
      } else {
        const isSav = articleEl.dataset.savings === "true";
        const isDep = articleEl.classList.contains("asset-asset-row--deposit");
        if (isSav || isDep) {
          const matN = parseNum(articleEl.querySelector(".asset-asset-maturity-amt-display")?.textContent);
          const prN = parseNum(articleEl.querySelector(".asset-asset-input-principal")?.value);
          if (matN !== null && prN !== null && matN > prN) {
            intHintEl.textContent = `이자 포함 만기 시 약 ${formatNum(matN)}원`;
          } else {
            intHintEl.textContent = "";
          }
        } else {
          intHintEl.textContent = "";
        }
      }
    }

    if (articleEl.classList.contains("asset-asset-row--deposit") || articleEl.dataset.savings === "true") {
      articleEl.classList.toggle("asset-asset-card--withdrawn", articleEl.dataset.withdrawn === "true");
    }
  }

  function wrapAssetDomRowAsCard(domRow, groupKey) {
    const articleEl = document.createElement("article");
    articleEl.className =
      domRow.className +
      " asset-asset-card asset-asset-row--card" +
      (domRow.classList.contains("asset-asset-row-real-estate") ? " asset-asset-card--real-estate" : "") +
      (domRow.classList.contains("asset-asset-row-insurance") ? " asset-asset-card--insurance" : "") +
      (domRow.classList.contains("asset-asset-row-annuity") ? " asset-asset-card--annuity" : "") +
      (domRow.classList.contains("asset-asset-row-stock") ? " asset-asset-card--stock" : "");
    articleEl.setAttribute("role", "listitem");
    articleEl.dataset.assetCardGroup = groupKey;
    Object.keys(domRow.dataset).forEach((k) => {
      articleEl.dataset[k] = domRow.dataset[k];
    });

    const face = document.createElement("div");
    const isStock = domRow.classList.contains("asset-asset-row-stock");
    const isRealEstate = domRow.classList.contains("asset-asset-row-real-estate");
    const isInsurance = domRow.classList.contains("asset-asset-row-insurance");
    const isAnnuity = domRow.classList.contains("asset-asset-row-annuity");
    const isDepositDebt =
      groupKey === "예금" ||
      groupKey === "적금" ||
      domRow.dataset.savings === "true" ||
      domRow.classList.contains("asset-asset-row--deposit");

    if (isDepositDebt) {
      articleEl.dataset.assetCardDepositDebt = "1";
      const isSavings = domRow.dataset.savings === "true";
      face.className = "asset-asset-card-face asset-debt-card-face";
      face.innerHTML = buildAssetDepositDebtFaceInnerHtml(isSavings);
    } else if (isStock) {
      articleEl.dataset.assetCardDebtStyle = "stock";
      face.className = "asset-asset-card-face asset-debt-card-face";
      face.innerHTML = buildAssetDebtStyleFaceInnerHtml("stock");
    } else if (isRealEstate) {
      articleEl.dataset.assetCardDebtStyle = "realestate";
      face.className = "asset-asset-card-face asset-debt-card-face";
      face.innerHTML = buildAssetDebtStyleFaceInnerHtml("realestate");
    } else if (isInsurance) {
      articleEl.dataset.assetCardDebtStyle = "insurance";
      face.className = "asset-asset-card-face asset-debt-card-face";
      face.innerHTML = buildAssetDebtStyleFaceInnerHtml("insurance");
    } else if (isAnnuity) {
      articleEl.dataset.assetCardDebtStyle = "annuity";
      face.className = "asset-asset-card-face asset-debt-card-face";
      face.innerHTML = buildAssetDebtStyleFaceInnerHtml("annuity");
    } else {
      face.className = "asset-asset-card-face";
      face.innerHTML =
        `<div class="asset-asset-card-main asset-asset-card-main--simple-face">` +
        `<div class="asset-asset-card-icon-wrap" aria-hidden="true">` +
        `<img class="asset-asset-card-icon-img" src="${assetGroupCardIconSrc(groupKey)}" alt="" width="22" height="22" />` +
        `</div>` +
        `<div class="asset-asset-card-copy">` +
        `<div class="asset-asset-card-title"></div>` +
        `<div class="asset-asset-card-meta"><div class="asset-asset-card-tags" role="presentation"></div></div>` +
        `</div>` +
        `<div class="asset-asset-card-figures">` +
        `<span class="asset-asset-card-balance"></span>` +
        `<span class="asset-asset-card-subline"></span>` +
        `<span class="asset-asset-card-int-hint" aria-hidden="true"></span>` +
        `</div>` +
        `</div>`;
    }

    const fieldRoot = document.createElement("div");
    fieldRoot.className = "asset-asset-card-fields";
    fieldRoot.setAttribute("aria-hidden", "true");
    while (domRow.firstChild) fieldRoot.appendChild(domRow.firstChild);
    articleEl.appendChild(face);
    articleEl.appendChild(fieldRoot);

    const scheduleCardPaint = () => {
      paintAssetCard(articleEl);
      requestAnimationFrame(() => paintAssetCard(articleEl));
    };
    fieldRoot.addEventListener("input", scheduleCardPaint, true);
    fieldRoot.addEventListener("change", scheduleCardPaint, true);
    paintAssetCard(articleEl);

    articleEl.addEventListener("click", (ev) => {
      if (ev.target.closest("button")) return;
      if (ev.target.closest(".asset-asset-card-fields")) return;
      openAssetNetworthModal({ replaceCard: articleEl });
    });

    articleEl.addEventListener("contextmenu", (e) => {
      const depositLike =
        articleEl.dataset.savings === "true" ||
        articleEl.classList.contains("asset-asset-row--deposit");
      if (!depositLike) return;
      e.preventDefault();
      const menu = document.createElement("div");
      menu.className = "asset-asset-maturity-context-menu";
      menu.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;z-index:100000;`;
      const hide = () => {
        if (menu.parentNode) document.body.removeChild(menu);
        document.removeEventListener("click", hide);
        document.removeEventListener("contextmenu", hide);
      };
      const withdrawn = articleEl.dataset.withdrawn === "true";
      const matured = articleEl.dataset.matured === "true";

      function addItem(label, fn) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "asset-asset-maturity-context-menu-item";
        btn.textContent = label;
        btn.addEventListener("click", () => {
          fn();
          hide();
          onAssetUpdate();
        });
        menu.appendChild(btn);
      }

      if (withdrawn) {
        addItem("다시 자산에 포함 (진행 중)", () => {
          articleEl.dataset.withdrawn = "false";
          articleEl.dataset.matured = "false";
        });
      } else if (!matured) {
        addItem("만기(보유 중)으로 표시", () => {
          articleEl.dataset.matured = "true";
          articleEl.dataset.withdrawn = "false";
        });
      } else {
        addItem("출금 완료 (총자산에서 제외)", () => {
          articleEl.dataset.withdrawn = "true";
          articleEl.dataset.matured = "true";
        });
        addItem("진행 중으로 되돌리기", () => {
          articleEl.dataset.matured = "false";
          articleEl.dataset.withdrawn = "false";
        });
      }

      document.body.appendChild(menu);
      requestAnimationFrame(() => {
        document.addEventListener("click", hide);
        document.addEventListener("contextmenu", hide);
      });
    });

    return articleEl;
  }

  function appendAssetCardForGroup(groupKey, payload) {
    const noop = () => {};
    let row;
    if (groupKey === "예금") {
      row = createAssetRow({ ...payload }, onAssetUpdate, false, "CMA", true, { suppressInlineDelete: true });
    } else if (groupKey === "적금") {
      row = createAssetRow({ ...payload }, onAssetUpdate, true, "예적금잔고", false, { suppressInlineDelete: true });
    } else if (groupKey === "부동산") {
      row = createRealEstateRow({ ...payload }, onAssetUpdate, {
        mode: "view",
        suppressInlineActions: true,
      });
    } else if (groupKey === "주식") {
      row = createStockRow({ ...payload }, onAssetUpdate, { suppressInlineDelete: true });
    } else if (groupKey === "보험") {
      row = createInsuranceRow({ ...payload }, onAssetUpdate, { suppressInlineDelete: true });
    } else if (groupKey === "연금") {
      row = createAnnuityRow({ ...payload }, onAssetUpdate, { suppressInlineDelete: true });
    } else {
      return;
    }
    const card = wrapAssetDomRowAsCard(row, groupKey);
    assetCardsList.appendChild(card);
  }

  function openAssetNetworthModal(opts = {}) {
    const replaceCard = opts.replaceCard || null;
    const initialGroup = opts.initialGroup || (replaceCard ? replaceCard.dataset.assetCardGroup || "예금" : "예금");
    if (document.querySelector(".asset-networth-asset-modal")) {
      showToast("입력 창을 닫은 뒤 다시 시도해 주세요.", "");
      return;
    }

    let editPayload = null;
    if (replaceCard) {
      editPayload = readAssetCardPayload(replaceCard);
    }

    const overlay = document.createElement("div");
    overlay.className = "asset-expense-transaction-modal asset-networth-asset-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", replaceCard ? "자산 수정" : "자산 추가");

    const backdrop = document.createElement("div");
    backdrop.className = "asset-expense-transaction-modal-backdrop";

    const panelShell = document.createElement("div");
    panelShell.className = "asset-expense-transaction-modal-panel-shell asset-networth-asset-modal-panel";

    const modalTitle = replaceCard ? "자산 수정" : "자산 추가";
    const headRow = document.createElement("div");
    headRow.className = "asset-expense-inline-panel-top asset-networth-asset-modal-head";
    const headTextWrap = document.createElement("div");
    headTextWrap.className = "asset-expense-inline-panel-head-text";
    const titleEl = document.createElement("span");
    titleEl.className = "asset-expense-inline-panel-title";
    titleEl.textContent = modalTitle;
    headTextWrap.appendChild(titleEl);
    const modalCloseBtn = document.createElement("button");
    modalCloseBtn.type = "button";
    modalCloseBtn.className = "asset-expense-inline-panel-x";
    modalCloseBtn.setAttribute("aria-label", "닫기");
    modalCloseBtn.textContent = "×";
    modalCloseBtn.addEventListener("click", () => closeOverlay());
    headRow.appendChild(headTextWrap);
    headRow.appendChild(modalCloseBtn);

    const tabStrip = document.createElement("div");
    tabStrip.className = "asset-asset-modal-tabs";
    const formMount = document.createElement("div");
    formMount.className = "asset-asset-modal-form-mount";

    let activeGroup = initialGroup;
    let realEstateModalPanel = null;

    function closeOverlay() {
      overlay.remove();
    }

    function getEditDataForGroup(g) {
      if (!editPayload) return {};
      if (g === "주식" && editPayload.groupKey === "주식") return { ...editPayload.stock };
      if (g === "보험" && editPayload.groupKey === "보험") return { ...editPayload.insurance };
      if (g === "연금" && editPayload.groupKey === "연금") return { ...editPayload.annuity };
      if (g === "부동산" && editPayload.groupKey === "부동산") return { ...editPayload.realEstate };
      if ((g === "예금" || g === "적금") && (editPayload.groupKey === "예금" || editPayload.groupKey === "적금")) {
        return { ...editPayload.depositLike };
      }
      return {};
    }

    function mountForm(g) {
      formMount.textContent = "";
      realEstateModalPanel = null;
      const modalNoop = () => {};
      const nwFloatEmbed = { suppressInlineDelete: true, assetNetworthFloatingModal: true };
      const isEdit = Boolean(replaceCard && editPayload && editPayload.groupKey === g);
      const data = isEdit ? getEditDataForGroup(g) : {};

      if (g === "부동산") {
        const phantom = createRealEstateRow(data, modalNoop, {
          mode: isEdit ? "edit" : "draft",
          memSnapshot: isEdit ? data : null,
          assetPhantomTableRow: true,
          assetModalHandlers: {
            onCancel: () => closeOverlay(),
            onSave: (d) => {
              if (replaceCard) {
                const row = createRealEstateRow(d, onAssetUpdate, { mode: "view", suppressInlineActions: true });
                const next = wrapAssetDomRowAsCard(row, "부동산");
                replaceCard.replaceWith(next);
              } else {
                appendAssetCardForGroup("부동산", d);
              }
              closeOverlay();
              onAssetUpdate();
            },
            onDelete:
              replaceCard && editPayload?.groupKey === "부동산"
                ? () => {
                    confirmDeleteRow(() => {
                      replaceCard.remove();
                      closeOverlay();
                      onAssetUpdate();
                    });
                  }
                : null,
          },
        });
        const panel = phantom.querySelector(".asset-expense-inline-panel");
        phantom.remove();
        if (panel) {
          realEstateModalPanel = panel;
          formMount.appendChild(panel);
        }
        return;
      }

      const tbl = document.createElement("table");
      tbl.className = "asset-asset-modal-embed-table";
      const tb = document.createElement("tbody");
      let tr;
      if (g === "예금") tr = createAssetRow(data, modalNoop, false, "CMA", true, nwFloatEmbed);
      else if (g === "적금") tr = createAssetRow(data, modalNoop, true, "예적금잔고", false, nwFloatEmbed);
      else if (g === "주식") tr = createStockRow(data, modalNoop, nwFloatEmbed);
      else if (g === "보험") tr = createInsuranceRow(data, modalNoop, nwFloatEmbed);
      else if (g === "연금") tr = createAnnuityRow(data, modalNoop, nwFloatEmbed);
      if (tr) {
        tb.appendChild(tr);
        tbl.appendChild(tb);
        formMount.appendChild(tbl);
      }
    }

    function applyNonRealEstateSave() {
      const g = activeGroup;
      const src = formMount.querySelector(".asset-asset-modal-embed-table tbody tr");
      if (!src) {
        showToast("입력 폼을 찾지 못했습니다. 모달을 닫았다가 다시 열어 주세요.", "");
        return;
      }
      if (g === "예금") {
        const rows = collectAssetRowsFromDOM(assetModalCollectHost(src));
        if (!rows.length) {
          showToast("예금 입력을 읽지 못했습니다. 다시 시도해 주세요.", "");
          return;
        }
        const d = rows[0];
        if (replaceCard) {
          const row = createAssetRow(d, onAssetUpdate, false, "CMA", true, { suppressInlineDelete: true });
          replaceCard.replaceWith(wrapAssetDomRowAsCard(row, "예금"));
        } else appendAssetCardForGroup("예금", d);
      } else if (g === "적금") {
        const rows = collectAssetRowsFromDOM(assetModalCollectHost(src));
        if (!rows.length) {
          showToast("적금 입력을 읽지 못했습니다. 다시 시도해 주세요.", "");
          return;
        }
        const d = rows[0];
        if (replaceCard) {
          const row = createAssetRow(d, onAssetUpdate, true, "예적금잔고", false, { suppressInlineDelete: true });
          replaceCard.replaceWith(wrapAssetDomRowAsCard(row, "적금"));
        } else appendAssetCardForGroup("적금", d);
      } else if (g === "주식") {
        const d = readAssetStockFromRoot(src);
        if (replaceCard) {
          const row = createStockRow(d, onAssetUpdate, { suppressInlineDelete: true });
          replaceCard.replaceWith(wrapAssetDomRowAsCard(row, "주식"));
        } else appendAssetCardForGroup("주식", d);
      } else if (g === "보험") {
        const d = {
          name: src.querySelector(".asset-insurance-input-name")?.value || "",
          kind: src.querySelector(".asset-insurance-input-kind")?.value || "",
          contractDate: src.querySelector(".asset-insurance-input-contract-date")?.value || "",
          maturityDate: src.querySelector(".asset-insurance-input-maturity-date")?.value || "",
          monthly: src.querySelector(".asset-insurance-input-monthly")?.value || "",
          surrenderValue: src.querySelector(".asset-insurance-input-surrender")?.value || "",
          coverage: src.querySelector(".asset-insurance-input-coverage")?.value || "",
        };
        if (replaceCard) {
          const row = createInsuranceRow(d, onAssetUpdate, { suppressInlineDelete: true });
          replaceCard.replaceWith(wrapAssetDomRowAsCard(row, "보험"));
        } else appendAssetCardForGroup("보험", d);
      } else if (g === "연금") {
        const d = {
          name: src.querySelector(".asset-annuity-input-name")?.value || "",
          kind: src.querySelector(".asset-annuity-input-kind")?.value || "",
          paymentStartDate: src.querySelector(".asset-annuity-input-payment-start")?.value || "",
          paymentEndDate: src.querySelector(".asset-annuity-input-payment-end")?.value || "",
          monthly: src.querySelector(".asset-annuity-input-monthly")?.value || "",
          receiptStartDate: src.querySelector(".asset-annuity-input-receipt-start")?.value || "",
          monthlyReceipt: src.querySelector(".asset-annuity-input-monthly-receipt")?.value || "",
          surrenderValue: src.querySelector(".asset-annuity-input-surrender")?.value || "",
        };
        if (replaceCard) {
          const row = createAnnuityRow(d, onAssetUpdate, { suppressInlineDelete: true });
          replaceCard.replaceWith(wrapAssetDomRowAsCard(row, "연금"));
        } else appendAssetCardForGroup("연금", d);
      }
      closeOverlay();
      onAssetUpdate();
    }

    const footerBar = document.createElement("div");
    footerBar.className = "asset-asset-modal-footer";

    const saveOuter = document.createElement("button");
    saveOuter.type = "button";
    saveOuter.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--primary";
    saveOuter.textContent = replaceCard ? "수정" : "저장";
    saveOuter.addEventListener("click", () => {
      if (activeGroup === "부동산") {
        applyRealEstateModalSave();
        return;
      }
      const modalRow = formMount.querySelector(".asset-asset-modal-embed-table tbody tr.asset-asset-row");
      if (modalRow && typeof modalRow._flushAssetCalculationsBeforeSave === "function") {
        modalRow._flushAssetCalculationsBeforeSave();
      }
      applyNonRealEstateSave();
    });

    if (replaceCard) {
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--danger";
      delBtn.textContent = "삭제";
      delBtn.addEventListener("click", () => {
        confirmDeleteRow(() => {
          replaceCard.remove();
          closeOverlay();
          onAssetUpdate();
        });
      });
      footerBar.appendChild(delBtn);
    }
    footerBar.appendChild(saveOuter);

    function applyRealEstateModalSave() {
      const panel = realEstateModalPanel;
      if (!panel) {
        showToast("부동산 입력을 찾지 못했습니다. 탭을 다시 눌러 주세요.", "");
        return;
      }
      const d = readRealEstateDataFromTr(panel);
      if (replaceCard) {
        const row = createRealEstateRow(d, onAssetUpdate, {
          mode: "view",
          suppressInlineActions: true,
        });
        replaceCard.replaceWith(wrapAssetDomRowAsCard(row, "부동산"));
      } else {
        appendAssetCardForGroup("부동산", d);
      }
      closeOverlay();
      onAssetUpdate();
    }

    /** 부동산: 저장·수정은 모달 바닥 줄만. 패널 안쪽 버튼은 embedded 시 생략 */
    function refreshAssetModalFooterForRealEstateTabs() {
      if (activeGroup !== "부동산") {
        footerBar.style.display = "";
        saveOuter.hidden = false;
        saveOuter.style.display = "";
        saveOuter.textContent = replaceCard ? "수정" : "저장";
        return;
      }
      footerBar.style.display = "";
      saveOuter.hidden = false;
      saveOuter.style.display = "";
      saveOuter.textContent = replaceCard ? "수정" : "저장";
    }

    ASSET_GROUPS.forEach((g) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "asset-asset-modal-tab";
      b.textContent = g.label;
      b.dataset.group = g.key;
      b.classList.toggle("is-active", g.key === activeGroup);
      b.addEventListener("click", () => {
        activeGroup = g.key;
        tabStrip.querySelectorAll(".asset-asset-modal-tab").forEach((x) => {
          x.classList.toggle("is-active", x.dataset.group === activeGroup);
        });
        mountForm(activeGroup);
        refreshAssetModalFooterForRealEstateTabs();
      });
      tabStrip.appendChild(b);
    });

    if (replaceCard && editPayload) {
      tabStrip.querySelectorAll(".asset-asset-modal-tab").forEach((b) => {
        if (b.dataset.group !== editPayload.groupKey) b.hidden = true;
      });
    }

    panelShell.appendChild(headRow);
    panelShell.appendChild(tabStrip);
    panelShell.appendChild(formMount);
    panelShell.appendChild(footerBar);

    overlay.appendChild(backdrop);
    overlay.appendChild(panelShell);
    document.body.appendChild(overlay);

    mountForm(activeGroup);
    refreshAssetModalFooterForRealEstateTabs();
  }

  function createRealEstateRow(data = {}, onAssetUpdate, options = {}) {
    const mode = options.mode != null ? options.mode : "view";
    const isView = mode === "view";
    const isDraft = mode === "draft";
    const isEdit = mode === "edit";
    const assetPhantomTableRow = options.assetPhantomTableRow === true;
    const assetModalHandlers = options.assetModalHandlers || null;
    /** 순자산「자산 추가/수정」모달 안에 들어갈 때: 바깥에서 제목·닫기 제공 → 안쪽 패널 상단 줄·두 번째 × 생략 */
    const embeddedInAssetWizardModal = Boolean(assetModalHandlers);
    const suppressInlineActions = options.suppressInlineActions === true;
    const memSnapshot = isEdit
      ? options.memSnapshot
        ? { ...options.memSnapshot }
        : { ...data }
      : null;
    const inPanel = isDraft || isEdit;
    const inRowUpdate = isView ? () => {} : onAssetUpdate;
    const RE_COL = 5;

    let tr;
    if (inPanel) {
      tr = document.createElement(assetPhantomTableRow ? "tr" : "div");
    } else {
      tr = document.createElement("tr");
    }
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
      const shellShellClass = embeddedInAssetWizardModal
        ? "asset-expense-inline-panel asset-networth-inline-panel asset-real-estate-panel--embedded"
        : "asset-expense-inline-panel asset-networth-inline-panel";
      const shellHeaderBlock = embeddedInAssetWizardModal
        ? ""
        : '<div class="asset-expense-inline-panel-top">' +
          '<div class="asset-expense-inline-panel-head-text">' +
          '<span class="asset-expense-inline-panel-title">' +
          panelTitle +
          "</span>" +
          "</div>" +
          '<button type="button" class="asset-expense-inline-panel-x" aria-label="닫기">×</button>' +
          "</div>";

      const shellPanelInner =
        '<div class="' +
        shellShellClass +
        '">' +
        shellHeaderBlock +
        '<div class="asset-expense-inline-panel-body"></div>' +
        '<div class="asset-expense-inline-panel-bottom" aria-label="확인 작업"></div>' +
        "</div>";

      tr.innerHTML = assetPhantomTableRow
        ? '<td colspan="' +
          RE_COL +
          '" class="asset-asset-cell-panel">' +
          shellPanelInner +
          "</td>"
        : '<div class="asset-asset-cell-panel">' + shellPanelInner + "</div>";

      const panelBody = tr.querySelector(".asset-expense-inline-panel-body");
      panelFooter = tr.querySelector(".asset-expense-inline-panel-bottom");
      xBtn = embeddedInAssetWizardModal ? null : tr.querySelector(".asset-expense-inline-panel-x");

      const formStackPanel = document.createElement("div");
      formStackPanel.className = "asset-expense-form-stack asset-real-estate-form-stack";
      formStackPanel.setAttribute("role", "group");
      formStackPanel.setAttribute("aria-label", "부동산 입력");
      panelBody.appendChild(formStackPanel);
      dataRowTarget = formStackPanel;
    } else {
      dataRowTarget = tr;
    }

    function appendRealEstateFieldSlot(labelText, tdClass, nodeEl, slotOpts = {}) {
      const isComputedSlot = !!slotOpts.computed;
      if (inPanel) {
        const rowSlot = document.createElement("div");
        rowSlot.className = "asset-expense-form-row";
        const labSlot = document.createElement("span");
        labSlot.className = "asset-expense-form-label";
        labSlot.textContent = labelText;
        const ctlSlot = document.createElement("div");
        ctlSlot.className =
          "asset-expense-form-control asset-expense-form-control--field" +
          (isComputedSlot ? " asset-debt-panel-value--computed" : "") +
          (tdClass ? " " + tdClass : "");
        if (isComputedSlot) ctlSlot.setAttribute("data-debt-value-kind", "computed");
        if (nodeEl) ctlSlot.appendChild(nodeEl);
        rowSlot.appendChild(labSlot);
        rowSlot.appendChild(ctlSlot);
        dataRowTarget.appendChild(rowSlot);
        return ctlSlot;
      }
      const td = document.createElement("td");
      if (tdClass) td.className = tdClass;
      if (nodeEl) td.appendChild(nodeEl);
      dataRowTarget.appendChild(td);
      return td;
    }

    const contractInput = document.createElement("input");
    contractInput.type = "text";
    contractInput.className = "asset-asset-input-contract";
    contractInput.value = data.contract || "";
    contractInput.placeholder = "예: ○○동 101호";
    bindNetWorthTextInput(contractInput, inRowUpdate);
    contractInput.addEventListener("keydown", (e) => e.key === "Enter" && !e.isComposing && contractInput.blur());
    appendRealEstateFieldSlot("계약 대상", "asset-asset-cell-contract", contractInput);

    const propertyTypeSelect = document.createElement("select");
    propertyTypeSelect.className = "asset-real-estate-input-property-type";
    propertyTypeSelect.setAttribute("aria-label", "부동산 유형");
    const propOpts = [
      ["", "유형 선택 (세금 계산 방식 참고)"],
      ["apartment", "아파트"],
      ["villa", "빌라·연립·다세대"],
      ["officetel", "오피스텔"],
      ["retail", "상가·사무실"],
      ["land", "토지"],
      ["other", "기타"],
    ];
    propOpts.forEach(([val, lab]) => {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = lab;
      propertyTypeSelect.appendChild(o);
    });
    propertyTypeSelect.value = data.propertyType && propOpts.some(([v]) => v === data.propertyType) ? data.propertyType : "";
    propertyTypeSelect.addEventListener("change", () => {
      inRowUpdate();
    });
    appendRealEstateFieldSlot("부동산 유형", "asset-asset-cell-re-property-type", propertyTypeSelect);

    const acquisitionDateInput = document.createElement("input");
    acquisitionDateInput.type = "date";
    acquisitionDateInput.className = "asset-real-estate-input-acquisition-date";
    acquisitionDateInput.value = data.acquisitionDate || "";
    acquisitionDateInput.addEventListener("change", () => {
      updateAssetValueDisplay();
      inRowUpdate();
    });
    appendRealEstateFieldSlot("취득일", "asset-asset-cell-re-acquisition", acquisitionDateInput);

    const salePriceInput = document.createElement("input");
    salePriceInput.type = "text";
    salePriceInput.className = "asset-asset-input-sale-price";
    salePriceInput.value = data.salePrice ? (formatNum(data.salePrice) || data.salePrice) : "";
    salePriceInput.placeholder = "현재 시세(원)";
    salePriceInput.addEventListener("input", (e) =>
      filterNumericInput(salePriceInput, false, e, { ignoreIMEComposition: true })
    );
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
    appendRealEstateFieldSlot("매매가(시세)", "asset-asset-cell-sale-price", salePriceInput);

    const purchasePriceInput = document.createElement("input");
    purchasePriceInput.type = "text";
    purchasePriceInput.className = "asset-real-estate-input-purchase-price";
    purchasePriceInput.value = data.purchasePrice ? (formatNum(data.purchasePrice) || data.purchasePrice) : "";
    purchasePriceInput.placeholder = "선택 · 평가 손익용";
    purchasePriceInput.addEventListener("input", (e) =>
      filterNumericInput(purchasePriceInput, false, e, { ignoreIMEComposition: true })
    );
    purchasePriceInput.addEventListener("input", () => {
      updateAssetValueDisplay();
      inRowUpdate();
    });
    purchasePriceInput.addEventListener("blur", () => {
      const formatted = formatNum(purchasePriceInput.value);
      if (formatted !== "") purchasePriceInput.value = formatted;
      updateAssetValueDisplay();
      inRowUpdate();
    });
    purchasePriceInput.addEventListener("keydown", (e) => e.key === "Enter" && purchasePriceInput.blur());
    appendRealEstateFieldSlot("매입가(취득가액)", "asset-asset-cell-re-purchase", purchasePriceInput);

    const areaSqmInput = document.createElement("input");
    areaSqmInput.type = "text";
    areaSqmInput.className = "asset-real-estate-input-area-sqm";
    areaSqmInput.value = data.areaSqm ? (formatNum(data.areaSqm) || data.areaSqm) : "";
    areaSqmInput.placeholder = "선택 · ㎡";
    areaSqmInput.addEventListener("input", (e) =>
      filterNumericInput(areaSqmInput, false, e, { ignoreIMEComposition: true })
    );
    areaSqmInput.addEventListener("input", () => inRowUpdate());
    areaSqmInput.addEventListener("blur", () => {
      const formatted = formatNum(areaSqmInput.value);
      if (formatted !== "") areaSqmInput.value = formatted;
      inRowUpdate();
    });
    areaSqmInput.addEventListener("keydown", (e) => e.key === "Enter" && areaSqmInput.blur());
    appendRealEstateFieldSlot("면적(㎡)", "asset-asset-cell-re-area", areaSqmInput);

    const loanInput = document.createElement("input");
    loanInput.type = "text";
    loanInput.className = "asset-asset-input-loan";
    loanInput.value = data.loan ? (formatNum(data.loan) || data.loan) : "";
    loanInput.placeholder = "담보 대출 잔액";
    loanInput.addEventListener("input", (e) =>
      filterNumericInput(loanInput, false, e, { ignoreIMEComposition: true })
    );
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
    appendRealEstateFieldSlot("대출금(잔액)", "asset-asset-cell-loan", loanInput);

    const occupancySelect = document.createElement("select");
    occupancySelect.className = "asset-real-estate-input-occupancy";
    occupancySelect.setAttribute("aria-label", "거주·임대");
    [
      ["owner", "직접 거주"],
      ["landlord", "임대 중(세입자·보증금 차감)"],
      ["tenant", "전·월세 거주(보증금만 자산)"],
    ].forEach(([val, lab]) => {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = lab;
      occupancySelect.appendChild(o);
    });
    const occInit = data.occupancy;
    occupancySelect.value =
      occInit === "landlord" || occInit === "tenant" || occInit === "owner" ? occInit : "owner";
    occupancySelect.addEventListener("change", () => {
      syncLeaseDepositVisibility();
      updateAssetValueDisplay();
      inRowUpdate();
    });
    appendRealEstateFieldSlot("거주·임대", "asset-asset-cell-re-occupancy", occupancySelect);

    const leaseDepositInput = document.createElement("input");
    leaseDepositInput.type = "text";
    leaseDepositInput.className = "asset-real-estate-input-lease-deposit";
    leaseDepositInput.value = data.leaseDeposit ? (formatNum(data.leaseDeposit) || data.leaseDeposit) : "";
    leaseDepositInput.placeholder = "숫자만";
    leaseDepositInput.addEventListener("input", (e) =>
      filterNumericInput(leaseDepositInput, false, e, { ignoreIMEComposition: true })
    );
    leaseDepositInput.addEventListener("input", () => {
      updateAssetValueDisplay();
      inRowUpdate();
    });
    leaseDepositInput.addEventListener("blur", () => {
      const formatted = formatNum(leaseDepositInput.value);
      if (formatted !== "") leaseDepositInput.value = formatted;
      updateAssetValueDisplay();
      inRowUpdate();
    });
    leaseDepositInput.addEventListener("keydown", (e) => e.key === "Enter" && leaseDepositInput.blur());
    appendRealEstateFieldSlot("보증금", "asset-asset-cell-re-lease-deposit", leaseDepositInput);

    const monthlyRentInput = document.createElement("input");
    monthlyRentInput.type = "text";
    monthlyRentInput.className = "asset-real-estate-input-monthly-rent";
    monthlyRentInput.value = data.monthlyRent ? (formatNum(data.monthlyRent) || data.monthlyRent) : "";
    monthlyRentInput.placeholder = "선택 · 월세액";
    monthlyRentInput.addEventListener("input", (e) =>
      filterNumericInput(monthlyRentInput, false, e, { ignoreIMEComposition: true })
    );
    monthlyRentInput.addEventListener("input", () => inRowUpdate());
    monthlyRentInput.addEventListener("blur", () => {
      const formatted = formatNum(monthlyRentInput.value);
      if (formatted !== "") monthlyRentInput.value = formatted;
      inRowUpdate();
    });
    monthlyRentInput.addEventListener("keydown", (e) => e.key === "Enter" && monthlyRentInput.blur());
    appendRealEstateFieldSlot("월세(참고)", "asset-asset-cell-re-monthly-rent", monthlyRentInput);

    const holdingPeriodDisplay = document.createElement("span");
    holdingPeriodDisplay.className = "asset-real-estate-holding-period-display";
    appendRealEstateFieldSlot("보유 기간", "asset-asset-cell-re-holding", holdingPeriodDisplay, { computed: true });

    const gainLossDisplay = document.createElement("span");
    gainLossDisplay.className = "asset-real-estate-gain-loss-display";
    appendRealEstateFieldSlot("평가 손익(시세−매입)", "asset-asset-cell-re-gain", gainLossDisplay, { computed: true });

    const assetValueDisplay = document.createElement("span");
    assetValueDisplay.className = "asset-asset-asset-value-display";

    function syncLeaseDepositVisibility() {
      const m = occupancySelect.value;
      const leaseLab =
        m === "landlord"
          ? "임대 보증금(회수 예정)"
          : m === "tenant"
            ? "낸 보증금(전·월세)"
            : "보증금";
      const leaseRow =
        leaseDepositInput.closest(".asset-expense-form-row") || leaseDepositInput.closest("td");
      const monthlyRow =
        monthlyRentInput.closest(".asset-expense-form-row") || monthlyRentInput.closest("td");
      const labEl = leaseRow?.querySelector?.(".asset-expense-form-label");
      if (labEl) labEl.textContent = leaseLab;
      const showLease = m === "landlord" || m === "tenant";
      if (leaseRow) {
        leaseRow.hidden = !showLease;
        leaseRow.setAttribute("aria-hidden", showLease ? "false" : "true");
      }
      if (monthlyRow) {
        const showMonthly = m === "landlord";
        monthlyRow.hidden = !showMonthly;
        monthlyRow.setAttribute("aria-hidden", showMonthly ? "false" : "true");
      }
      leaseDepositInput.disabled = m === "owner";
      monthlyRentInput.disabled = m !== "landlord";
    }

    function updateAssetValueDisplay() {
      const occ = occupancySelect.value;
      const val = computeRealEstateNetFromInputs(
        salePriceInput.value,
        loanInput.value,
        leaseDepositInput.value,
        occ,
      );
      assetValueDisplay.textContent = val !== null && !Number.isNaN(val) ? `${formatNum(val)}원` : "";
      assetValueDisplay.classList.toggle(
        "asset-real-estate-asset-value--negative",
        val !== null && !Number.isNaN(val) && val < 0,
      );

      const hp = formatRealEstateHoldingPeriod(acquisitionDateInput.value);
      const monthsHeld = holdMonthCount(acquisitionDateInput.value);
      holdingPeriodDisplay.textContent = hp
        ? `${hp}${monthsHeld >= 24 ? " · 2년 이상 보유(양도세 참고)" : ""}`
        : acquisitionDateInput.value
          ? ""
          : "취득일 입력 시 계산";

      const sale = parseNum(salePriceInput.value);
      const pur = parseNum(purchasePriceInput.value);
      if (pur !== null && sale !== null) {
        const g = sale - pur;
        gainLossDisplay.textContent =
          g === 0 ? "0원" : `${g > 0 ? "+" : ""}${formatNum(g)}원`;
      } else {
        gainLossDisplay.textContent = "매입가·시세 입력 시";
      }
    }

    function holdMonthCount(dateStr) {
      const d0 = parseDate(dateStr);
      if (!d0) return 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const d = new Date(d0.getTime());
      d.setHours(0, 0, 0, 0);
      if (today < d) return 0;
      let months =
        (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
      if (today.getDate() < d.getDate()) months -= 1;
      return Math.max(0, months);
    }

    syncLeaseDepositVisibility();
    updateAssetValueDisplay();
    appendRealEstateFieldSlot("순자산가치(자동)", "asset-asset-cell-asset-value", assetValueDisplay, { computed: true });

    if (inPanel) {
      const doCancel = (e) => {
        e?.stopPropagation?.();
        if (assetModalHandlers?.onCancel) {
          assetModalHandlers.onCancel();
          return;
        }
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
        if (embeddedInAssetWizardModal) {
          panelFooter.replaceChildren();
          panelFooter.style.display = "none";
        } else if (isDraft) {
          const saveBtn = document.createElement("button");
          saveBtn.type = "button";
          saveBtn.className = "asset-expense-inline-panel-btn asset-expense-inline-panel-btn--primary";
          saveBtn.textContent = "저장";
          saveBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const pane =
              e.currentTarget.closest(".asset-expense-inline-panel") ||
              tr.querySelector(".asset-expense-inline-panel") ||
              tr;
            const d = readRealEstateDataFromTr(pane);
            if (assetModalHandlers?.onSave) {
              assetModalHandlers.onSave(d);
              return;
            }
            tr.replaceWith(createRealEstateRow(d, onAssetUpdate, { mode: "view" }));
            onAssetUpdate();
          });
          const footInner = document.createElement("div");
          footInner.className = "asset-expense-inline-panel-bottom-inner";
          footInner.appendChild(saveBtn);
          panelFooter.appendChild(footInner);
          panelFooter.style.display = "";
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
            if (assetModalHandlers?.onDelete) {
              assetModalHandlers.onDelete();
              return;
            }
            confirmDeleteRow(() => {
              tr.remove();
              onAssetUpdate();
            });
          });
          applyBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const pane =
              e.currentTarget.closest(".asset-expense-inline-panel") ||
              tr.querySelector(".asset-expense-inline-panel") ||
              tr;
            const d = readRealEstateDataFromTr(pane);
            if (assetModalHandlers?.onSave) {
              assetModalHandlers.onSave(d);
              return;
            }
            tr.replaceWith(createRealEstateRow(d, onAssetUpdate, { mode: "view" }));
            onAssetUpdate();
          });
          const footInner = document.createElement("div");
          footInner.className = "asset-expense-inline-panel-bottom-inner";
          footInner.appendChild(delBtn2);
          footInner.appendChild(applyBtn);
          panelFooter.appendChild(footInner);
          panelFooter.style.display = "";
        }
      }
    } else if (!suppressInlineActions) {
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

  function createStockRow(data = {}, onAssetUpdate, options = {}) {
    const suppressInlineDelete = options.suppressInlineDelete === true;
    const hideNwFloat = options.assetNetworthFloatingModal === true;
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

    const avgPriceTd = document.createElement("td");
    avgPriceTd.className = "asset-stock-cell-avg-price";
    const avgPriceInput = document.createElement("input");
    avgPriceInput.type = "text";
    avgPriceInput.className = "asset-stock-input-avg-price";
    avgPriceInput.value = data.avgPrice ? (formatNum(data.avgPrice) || data.avgPrice) : "";
    avgPriceInput.placeholder = "-";
    avgPriceInput.addEventListener("input", (e) =>
      filterNumericInput(avgPriceInput, true, e, { ignoreIMEComposition: true })
    );
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
    quantityInput.addEventListener("input", (e) =>
      filterNumericInput(quantityInput, false, e, { ignoreIMEComposition: true })
    );
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
    currentPriceInput.placeholder = "직접 입력";
    currentPriceInput.addEventListener("input", (e) =>
      filterNumericInput(currentPriceInput, true, e, { ignoreIMEComposition: true })
    );
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

    if (hideNwFloat) {
      purchaseAmtTd.hidden = true;
      appraisalAmtTd.hidden = true;
      returnRateTd.hidden = true;
      profitLossTd.hidden = true;
    }

    function updateStockCalculations() {
      const avg = parseNum(avgPriceInput.value);
      const qty = parseNum(quantityInput.value);
      const curRaw = (currentPriceInput.value ?? "").trim();
      const hasCurrentPrice = curRaw !== "";
      const current = hasCurrentPrice ? parseNum(currentPriceInput.value) : null;
      const purchaseAmt = avg !== null && qty !== null && qty > 0 ? avg * qty : null;
      const appraisalAmt =
        current !== null && qty !== null && qty > 0 ? current * qty : null;
      const profitLoss = purchaseAmt !== null && appraisalAmt !== null ? appraisalAmt - purchaseAmt : null;
      const returnRate = purchaseAmt !== null && purchaseAmt > 0 && profitLoss !== null
        ? (profitLoss / purchaseAmt) * 100 : null;
      let basis = "none";
      if (appraisalAmt !== null) basis = "appraisal";
      else if (purchaseAmt !== null && purchaseAmt > 0) basis = "purchase";
      tr.dataset.assetStockNetWorthBasis = basis;
      tr.classList.toggle("asset-asset-row-stock--no-current-price", basis === "purchase");
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

    /** 순자산 모달 «수정»: 저장 클릭 직전 재계산 — 블러 없이 눌렀을 때도 반영 */
    tr._flushAssetCalculationsBeforeSave = () => {
      updateStockCalculations();
    };

    if (!suppressInlineDelete) {
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
    }

    return tr;
  }

  function createInsuranceRow(data = {}, onAssetUpdate, options = {}) {
    const suppressInlineDelete = options.suppressInlineDelete === true;
    const hideNwFloat = options.assetNetworthFloatingModal === true;
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
      input.addEventListener("input", (e) => {
        filterNumericInput(input, false, e, { ignoreIMEComposition: true });
        onAssetUpdate();
      });
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
    if (hideNwFloat) totalPaidTd.hidden = true;

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

    tr._flushAssetCalculationsBeforeSave = () => {
      updateTotalPaid();
    };

    addNumInputTd("asset-insurance-input-surrender", data.surrenderValue);
    addTextInputTd("asset-insurance-input-coverage", data.coverage);

    if (!suppressInlineDelete) {
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
    }
    return tr;
  }

  function createAnnuityRow(data = {}, onAssetUpdate, options = {}) {
    const suppressInlineDelete = options.suppressInlineDelete === true;
    const hideNwFloat = options.assetNetworthFloatingModal === true;
    const tr = document.createElement("tr");
    tr.className = "asset-asset-row asset-asset-row-annuity";
    tr.dataset.annuity = "true";

    const addNumInputTd = (cls, val, placeholder = "-", allowDecimal = false, tdClass = "") => {
      const td = document.createElement("td");
      if (tdClass) td.className = tdClass;
      const input = document.createElement("input");
      input.type = "text";
      input.className = cls;
      input.value = val ? (formatNum(val) || val) : "";
      input.placeholder = placeholder;
      input.addEventListener("input", (e) =>
        filterNumericInput(input, allowDecimal, e, { ignoreIMEComposition: true })
      );
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
    const addTextInputTd = (cls, val, placeholder = "-", tdClass = "") => {
      const td = document.createElement("td");
      if (tdClass) td.className = tdClass;
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

    addTextInputTd("asset-annuity-input-name", data.name, "", "asset-annuity-cell-name");
    addTextInputTd("asset-annuity-input-kind", data.kind || "", "-", "asset-annuity-cell-kind");
    addNumInputTd("asset-annuity-input-surrender", data.surrenderValue, "-", false, "asset-annuity-cell-surrender");
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
    if (hideNwFloat) {
      paymentYearsTd.hidden = true;
      totalPaidTd.hidden = true;
    }

    const receiptStartInput = addDateInputTd("asset-annuity-input-receipt-start", data.receiptStartDate);
    const monthlyReceiptInput = addNumInputTd(
      "asset-annuity-input-monthly-receipt",
      data.monthlyReceipt,
      "-",
      true
    );

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

    tr._flushAssetCalculationsBeforeSave = () => {
      updateAnnuityCalc();
    };

    if (!suppressInlineDelete) {
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
    }
    return tr;
  }

  function createAssetRow(data = {}, onAssetUpdate, isSavings = false, savingsDefaultType = "예적금잔고", isDeposit = false, options = {}) {
    const suppressInlineDelete = options.suppressInlineDelete === true;
    const hideNwFloatMeasures = options.assetNetworthFloatingModal === true;
    const tr = document.createElement("tr");
    tr.className = "asset-asset-row";
    if (isSavings) tr.dataset.savings = "true";
    if (isSavings || isDeposit) {
      tr.dataset.matured = data.matured ? "true" : "false";
      tr.dataset.withdrawn = data.withdrawn ? "true" : "false";
    }

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

    if (isDeposit) {
      tr.classList.add("asset-asset-row--deposit");
      if (hideNwFloatMeasures) {
        const typeHiddenDeposit = document.createElement("input");
        typeHiddenDeposit.type = "hidden";
        typeHiddenDeposit.className = "asset-asset-input-type";
        typeHiddenDeposit.value =
          (data.assetType && String(data.assetType).trim()) || "CMA";
        typeHiddenDeposit.name = "assetType";
        nameTd.appendChild(typeHiddenDeposit);
      }
    } else if (isSavings) {
      const typeHidden = document.createElement("input");
      typeHidden.type = "hidden";
      typeHidden.className = "asset-asset-input-type";
      typeHidden.value = data.assetType || savingsDefaultType;
      typeHidden.name = "assetType";
      nameTd.appendChild(typeHidden);
    }

    if (!isSavings) {
      const assetTypeTd = document.createElement("td");
      assetTypeTd.className = "asset-asset-cell-type";
      assetTypeTd.appendChild(createAssetTypeDropdown(data.assetType || "", onAssetUpdate));
      if (!(hideNwFloatMeasures && isDeposit)) {
        tr.appendChild(assetTypeTd);
      }
    }

    const principalTd = document.createElement("td");
    principalTd.className = "asset-asset-cell-principal";
    const principalInput = document.createElement("input");
    principalInput.type = "text";
    principalInput.className = "asset-asset-input-principal";
    principalInput.value = data.principal ? (formatNum(data.principal) || data.principal) : "";
    principalInput.placeholder = "-";
    principalInput.addEventListener("input", (e) =>
      filterNumericInput(principalInput, false, e, { ignoreIMEComposition: true })
    );
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
      const rateEl = tr.querySelector(".asset-asset-maturity-rate-display");
      if (rateEl) {
        const pr = calcMaturityRate(openDateInput?.value, maturityDateInput?.value);
        rateEl.textContent = pr !== null ? `${pr}%` : "";
      }
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

    const nwModalSavPair = hideNwFloatMeasures === true && isSavings === true && isDeposit !== true;
    /** 순자산 떠 있는 모달: 월 불입과 약정 개월을 한 줄 그리드에 두기 위해 DOM 순서를 붙입니다. */
    let monthlyTd;
    let monthlyInput;
    if (!isDeposit) {
      monthlyTd = document.createElement("td");
      monthlyTd.className = "asset-asset-cell-monthly";
      monthlyInput = document.createElement("input");
      monthlyInput.type = "text";
      monthlyInput.className = "asset-asset-input-monthly";
      monthlyInput.value = data.monthly ? (formatNum(data.monthly) || data.monthly) : "";
      monthlyInput.placeholder = "-";
      monthlyInput.addEventListener("input", (e) =>
        filterNumericInput(monthlyInput, false, e, { ignoreIMEComposition: true })
      );
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
      const monthlySuffixWrap = document.createElement("div");
      monthlySuffixWrap.className = "asset-debt-input-suffix-wrap";
      monthlySuffixWrap.appendChild(monthlyInput);
      const monthlyUnit = document.createElement("span");
      monthlyUnit.className = "asset-debt-input-suffix-unit";
      monthlyUnit.setAttribute("aria-hidden", "true");
      monthlyUnit.textContent = "원";
      monthlySuffixWrap.appendChild(monthlyUnit);
      monthlyTd.appendChild(monthlySuffixWrap);
      if (!nwModalSavPair) tr.appendChild(monthlyTd);
    }

    function getTotalMonths() {
      if (!monthsInput) return null;
      const m = parseNum(monthsInput?.value);
      if (m !== null && m > 0) return m;
      const open = parseDate(openDateInput?.value);
      const maturity = parseDate(maturityDateInput?.value);
      if (!open || !maturity || maturity <= open) return null;
      const openZ = new Date(open.getTime());
      openZ.setHours(0, 0, 0, 0);
      const matZ = new Date(maturity.getTime());
      matZ.setHours(0, 0, 0, 0);
      const months = calendarMonthsCompleted(openZ, matZ);
      if (months === null || months <= 0) return null;
      return months;
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
    rateInput.title = isSavings
      ? "연 금리, 퍼센트 숫자만 (4.2 = 4.2%). 월할 단리 참고이며 은행 약정과 다를 수 있습니다."
      : isDeposit
        ? "연 단리 참고. 개설~만기 일수 기준 표시, 실제 약정과 다를 수 있습니다."
        : "";
    rateInput.addEventListener("input", (e) =>
      filterNumericInput(rateInput, true, e, { ignoreIMEComposition: true })
    );
    rateInput.addEventListener("input", () => {
      if (isDeposit) updateDepositMaturityAmt();
      else {
        updatePrincipalFromCalc();
        updateInterestAndMaturityAmt();
      }
      onAssetUpdate();
    });
    rateInput.addEventListener("keydown", (e) => e.key === "Enter" && rateInput.blur());
    if (isDeposit) {
      const rateWrap = document.createElement("div");
      rateWrap.className = "asset-debt-input-suffix-wrap";
      rateWrap.appendChild(rateInput);
      const rateUnit = document.createElement("span");
      rateUnit.className = "asset-debt-input-suffix-unit";
      rateUnit.setAttribute("aria-hidden", "true");
      rateUnit.textContent = "%";
      rateWrap.appendChild(rateUnit);
      rateTd.appendChild(rateWrap);
    } else {
      rateTd.appendChild(rateInput);
    }
    if (!nwModalSavPair) tr.appendChild(rateTd);

    let monthsTd;
    let monthsInput;
    if (!isDeposit) {
      monthsTd = document.createElement("td");
      monthsTd.className = "asset-asset-cell-months";
      monthsInput = document.createElement("input");
      monthsInput.type = "text";
      monthsInput.className = "asset-asset-input-months";
      monthsInput.value = data.months ?? "";
      monthsInput.placeholder = "-";
      monthsInput.addEventListener("input", (e) =>
        filterNumericInput(monthsInput, false, e, { ignoreIMEComposition: true })
      );
      monthsInput.addEventListener("input", () => {
        syncSavingsMaturityFromOpenAndMonths();
        updatePrincipalFromCalc();
        updateInterestAndMaturityAmt();
        onAssetUpdate();
      });
      monthsInput.addEventListener("keydown", (e) => e.key === "Enter" && monthsInput.blur());
      const monthsSuffixWrap = document.createElement("div");
      monthsSuffixWrap.className = "asset-debt-input-suffix-wrap";
      monthsSuffixWrap.appendChild(monthsInput);
      const monthsUnit = document.createElement("span");
      monthsUnit.className = "asset-debt-input-suffix-unit";
      monthsUnit.setAttribute("aria-hidden", "true");
      monthsUnit.textContent = "개월";
      monthsSuffixWrap.appendChild(monthsUnit);
      monthsTd.appendChild(monthsSuffixWrap);
      if (!nwModalSavPair) tr.appendChild(monthsTd);
    }

    if (nwModalSavPair && monthlyTd && monthsTd && rateTd) {
      tr.appendChild(monthlyTd);
      tr.appendChild(monthsTd);
      tr.appendChild(rateTd);
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
    if (isDeposit || isSavings) {
      openDateTd.title = "개설일이 없으면 납입 진행률·이자 참고값이 비어 있을 수 있습니다.";
    }
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
      const openStr = openDateInput.value?.trim();
      const m = parseNum(monthsInput.value);
      if (!openStr || m === null || m <= 0) return;
      const out = addCalendarMonthsClamped(openStr, Math.floor(m));
      if (out) {
        maturityDateInput.value = out;
        refreshMaturityDate();
      }
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
    if (hideNwFloatMeasures && !isDeposit) maturityRateTd.hidden = true;

    const interestTd = document.createElement("td");
    interestTd.className = "asset-asset-cell-interest";
    const interestDisplay = document.createElement("span");
    interestDisplay.className = "asset-asset-interest-display";
    interestDisplay.textContent = "";
    interestTd.appendChild(interestDisplay);
    tr.appendChild(interestTd);
    if (hideNwFloatMeasures && !isDeposit) interestTd.hidden = true;

    if (deferPrincipalToBeforeMaturityAmt) {
      tr.appendChild(principalTd);
      if (hideNwFloatMeasures) principalTd.hidden = true;
    }

    const maturityAmtTd = document.createElement("td");
    maturityAmtTd.className = "asset-asset-cell-maturity-amt";
    const maturityAmtDisplay = document.createElement("span");
    maturityAmtDisplay.className = "asset-asset-maturity-amt-display";
    maturityAmtDisplay.textContent = "";
    if (isDeposit || isSavings) {
      interestDisplay.title = "참고용 추정 이자입니다. 은행 약정과 다를 수 있습니다.";
      maturityAmtDisplay.title = "참고용 만기예상입니다. 은행 약정과 다를 수 있습니다.";
    }
    maturityAmtTd.appendChild(maturityAmtDisplay);
    tr.appendChild(maturityAmtTd);
    if (hideNwFloatMeasures && !isDeposit) maturityAmtTd.hidden = true;

    if (isDeposit) updateDepositMaturityAmt();
    else {
      if (monthsInput && openDateInput.value && monthsInput.value && !maturityDateInput.value) {
        syncSavingsMaturityFromOpenAndMonths();
      }
      updatePrincipalFromCalc();
      updateInterestAndMaturityAmt();
    }

    tr._flushAssetCalculationsBeforeSave = () => {
      if (isDeposit) {
        updateDepositMaturityAmt();
        return;
      }
      if (isSavings && monthsInput && openDateInput.value && monthsInput.value) {
        syncSavingsMaturityFromOpenAndMonths();
      }
      if (principalTd.hidden) {
        updatePrincipalFromCalc();
      }
      updateInterestAndMaturityAmt();
    };

    if (!suppressInlineDelete) {
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
    }

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
    /* 그룹별 표 합계 제거: 순자산 합계는 updateNetWorthDashboard에서 산출 */
  }

  updateNetWorthDashboard = () => {
    let sumAssets = 0;
    const includeInterest =
      assetSection.querySelector(".asset-networth-dashboard-include-deposit-interest")?.checked === true;
    assetTableWrap.querySelectorAll(".asset-asset-row:not(.asset-asset-row-real-estate):not(.asset-asset-row-stock):not(.asset-asset-row-insurance):not(.asset-asset-row-annuity)").forEach((tr) => {
      const isDep = tr.classList.contains("asset-asset-row--deposit");
      const isSav = tr.dataset.savings === "true";
      if (isDep || isSav) {
        sumAssets += getDepositLikeAmountForNetWorth(tr, includeInterest);
        return;
      }
      const p = parseNum(tr.querySelector(".asset-asset-input-principal")?.value);
      if (p !== null) sumAssets += p;
    });
    assetTableWrap.querySelectorAll(".asset-asset-row-real-estate").forEach((tr) => {
      const occ = tr.querySelector(".asset-real-estate-input-occupancy")?.value || "owner";
      const net = computeRealEstateNetFromInputs(
        tr.querySelector(".asset-asset-input-sale-price")?.value,
        tr.querySelector(".asset-asset-input-loan")?.value,
        tr.querySelector(".asset-real-estate-input-lease-deposit")?.value ?? "",
        occ,
      );
      if (net !== null && !Number.isNaN(net)) sumAssets += net;
    });
    assetTableWrap.querySelectorAll(".asset-asset-row-stock").forEach((tr) => {
      const basis = tr.dataset.assetStockNetWorthBasis || "";
      const appraisal = parseNum(tr.querySelector(".asset-stock-appraisal-amt-display")?.textContent);
      const purchase = parseNum(tr.querySelector(".asset-stock-purchase-amt-display")?.textContent);
      if (basis === "appraisal" && appraisal !== null) {
        sumAssets += appraisal;
      } else if (basis === "purchase" && purchase !== null) {
        sumAssets += purchase;
      } else if (appraisal !== null) {
        sumAssets += appraisal;
      } else if (purchase !== null) {
        sumAssets += purchase;
      }
    });
    assetTableWrap.querySelectorAll(".asset-asset-row-insurance").forEach((tr) => {
      const surrender = parseNum(tr.querySelector(".asset-insurance-input-surrender")?.value);
      if (surrender !== null) sumAssets += surrender;
    });
    assetTableWrap.querySelectorAll(".asset-asset-row-annuity").forEach((tr) => {
      const sur = parseNum(tr.querySelector(".asset-annuity-input-surrender")?.value);
      const totalPaid = parseNum(tr.querySelector(".asset-annuity-total-paid-display")?.textContent);
      const forNet = sur !== null ? sur : totalPaid;
      if (forNet !== null) sumAssets += forNet;
    });
    let sumDebt = 0;
    cardsList.querySelectorAll(".asset-debt-row.asset-debt-row--view").forEach((tr) => {
      const balanceEl = tr.querySelector(".asset-debt-balance-display");
      const balance = parseNum(balanceEl?.textContent);
      if (balance !== null) sumDebt += balance;
    });
    const netWorth = sumAssets - sumDebt;
    if (assetsValueEl) {
      assetsValueEl.textContent = sumAssets !== 0 ? formatNum(sumAssets) : "-";
      assetsValueEl.classList.toggle("asset-networth-dashboard-formula-value--negative", sumAssets < 0);
      setNetworthDashboardKoLine(assetsKoEl, sumAssets);
    }
    if (debtValueEl) {
      debtValueEl.textContent = sumDebt !== 0 ? formatNum(sumDebt) : "-";
      setNetworthDashboardKoLine(debtKoEl, sumDebt);
    }
    netWorthValueEl.textContent = netWorth !== 0 ? formatNum(netWorth) : "-";
    netWorthValueEl.classList.toggle("asset-networth-dashboard-formula-value--negative", netWorth < 0);
    setNetworthDashboardKoLine(netKoEl, netWorth);

    const targetVal = parseNum(targetInput.value);
    setNetworthDashboardKoLine(targetKoEl, targetVal !== null && targetVal > 0 ? targetVal : null);
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
      const withdrawn = tr.dataset.withdrawn === "true";
      let show;
      if (tab === "in-progress") {
        show = !matured && !withdrawn;
      } else {
        show = matured || withdrawn;
      }
      tr.style.display = show ? "" : "none";
    });
    tabsEl.querySelectorAll(".asset-asset-tab-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.tab === tab);
    });
  }

  /** 예·적금·부동산·주식·보험·연금 셀 변경·카드 수정 시 호출 → saveAssets + 화면 갱신 */
  onAssetUpdate = () => {
    updateAllMaturityRates();
    saveAssets();
    updateAssetCount();
    updateAssetTotals();
    assetTableWrap.querySelectorAll(".asset-asset-card").forEach((c) => paintAssetCard(c));
    updateNetWorthDashboard();
  };

  loadAssetRows().forEach((row) => {
    const assetType = row.assetType || "";
    if (assetType === "부동산" || assetType === "부동산 전월세 보증금") return;
    appendAssetCardForGroup(getAssetGroup(assetType), row);
  });
  loadRealEstateRows().forEach((row) => appendAssetCardForGroup("부동산", row));
  loadStockRows().forEach((row) => appendAssetCardForGroup("주식", row));
  loadInsuranceRows().forEach((row) => appendAssetCardForGroup("보험", row));
  loadAnnuityRows().forEach((row) => appendAssetCardForGroup("연금", row));

  function updateAssetCount() {
    const n = assetTableWrap.querySelectorAll(".asset-asset-card").length;
    assetHeader.querySelector(".asset-asset-count").textContent = n ? `${n}건` : "0건";
  }

  assetHeader.querySelector(".asset-asset-add-inline-btn")?.addEventListener("click", () =>
    openAssetNetworthModal({}),
  );

  assetSection.appendChild(assetHeader);
  assetSection.appendChild(assetDepositNwOpts);
  assetSection.appendChild(assetTableWrap);

  updateAssetCount();
  updateAllMaturityRates();
  updateAssetTotals();
  updateNetWorthDashboard();
  wrap.appendChild(assetSection);

  return wrap;
}

/** 시작일(yyyy-mm-dd)이 속한 달에서 ±delta달 이동한 달의 1일~말일 (가계부·현금흐름 월 네비 공통) */
function shiftExpenseCalendarMonthBounds(anchorYmd, deltaMonths) {
  const s = String(anchorYmd ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [yStr, moStr] = s.split("-");
  const y0 = Number(yStr);
  const m0 = Number(moStr);
  if (!Number.isFinite(y0) || !Number.isFinite(m0)) return null;
  const anchor = new Date(y0, m0 - 1 + deltaMonths, 1);
  const y = anchor.getFullYear();
  const mo = anchor.getMonth() + 1;
  const pad = (n) => String(n).padStart(2, "0");
  const lastDay = new Date(y, mo, 0).getDate();
  return { start: `${y}-${pad(mo)}-01`, end: `${y}-${pad(mo)}-${pad(lastDay)}` };
}

function renderExpenseView(options = {}) {
  const expenseMobile =
    typeof window !== "undefined" && window.matchMedia("(max-width: 48rem)").matches;

  const wrap = document.createElement("div");
  wrap.className =
    "asset-expense-view" + (expenseMobile ? " asset-expense-view--mobile" : "");

  const now = new Date();
  const pad2Ym = (n) => String(n).padStart(2, "0");
  const _fy = now.getFullYear();
  const _fm = now.getMonth() + 1;
  let filterStartDate = `${_fy}-${pad2Ym(_fm)}-01`;
  let filterEndDate = `${_fy}-${pad2Ym(_fm)}-${pad2Ym(new Date(_fy, _fm, 0).getDate())}`;

  let expenseFilterPullTimer = null;
  /** 날짜·월 필터에 맞는 구간만 서버에서 받아 표 갱신 */
  let scheduleExpenseMemPullFromServer = () => {};

  /** YYYY-MM-DD → "2026. 05. 14.(목)" — 시간가계부 필터와 동일 표기 */
  function formatExpenseFilterDateDotsWithWeekday(dStr) {
    if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
    const [y, mo, d] = dStr.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const yy = String(y);
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${yy}. ${mm}. ${dd}(${weekdays[dt.getDay()]})`;
  }

  const filterBar = document.createElement("div");
  filterBar.className = "asset-expense-filter-bar";
  filterBar.innerHTML = `
    <div class="asset-expense-filter-add-row time-ledger-filter-add-row">
      <div class="time-filter-bar">
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
          <div class="time-filter-day-nav asset-expense-month-shift-nav">
            <button type="button" class="time-filter-day-prev" aria-label="이전 월">
              <img src="/toolbaricons/caret-left-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
            </button>
            <button type="button" class="time-filter-day-next" aria-label="다음 월">
              <img src="/toolbaricons/caret-right-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const startDateInput = filterBar.querySelector(".time-filter-start-date");
  const endDateInput = filterBar.querySelector(".time-filter-end-date");
  function syncExpenseRangeDateLabels() {
    const fmt = formatExpenseFilterDateDotsWithWeekday;
    const startLabel = filterBar.querySelector(".time-filter-date-label--start");
    const endLabel = filterBar.querySelector(".time-filter-date-label--end");
    const sv = String(startDateInput?.value || filterStartDate || "").slice(0, 10);
    const ev = String(endDateInput?.value || filterEndDate || "").slice(0, 10);
    if (startLabel) startLabel.textContent = sv && /^\d{4}-\d{2}-\d{2}$/.test(sv) ? fmt(sv) : "";
    if (endLabel) endLabel.textContent = ev && /^\d{4}-\d{2}-\d{2}$/.test(ev) ? fmt(ev) : "";
  }

  function openAssetExpenseRangeDateInput(inp) {
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
      } catch (_) {}
    }
    inp.click();
  }

  filterBar.querySelectorAll(".asset-expense-date-nav-cluster .time-filter-date-field").forEach((field) => {
    const inp = field.querySelector('input[type="date"]');
    if (!inp) return;
    field.addEventListener("click", () => openAssetExpenseRangeDateInput(inp));
  });

  startDateInput.value = filterStartDate;
  endDateInput.value = filterEndDate;
  syncExpenseRangeDateLabels();

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
    <span class="asset-expense-ledger-col asset-expense-ledger-col--tags" aria-hidden="true">태그</span>
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
    const fmt = formatExpenseFilterDateDotsWithWeekday;
    const s = fmt((startDateInput?.value || filterStartDate || "").slice(0, 10));
    const e = fmt((endDateInput?.value || filterEndDate || "").slice(0, 10));
    labelSpan.textContent = s && e ? `${s} ~ ${e} 합계` : "기간 합계";
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

  /** Supabase transaction_date 범위 질의용 YYYY-MM-DD */
  function getExpensePickerSqlBounds() {
    let s = (startDateInput?.value || filterStartDate || "").slice(0, 10);
    let e = (endDateInput?.value || filterEndDate || "").slice(0, 10);
    if (s && e && s > e) [s, e] = [e, s];
    return { from: s, to: e };
  }

  function applyExpenseFilter() {
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    cardsListEl.querySelectorAll(".asset-expense-row").forEach((rowEl) => {
      const dateInput = rowEl.querySelector(".asset-expense-input-date");
      const dateStr = dateInput?.value || "";
      const show = isDateInRange(dateStr, "range", 0, 0, start, end);
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
          <div class="asset-expense-cell-amount"><input type="text" class="asset-expense-input-amount" name="asset-expense-amount" inputmode="numeric" autocomplete="off" placeholder="0" value="${expenseAmountInitialInputValue(data.amount || "").replace(/"/g, "&quot;")}" /></div>
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
              inputmode="numeric"
              autocomplete="off"
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
        <div class="asset-expense-form-row asset-expense-form-row--payment-method">
          <span class="asset-expense-form-label">결제수단</span>
          <div class="asset-expense-form-control asset-expense-cell-payment"></div>
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
    const classificationTd = rowEl.querySelector(".asset-expense-cell-classification");
    const categoryTd = rowEl.querySelector(".asset-expense-cell-category");
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
    if (categoryTd) categoryTd.appendChild(categoryDisplay);

    const paymentTd = rowEl.querySelector(".asset-expense-cell-payment");
    const paymentMethodFormRow = rowEl.querySelector(".asset-expense-form-row--payment-method");
    const paymentControl = createExpensePaymentInput(data.payment || "", () => {
      syncExpenseLedgerCardDecor();
      onTotalsUpdate?.();
    }, { inlineButtons: usePanel });

    function syncPaymentIncomeModeForRow() {
      const flowTypeInput =
        rowEl.querySelector(".asset-expense-cell-flow-type .asset-expense-input-flow-type") ||
        flowTypeTd.querySelector(".asset-expense-input-flow-type");
      const isDeposit = (flowTypeInput?.value || "").trim() === "입금";
      paymentControl.setPaymentIncomeMode(isDeposit);
      /* 패널/모달: 결제 라벨+칸 통째 숨김. 목록 카드: 칸만 숨김 */
      if (paymentMethodFormRow) {
        paymentMethodFormRow.hidden = isDeposit;
      } else if (paymentTd) {
        paymentTd.hidden = isDeposit;
      }
    }

    const flowTypeDropdown = createExpenseFlowTypeDropdown(
      flowTypeValue,
      () => {
        const flowTypeInput = flowTypeTd.querySelector(".asset-expense-input-flow-type");
        classificationDropdown.refresh(flowTypeInput?.value || "");
        updateCategoryDisplay();
        applyAmountSign();
        syncExpenseLedgerCardDecor();
        syncPaymentIncomeModeForRow();
        onTotalsUpdate?.();
      },
      { inlineButtons: usePanel }
    );
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
      filterNumericInput(amountInput, false, e, { ignoreIMEComposition: true });
      syncExpenseLedgerCardDecor();
      onTotalsUpdate?.();
    });
    amountInput.addEventListener("compositionend", () => {
      filterNumericInput(amountInput, false, null, { ignoreIMEComposition: true });
      syncExpenseLedgerCardDecor();
      onTotalsUpdate?.();
    });
    amountInput.addEventListener("paste", () => {
      queueMicrotask(() => {
        filterNumericInput(amountInput, false, null, { ignoreIMEComposition: true });
        syncExpenseLedgerCardDecor();
        onTotalsUpdate?.();
      });
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
          isDateInRange(data.date, "range", 0, 0, start, end),
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

  filterBar.addEventListener("click", (e) => {
    const prev = e.target.closest(".asset-expense-date-nav-cluster .time-filter-day-prev");
    const next = e.target.closest(".asset-expense-date-nav-cluster .time-filter-day-next");
    if (!prev && !next) return;
    e.preventDefault();
    const anchor = (startDateInput.value || filterStartDate || "").slice(0, 10);
    const b = shiftExpenseCalendarMonthBounds(anchor, prev ? -1 : 1);
    if (!b) return;
    filterStartDate = b.start;
    filterEndDate = b.end;
    startDateInput.value = filterStartDate;
    endDateInput.value = filterEndDate;
    syncExpenseRangeDateLabels();
    applyExpenseFilter();
    syncExpenseFooterSummaryLabel();
    scheduleExpenseMemPullFromServer();
  });

  addBtn.addEventListener("click", () => {
    if (document.querySelector(".asset-expense-transaction-modal")) {
      showToast("입력 창을 닫은 뒤 새 거래를 추가해 주세요.", "");
      return;
    }
    openExpenseTransactionModal({ mode: "draft" });
  });

  startDateInput.addEventListener("change", () => {
    filterStartDate = (startDateInput.value || "").slice(0, 10) || filterStartDate;
    syncExpenseRangeDateLabels();
    applyExpenseFilter();
    syncExpenseFooterSummaryLabel();
    scheduleExpenseMemPullFromServer();
  });
  endDateInput.addEventListener("change", () => {
    filterEndDate = (endDateInput.value || "").slice(0, 10) || filterEndDate;
    syncExpenseRangeDateLabels();
    applyExpenseFilter();
    syncExpenseFooterSummaryLabel();
    scheduleExpenseMemPullFromServer();
  });
  startDateInput.addEventListener("input", syncExpenseRangeDateLabels);
  endDateInput.addEventListener("input", syncExpenseRangeDateLabels);

  const startForInit = startDateInput.value || filterStartDate;
  const endForInit = endDateInput.value || filterEndDate;
  const initialRows = loadExpenseRows().filter((data) =>
    isDateInRange(data.date, "range", 0, 0, startForInit, endForInit),
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
  const filterAddRowEl = filterBar.querySelector(".asset-expense-filter-add-row");
  filterActions.appendChild(addBtn);
  filterActions.appendChild(settingsBtn);
  if (filterAddRowEl) filterAddRowEl.appendChild(filterActions);
  else filterBar.appendChild(filterActions);

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

function renderCashflowView() {
  const wrap = document.createElement("div");
  wrap.className = "asset-cashflow-view";

  const now = new Date();
  const padCf = (n) => String(n).padStart(2, "0");
  const cry = now.getFullYear();
  const crm = now.getMonth() + 1;
  let cfStartDate = `${cry}-${padCf(crm)}-01`;
  let cfEndDate = `${cry}-${padCf(crm)}-${padCf(new Date(cry, crm, 0).getDate())}`;

  const periodToolbar = document.createElement("div");
  periodToolbar.className = "asset-expense-filter-bar asset-cashflow-period-toolbar";
  periodToolbar.innerHTML = `
    <div class="asset-expense-filter-add-row time-ledger-filter-add-row">
      <div class="time-filter-bar">
        <div class="time-filter-nav-cluster asset-expense-date-nav-cluster asset-cashflow-date-nav-cluster">
          <div class="time-filter-range-wrap asset-expense-date-range-wrap" data-cashflow-range="1">
            <div class="time-filter-date-field">
              <input type="date" class="time-filter-start-date asset-cashflow-range-start" name="cashflow-filter-start" aria-label="현금흐름 시작일" />
              <span class="time-filter-date-label time-filter-date-label--start" aria-hidden="true"></span>
              <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
            </div>
            <span class="time-filter-range-sep">~</span>
            <div class="time-filter-date-field">
              <input type="date" class="time-filter-end-date asset-cashflow-range-end" name="cashflow-filter-end" aria-label="현금흐름 종료일" />
              <span class="time-filter-date-label time-filter-date-label--end" aria-hidden="true"></span>
              <img src="/toolbaricons/calendar-alt.svg" alt="" class="time-filter-date-cal-icon" width="14" height="14" aria-hidden="true" />
            </div>
          </div>
          <div class="time-filter-day-nav asset-expense-month-shift-nav">
            <button type="button" class="time-filter-day-prev" aria-label="이전 월">
              <img src="/toolbaricons/caret-left-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
            </button>
            <button type="button" class="time-filter-day-next" aria-label="다음 월">
              <img src="/toolbaricons/caret-right-circle.svg" alt="" class="time-btn-icon time-filter-day-nav-icon" width="20" height="20" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
  const cfStartInput = periodToolbar.querySelector(".asset-cashflow-range-start");
  const cfEndInput = periodToolbar.querySelector(".asset-cashflow-range-end");

  function formatCashflowFilterDateDotsWithWeekday(dStr) {
    if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return "";
    const [y, mo, d] = dStr.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
    const yy = String(y);
    const mm = String(mo).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    return `${yy}. ${mm}. ${dd}(${weekdays[dt.getDay()]})`;
  }

  function getCashflowPickerBounds() {
    let s = (cfStartInput?.value || cfStartDate || "").slice(0, 10);
    let e = (cfEndInput?.value || cfEndDate || "").slice(0, 10);
    if (s && e && s > e) [s, e] = [e, s];
    return { from: s, to: e };
  }

  function syncCashflowRangeDateLabels() {
    const fmt = formatCashflowFilterDateDotsWithWeekday;
    const startLabel = periodToolbar.querySelector(".time-filter-date-label--start");
    const endLabel = periodToolbar.querySelector(".time-filter-date-label--end");
    const sv = String(cfStartInput?.value || cfStartDate || "").slice(0, 10);
    const ev = String(cfEndInput?.value || cfEndDate || "").slice(0, 10);
    if (startLabel) startLabel.textContent = sv && /^\d{4}-\d{2}-\d{2}$/.test(sv) ? fmt(sv) : "";
    if (endLabel) endLabel.textContent = ev && /^\d{4}-\d{2}-\d{2}$/.test(ev) ? fmt(ev) : "";
  }

  function openAssetCashflowRangeDateInput(inp) {
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
      } catch (_) {}
    }
    inp.click();
  }

  periodToolbar
    .querySelectorAll(".asset-cashflow-date-nav-cluster .time-filter-date-field")
    .forEach((field) => {
      const inp = field.querySelector('input[type="date"]');
      if (!inp) return;
      field.addEventListener("click", () => openAssetCashflowRangeDateInput(inp));
    });

  cfStartInput.value = cfStartDate;
  cfEndInput.value = cfEndDate;
  syncCashflowRangeDateLabels();

  cfStartInput.addEventListener("change", () => {
    cfStartDate = (cfStartInput.value || "").slice(0, 10) || cfStartDate;
    syncCashflowRangeDateLabels();
    renderChart();
  });
  cfEndInput.addEventListener("change", () => {
    cfEndDate = (cfEndInput.value || "").slice(0, 10) || cfEndDate;
    syncCashflowRangeDateLabels();
    renderChart();
  });
  cfStartInput.addEventListener("input", syncCashflowRangeDateLabels);
  cfEndInput.addEventListener("input", syncCashflowRangeDateLabels);

  periodToolbar.addEventListener("click", (e) => {
    const prev = e.target.closest(".asset-cashflow-date-nav-cluster .time-filter-day-prev");
    const next = e.target.closest(".asset-cashflow-date-nav-cluster .time-filter-day-next");
    if (!prev && !next) return;
    e.preventDefault();
    const anchor = (cfStartInput.value || cfStartDate || "").slice(0, 10);
    const b = shiftExpenseCalendarMonthBounds(anchor, prev ? -1 : 1);
    if (!b) return;
    cfStartDate = b.start;
    cfEndDate = b.end;
    cfStartInput.value = cfStartDate;
    cfEndInput.value = cfEndDate;
    syncCashflowRangeDateLabels();
    renderChart();
  });

  wrap.appendChild(periodToolbar);

  const dashboard = document.createElement("div");
  dashboard.className = "time-dashboard-view";
  wrap.appendChild(dashboard);

  function cashflowRowInYmdRange(r, fromYmd, toYmd) {
    const d = String(r.date || "").slice(0, 10);
    if (!fromYmd || !toYmd || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    const f = fromYmd.slice(0, 10);
    const t = toYmd.slice(0, 10);
    return d >= f && d <= t;
  }

  function aggregateByCategory(rows, fromYmd, toYmd) {
    const 소비 = { label: "소비", value: 0, color: "#C4D8F2" };
    const 저축 = { label: "저축", value: 0, color: "#F2D9C4" };
    const 투자 = { label: "투자", value: 0, color: "#C8D0D8" };
    const 수입 = { label: "수입", value: 0, color: "#E0C4E8" };

    rows.forEach((r) => {
      if (!cashflowRowInYmdRange(r, fromYmd, toYmd)) return;

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
  function aggregateByCategoryDetailed(rows, fromYmd, toYmd) {
    const 수입 = { label: "수입", value: 0, color: "#E0C4E8", desc: "월급, 부업, 용돈, 보너스, 임대소득, 투자소득" };
    const 고정비 = { label: "고정비", value: 0, color: "#C4DCC8", desc: "월세, 보험, 통신비, 관리비" };
    const 변동비 = { label: "변동비", value: 0, color: "#C4E0DC", desc: "식비, 교통비, 쇼핑" };
    const 저축 = { label: "저축/투자", value: 0, color: "#F2D9C4", desc: "예적금, 주식, 연금, 펀드" };
    const 기타 = { label: "기타", value: 0, color: "#F2E8C4", desc: "경조사비, 선물비, Me 비용" };

    rows.forEach((r) => {
      if (!cashflowRowInYmdRange(r, fromYmd, toYmd)) return;

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
  function aggregateByClassification(categoryKeys, rows, fromYmd, toYmd) {
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
      if (!cashflowRowInYmdRange(r, fromYmd, toYmd)) return;
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

  function aggregateFixedExpenseByClassification(rows, fromYmd, toYmd) {
    const byCat = getExpenseClassificationByCategory();
    const classifications = byCat.고정비 || [];
    const map = Object.fromEntries(classifications.map((c) => [c.label, { ...c, value: 0 }]));
    let 기타합계 = 0;

    rows.forEach((r) => {
      if (!cashflowRowInYmdRange(r, fromYmd, toYmd)) return;
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

  function getSubscriptionExpenseRows(rows, fromYmd, toYmd) {
    return rows.filter((r) => {
      if (!cashflowRowInYmdRange(r, fromYmd, toYmd)) return false;
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

  function getVariableExpenseRows(rows, fromYmd, toYmd) {
    if (!Array.isArray(rows)) return [];
    return rows.filter((r) => {
      if (!cashflowRowInYmdRange(r, fromYmd, toYmd)) return false;
      if ((r.category || "").trim() !== "변동비") return false;
      const cls = (r.classification || "").trim();
      return VARIABLE_EXPENSE_CLASSIFICATIONS.includes(cls) || cls === "";
    });
  }

  function renderChart() {
    const rows = loadExpenseRows();
    const { from: cfFrom, to: cfTo } = getCashflowPickerBounds();
    const periodLabel =
      cfFrom && cfTo
        ? `${formatCashflowFilterDateDotsWithWeekday(cfFrom)} ~ ${formatCashflowFilterDateDotsWithWeekday(cfTo)}`
        : "기간 미선택";
    const data =
      cfFrom && cfTo ? aggregateByCategory(rows, cfFrom, cfTo) : aggregateByCategory([], "", "");
    const [소비, 저축, 투자, 수입] = data;
    const flowData = aggregateByCategoryDetailed(rows, cfFrom || "", cfTo || "");
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
          const breakdown = aggregateByClassification(keys, rows, cfFrom || "", cfTo || "");
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
      <div class="time-dashboard-widget-title">수입 대비 지출 비율·금액</div>
      <div class="time-dashboard-widget-desc" style="color:#6b7280;margin-bottom:0.5rem;">${periodLabel}</div>
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

    const fixedExpenseData = aggregateFixedExpenseByClassification(rows, cfFrom || "", cfTo || "");
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
      <div class="time-dashboard-widget-title">고정비</div>
      <div class="time-dashboard-widget-desc" style="color:#6b7280;margin-top:0.25rem;margin-bottom:0.75rem;">${periodLabel} · 세부지출분류별</div>
      <table class="asset-fixed-expense-table">
        <thead><tr><th>세부지출분류</th><th>금액</th></tr></thead>
        <tbody>
          ${fixedExpenseTableRows || '<tr><td colspan="2" class="asset-fixed-expense-empty">데이터 없음</td></tr>'}
        </tbody>
        <tfoot><tr><td>합계</td><td class="asset-fixed-expense-amt">${fixedExpenseTotal > 0 ? formatNum(fixedExpenseTotal) + "원" : "—"}</td></tr></tfoot>
      </table>
    `;

    const subscriptionRows = getSubscriptionExpenseRows(rows, cfFrom || "", cfTo || "");
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
      <div class="time-dashboard-widget-title">구독료 목록</div>
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
      const varRows = getVariableExpenseRows(rows, cfFrom || "", cfTo || "");
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
      variableExpenseWidget.innerHTML = `<div class="time-dashboard-widget-title">변동비</div><div class="time-dashboard-widget-desc" style="color:#6b7280;margin-top:0.25rem;margin-bottom:0.5rem;">${periodLabel} · 세부카테고리별</div><div class="asset-variable-bar-total">총 ${formatNum(totalVariable)}원</div><div class="asset-variable-bar-list">${barEntries.length ? barHtml : '<div class="asset-variable-bar-empty">데이터 없음</div>'}</div>`;
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


  /* 상단 ASSET·자산관리 헤더 없음 — 가계부 등 서브 탭부터 표시 */

  const viewTabs = document.createElement("div");
  viewTabs.className = "asset-view-tabs";
  viewTabs.innerHTML = `
    <button type="button" class="asset-view-tab" data-view="expense">가계부</button>
    <button type="button" class="asset-view-tab" data-view="cashflow">현금흐름</button>
    <button type="button" class="asset-view-tab" data-view="networth">순자산</button>
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
    contentWrap.innerHTML = "";
    if (view === "networth") {
      contentWrap.appendChild(renderNetworthView());
    } else if (view === "expense") {
      contentWrap.appendChild(renderExpenseView({ onOpenSettings: () => assetSettings.open() }));
    } else if (view === "cashflow") {
      contentWrap.appendChild(renderCashflowView());
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
