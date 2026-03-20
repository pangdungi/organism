/**
 * 자산관리 - 순자산(총 부채), 지출입력장, 현금흐름, 자산관리계획
 */

const DEBT_ROWS_KEY = "asset_debt_rows";
const ASSET_ROWS_KEY = "asset_asset_rows";
const REAL_ESTATE_ROWS_KEY = "asset_real_estate_rows";
const STOCK_ROWS_KEY = "asset_stock_rows";
const INSURANCE_ROWS_KEY = "asset_insurance_rows";
const ANNUITY_ROWS_KEY = "asset_annuity_rows";

const DEFAULT_STOCK_CATEGORY_OPTIONS = [
  { label: "미국주식", color: "asset-stock-cat-green" },
  { label: "국내주식", color: "asset-stock-cat-blue" },
  { label: "ETF", color: "asset-stock-cat-purple" },
  { label: "코인", color: "asset-stock-cat-pink" },
  { label: "현물", color: "asset-stock-cat-amber" },
  { label: "선물", color: "asset-stock-cat-gray" },
];
const STOCK_CATEGORY_OPTIONS_KEY = "asset_stock_category_options";

function getStockCategoryOptions() {
  const defaults = DEFAULT_STOCK_CATEGORY_OPTIONS.map((o) => o.label);
  try {
    const raw = localStorage.getItem(STOCK_CATEGORY_OPTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        return [...defaults, ...arr.filter((s) => typeof s === "string" && s.trim() && !defaults.includes(s.trim()))];
      }
    }
  } catch (_) {}
  return defaults;
}

function addStockCategoryOption(name) {
  const defaults = DEFAULT_STOCK_CATEGORY_OPTIONS.map((o) => o.label);
  const opts = getStockCategoryOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.includes(trimmed)) return opts;
  const custom = opts.filter((o) => !defaults.includes(o));
  custom.push(trimmed);
  try {
    localStorage.setItem(STOCK_CATEGORY_OPTIONS_KEY, JSON.stringify(custom));
  } catch (_) {}
  return getStockCategoryOptions();
}

function removeStockCategoryOption(name) {
  if (!name || DEFAULT_STOCK_CATEGORY_OPTIONS.some((o) => o.label === name)) return getStockCategoryOptions();
  const defaults = DEFAULT_STOCK_CATEGORY_OPTIONS.map((o) => o.label);
  const custom = getStockCategoryOptions().filter((o) => !defaults.includes(o) && o !== name);
  try {
    localStorage.setItem(STOCK_CATEGORY_OPTIONS_KEY, JSON.stringify(custom));
  } catch (_) {}
  return getStockCategoryOptions();
}

function isDefaultStockCategory(name) {
  return DEFAULT_STOCK_CATEGORY_OPTIONS.some((o) => o.label === name);
}

function getStockCategoryColor(label) {
  return "asset-stock-cat-gray";
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
const INSURANCE_KIND_OPTIONS_KEY = "asset_insurance_kind_options";

function getInsuranceKindOptions() {
  const defaults = DEFAULT_INSURANCE_KIND_OPTIONS.map((o) => o.label);
  try {
    const raw = localStorage.getItem(INSURANCE_KIND_OPTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        return [...defaults, ...arr.filter((s) => typeof s === "string" && s.trim() && !defaults.includes(s.trim()))];
      }
    }
  } catch (_) {}
  return defaults;
}

function addInsuranceKindOption(name) {
  const defaults = DEFAULT_INSURANCE_KIND_OPTIONS.map((o) => o.label);
  const opts = getInsuranceKindOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.includes(trimmed)) return opts;
  const custom = opts.filter((o) => !defaults.includes(o));
  custom.push(trimmed);
  try {
    localStorage.setItem(INSURANCE_KIND_OPTIONS_KEY, JSON.stringify(custom));
  } catch (_) {}
  return getInsuranceKindOptions();
}

function removeInsuranceKindOption(name) {
  if (!name || DEFAULT_INSURANCE_KIND_OPTIONS.some((o) => o.label === name)) return getInsuranceKindOptions();
  const defaults = DEFAULT_INSURANCE_KIND_OPTIONS.map((o) => o.label);
  const custom = getInsuranceKindOptions().filter((o) => !defaults.includes(o) && o !== name);
  try {
    localStorage.setItem(INSURANCE_KIND_OPTIONS_KEY, JSON.stringify(custom));
  } catch (_) {}
  return getInsuranceKindOptions();
}

function isDefaultInsuranceKind(name) {
  return DEFAULT_INSURANCE_KIND_OPTIONS.some((o) => o.label === name);
}

function getInsuranceKindColor(label) {
  const opt = DEFAULT_INSURANCE_KIND_OPTIONS.find((o) => o.label === label);
  return opt ? opt.color : "asset-insurance-kind-gray";
}

const NET_WORTH_TARGET_KEY = "asset_networth_target";
const EXPENSE_ROWS_KEY = "asset_expense_rows";
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

const EXPENSE_CATEGORY_OPTIONS_KEY = "asset_expense_category_options";
const EXPENSE_CLASSIFICATION_KEY = "asset_expense_classification_by_category";

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
  try {
    const raw = localStorage.getItem(EXPENSE_CATEGORY_OPTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr;
    }
  } catch (_) {}
  return DEFAULT_EXPENSE_CATEGORY_OPTIONS.map((o) => ({ ...o }));
}

function saveExpenseCategoryOptions(arr) {
  try {
    localStorage.setItem(EXPENSE_CATEGORY_OPTIONS_KEY, JSON.stringify(arr));
  } catch (_) {}
}

function getExpenseClassificationByCategory() {
  const out = {};
  try {
    const raw = localStorage.getItem(EXPENSE_CLASSIFICATION_KEY);
    const saved = raw ? JSON.parse(raw) : null;
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
  try {
    localStorage.setItem(EXPENSE_CLASSIFICATION_KEY, JSON.stringify(obj));
  } catch (_) {}
}

const SAVINGS_GOAL_OPTIONS_KEY = "asset_savings_goal_options";
const DEFAULT_SAVINGS_GOAL_OPTIONS = ["전세자금", "여행자금", "결혼자금", "목돈마련", "통장잔고", "현금보관", "생활비", "예비자금", "비상금", "그 외"];

const EXPENSE_PAYMENT_OPTIONS_KEY = "asset_expense_payment_options";
const DEFAULT_PAYMENT_OPTIONS = ["신용카드", "체크카드", "현금"];
function getSavingsGoalOptions() {
  try {
    const raw = localStorage.getItem(SAVINGS_GOAL_OPTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) return arr.map((o) => (typeof o === "string" ? o : o.name));
    }
  } catch (_) {}
  return [...DEFAULT_SAVINGS_GOAL_OPTIONS];
}

function addSavingsGoalOption(name) {
  const opts = getSavingsGoalOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.includes(trimmed)) return opts;
  opts.push(trimmed);
  try {
    localStorage.setItem(SAVINGS_GOAL_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function removeSavingsGoalOption(name) {
  if (!name || DEFAULT_SAVINGS_GOAL_OPTIONS.includes(name)) return getSavingsGoalOptions();
  const opts = getSavingsGoalOptions().filter((o) => o !== name);
  try {
    localStorage.setItem(SAVINGS_GOAL_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function isDefaultSavingsGoal(name) {
  return DEFAULT_SAVINGS_GOAL_OPTIONS.includes(name);
}

function getPaymentOptions() {
  try {
    const raw = localStorage.getItem(EXPENSE_PAYMENT_OPTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        return arr.map((o) => (typeof o === "string" ? o : o.name));
      }
    }
  } catch (_) {}
  return [...DEFAULT_PAYMENT_OPTIONS];
}

function addPaymentOption(name) {
  const opts = getPaymentOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.includes(trimmed)) return opts;
  opts.unshift(trimmed);
  try {
    localStorage.setItem(EXPENSE_PAYMENT_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function removePaymentOption(name) {
  const opts = getPaymentOptions().filter((o) => o !== name);
  try {
    localStorage.setItem(EXPENSE_PAYMENT_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function savePaymentOptions(opts) {
  const arr = Array.isArray(opts) ? opts.filter((o) => (o || "").trim()) : [];
  try {
    localStorage.setItem(EXPENSE_PAYMENT_OPTIONS_KEY, JSON.stringify(arr));
  } catch (_) {}
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
    const raw = localStorage.getItem(DEBT_ROWS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
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
  try {
    localStorage.setItem(DEBT_ROWS_KEY, JSON.stringify(rows));
  } catch (_) {}
}

function collectDebtRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".asset-debt-row").forEach((tr) => {
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
    rows.push({
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
    });
  });
  return rows;
}

function loadAssetRows() {
  try {
    const raw = localStorage.getItem(ASSET_ROWS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
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
  try {
    localStorage.setItem(ASSET_ROWS_KEY, JSON.stringify(rows));
  } catch (_) {}
}

function loadRealEstateRows() {
  try {
    const raw = localStorage.getItem(REAL_ESTATE_ROWS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (_) {}
  return [];
}

function loadStockRows() {
  try {
    const raw = localStorage.getItem(STOCK_ROWS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (_) {}
  return [];
}

function saveStockRows(rows) {
  try {
    localStorage.setItem(STOCK_ROWS_KEY, JSON.stringify(rows));
  } catch (_) {}
}

function loadInsuranceRows() {
  try {
    const raw = localStorage.getItem(INSURANCE_ROWS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (_) {}
  return [];
}

function saveInsuranceRows(rows) {
  try {
    localStorage.setItem(INSURANCE_ROWS_KEY, JSON.stringify(rows));
  } catch (_) {}
}

function loadAnnuityRows() {
  try {
    const raw = localStorage.getItem(ANNUITY_ROWS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (_) {}
  return [];
}

function saveAnnuityRows(rows) {
  try {
    localStorage.setItem(ANNUITY_ROWS_KEY, JSON.stringify(rows));
  } catch (_) {}
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
  try {
    localStorage.setItem(REAL_ESTATE_ROWS_KEY, JSON.stringify(rows));
  } catch (_) {}
}

function loadNetWorthTarget() {
  try {
    const raw = localStorage.getItem(NET_WORTH_TARGET_KEY);
    return raw ?? "";
  } catch (_) {}
  return "";
}

function saveNetWorthTarget(value) {
  try {
    localStorage.setItem(NET_WORTH_TARGET_KEY, String(value ?? ""));
  } catch (_) {}
}

function loadExpenseRows() {
  try {
    const raw = localStorage.getItem(EXPENSE_ROWS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (_) {}
  return [];
}

function saveExpenseRows(rows) {
  try {
    localStorage.setItem(EXPENSE_ROWS_KEY, JSON.stringify(rows));
  } catch (_) {}
}

function collectExpenseRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".asset-expense-row").forEach((tr) => {
    const nameInput = tr.querySelector(".asset-expense-input-name");
    const dateInput = tr.querySelector(".asset-expense-input-date");
    const flowTypeInput = tr.querySelector(".asset-expense-input-flow-type");
    const categoryInput = tr.querySelector(".asset-expense-input-category");
    const classificationInput = tr.querySelector(".asset-expense-input-classification");
    const amountInput = tr.querySelector(".asset-expense-input-amount");
    const paymentInput = tr.querySelector(".asset-expense-input-payment");
    const memoInput = tr.querySelector(".asset-expense-input-memo");
    rows.push({
      name: nameInput?.value || "",
      date: dateInput?.value || "",
      flowType: flowTypeInput?.value || "",
      category: categoryInput?.value || "",
      classification: classificationInput?.value || "",
      amount: amountInput?.value || "",
      payment: paymentInput?.value || "",
      memo: memoInput?.value || "",
    });
  });
  return rows;
}

function collectRealEstateRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".asset-asset-row-real-estate").forEach((tr) => {
    const contractInput = tr.querySelector(".asset-asset-input-contract");
    const salePriceInput = tr.querySelector(".asset-asset-input-sale-price");
    const loanInput = tr.querySelector(".asset-asset-input-loan");
    rows.push({
      contract: contractInput?.value || "",
      salePrice: salePriceInput?.value || "",
      loan: loanInput?.value || "",
    });
  });
  return rows;
}

function collectAssetRowsFromDOM(tableEl) {
  const rows = [];
  tableEl?.querySelectorAll(".asset-asset-row:not(.asset-asset-row-real-estate):not(.asset-asset-row-stock)").forEach((tr) => {
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

/** 주식분류 드롭다운 - 미국주식, 국내주식, ETF, 코인, 현물, 선물 + 사용자 추가 */
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
    display.className = "asset-stock-category-display" + (val ? " " + getStockCategoryColor(val) : "");
  }

  const panel = document.createElement("div");
  panel.className = "asset-stock-category-panel";
  panel.hidden = true;

  function buildPanel() {
    panel.innerHTML = "";
    const titleRow = document.createElement("div");
    titleRow.className = "asset-stock-category-panel-title";
    titleRow.textContent = "옵션 선택 또는 생성";
    panel.appendChild(titleRow);
    getStockCategoryOptions().forEach((label) => {
      const row = document.createElement("div");
      row.className = "asset-stock-category-option";
      const tag = document.createElement("span");
      tag.className = "asset-stock-category-tag " + getStockCategoryColor(label);
      tag.textContent = label;
      tag.addEventListener("click", (e) => {
        e.stopPropagation();
        input.value = label;
        updateDisplay();
        panel.hidden = true;
        onUpdate?.();
      });
      row.appendChild(tag);
      if (!isDefaultStockCategory(label)) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "asset-stock-category-option-delete";
        delBtn.title = "삭제";
        delBtn.innerHTML =
          '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
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
          '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
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

/** 예적금 용도 드롭다운 - 전세자금, 여행자금 등 + 사용자 추가 */
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
          '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
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
    const addRow = document.createElement("div");
    addRow.className = "asset-asset-savings-goal-add";
    const addInput = document.createElement("input");
    addInput.type = "text";
    addInput.placeholder = "추가 입력 후 Enter";
    addInput.className = "asset-asset-savings-goal-add-input";
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const val = (addInput.value || "").trim();
        if (val) {
          addSavingsGoalOption(val);
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

/** 지출입력장 카테고리 드롭다운 - 고정비, 변동비, 저축, 투자, 기타 */
/** 큰분류 드롭다운 - 선택 → 지출(파랑) / 입금(빨강) */
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

  function getColorClass(val) {
    const category = clsToCat[val] || "";
    return getExpenseCategoryOptions().find((o) => o.label === category)?.color || "";
  }

  function updateDisplay() {
    const val = classificationInput.value || "";
    const opts = getClassificationsByFlowType(flowType);
    display.textContent = val || "선택";
    const canSelect = flowType === "입금" || flowType === "지출";
    display.className = "asset-expense-classification-display " + (canSelect ? "" : "is-disabled ") + getColorClass(val);
  }

  const panel = document.createElement("div");
  panel.className = "asset-expense-classification-panel asset-expense-classification-panel--pills";
  panel.hidden = true;

  let closeHandler = null;

  function getCategoryColorClass(category) {
    const opt = getExpenseCategoryOptions().find((o) => o.label === category);
    return opt ? opt.color : "expense-cat-teal";
  }

  function buildPanel() {
    panel.innerHTML = "";
    const opts = getClassificationsByFlowType(flowType);
    opts.forEach((opt) => {
      const category = clsToCat[opt.label] || "";
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "asset-expense-classification-pill " + getCategoryColorClass(category);
      pill.textContent = opt.label;
      pill.addEventListener("mousedown", (e) => e.stopPropagation());
      pill.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        classificationInput.value = opt.label;
        categoryInput.value = category;
        updateDisplay();
        panel.hidden = true;
        if (closeHandler) document.removeEventListener("mousedown", closeHandler, true);
        onSelect?.(opt.label, category);
      });
      panel.appendChild(pill);
    });
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      if (flowType !== "입금" && flowType !== "지출") {
        closeAllDebtDropdownPanels(panel);
        const rect = display.getBoundingClientRect();
        panel.style.top = `${rect.bottom + 2}px`;
        panel.style.left = `${rect.left}px`;
        panel.style.minWidth = `${Math.max(rect.width, 200)}px`;
        panel.style.maxWidth = `min(26.25rem, calc(100vw - ${Math.round(rect.left) + 24}px))`;
        document.body.appendChild(panel);
        panel.innerHTML = '<p class="asset-expense-classification-hint">큰 분류(지출/입금)를 먼저 선택해 주세요.</p>';
        panel.hidden = false;
        closeHandler = (ev) => {
          if (panel.hidden) {
            document.removeEventListener("mousedown", closeHandler, true);
            return;
          }
          const inWrap = wrap.contains(ev.target);
          const inPanel = panel.contains(ev.target);
          if (!inWrap && !inPanel) {
            panel.hidden = true;
            document.removeEventListener("mousedown", closeHandler, true);
          }
        };
        setTimeout(() => document.addEventListener("mousedown", closeHandler, true), 0);
        return;
      }
      closeAllDebtDropdownPanels(panel);
      const rect = display.getBoundingClientRect();
      panel.style.top = `${rect.bottom + 2}px`;
      panel.style.left = `${rect.left}px`;
      panel.style.minWidth = `${Math.max(rect.width, 200)}px`;
      panel.style.maxWidth = `min(26.25rem, calc(100vw - ${Math.round(rect.left) + 24}px))`;
      document.body.appendChild(panel);
      buildPanel();
      panel.hidden = false;
      closeHandler = (ev) => {
        if (panel.hidden) {
          document.removeEventListener("mousedown", closeHandler, true);
          return;
        }
        const inWrap = wrap.contains(ev.target);
        const inPanel = panel.contains(ev.target);
        if (!inWrap && !inPanel) {
          panel.hidden = true;
          document.removeEventListener("mousedown", closeHandler, true);
        }
      };
      setTimeout(() => document.addEventListener("mousedown", closeHandler, true), 0);
    } else {
      panel.hidden = true;
    }
  });

  function refresh(newFlowType) {
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

/** 지출입력장 결제수단 드롭다운 - 가계부 설정에서 등록한 결제수단만 선택 (타이핑/추가/삭제 없음) */
function createExpensePaymentInput(initialValue, onUpdate) {
  const wrap = document.createElement("div");
  wrap.className = "asset-expense-payment-wrap";

  const input = document.createElement("input");
  input.type = "hidden";
  input.className = "asset-expense-input-payment";
  input.value = initialValue || "";

  const display = document.createElement("span");
  display.className = "asset-expense-payment-display";

  function updateDisplay() {
    const val = (input.value || "").trim();
    display.textContent = val || "선택";
    display.className = "asset-expense-payment-display" + (val ? " has-value" : "");
  }

  const panel = document.createElement("div");
  panel.className = "asset-expense-payment-panel";
  panel.hidden = true;

  function updatePanelPosition() {
    const rect = display.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.minWidth = `${Math.max(rect.width, 160)}px`;
  }

  function openPanel() {
    panel.innerHTML = "";
    const all = getPaymentOptions();
    all.forEach((opt) => {
      const row = document.createElement("div");
      row.className = "asset-expense-payment-option";
      row.innerHTML = `<span class="asset-expense-payment-tag">${opt}</span>`;
      row.dataset.value = opt;
      row.addEventListener("click", () => {
        input.value = opt;
        updateDisplay();
        panel.hidden = true;
        onUpdate?.();
      });
      panel.appendChild(row);
    });
    closeAllDebtDropdownPanels(panel);
    updatePanelPosition();
    document.body.appendChild(panel);
    panel.hidden = false;
  }

  display.addEventListener("click", (e) => {
    e.stopPropagation();
    if (panel.hidden) {
      openPanel();
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

  updateDisplay();
  wrap.appendChild(input);
  wrap.appendChild(display);
  wrap.appendChild(panel);

  return { wrap, input };
}

function parseNum(val) {
  const n = parseFloat(String(val || "").replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

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

/** 숫자 전용 입력: 비숫자 문자 제거 (allowDecimal: 소수점 허용 여부) */
function filterNumericInput(el, allowDecimal) {
  const re = allowDecimal ? /[^\d,.]/g : /[^\d,]/g;
  const v = el.value;
  const filtered = v.replace(re, "");
  if (v !== filtered) el.value = filtered;
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

/** 월납입액, 개설일, 만기일, 이자율로 현재 자산액 계산 (적금 단리 공식) */
function calcAssetFromMonthlyDeposit(monthly, openDate, maturityDate, rateStr) {
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
  const rate = parseRate(rateStr);
  if (rate === null || rate === 0) {
    return Math.round(monthlyAmt * elapsedMonths);
  }
  const r = rate / 100 / 12;
  const principal = monthlyAmt * elapsedMonths;
  const interest = monthlyAmt * r * (elapsedMonths * (elapsedMonths + 1)) / 2;
  return Math.round(principal + interest);
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
        <span class="asset-networth-dashboard-formula-label">총 자산</span>
        <span class="asset-networth-dashboard-formula-value asset-networth-dashboard-assets-value">-</span>
      </div>
      <span class="asset-networth-dashboard-formula-op">−</span>
      <div class="asset-networth-dashboard-formula-item">
        <span class="asset-networth-dashboard-formula-label">총 대출</span>
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
        <th class="asset-debt-th-period">대출개월</th>
        <th class="asset-debt-th-rate">대출금리</th>
        <th class="asset-debt-th-principal">총원금</th>
        <th class="asset-debt-th-interest">총 대출 이자</th>
        <th class="asset-debt-th-monthly-principal">월 원금</th>
        <th class="asset-debt-th-monthly-interest">월 이자</th>
        <th class="asset-debt-th-start-date">시작일</th>
        <th class="asset-debt-th-end-date">만기일</th>
        <th class="asset-debt-th-paid">상환금액</th>
        <th class="asset-debt-th-extra-paid">중도상환(수수료 제외)</th>
        <th class="asset-debt-th-balance">잔액</th>
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

  function createDebtRow(data = {}, onUpdate) {
    const tr = document.createElement("tr");
    tr.className = "asset-debt-row";

    const nameTd = document.createElement("td");
    nameTd.className = "asset-debt-cell-name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "asset-debt-input-name";
    nameInput.value = data.name || "";
    nameInput.placeholder = "";
    nameInput.addEventListener("input", onUpdate);
    nameInput.addEventListener("keydown", (e) => e.key === "Enter" && nameInput.blur());
    nameTd.appendChild(nameInput);
    tr.appendChild(nameTd);

    const debtTypeTd = document.createElement("td");
    debtTypeTd.className = "asset-debt-cell-type";
    debtTypeTd.appendChild(createDebtTypeDropdown(data.debtType || "", onUpdate));
    tr.appendChild(debtTypeTd);

    const repaymentTd = document.createElement("td");
    repaymentTd.className = "asset-debt-cell-repayment";
    repaymentTd.appendChild(createDebtRepaymentDropdown(data.repayment || "", onUpdate));
    tr.appendChild(repaymentTd);

    const periodTd = document.createElement("td");
    periodTd.className = "asset-debt-cell-period";
    const periodInput = document.createElement("input");
    periodInput.type = "text";
    periodInput.className = "asset-debt-input-period";
    periodInput.value = data.periodYears ?? "";
    periodInput.placeholder = "-";
    periodInput.addEventListener("input", () => filterNumericInput(periodInput, false));
    periodInput.addEventListener("keydown", (e) => e.key === "Enter" && periodInput.blur());
    periodTd.appendChild(periodInput);
    tr.appendChild(periodTd);

    const rateTd = document.createElement("td");
    rateTd.className = "asset-debt-cell-rate";
    const rateInput = document.createElement("input");
    rateInput.type = "text";
    rateInput.className = "asset-debt-input-rate";
    rateInput.value = data.interestRate ?? "";
    rateInput.placeholder = "-";
    rateInput.addEventListener("input", () => filterNumericInput(rateInput, true));
    rateInput.addEventListener("keydown", (e) => e.key === "Enter" && rateInput.blur());
    rateTd.appendChild(rateInput);
    tr.appendChild(rateTd);

    const principalTd = document.createElement("td");
    principalTd.className = "asset-debt-cell-principal";
    const principalInput = document.createElement("input");
    principalInput.type = "text";
    principalInput.className = "asset-debt-input-principal";
    principalInput.value = data.principal ? (formatNum(data.principal) || data.principal) : "";
    principalInput.placeholder = "-";
    principalInput.addEventListener("input", () => filterNumericInput(principalInput, false));
    principalInput.addEventListener("blur", () => {
      const formatted = formatNum(principalInput.value);
      if (formatted !== "") principalInput.value = formatted;
    });
    principalInput.addEventListener("keydown", (e) => e.key === "Enter" && principalInput.blur());
    principalTd.appendChild(principalInput);
    tr.appendChild(principalTd);

    const interestTd = document.createElement("td");
    interestTd.className = "asset-debt-cell-interest";
    const interestSpan = document.createElement("span");
    interestSpan.className = "asset-debt-interest-display";

    function updateInterest() {
      const repaymentInput = repaymentTd.querySelector(".asset-debt-input-repayment");
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
      onUpdate();
    };
    repaymentTd.innerHTML = "";
    repaymentTd.appendChild(createDebtRepaymentDropdown(data.repayment || "", repaymentOnUpdate));
    updateInterest();
    interestTd.appendChild(interestSpan);
    tr.appendChild(interestTd);

    const monthlyPrincipalTd = document.createElement("td");
    monthlyPrincipalTd.className = "asset-debt-cell-monthly-principal";
    const monthlyPrincipalSpan = document.createElement("span");
    monthlyPrincipalSpan.className = "asset-debt-monthly-principal-display";

    const monthlyInterestTd = document.createElement("td");
    monthlyInterestTd.className = "asset-debt-cell-monthly-interest";
    const monthlyInterestSpan = document.createElement("span");
    monthlyInterestSpan.className = "asset-debt-monthly-interest-display";

    function updateMonthlyBreakdown() {
      const repaymentInput = repaymentTd.querySelector(".asset-debt-input-repayment");
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

    monthlyPrincipalTd.appendChild(monthlyPrincipalSpan);
    monthlyInterestTd.appendChild(monthlyInterestSpan);
    tr.appendChild(monthlyPrincipalTd);
    tr.appendChild(monthlyInterestTd);
    updateMonthlyBreakdownRef = updateMonthlyBreakdown;
    updateMonthlyBreakdown();

    const startDateTd = document.createElement("td");
    startDateTd.className = "asset-debt-cell-start-date asset-debt-date-cell";
    const startDateDisplay = document.createElement("span");
    startDateDisplay.className = "asset-debt-date-display";
    const startDateInput = document.createElement("input");
    startDateInput.type = "date";
    startDateInput.className = "asset-debt-input-start-date";
    startDateInput.value = data.startDate ?? "";

    function updateStartDateDisplay() {
      startDateDisplay.textContent = startDateInput.value ? formatDateYYMMDD(startDateInput.value) : "-";
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
      onUpdate();
    });
    startDateTd.addEventListener("click", (e) => {
      e.preventDefault();
      startDateInput.focus();
      if (typeof startDateInput.showPicker === "function") startDateInput.showPicker();
    });
    startDateTd.appendChild(startDateDisplay);
    startDateTd.appendChild(startDateInput);
    tr.appendChild(startDateTd);

    const endDateTd = document.createElement("td");
    endDateTd.className = "asset-debt-cell-end-date asset-debt-date-cell";
    const endDateDisplay = document.createElement("span");
    endDateDisplay.className = "asset-debt-date-display";
    const endDateInput = document.createElement("input");
    endDateInput.type = "date";
    endDateInput.className = "asset-debt-input-end-date";
    endDateInput.value = data.endDate ?? "";

    function updateEndDateDisplay() {
      endDateDisplay.textContent = endDateInput.value ? formatDateYYMMDD(endDateInput.value) : "-";
    }

    endDateInput.addEventListener("change", () => {
      updateEndDateDisplay();
      updatePaidFromDates();
      onUpdate();
    });
    endDateTd.addEventListener("click", (e) => {
      e.preventDefault();
      endDateInput.focus();
      if (typeof endDateInput.showPicker === "function") endDateInput.showPicker();
    });
    endDateTd.appendChild(endDateDisplay);
    endDateTd.appendChild(endDateInput);
    tr.appendChild(endDateTd);

    updateStartDateDisplay();
    updateEndDateDisplay();

    const paidTd = document.createElement("td");
    paidTd.className = "asset-debt-cell-paid";
    const paidSpan = document.createElement("span");
    paidSpan.className = "asset-debt-paid-display";
    paidSpan.title = "시작일~오늘 기준 자동 계산 (입력 불가)";

    function updatePaidFromDates() {
      const repaymentInput = repaymentTd.querySelector(".asset-debt-input-repayment");
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
      onUpdate();
    }
    updatePaidFromDatesRef = updatePaidFromDates;

    rateInput.addEventListener("input", () => {
      updateInterest();
      updateMonthlyBreakdown();
      updatePaidFromDates();
      onUpdate();
    });
    periodInput.addEventListener("input", () => {
      updateInterest();
      updateEndDateFromStartDate();
      updateMonthlyBreakdown();
      updatePaidFromDates();
      onUpdate();
    });
    principalInput.addEventListener("input", () => {
      updateInterest();
      updateMonthlyBreakdown();
      updatePaidFromDates();
      onUpdate();
    });
    paidTd.appendChild(paidSpan);
    tr.appendChild(paidTd);

    const extraPaidTd = document.createElement("td");
    extraPaidTd.className = "asset-debt-cell-extra-paid";
    const extraPaidInput = document.createElement("input");
    extraPaidInput.type = "text";
    extraPaidInput.className = "asset-debt-input-extra-paid";
    extraPaidInput.value = data.extraPaid ? (formatNum(data.extraPaid) || data.extraPaid) : "";
    extraPaidInput.placeholder = "-";
    extraPaidInput.title = "중도상환 금액 (수수료 제외)";
    extraPaidInput.addEventListener("input", () => filterNumericInput(extraPaidInput, false));
    extraPaidInput.addEventListener("input", onUpdate);
    extraPaidInput.addEventListener("blur", () => {
      const formatted = formatNum(extraPaidInput.value);
      if (formatted !== "") extraPaidInput.value = formatted;
      updateBalance();
    });
    extraPaidInput.addEventListener("keydown", (e) => e.key === "Enter" && extraPaidInput.blur());
    extraPaidTd.appendChild(extraPaidInput);
    tr.appendChild(extraPaidTd);

    const balanceTd = document.createElement("td");
    balanceTd.className = "asset-debt-cell-balance";
    const balanceSpan = document.createElement("span");
    balanceSpan.className = "asset-debt-balance-display";

    function updateBalance() {
      const p = parseNum(principalInput.value);
      const repaymentInput = repaymentTd.querySelector(".asset-debt-input-repayment");
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

    balanceTd.appendChild(balanceSpan);
    tr.appendChild(balanceTd);

    if (startDateInput.value && !endDateInput.value) {
      updateEndDateFromStartDate();
    }
    if (startDateInput.value && endDateInput.value) {
      updatePaidFromDates();
    }

    const actionsTd = document.createElement("td");
    actionsTd.className = "asset-debt-cell-actions";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "asset-debt-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      tr.remove();
      onUpdate();
    });
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

    return tr;
  }

  function save() {
    const rows = collectDebtRowsFromDOM(tableWrap);
    saveDebtRows(rows);
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

    /* 프로그레스 바 업데이트: (상환금액 + 중도상환) / (총원금 + 총 대출 이자) × 100 */
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
    const tr = createDebtRow(row, onUpdate);
    tbody.insertBefore(tr, totalsRow);
  });

  addTaskBtn.addEventListener("click", () => {
    const tr = createDebtRow({}, onUpdate);
    tbody.insertBefore(tr, totalsRow);
    onUpdate();
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

  function createRealEstateRow(data = {}, onAssetUpdate) {
    const tr = document.createElement("tr");
    tr.className = "asset-asset-row asset-asset-row-real-estate";
    tr.dataset.realEstate = "true";

    const contractTd = document.createElement("td");
    contractTd.className = "asset-asset-cell-contract";
    const contractInput = document.createElement("input");
    contractInput.type = "text";
    contractInput.className = "asset-asset-input-contract";
    contractInput.value = data.contract || "";
    contractInput.placeholder = "";
    contractInput.addEventListener("input", onAssetUpdate);
    contractInput.addEventListener("blur", () => onAssetUpdate());
    contractInput.addEventListener("keydown", (e) => e.key === "Enter" && contractInput.blur());
    contractTd.appendChild(contractInput);
    tr.appendChild(contractTd);

    const salePriceTd = document.createElement("td");
    salePriceTd.className = "asset-asset-cell-sale-price";
    const salePriceInput = document.createElement("input");
    salePriceInput.type = "text";
    salePriceInput.className = "asset-asset-input-sale-price";
    salePriceInput.value = data.salePrice ? (formatNum(data.salePrice) || data.salePrice) : "";
    salePriceInput.placeholder = "-";
    salePriceInput.addEventListener("input", () => filterNumericInput(salePriceInput, false));
    salePriceInput.addEventListener("input", () => {
      updateAssetValueDisplay();
      onAssetUpdate();
    });
    salePriceInput.addEventListener("blur", () => {
      const formatted = formatNum(salePriceInput.value);
      if (formatted !== "") salePriceInput.value = formatted;
      updateAssetValueDisplay();
      onAssetUpdate();
    });
    salePriceInput.addEventListener("keydown", (e) => e.key === "Enter" && salePriceInput.blur());
    salePriceTd.appendChild(salePriceInput);
    tr.appendChild(salePriceTd);

    const loanTd = document.createElement("td");
    loanTd.className = "asset-asset-cell-loan";
    const loanInput = document.createElement("input");
    loanInput.type = "text";
    loanInput.className = "asset-asset-input-loan";
    loanInput.value = data.loan ? (formatNum(data.loan) || data.loan) : "";
    loanInput.placeholder = "-";
    loanInput.addEventListener("input", () => filterNumericInput(loanInput, false));
    loanInput.addEventListener("input", () => {
      updateAssetValueDisplay();
      onAssetUpdate();
    });
    loanInput.addEventListener("blur", () => {
      const formatted = formatNum(loanInput.value);
      if (formatted !== "") loanInput.value = formatted;
      updateAssetValueDisplay();
      onAssetUpdate();
    });
    loanInput.addEventListener("keydown", (e) => e.key === "Enter" && loanInput.blur());
    loanTd.appendChild(loanInput);
    tr.appendChild(loanTd);

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
    tr.appendChild(assetValueTd);

    const actionsTd = document.createElement("td");
    actionsTd.className = "asset-asset-cell-actions";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "asset-asset-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      tr.remove();
      onAssetUpdate();
    });
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

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
    nameInput.addEventListener("input", onAssetUpdate);
    nameInput.addEventListener("keydown", (e) => e.key === "Enter" && nameInput.blur());
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
    avgPriceInput.addEventListener("input", () => filterNumericInput(avgPriceInput, true));
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

    const currentPriceTd = document.createElement("td");
    currentPriceTd.className = "asset-stock-cell-current-price";
    const currentPriceInput = document.createElement("input");
    currentPriceInput.type = "text";
    currentPriceInput.className = "asset-stock-input-current-price";
    currentPriceInput.value = data.currentPrice ? (formatNum(data.currentPrice) || data.currentPrice) : "";
    currentPriceInput.placeholder = "-";
    currentPriceInput.addEventListener("input", () => filterNumericInput(currentPriceInput, true));
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

    const quantityTd = document.createElement("td");
    quantityTd.className = "asset-stock-cell-quantity";
    const quantityInput = document.createElement("input");
    quantityInput.type = "text";
    quantityInput.className = "asset-stock-input-quantity";
    quantityInput.value = data.quantity ?? "";
    quantityInput.placeholder = "-";
    quantityInput.addEventListener("input", () => filterNumericInput(quantityInput, false));
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
      appraisalAmtSpan.textContent = appraisalAmt !== null ? formatNum(Math.round(appraisalAmt)) : "";
      profitLossSpan.textContent = profitLoss !== null ? (profitLoss >= 0 ? "" : "-") + formatNum(Math.abs(Math.round(profitLoss))) : "";
      profitLossSpan.className = "asset-stock-profit-loss-display " + (profitLoss !== null ? (profitLoss >= 0 ? "profit" : "loss") : "");
      returnRateSpan.textContent = returnRate !== null ? Math.round(returnRate) + "%" : "";
      returnRateSpan.className = "asset-stock-return-rate-display " + (returnRate !== null ? (returnRate >= 0 ? "profit" : "loss") : "");
    }
    updateStockCalculations();

    const actionsTd = document.createElement("td");
    actionsTd.className = "asset-stock-cell-actions";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "asset-asset-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      tr.remove();
      onAssetUpdate();
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
      input.addEventListener("input", onAssetUpdate);
      input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
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
    delBtn.addEventListener("click", () => { tr.remove(); onAssetUpdate(); });
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
      input.addEventListener("input", () => filterNumericInput(input, false));
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
      input.addEventListener("input", () => { updateAnnuityCalc(); onAssetUpdate(); });
      input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
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
    delBtn.addEventListener("click", () => { tr.remove(); onAssetUpdate(); });
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
    nameInput.addEventListener("input", onAssetUpdate);
    nameInput.addEventListener("keydown", (e) => e.key === "Enter" && nameInput.blur());
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
    principalInput.addEventListener("input", () => filterNumericInput(principalInput, false));
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
    tr.appendChild(principalTd);

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
      monthlyInput.addEventListener("input", () => filterNumericInput(monthlyInput, false));
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
      const calc = calcAssetFromMonthlyDeposit(
        monthlyInput.value,
        openDateInput?.value,
        maturityDateInput?.value,
        rateInput?.value
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
    rateInput.placeholder = "-";
    rateInput.addEventListener("input", () => filterNumericInput(rateInput, true));
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
      monthsInput.addEventListener("input", () => filterNumericInput(monthsInput, false));
      monthsInput.addEventListener("input", () => {
        updateInterestAndMaturityAmt();
        onAssetUpdate();
      });
      monthsInput.addEventListener("keydown", (e) => e.key === "Enter" && monthsInput.blur());
      monthsTd.appendChild(monthsInput);
      tr.appendChild(monthsTd);
    }

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
    maturityDateInput.addEventListener("change", () => {
      refreshMaturityDate();
      if (isDeposit) updateDepositMaturityAmt();
      else {
        updatePrincipalFromCalc();
        updateInterestAndMaturityAmt();
      }
      onAssetUpdate();
    });
    maturityDateWrap.addEventListener("click", () => {
      maturityDateInput.focus();
      if (typeof maturityDateInput.showPicker === "function") maturityDateInput.showPicker();
      else maturityDateInput.click();
    });
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

    const maturityAmtTd = document.createElement("td");
    maturityAmtTd.className = "asset-asset-cell-maturity-amt";
    const maturityAmtDisplay = document.createElement("span");
    maturityAmtDisplay.className = "asset-asset-maturity-amt-display";
    maturityAmtDisplay.textContent = "";
    maturityAmtTd.appendChild(maturityAmtDisplay);
    tr.appendChild(maturityAmtTd);

    if (isDeposit) updateDepositMaturityAmt();
    else {
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
      tr.remove();
      onAssetUpdate();
    });
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

    return tr;
  }

  function saveAssets() {
    const rows = collectAssetRowsFromDOM(assetTableWrap);
    saveAssetRows(rows);
    const realEstateRows = collectRealEstateRowsFromDOM(assetTableWrap);
    saveRealEstateRows(realEstateRows);
    const stockRows = collectStockRowsFromDOM(assetTableWrap);
    saveStockRows(stockRows);
  }

  function updateAssetTotals() {
    ASSET_GROUPS.forEach((g) => {
      const el = subsectionElements[g.key];
      if (!el) return;
      let sum = 0;
      if (el.isStock) {
        el.tbody.querySelectorAll(".asset-asset-row-stock").forEach((tr) => {
          const appraisalSpan = tr.querySelector(".asset-stock-appraisal-amt-display");
          const appraisal = parseNum(appraisalSpan?.textContent);
          if (appraisal !== null) sum += appraisal;
        });
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
            <th class="asset-asset-th-principal">원금</th>
            <th class="asset-asset-th-rate">이자율</th>
            <th class="asset-asset-th-open-date">개설일</th>
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
            <th class="asset-asset-th-name">상품명</th>
            <th class="asset-asset-th-category">용도</th>
            <th class="asset-asset-th-principal">자산액</th>
            <th class="asset-asset-th-monthly">월납입액</th>
            <th class="asset-asset-th-rate">이자율</th>
            <th class="asset-asset-th-months">개월수</th>
            <th class="asset-asset-th-open-date">개설일</th>
            <th class="asset-asset-th-maturity-date">만기일</th>
            <th class="asset-asset-th-maturity-rate">만기율</th>
            <th class="asset-asset-th-interest">이자</th>
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
          <col class="asset-stock-col-current-price">
          <col class="asset-stock-col-quantity">
          <col class="asset-stock-col-appraisal-amt">
          <col class="asset-stock-col-return-rate">
          <col class="asset-stock-col-profit-loss">
          <col class="asset-stock-col-actions">
        </colgroup>
        <thead>
          <tr>
            <th class="asset-stock-th-name">종목명</th>
            <th class="asset-stock-th-category">주식분류</th>
            <th class="asset-stock-th-avg-price">평균단가</th>
            <th class="asset-stock-th-current-price">현재가</th>
            <th class="asset-stock-th-quantity">보유수량</th>
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
            <th class="asset-asset-th-rate">이자율</th>
            <th class="asset-asset-th-months">개월수</th>
            <th class="asset-asset-th-open-date">개설일</th>
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
    } else {
      const totalsColspan = isDeposit ? 2 : isSavings ? 2 : 3;
      const totalsEmptyCells = isDeposit ? 5 : isSavings ? 7 : 8;
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
        const tr = createRealEstateRow({}, onAssetUpdate);
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
      const tr = createRealEstateRow(row, onAssetUpdate);
      realEstateEl.tbody.insertBefore(tr, realEstateEl.totalsRow);
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
  const wrap = document.createElement("div");
  wrap.className = "asset-expense-view";

  const now = new Date();
  let filterType = "month";
  let filterYear = now.getFullYear();
  let filterMonth = now.getMonth() + 1;
  let filterStartDate = getTodayDateStr();
  let filterEndDate = getTodayDateStr();

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

  const filterBar = document.createElement("div");
  filterBar.className = "asset-expense-filter-bar";
  filterBar.innerHTML = `
    <div class="time-filter-tabs">
      <button type="button" class="time-filter-btn active" data-filter="month">월별</button>
      <button type="button" class="time-filter-btn" data-filter="week">일주일</button>
      <button type="button" class="time-filter-btn" data-filter="day">하루</button>
      <button type="button" class="time-filter-btn" data-filter="range">날짜 선택</button>
    </div>
    <div class="time-filter-day-wrap" data-filter-wrap="day" style="display:none">
      <div class="time-filter-day-nav">
        <button type="button" class="time-filter-day-prev" aria-label="이전 날짜">&lt;</button>
        <span class="time-filter-day-display">${formatDateForDayFilter(filterStartDate)}</span>
        <button type="button" class="time-filter-day-next" aria-label="다음 날짜">&gt;</button>
      </div>
    </div>
    <div class="time-filter-month-wrap" data-filter-wrap="month">
      <div class="asset-cashflow-dropdown-wrap">
        <button type="button" class="time-period-trigger asset-cashflow-trigger" id="asset-expense-month-trigger">${filterMonth}월</button>
        <div class="time-period-panel asset-cashflow-panel" id="asset-expense-month-panel">
          ${Array.from({ length: 12 }, (_, i) => {
            const m = i + 1;
            return `<div class="time-period-option" data-value="${m}">${m}월</div>`;
          }).join("")}
        </div>
      </div>
      <div class="asset-cashflow-year-nav">
        <button type="button" class="asset-cashflow-year-btn" aria-label="이전 연도">&lt;</button>
        <span class="asset-cashflow-year-display">${filterYear}</span>
        <button type="button" class="asset-cashflow-year-btn" aria-label="다음 연도">&gt;</button>
      </div>
    </div>
    <div class="time-filter-range-wrap" data-filter-wrap="range" style="display:none">
      <input type="date" class="time-filter-start-date" name="asset-filter-start" />
      <span>~</span>
      <input type="date" class="time-filter-end-date" name="asset-filter-end" />
    </div>
  `;

  const dayWrap = filterBar.querySelector("[data-filter-wrap='day']");
  const monthWrap = filterBar.querySelector("[data-filter-wrap='month']");
  const rangeWrap = filterBar.querySelector("[data-filter-wrap='range']");
  const dayDisplay = filterBar.querySelector(".time-filter-day-display");
  const dayPrevBtn = filterBar.querySelector(".time-filter-day-prev");
  const dayNextBtn = filterBar.querySelector(".time-filter-day-next");
  const startDateInput = filterBar.querySelector(".time-filter-start-date");
  const endDateInput = filterBar.querySelector(".time-filter-end-date");
  const monthTrigger = filterBar.querySelector("#asset-expense-month-trigger");
  const monthPanel = filterBar.querySelector("#asset-expense-month-panel");
  const monthDropdownWrap = filterBar.querySelector(".time-filter-month-wrap .asset-cashflow-dropdown-wrap");
  const yearDisplay = filterBar.querySelector(".asset-cashflow-year-display");
  const yearPrevBtn = filterBar.querySelector(".time-filter-month-wrap .asset-cashflow-year-btn:first-child");
  const yearNextBtn = filterBar.querySelector(".time-filter-month-wrap .asset-cashflow-year-btn:last-child");

  monthPanel.querySelectorAll(".time-period-option").forEach((o) => {
    o.classList.toggle("is-selected", o.dataset.value === String(filterMonth));
  });

  monthTrigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    monthPanel.classList.toggle("is-open");
    monthDropdownWrap.classList.toggle("is-open");
  });
  monthPanel.querySelectorAll(".time-period-option").forEach((o) => {
    o.addEventListener("click", (e) => {
      e.stopPropagation();
      filterMonth = parseInt(o.dataset.value, 10);
      monthTrigger.textContent = `${filterMonth}월`;
      monthPanel.classList.remove("is-open");
      monthDropdownWrap.classList.remove("is-open");
      monthPanel.querySelectorAll(".time-period-option").forEach((opt) => {
        opt.classList.toggle("is-selected", opt.dataset.value === String(filterMonth));
      });
      applyExpenseFilter();
    });
  });
  yearPrevBtn.addEventListener("click", () => {
    filterYear -= 1;
    yearDisplay.textContent = filterYear;
    applyExpenseFilter();
  });
  yearNextBtn.addEventListener("click", () => {
    filterYear += 1;
    yearDisplay.textContent = filterYear;
    applyExpenseFilter();
  });
  document.addEventListener("click", (e) => {
    if (!monthDropdownWrap?.contains(e.target)) {
      monthPanel?.classList.remove("is-open");
      monthDropdownWrap?.classList.remove("is-open");
    }
  });

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
  });
  dayNextBtn?.addEventListener("click", () => {
    const d = new Date(filterStartDate + "T12:00:00");
    d.setDate(d.getDate() + 1);
    filterStartDate = filterEndDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    startDateInput.value = filterStartDate;
    endDateInput.value = filterEndDate;
    updateDayDisplay();
    applyExpenseFilter();
  });

  startDateInput.value = filterStartDate;
  endDateInput.value = filterEndDate;

  const tableWrap = document.createElement("div");
  tableWrap.className = "asset-expense-table-wrap";
  const table = document.createElement("table");
  table.className = "asset-expense-table";
  table.innerHTML = `
    <colgroup>
      <col class="asset-expense-col-date">
      <col class="asset-expense-col-amount">
      <col class="asset-expense-col-flow-type">
      <col class="asset-expense-col-classification">
      <col class="asset-expense-col-name">
      <col class="asset-expense-col-payment">
      <col class="asset-expense-col-category">
      <col class="asset-expense-col-memo">
      <col class="asset-expense-col-delete">
    </colgroup>
    <thead>
      <tr>
        <th class="asset-expense-th-date">거래일</th>
        <th class="asset-expense-th-amount">금액</th>
        <th class="asset-expense-th-flow-type">큰분류</th>
        <th class="asset-expense-th-classification">소비/수입 분류</th>
        <th class="asset-expense-th-name">소비/수입 명</th>
        <th class="asset-expense-th-payment">결제수단</th>
        <th class="asset-expense-th-category">카테고리</th>
        <th class="asset-expense-th-memo">메모</th>
        <th class="asset-expense-th-delete"></th>
      </tr>
    </thead>
    <tbody></tbody>
    <tfoot class="asset-expense-tfoot">
      <tr class="asset-expense-summary-row">
        <td class="asset-expense-summary-label">합계</td>
        <td class="asset-expense-summary-total">-</td>
        <td colspan="7"></td>
      </tr>
    </tfoot>
  `;

  const tbody = table.querySelector("tbody");
  const totalEl = table.querySelector(".asset-expense-summary-total");

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

  function applyExpenseFilter() {
    const type = filterType;
    const y = filterYear;
    const m = filterMonth;
    const start = startDateInput.value || filterStartDate;
    const end = endDateInput.value || filterEndDate;
    tbody.querySelectorAll(".asset-expense-row").forEach((tr) => {
      const dateInput = tr.querySelector(".asset-expense-input-date");
      const dateStr = dateInput?.value || "";
      const show = isDateInRange(dateStr, type, y, m, start, end);
      tr.style.display = show ? "" : "none";
    });
    updateExpenseTotals();
  }

  function updateExpenseTotals() {
    let total = 0;
    table.querySelectorAll(".asset-expense-row").forEach((tr) => {
      if (tr.style.display === "none") return;
      const amtRaw = parseNum(tr.querySelector(".asset-expense-input-amount")?.value);
      const flowType = tr.querySelector(".asset-expense-input-flow-type")?.value || "";
      if (amtRaw !== null && (flowType === "입금" || flowType === "지출")) {
        const amt = flowType === "입금" ? Math.abs(amtRaw) : -Math.abs(amtRaw);
        total += amt;
      }
    });
    totalEl.textContent = total !== 0 ? formatNum(total) : "-";
  }

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "asset-expense-add-task";
  addBtn.innerHTML = '<span class="asset-expense-add-icon">+</span>';

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
    const rows = collectExpenseRowsFromDOM(table);
    saveExpenseRows(rows);
  }

  function createExpenseRow(data = {}, onTotalsUpdate, onFilterApply) {
    const tr = document.createElement("tr");
    tr.className = "asset-expense-row";
    const todayValue = getTodayDateValue();
    const dateValue = data.date || todayValue;
    const dateDisplayVal = formatDateYYMMDD(dateValue);
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "asset-expense-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      tr.remove();
      onTotalsUpdate?.();
      saveExpense();
    });
    const flowTypeValue = data.flowType ?? (data.category === "수입" ? "입금" : data.category ? "지출" : "");
    tr.innerHTML = `
      <td class="asset-expense-cell-date">
        <span class="asset-expense-date-display">${dateDisplayVal}</span>
        <input type="date" class="asset-expense-input-date" name="asset-expense-date" value="${dateValue}" tabindex="-1" />
      </td>
      <td class="asset-expense-cell-amount"><input type="text" class="asset-expense-input-amount" name="asset-expense-amount" placeholder="0" value="${(data.amount || "").replace(/"/g, "&quot;")}" /></td>
      <td class="asset-expense-cell-flow-type"></td>
      <td class="asset-expense-cell-classification"></td>
      <td class="asset-expense-cell-name"><input type="text" class="asset-expense-input-name" name="asset-expense-name" placeholder="" value="${(data.name || "").replace(/"/g, "&quot;")}" /></td>
      <td class="asset-expense-cell-payment"></td>
      <td class="asset-expense-cell-category"></td>
      <td class="asset-expense-cell-memo"><input type="text" class="asset-expense-input-memo" name="asset-expense-memo" placeholder="" value="${(data.memo || "").replace(/"/g, "&quot;")}" /></td>
      <td class="asset-expense-cell-delete"><div class="asset-expense-delete-wrap"></div></td>
    `;
    tr.querySelector(".asset-expense-delete-wrap").appendChild(delBtn);
    const flowTypeTd = tr.querySelector(".asset-expense-cell-flow-type");
    const categoryTd = tr.querySelector(".asset-expense-cell-category");
    const classificationTd = tr.querySelector(".asset-expense-cell-classification");
    const nameInput = tr.querySelector(".asset-expense-input-name");
    const memoInput = tr.querySelector(".asset-expense-input-memo");

    const initialCategory = data.category || "";
    const initialClassification = data.classification || "";

    const classificationDropdown = createExpenseClassificationDropdownByFlowType(
      flowTypeValue,
      initialClassification,
      initialCategory,
      () => {
        updateCategoryDisplay();
        applyAmountSign();
        onTotalsUpdate?.();
        saveExpense();
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

    const flowTypeDropdown = createExpenseFlowTypeDropdown(flowTypeValue, () => {
      const flowTypeInput = flowTypeTd.querySelector(".asset-expense-input-flow-type");
      classificationDropdown.refresh(flowTypeInput?.value || "");
      updateCategoryDisplay();
      applyAmountSign();
      onTotalsUpdate?.();
      saveExpense();
    });
    flowTypeTd.appendChild(flowTypeDropdown);

    const paymentTd = tr.querySelector(".asset-expense-cell-payment");
    const paymentInput = createExpensePaymentInput(data.payment || "", () => {
      onTotalsUpdate?.();
      saveExpense();
    });
    paymentTd.appendChild(paymentInput.wrap);

    const amountInput = tr.querySelector(".asset-expense-input-amount");

    function applyAmountSign() {
      const flowTypeInput = flowTypeTd.querySelector(".asset-expense-input-flow-type");
      const flowType = flowTypeInput?.value || "";
      const raw = parseNum(amountInput.value);
      if (raw === null) return;
      if (flowType !== "입금" && flowType !== "지출") return;
      const signed = flowType === "입금" ? Math.abs(raw) : -Math.abs(raw);
      amountInput.value = formatNum(signed);
      onTotalsUpdate?.();
    }

    const origRefresh = classificationDropdown.refresh;
    classificationDropdown.refresh = (flowType) => {
      origRefresh(flowType);
      updateCategoryDisplay();
    };
    updateCategoryDisplay();

    amountInput.addEventListener("blur", () => {
      applyAmountSign();
      onTotalsUpdate?.();
      saveExpense();
    });
    amountInput.addEventListener("input", () => {
      onTotalsUpdate?.();
      saveExpense();
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
    nameInput.addEventListener("blur", () => saveExpense());
    memoInput.addEventListener("blur", () => saveExpense());

    memoInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        memoInput.blur();
      }
    });

    const dateCell = tr.querySelector(".asset-expense-cell-date");
    const dateDisplay = tr.querySelector(".asset-expense-date-display");
    const dateInput = tr.querySelector(".asset-expense-input-date");
    dateInput.addEventListener("change", () => {
      dateDisplay.textContent = formatDateYYMMDD(dateInput.value);
      saveExpense();
      onFilterApply?.();
    });
    dateCell.addEventListener("click", (e) => {
      e.preventDefault();
      dateInput.focus();
      if (typeof dateInput.showPicker === "function") {
        dateInput.showPicker();
      }
    });
    return tr;
  }

  addBtn.addEventListener("click", () => {
    const tr = createExpenseRow({}, updateExpenseTotals, applyExpenseFilter);
    tbody.appendChild(tr);
    applyExpenseFilter();
    saveExpense();
  });

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
    });
  });
  startDateInput.addEventListener("change", applyExpenseFilter);
  endDateInput.addEventListener("change", applyExpenseFilter);

  const initialRows = loadExpenseRows();
  if (initialRows.length > 0) {
    initialRows.forEach((data) => {
      const tr = createExpenseRow(data, updateExpenseTotals, applyExpenseFilter);
      tbody.appendChild(tr);
    });
  } else {
    [1, 2, 3].forEach(() => {
      const tr = createExpenseRow({}, updateExpenseTotals, applyExpenseFilter);
      tbody.appendChild(tr);
    });
  }
  applyExpenseFilter();

  tableWrap.appendChild(table);

  const expenseTableContainer = document.createElement("div");
  expenseTableContainer.className = "asset-expense-table-container";
  expenseTableContainer.appendChild(tableWrap);
  const expenseAddButtonWrap = document.createElement("div");
  expenseAddButtonWrap.className = "asset-expense-add-button-wrap";
  expenseAddButtonWrap.appendChild(addBtn);
  expenseTableContainer.appendChild(expenseAddButtonWrap);

  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "asset-expense-settings-btn";
  settingsBtn.setAttribute("aria-label", "가계부 설정");
  settingsBtn.innerHTML = `<svg class="asset-expense-settings-icon" width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m19.845 13.561c.1-.505.155-1.027.155-1.561s-.055-1.056-.155-1.561l1.806-1.489c.502-.414.632-1.132.307-1.696l-.869-1.508c-.325-.564-1.011-.811-1.62-.582l-2.198.825c-.779-.684-1.689-1.218-2.691-1.559l-.385-2.316c-.108-.643-.663-1.114-1.314-1.114h-1.738c-.651 0-1.206.471-1.313 1.114l-.386 2.316c-1.002.341-1.912.875-2.691 1.559l-2.198-.825c-.61-.228-1.295.018-1.62.582l-.87 1.508c-.325.564-.195 1.282.307 1.696l1.806 1.489c-.1.505-.155 1.026-.155 1.561s.055 1.056.155 1.561l-1.806 1.489c-.502.414-.632 1.132-.307 1.696l.869 1.508c.325.564 1.011.811 1.62.582l2.198-.825c.779.684 1.689 1.218 2.691 1.559l.385 2.316c.109.643.664 1.114 1.315 1.114h1.738c.651 0 1.206-.471 1.313-1.114l.385-2.316c1.002-.341 1.913-.875 2.691-1.559l2.198.825c.609.229 1.295-.017 1.62-.582l.869-1.508c.325-.564.196-1.282-.307-1.696z"/><circle cx="12.012" cy="12" r="3"/></g></svg>`;
  if (options?.onOpenSettings) {
    settingsBtn.addEventListener("click", options.onOpenSettings);
  }
  filterBar.appendChild(settingsBtn);

  wrap.appendChild(filterBar);
  wrap.appendChild(expenseTableContainer);
  return wrap;
}

const DEFAULT_CAT_COLOR = "expense-cat-teal";
const DEFAULT_CLS_COLOR = "expense-cls-teal";
const DEFAULT_CATEGORY_LABELS = ["고정비", "변동비", "저축", "투자", "수입"];

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
              <button type="button" class="asset-settings-add-cat">+ 추가</button>
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
  const addCatBtn = modal.querySelector(".asset-settings-add-cat");
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
        input.addEventListener("input", () => { cats[i].label = input.value.trim(); });
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
      }
      input.addEventListener("focus", (e) => {
        e.stopPropagation();
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
          performSave();
        });
      }
      row.addEventListener("click", (e) => {
        if (!e.target.matches(".asset-settings-remove") && !e.target.matches("input")) {
          modal._selectedIdx = i;
          renderCategories(cats);
          renderClassifications(cats, modal._byCat);
        }
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
        clsInput.addEventListener("input", (e) => {
          if (!byCat[c.label]) byCat[c.label] = [];
          byCat[c.label][clsIdx].label = e.target.value.trim();
        });
        clsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); clsInput.blur(); } });
      }
      if (!isDefault) {
        row.querySelector(".asset-settings-remove").addEventListener("click", () => {
          byCat[c.label].splice(clsIdx, 1);
          renderClassifications(cats, byCat);
          modal._byCat = byCat;
          performSave();
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
        input.addEventListener("input", () => { modal._payments[i] = input.value.trim(); });
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
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

  addCatBtn.addEventListener("click", () => {
    const cats = modal._cats || [];
    const byCat = modal._byCat || {};
    cats.push({ label: "", color: DEFAULT_CAT_COLOR });
    byCat[""] = [];
    modal._selectedIdx = cats.length - 1;
    renderCategories(cats);
    renderClassifications(cats, byCat);
  });

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
  }

  saveBtn.addEventListener("click", () => {
    performSave();
    onSave?.();
    modal.hidden = true;
  });

  closeBtn.addEventListener("click", () => { modal.hidden = true; });
  backdrop.addEventListener("click", () => { modal.hidden = true; });

  return {
    modal,
    open() {
      loadAndRender();
      modal.hidden = false;
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

function renderPlanView() {
  const wrap = document.createElement("div");
  wrap.className = "asset-plan-view";

  const createTable = (title, col1Label, col4Label, col4Calculated, goalType, tableType) => {
    const section = document.createElement("div");
    section.className = "asset-plan-section";
    const h3 = document.createElement("h3");
    h3.className = "asset-plan-section-title";
    h3.textContent = title;
    section.appendChild(h3);
    const tableWrap = document.createElement("div");
    tableWrap.className = "asset-plan-table-wrap";
    const table = document.createElement("table");
    table.className = "asset-plan-table";
    const colgroup = document.createElement("colgroup");
    colgroup.innerHTML = `<col class="asset-plan-col-category" /><col class="asset-plan-col-amount" /><col class="asset-plan-col-amount" /><col class="asset-plan-col-amount" /><col class="asset-plan-col-goal" /><col class="asset-plan-col-delete" />`;
    table.appendChild(colgroup);
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>${col1Label}</th><th>월목표 금액</th><th>이번달 합계</th><th>${col4Label}</th><th>목표달성</th><th></th></tr>`;
    const tbody = document.createElement("tbody");

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "asset-plan-btn-add";
    addBtn.innerHTML = '<span class="asset-plan-add-icon">+</span>';

    function updateCol4AndGoal(tr) {
      const goalInput = tr.querySelector("td:nth-child(2) input");
      const totalInput = tr.querySelector("td:nth-child(3) input");
      const totalDisplay = tr.querySelector(".asset-plan-total-display");
      let goal = parseNum(goalInput?.value);
      let total = null;
      if ((tableType === "income" || tableType === "investSavings" || tableType === "expense") && totalDisplay) {
        total = parseNum(totalDisplay.textContent);
      } else if (totalInput) {
        total = parseNum(totalInput?.value);
      }
      if (col4Calculated) {
        const displayEl = tr.querySelector(".asset-plan-col4-display");
        if (displayEl && goalInput && (totalInput || totalDisplay)) {
          let diff = null;
          if (goal !== null && total !== null) {
            diff = goal - total;
            if (goalType === "min" || goalType === "max") diff = Math.max(0, diff);
          }
          displayEl.textContent = diff !== null ? formatNum(diff) : "-";
        }
      }
      const goalDisplayEl = tr.querySelector(".asset-plan-goal-display");
      if (goalDisplayEl) {
        const hasValues = goal !== null && total !== null;
        const achieved = hasValues && (goalType === "min" ? total >= goal : total <= goal);
        goalDisplayEl.textContent = hasValues ? (achieved ? "🎉 달성" : "실패") : "-";
        goalDisplayEl.className = "asset-plan-goal-display" + (achieved ? " is-achieved" : hasValues ? " is-failed" : "");
      }
    }

    addBtn.addEventListener("click", () => {
      const tr = document.createElement("tr");
      tr.className = "asset-plan-row";
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "asset-plan-btn-delete";
      deleteBtn.textContent = "삭제";
      deleteBtn.addEventListener("click", () => tr.remove());
      const col4Content = col4Calculated
        ? `<span class="asset-plan-col4-display">-</span>`
        : `<input type="text" class="asset-plan-input" placeholder="" />`;
      const col4Class = col4Calculated ? "asset-plan-cell-col4-calc" : "";
      const col1Content = (tableType === "income" || tableType === "investSavings" || tableType === "expense")
        ? `<td class="asset-plan-cell-category"></td>`
        : `<td><input type="text" class="asset-plan-input" placeholder="" /></td>`;
      const col3Content = (tableType === "income" || tableType === "investSavings" || tableType === "expense")
        ? `<td class="asset-plan-cell-total"><span class="asset-plan-total-display">-</span></td>`
        : `<td><input type="text" class="asset-plan-input asset-plan-input-amount" inputmode="numeric" placeholder="" /></td>`;
      tr.innerHTML = `${col1Content}<td><input type="text" class="asset-plan-input asset-plan-input-amount" inputmode="numeric" placeholder="" /></td>${col3Content}<td class="${col4Class}">${col4Content}</td><td class="asset-plan-cell-goal"><span class="asset-plan-goal-display">-</span></td><td class="asset-plan-cell-delete"><div class="asset-plan-delete-wrap"></div></td>`;
      tr.querySelector(".asset-plan-delete-wrap").appendChild(deleteBtn);
      const goalInput = tr.querySelector("td:nth-child(2) input");
      const totalInput = tr.querySelector("td:nth-child(3) input");
      const totalDisplay = tr.querySelector(".asset-plan-total-display");
      const categoryCell = tr.querySelector(".asset-plan-cell-category");
      if (tableType === "income" && categoryCell) {
        const dropdown = createPlanIncomeCategoryDropdown("", (classification) => {
          const sum = getExpenseSumByIncomeClassification(classification);
          if (totalDisplay) totalDisplay.textContent = sum > 0 ? formatNum(sum) : "-";
          updateCol4AndGoal(tr);
        });
        categoryCell.appendChild(dropdown.wrap);
      } else if (tableType === "investSavings" && categoryCell) {
        const dropdown = createPlanInvestSavingsCategoryDropdown("", (category, classification) => {
          const sum = getExpenseSumByInvestSavingsClassification(category, classification);
          if (totalDisplay) totalDisplay.textContent = sum > 0 ? formatNum(sum) : "-";
          updateCol4AndGoal(tr);
        });
        categoryCell.appendChild(dropdown.wrap);
      } else if (tableType === "expense" && categoryCell) {
        const dropdown = createPlanExpenseCategoryDropdown("", (category, classification) => {
          const sum = getExpenseSumByExpenseClassification(category, classification);
          if (totalDisplay) totalDisplay.textContent = sum > 0 ? formatNum(sum) : "-";
          updateCol4AndGoal(tr);
        });
        categoryCell.appendChild(dropdown.wrap);
      }
      if (categoryCell) {
        categoryCell.addEventListener("click", (e) => {
          if (e.target.closest(".asset-plan-category-display")) return;
        });
      }
      const formatAmount = (input) => {
        input.addEventListener("blur", () => {
          const formatted = formatNum(input.value);
          if (formatted !== "") input.value = formatted;
          updateCol4AndGoal(tr);
        });
        input.addEventListener("keydown", (e) => e.key === "Enter" && input.blur());
      };
      formatAmount(goalInput);
      if (totalInput) {
        formatAmount(totalInput);
        const onInput = () => updateCol4AndGoal(tr);
        goalInput.addEventListener("input", onInput);
        totalInput.addEventListener("input", onInput);
      } else if (totalDisplay && (tableType === "income" || tableType === "investSavings" || tableType === "expense")) {
        goalInput.addEventListener("input", () => updateCol4AndGoal(tr));
      }
      tbody.appendChild(tr);
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

  const viewTabs = document.createElement("div");
  viewTabs.className = "time-view-tabs";

  const periodWrap = document.createElement("div");
  periodWrap.className = "asset-cashflow-period-wrap";

  const monthWrap = document.createElement("div");
  monthWrap.className = "asset-cashflow-dropdown-wrap";
  const monthTrigger = document.createElement("button");
  monthTrigger.type = "button";
  monthTrigger.className = "time-period-trigger asset-cashflow-trigger";
  monthTrigger.textContent = `${selectedMonth}월`;
  const monthPanel = document.createElement("div");
  monthPanel.className = "time-period-panel asset-cashflow-panel";
  monthPanel.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    return `<div class="time-period-option" data-value="${m}">${m}월</div>`;
  }).join("");
  monthWrap.appendChild(monthTrigger);
  monthWrap.appendChild(monthPanel);

  const yearWrap = document.createElement("div");
  yearWrap.className = "asset-cashflow-year-nav";
  yearWrap.innerHTML = `
    <button type="button" class="asset-cashflow-year-btn" aria-label="이전 연도">&lt;</button>
    <span class="asset-cashflow-year-display">${selectedYear}</span>
    <button type="button" class="asset-cashflow-year-btn" aria-label="다음 연도">&gt;</button>
  `;
  const yearPrevBtn = yearWrap.querySelector(".asset-cashflow-year-btn:first-child");
  const yearNextBtn = yearWrap.querySelector(".asset-cashflow-year-btn:last-child");
  const yearDisplay = yearWrap.querySelector(".asset-cashflow-year-display");

  periodWrap.appendChild(monthWrap);
  periodWrap.appendChild(yearWrap);
  viewTabs.appendChild(periodWrap);
  wrap.appendChild(viewTabs);

  const dashboard = document.createElement("div");
  dashboard.className = "time-dashboard-view";

  monthTrigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    monthPanel.classList.toggle("is-open");
    monthWrap.classList.toggle("is-open");
  });
  monthPanel.querySelectorAll(".time-period-option").forEach((o) => {
    o.addEventListener("click", (e) => {
      e.stopPropagation();
      selectedMonth = parseInt(o.dataset.value, 10);
      monthTrigger.textContent = `${selectedMonth}월`;
      monthPanel.classList.remove("is-open");
      monthWrap.classList.remove("is-open");
      monthPanel.querySelectorAll(".time-period-option").forEach((opt) => {
        opt.classList.toggle("is-selected", opt.dataset.value === String(selectedMonth));
      });
      renderChart();
    });
  });

  yearPrevBtn.addEventListener("click", () => {
    selectedYear -= 1;
    yearDisplay.textContent = selectedYear;
    renderChart();
  });
  yearNextBtn.addEventListener("click", () => {
    selectedYear += 1;
    yearDisplay.textContent = selectedYear;
    renderChart();
  });

  monthPanel.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => {
    monthPanel.classList.remove("is-open");
    monthWrap.classList.remove("is-open");
  });

  monthPanel.querySelectorAll(".time-period-option").forEach((o) => {
    o.classList.toggle("is-selected", o.dataset.value === String(selectedMonth));
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
        <div class="asset-cashflow-flow-item" data-flow="${d.label}" style="background:${d.color}0d;border-color:${d.color}30">
          <div class="asset-cashflow-flow-icon" style="background:${d.color}25;color:${d.color}">
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
  return wrap;
}

export {
  loadExpenseRows,
  saveExpenseRows,
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

  const header = document.createElement("div");
  header.className = "asset-header dream-view-header-wrap";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "ASSET";
  const h = document.createElement("h1");
  h.className = "dream-view-title asset-title";
  h.textContent = "자산관리";
  header.appendChild(label);
  header.appendChild(h);
  el.appendChild(header);

  const viewTabs = document.createElement("div");
  viewTabs.className = "asset-view-tabs";
  viewTabs.innerHTML = `
    <button type="button" class="asset-view-tab active" data-view="expense">가계부</button>
    <button type="button" class="asset-view-tab" data-view="cashflow">현금흐름</button>
    <button type="button" class="asset-view-tab" data-view="networth">순자산</button>
    <button type="button" class="asset-view-tab" data-view="plan">자산관리계획</button>
  `;
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
      const table = contentWrap.querySelector(".asset-expense-table");
      if (table) {
        const rows = collectExpenseRowsFromDOM(table);
        saveExpenseRows(rows);
      }
    }
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
    renderView(view);
  }

  viewTabs.querySelectorAll(".asset-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  renderView("expense");

  setupScrollClosePanels();

  return el;
}
