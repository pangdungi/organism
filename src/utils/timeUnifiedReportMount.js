/**
 * 시간 레포트 — 데이터 기반 통합 UI (AI 분석 없음)
 */

import { applyStaticAppIconImg } from "./staticAppIconImg.js";
import { getBudgetDayReportForDay } from "./diaryBudgetDayReport.js";
import { getTaskOptionByName } from "./timeTaskOptionsModel.js";
import { getScopedLocalStorageItem } from "./clientStorageScope.js";
import { KPI_MAP_STORAGE_KEYS, readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import {
  countCalendarDaysInInclusiveRange,
  countKpiDaysWithRecordedMinutesInDateRange,
  getAccumulatedMinutesForKpiIdInDateRange,
} from "./timeKpiSync.js";
import {
  TIME_DAILY_BUDGET_GOALS_KEY,
  readTimeDailyBudgetGoalsRaw,
} from "./timeDailyBudgetModel.js";
import {
  formatIntegerMinutesDurationKo,
  formatLedgerLossKrwDisplay,
  getDailyInvestReclaimSnapshot,
  getDailyProductiveCategoryInvestBarsSnapshot,
  getDailyProductiveCategoryTaskBreakdown,
  getDailyConsumptionCategoryTaskBreakdown,
  getDailyHealthyMealDetails,
  getDailyHealthyMealIntakeMinutes,
  getDailyUnhealthyMealIntakeMinutes,
  getDailyNonproductiveWastedSnapshot,
  getDailyTimeReportDonutSnapshot,
  getDailyTimeReportSummaryGrid,
  getDailyTimeReportTopTasksByMinutes,
  getMonthlyInvestReclaimSnapshot,
  getMonthlyProductiveCategoryInvestBarsSnapshot,
  getMonthlyProductiveCategoryTaskBreakdown,
  getMonthlyConsumptionCategoryTaskBreakdown,
  getMonthlyHealthyMealDetails,
  getMonthlyHealthyMealIntakeMinutes,
  getMonthlyUnhealthyMealIntakeMinutes,
  getMonthlyTimeReportDonutSnapshot,
  getMonthlyTimeReportSummaryGrid,
  getMonthlyTimeReportTopTasksByMinutes,
  getMonthlyNonproductiveWastedSnapshot,
  getDailyTimeReportHeroSnapshot,
  getMonthlyTimeReportHeroSnapshot,
  formatInvestReclaimWonDisplay,
  formatYmdDotsWithWeekdayKo,
} from "../views/Time.js";

const REPORT_DONUT_PASTELS = [
  "#93C5FD",
  "#FCA5A5",
  "#86EFAC",
  "#C4B5FD",
  "#FCD34D",
  "#5EEAD4",
  "#F9A8D4",
  "#A5B4FC",
  "#FDBA74",
  "#DDD6FE",
];

/** 시간 레포트 요약 카드용 PNG (public/diary-tr-icons) — 사용자 제공 순서 1~12 */
const DIARY_TR_ICON_BASE = "/diary-tr-icons";
const DIARY_TR_ICON = {
  routineDone: `${DIARY_TR_ICON_BASE}/01-routine-done.png`,
  routineZero: `${DIARY_TR_ICON_BASE}/02-routine-zero.png`,
  healthExist: `${DIARY_TR_ICON_BASE}/03-health-exist.png`,
  happinessLive: `${DIARY_TR_ICON_BASE}/04-happiness-live.png`,
  dreamCloser: `${DIARY_TR_ICON_BASE}/05-dream-closer.png`,
  sideincomeValue: `${DIARY_TR_ICON_BASE}/06-sideincome-value.png`,
  work: `${DIARY_TR_ICON_BASE}/07-work.png`,
  sleep: `${DIARY_TR_ICON_BASE}/08-sleep.png`,
  media: `${DIARY_TR_ICON_BASE}/09-media.png`,
  pleasure: `${DIARY_TR_ICON_BASE}/10-pleasure.png`,
  unhealthy: `${DIARY_TR_ICON_BASE}/11-unhealthy.png`,
  moneylosing: `${DIARY_TR_ICON_BASE}/12-moneylosing.png`,
  /** 불행 비생산 카테고리 — 사용자 제공 아이콘 */
  unhappiness: `${DIARY_TR_ICON_BASE}/13-unhappiness.png`,
  /** 건강하지 않은 섭취 식단 카드 */
  unhealthyMealIntake: `${DIARY_TR_ICON_BASE}/14-unhealthy-meal-intake.png`,
  /** 건강한 섭취 식단 카드 */
  healthyMealIntake: `${DIARY_TR_ICON_BASE}/15-healthy-meal-intake.png`,
};

/** 아이콘 슬롯에 PNG 채우기(점선 빈 슬롯 대체) */
function fillDiaryTrSummaryIconSlot(iconSlot, src) {
  iconSlot.textContent = "";
  iconSlot.classList.remove("diary-tr-summary-icon-slot--empty");
  iconSlot.classList.add("diary-tr-summary-icon-slot--img");
  const img = document.createElement("img");
  img.className = "diary-tr-summary-icon-img";
  img.src = src;
  img.alt = "";
  applyStaticAppIconImg(img);
  iconSlot.appendChild(img);
}

/** 소비·투자 레포트 — 섭취 식단 전용 카드(탭 상세 없음) */
function appendTimeReportMealIntakeCard(grid, { title, iconSrc, minutes, meals }) {
  const art = document.createElement("article");
  art.className = "diary-tr-summary-card diary-tr-meal-intake-card";
  art.setAttribute("aria-label", title);

  const iconSlot = document.createElement("div");
  iconSlot.className = "diary-tr-summary-icon-slot diary-tr-summary-icon-slot--empty";
  iconSlot.setAttribute("aria-hidden", "true");
  if (iconSrc) fillDiaryTrSummaryIconSlot(iconSlot, iconSrc);

  const h = document.createElement("h3");
  h.className = "diary-tr-summary-title";
  h.textContent = title;

  const timeEl = document.createElement("p");
  timeEl.className = "diary-tr-summary-time";
  timeEl.textContent = formatIntegerMinutesDurationKo(minutes);

  art.appendChild(iconSlot);
  art.appendChild(h);
  art.appendChild(timeEl);

  if (Array.isArray(meals) && meals.length > 0) {
    const ul = document.createElement("ul");
    ul.className = "diary-tr-summary-meals";
    meals.forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line;
      ul.appendChild(li);
    });
    art.appendChild(ul);
  }

  grid.appendChild(art);
}

/** 투자 탭 레포트 — 생산 카테고리 막대 채색(소비 도넛과 같은 톤) */
const DIARY_PROD_CAT_BAR_FILL = {
  dream: "#93C5FD",
  happiness: "#FCA5A5",
  sideincome: "#86EFAC",
  health: "#C4B5FD",
  other_prod: "#CBD5E1",
};

/** 예산·소비 막대 — 비생산 카테고리(도넛 파스텔 톤) */
const DIARY_CONSUMPTION_CAT_BAR_FILL = {
  media_watch: "#FCA5A5",
  pleasure: "#FDBA74",
  unhealthy: "#FCD34D",
  moneylosing: "#5EEAD4",
  unhappiness: "#F9A8D4",
};

/** 과제명 → 막대 색(투자·소비 레포트와 동일 카테고리 매핑, 없으면 파스텔 순환) */
function diaryTrBarFillForTaskName(taskName, fallbackIndex = 0) {
  const opt = getTaskOptionByName(String(taskName || "").trim());
  const cat = String(opt?.category || "").trim().toLowerCase();
  if (cat && DIARY_PROD_CAT_BAR_FILL[cat]) return DIARY_PROD_CAT_BAR_FILL[cat];
  if (cat && DIARY_CONSUMPTION_CAT_BAR_FILL[cat]) return DIARY_CONSUMPTION_CAT_BAR_FILL[cat];
  const prod = String(opt?.productivity || "").trim().toLowerCase();
  if (prod === "productive") return DIARY_PROD_CAT_BAR_FILL.other_prod;
  return REPORT_DONUT_PASTELS[fallbackIndex % REPORT_DONUT_PASTELS.length];
}

/** 생산 카테고리 막대 스냅샷과 동일 출처로 분 단위 시간(카드 그리드용) */
function investProdCategoryMinutesRounded(snap, categoryKey) {
  const seg = (snap?.segments ?? []).find((s) => s.categoryKey === categoryKey);
  if (!seg || !(seg.hours > 0) || !Number.isFinite(seg.hours)) return 0;
  return Math.round(seg.hours * 60);
}

/** 탭 2 통제일기 Q&A 템플릿 */
const TAB2_QA_TEMPLATE = [
  "오늘 내가 자제하지 못한 나쁜 습관은 무엇인가?",
  "어떻게 해야 더 나아질 수 있는가?",
  "지금 내 행동은 좋은 것인가?",
  "어떻게 스스로를 향상시킬 것인가?",
  "지금 이 순간에 대한 명확한 판단은?",
  "지금 이 순간에 맞는 상식적 행동은?",
  "일이 잘 되어갈 때의 감사한 태도",
  "통제할 수 없는 것",
  "통제할 수 있는 것",
];

/** 푸터·짧은 표기 */
function diaryTabLabel(tabId) {
  if (tabId === "2") return "레포트";
  return "메모";
}

/** 모달 제목 등 긴 표기 */
function diaryTabModalTitle(tabId) {
  if (tabId === "2") return "레포트";
  return "메모";
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr || dateStr.length < 10) return "";
  const [y, m, d] = dateStr.split("-");
  return `${y}/${m}/${d}`;
}

/** YYYY-MM-DD 또는 앞 7자 → YYYY/MM (먼스 모드 표시용) */
function formatMonthSlashFromYmd(ymd) {
  const n = normalizeDiaryDateStr(ymd);
  if (!n || n.length < 7) return "";
  return `${n.slice(0, 4)}/${n.slice(5, 7)}`;
}

function normalizeDiaryDateStr(dateVal) {
  if (!dateVal) return "";
  return String(dateVal).replace(/\//g, "-").slice(0, 10);
}

/** 시간 리포트 — 화면에 보이는 날/월 구간만 서버에서 pull */
function diaryReportLedgerPullRange(ymd, granularity) {
  const yTen = normalizeDiaryDateStr(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yTen)) {
    const t = timeLedgerLocalTodayYmd();
    return { rangeStart: t, rangeEnd: t };
  }
  if (granularity === "month") {
    const monthRng = getTimeReportMonthInclusiveRange(yTen);
    if (monthRng) return monthRng;
  }
  return { rangeStart: yTen, rangeEnd: yTen };
}

/** 소비 탭 일별 도넛 위 제목 — 오늘이면 「오늘」, 아니면 날짜표기 포함 */
function timeReportDayDonutBlockTitle(ymdTen) {
  const ten = normalizeDiaryDateStr(ymdTen);
  if (!ten || ten.length < 10) return "하루 시간 사용";
  if (ten === toDateStr(new Date())) return "오늘 하루 시간 사용";
  const disp = formatDateDisplay(ten);
  return disp ? `${disp} 하루 시간 사용` : "하루 시간 사용";
}

/** 소비 탭 월별 도넛 위 제목 — 이번 달이면 「이번 달」, 아니면 YYYY/MM */
function timeReportMonthDonutBlockTitle(ymdTen) {
  const ten = normalizeDiaryDateStr(ymdTen);
  if (!ten || ten.length < 10) return "월별 시간 사용";
  const ymAnchor = ten.slice(0, 7);
  const today = toDateStr(new Date());
  if (ymAnchor === today.slice(0, 7)) return "이번 달 시간 사용";
  const disp = formatMonthSlashFromYmd(ten);
  return disp ? `${disp} 시간 사용` : "월별 시간 사용";
}

/** 「시간 소비 리포트」 아래 — 비생산 합 시간 문구 타이틀 */
function timeReportWasteMiniTitle(ymdTen, granularity) {
  const ten = normalizeDiaryDateStr(ymdTen);
  if (granularity === "month") {
    const ym = ten.length >= 7 ? ten.slice(0, 7) : "";
    const today = toDateStr(new Date());
    const disp = formatMonthSlashFromYmd(ten);
    if (!disp) return "내가 낭비한 시간";
    if (ym && ym === today.slice(0, 7)) return "이번 달 내가 낭비한 시간";
    return `${disp} 내가 낭비한 시간`;
  }
  if (!ten || ten.length < 10) return "내가 낭비한 시간";
  if (ten === toDateStr(new Date())) return "오늘 내가 낭비한 시간";
  const disp = formatDateDisplay(ten);
  return disp ? `${disp} 내가 낭비한 시간` : "그날 내가 낭비한 시간";
}

/** 「시간 투자 리포트」 아래 — 투자 집계 시간 문구 타이틀(소비 낭비 미니와 동형) */
function timeReportInvestMiniTitle(ymdTen, granularity) {
  const ten = normalizeDiaryDateStr(ymdTen);
  if (granularity === "month") {
    const ym = ten.length >= 7 ? ten.slice(0, 7) : "";
    const today = toDateStr(new Date());
    const disp = formatMonthSlashFromYmd(ten);
    if (!disp) return "내가 투자한 시간";
    if (ym && ym === today.slice(0, 7)) return "이번 달 내가 투자한 시간";
    return `${disp} 내가 투자한 시간`;
  }
  if (!ten || ten.length < 10) return "내가 투자한 시간";
  if (ten === toDateStr(new Date())) return "내가 오늘 투자한 시간";
  const disp = formatDateDisplay(ten);
  return disp ? `${disp} 내가 투자한 시간` : "그날 내가 투자한 시간";
}

/** 앵커 날짜에서 ±N달(일은 해당 월 말일에 맞춤) */
function shiftCalendarMonthBy(ymdTen, deltaMonths) {
  const n = normalizeDiaryDateStr(ymdTen);
  if (!n || n.length < 10) return toDateStr(new Date());
  const y = parseInt(n.slice(0, 4), 10);
  const mo = parseInt(n.slice(5, 7), 10) - 1;
  const d = parseInt(n.slice(8, 10), 10);
  const first = new Date(y, mo + deltaMonths, 1);
  const y2 = first.getFullYear();
  const m2 = first.getMonth();
  const lastDay = new Date(y2, m2 + 1, 0).getDate();
  const dayClamped = Math.min(Number.isFinite(d) ? d : 1, lastDay);
  return toDateStr(new Date(y2, m2, dayClamped));
}

/** 앵커 날짜에서 ±N일 */
function shiftCalendarDayBy(ymdTen, deltaDays) {
  const n = normalizeDiaryDateStr(ymdTen);
  if (!n || n.length < 10) return toDateStr(new Date());
  const y = parseInt(n.slice(0, 4), 10);
  const mo = parseInt(n.slice(5, 7), 10) - 1;
  const d = parseInt(n.slice(8, 10), 10);
  const dt = new Date(y, mo, d);
  dt.setDate(dt.getDate() + deltaDays);
  return toDateStr(dt);
}

/** 일기 날짜 내림차순, 같은 날짜면 id 내림차순 */
function compareDiaryEntriesNewestFirst(a, b) {
  const byDate = (b.date || "").localeCompare(a.date || "");
  if (byDate !== 0) return byDate;
  return (b.id || "").localeCompare(a.id || "");
}

/** Q&A 답 영역: 폭 변경 시 autosize 재실행(내부 스크롤 없을 때 잘림 방지) */
function attachDiaryQaAnswerResizeSync(ansEl, adjustHeight) {
  if (!ansEl || typeof ResizeObserver === "undefined") return;
  const block =
    ansEl.closest(".diary-qa-block") ||
    ansEl.closest(".time-task-log-field") ||
    ansEl.closest("[data-lp-diary-qa-block]");
  if (!block) return;
  const ro = new ResizeObserver(() => {
    if (!ansEl.isConnected) {
      ro.disconnect();
      return;
    }
    adjustHeight();
  });
  ro.observe(block);
}

/** 기존 날짜 기반 데이터를 entry 배열로 마이그레이션 */
function migrateToEntries(tabData) {
  if (Array.isArray(tabData)) return tabData;
  if (tabData && typeof tabData === "object" && !tabData.entries) {
    return Object.entries(tabData).map(([date, v]) => ({
      id: date,
      date,
      title: "제목없음",
      content: v?.content || "",
    }));
  }
  return tabData?.entries || [];
}

function getTabEntriesList(tabId, all) {
  const tab = all[tabId];
  const list = migrateToEntries(tab);
  return list.sort(compareDiaryEntriesNewestFirst);
}


/** 통합 레포트 히어로 — 점수·가용·투자·소비·순가치·예산 요약 */
function mountTimeReportUnifiedHero(scrollWrap, ymdTen, granularity) {
  const snap =
    granularity === "month"
      ? getMonthlyTimeReportHeroSnapshot(ymdTen)
      : getDailyTimeReportHeroSnapshot(ymdTen);
  const budgetSnap =
    granularity === "day" ? getBudgetDayReportForDay(ymdTen) : null;

  const shell = document.createElement("section");
  shell.className = "diary-tr-report-hero-shell";
  shell.setAttribute(
    "aria-label",
    granularity === "month" ? "월간 시간 레포트 요약" : "오늘 하루 시간 레포트 요약",
  );

  const card = document.createElement("div");
  card.className = "diary-tr-report-hero-card";

  const head = document.createElement("div");
  head.className = "diary-tr-report-hero-head";

  const scoreBlock = document.createElement("div");
  scoreBlock.className = "diary-tr-report-hero-score";
  const scoreVal = document.createElement("p");
  scoreVal.className = "diary-tr-report-hero-score-value";
  scoreVal.textContent = String(snap.score);
  const scoreLbl = document.createElement("p");
  scoreLbl.className = "diary-tr-report-hero-score-label";
  scoreLbl.textContent = granularity === "month" ? "월간 점수" : "오늘 점수";
  scoreBlock.appendChild(scoreVal);
  scoreBlock.appendChild(scoreLbl);

  const headText = document.createElement("div");
  headText.className = "diary-tr-report-hero-head-text";
  const title = document.createElement("h2");
  title.className = "diary-tr-report-hero-title";
  title.textContent =
    granularity === "month"
      ? timeReportMonthDonutBlockTitle(ymdTen)
      : formatYmdDotsWithWeekdayKo(ymdTen) || timeReportDayDonutBlockTitle(ymdTen);
  const subtitle = document.createElement("p");
  subtitle.className = "diary-tr-report-hero-subtitle";
  subtitle.textContent =
    granularity === "month"
      ? "가용시간 대비 생산적 투자 비율"
      : "가용시간 대비 생산적 투자로 오늘을 평가해요";
  headText.appendChild(title);
  headText.appendChild(subtitle);

  head.appendChild(scoreBlock);
  head.appendChild(headText);
  card.appendChild(head);

  const stats = document.createElement("div");
  stats.className = "diary-tr-report-hero-stats";

  function appendStat(label, value, extraClass) {
    const item = document.createElement("div");
    item.className = "diary-tr-report-hero-stat";
    const lbl = document.createElement("p");
    lbl.className = "diary-tr-report-hero-stat-label";
    lbl.textContent = label;
    const val = document.createElement("p");
    val.className =
      "diary-tr-report-hero-stat-value" + (extraClass ? ` ${extraClass}` : "");
    val.textContent = value;
    item.appendChild(lbl);
    item.appendChild(val);
    stats.appendChild(item);
  }

  const availLabel = granularity === "month" ? "일평균 가용" : "가용 시간";
  appendStat(availLabel, formatIntegerMinutesDurationKo(snap.availableMinutes));
  appendStat("투자 시간", formatIntegerMinutesDurationKo(snap.productiveMinutes));
  appendStat("소비(낭비)", formatIntegerMinutesDurationKo(snap.wasteMinutes));

  let netText = "₩0";
  let netClass = "diary-tr-report-hero-stat-value--neutral";
  if (snap.netWon > 0) {
    netText = formatInvestReclaimWonDisplay(snap.netWon);
    netClass = "diary-tr-report-hero-stat-value--gain";
  } else if (snap.netWon < 0) {
    netText = formatLedgerLossKrwDisplay(Math.abs(snap.netWon));
    netClass = "diary-tr-report-hero-stat-value--loss";
  }
  appendStat("순 가치", netText, netClass);

  card.appendChild(stats);

  if (snap.focusLabel && snap.focusPct > 0) {
    const focus = document.createElement("p");
    focus.className = "diary-tr-report-hero-focus";
    focus.textContent = `집중 영역 · ${snap.focusLabel} ${snap.focusPct}%`;
    card.appendChild(focus);
  }

  if (snap.mediaMinutes > 0) {
    const media = document.createElement("p");
    media.className = "diary-tr-report-hero-media";
    media.textContent = `미디어 시청 ${formatIntegerMinutesDurationKo(snap.mediaMinutes)}`;
    card.appendChild(media);
  }

  if (budgetSnap) {
    const budgetLine = document.createElement("p");
    budgetLine.className = "diary-tr-report-hero-budget";
    const well = budgetSnap.wellDone.length;
    const adjust = budgetSnap.productivity.length;
    const unplanned = budgetSnap.unplannedNonproductive.length;
    budgetLine.textContent = `예산 · 잘했어요 ${well} · 조정 ${adjust} · 계획外 ${unplanned}`;
    card.appendChild(budgetLine);
  }

  shell.appendChild(card);
  scrollWrap.appendChild(shell);
}

function mountTimeReportSubsectionHeader(scrollWrap, title) {
  const block = document.createElement("div");
  block.className = "diary-tr-report-subsection-header";
  const h2 = document.createElement("h2");
  h2.className = "diary-tr-report-subsection-title";
  h2.textContent = title;
  block.appendChild(h2);
  scrollWrap.appendChild(block);
}

export function mountUnifiedTimeReport(scrollWrap, ymdTen, granularity) {
mountTimeReportUnifiedHero(scrollWrap, ymdTen, granularity);
mountTimeReportProductiveBars(scrollWrap, ymdTen, granularity);
mountTimeReportInvestSectionHeader(scrollWrap);
mountTimeReportInvestMini(scrollWrap, ymdTen, granularity);
mountTimeReportInvestMotivationCards(scrollWrap, ymdTen, granularity);
mountTimeReportInvestRoutineTrackerHeader(scrollWrap);
mountTimeReportInvestRoutineKpiTimeCards(scrollWrap, ymdTen, granularity);
mountTimeReportDonut(scrollWrap, ymdTen, granularity);
mountTimeReportWorkSleepStrip(scrollWrap, ymdTen, granularity);
mountTimeReportConsumptionTopTasks(scrollWrap, ymdTen, granularity);
mountTimeReportConsumptionSectionHeader(scrollWrap);
mountTimeReportNonproductiveWasteMini(scrollWrap, ymdTen, granularity);
mountTimeReportSummaryGrid(scrollWrap, ymdTen, granularity);
}

/** 도넛 범례용 정수 % (합 100 근사) */
function legendIntegerPercents(hoursList, totalHrs) {
  if (!Array.isArray(hoursList) || totalHrs <= 0 || !hoursList.length) {
    return hoursList.map(() => 0);
  }
  const exact = hoursList.map((h) => (h / totalHrs) * 100);
  const out = exact.map((x) => Math.floor(x));
  let rem = 100 - out.reduce((a, b) => a + b, 0);
  const idxs = exact
    .map((x, i) => ({ i, f: x - out[i] }))
    .sort((a, b) => b.f - a.f);
  if (idxs.length === 0) return out;
  for (let k = 0; k < rem; k++) out[idxs[k % idxs.length].i] += 1;
  return out;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** 도넛 윗점(-90°) 기준 반시계향 호 조각(path d). 전체 원(≈360°)은 두 번으로 나눔 */
function annularSectorPath(cx, cy, rOut, rIn, a0, a1) {
  const span = a1 - a0;
  if (span <= 1e-9) return "";
  const twoPi = Math.PI * 2;
  if (span >= twoPi - 1e-5) {
    const h = annularSectorPath(cx, cy, rOut, rIn, a0, a0 + Math.PI);
    const h2 = annularSectorPath(cx, cy, rOut, rIn, a0 + Math.PI, a0 + twoPi);
    return `${h} ${h2}`;
  }
  const large = span > Math.PI ? 1 : 0;
  const x1 = cx + rOut * Math.cos(a0);
  const y1 = cy + rOut * Math.sin(a0);
  const x2 = cx + rOut * Math.cos(a1);
  const y2 = cy + rOut * Math.sin(a1);
  const x3 = cx + rIn * Math.cos(a1);
  const y3 = cy + rIn * Math.sin(a1);
  const x4 = cx + rIn * Math.cos(a0);
  const y4 = cy + rIn * Math.sin(a0);
  return [
    "M",
    x1,
    y1,
    "A",
    rOut,
    rOut,
    0,
    large,
    1,
    x2,
    y2,
    "L",
    x3,
    y3,
    "A",
    rIn,
    rIn,
    0,
    large,
    0,
    x4,
    y4,
    "Z",
  ].join(" ");
}

/** 투자 탭: 생산 과제 카테고리별 비중(가로 막대) */
function mountTimeReportProductiveBars(scrollWrap, ymdTen, granularity) {
  const snap =
    granularity === "month"
      ? getMonthlyProductiveCategoryInvestBarsSnapshot(ymdTen)
      : getDailyProductiveCategoryInvestBarsSnapshot(ymdTen);

  const section = document.createElement("section");
  section.className = "diary-tr-prod-bars-shell";
  section.setAttribute("aria-label", "생산 과제 카테고리별 투자 비중");

  const card = document.createElement("div");
  card.className = "diary-tr-prod-bars-card";
  if (!snap.totalProductiveHours || snap.totalProductiveHours <= 0) {
    const empty = document.createElement("p");
    empty.className = "diary-tr-prod-bars-empty";
    empty.textContent = "표시할 생산 과제 기록이 없습니다.";
    card.appendChild(empty);
  } else {
    snap.segments.forEach((seg) => {
      const row = document.createElement("div");
      row.className = "diary-tr-prod-bar-row";
      const meta = document.createElement("div");
      meta.className = "diary-tr-prod-bar-meta";
      const lab = document.createElement("span");
      lab.className = "diary-tr-prod-bar-label";
      lab.textContent = seg.label;
      const pct = document.createElement("span");
      pct.className = "diary-tr-prod-bar-pct";
      pct.textContent = `${seg.pctRounded}%`;
      meta.appendChild(lab);
      meta.appendChild(pct);
      const track = document.createElement("div");
      track.className = "diary-tr-prod-bar-track";
      track.setAttribute("aria-hidden", "true");
      const fill = document.createElement("div");
      fill.className = "diary-tr-prod-bar-fill";
      const wPct = Math.min(100, Math.max(0, seg.pct));
      fill.style.width = `${wPct}%`;
      fill.style.background =
        DIARY_PROD_CAT_BAR_FILL[seg.categoryKey] || DIARY_PROD_CAT_BAR_FILL.other_prod;
      track.appendChild(fill);
      row.appendChild(meta);
      row.appendChild(track);
      card.appendChild(row);
    });
  }

  section.appendChild(card);
  scrollWrap.appendChild(section);
}

/** 로그 탭 제거 — 과제 메모는 시간가계부 「메모만 보기」에서 조회 */

/** 시간 레포트 카드 탭 → 해당 카테고리 과제·시간 목록(투자·소비 공통) */
function openTimeReportCategoryTaskDetailModal(opts) {
  const {
    headline,
    categoryLabel,
    rows,
    periodLabel,
    emptyMessage = "이 기간에 해당하는 과제 기록이 없습니다.",
  } = opts;
  document.querySelectorAll(".diary-tr-invest-detail-modal").forEach((m) => m.remove());

  const modal = document.createElement("div");
  modal.className = "time-task-setup-modal diary-tr-invest-detail-modal";
  modal.removeAttribute("hidden");

  const backdrop = document.createElement("div");
  backdrop.className = "diary-tr-invest-detail-modal-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const panel = document.createElement("div");
  panel.className = "diary-tr-invest-detail-modal-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute(
    "aria-labelledby",
    "diary-tr-invest-detail-modal-title",
  );

  const header = document.createElement("div");
  header.className = "diary-tr-invest-detail-modal-header";

  const title = document.createElement("h3");
  title.id = "diary-tr-invest-detail-modal-title";
  title.className = "diary-tr-invest-detail-modal-title";
  title.textContent = headline;

  const meta = document.createElement("p");
  meta.className = "diary-tr-invest-detail-modal-meta";
  meta.textContent = `${periodLabel} · 카테고리 ${categoryLabel}`;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "diary-tr-invest-detail-modal-close";
  closeBtn.setAttribute("aria-label", "닫기");
  closeBtn.textContent = "×";

  header.appendChild(title);
  header.appendChild(meta);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "diary-tr-invest-detail-modal-body";

  const list = document.createElement("div");
  list.className = "diary-budget-unplanned-card diary-tr-invest-detail-list";

  if (!rows.length) {
    const empty = document.createElement("p");
    empty.className = "diary-tr-invest-detail-empty";
    empty.textContent = emptyMessage;
    body.appendChild(empty);
  } else {
    rows.forEach((row) => {
      const line = document.createElement("div");
      line.className = "diary-budget-unplanned-row";
      const nameEl = document.createElement("span");
      nameEl.className = "diary-budget-unplanned-name";
      nameEl.textContent = row.taskName;
      const timeEl = document.createElement("span");
      timeEl.className = "diary-budget-unplanned-time";
      timeEl.textContent = formatIntegerMinutesDurationKo(row.minutes);
      line.appendChild(nameEl);
      line.appendChild(timeEl);
      list.appendChild(line);
    });
    body.appendChild(list);
  }

  panel.appendChild(header);
  panel.appendChild(body);
  modal.appendChild(backdrop);
  modal.appendChild(panel);

  const close = () => {
    modal.remove();
    document.body.style.overflow = "";
  };
  closeBtn.addEventListener("click", close);
  /* 배경 탭으로 닫지 않음 (닫기는 ×만) */
  document.body.style.overflow = "hidden";
  document.body.appendChild(modal);
}

/** 투자 탭: 생산 카테고리 막대 아래 메시지형 카드(아이콘 미정) — 꿈·부수입·건강·행복 순 */
function mountTimeReportInvestMotivationCards(scrollWrap, ymdTen, granularity) {
  const snap =
    granularity === "month"
      ? getMonthlyProductiveCategoryInvestBarsSnapshot(ymdTen)
      : getDailyProductiveCategoryInvestBarsSnapshot(ymdTen);

  const section = document.createElement("section");
  section.className = "diary-tr-invest-quote-shell";
  section.setAttribute("aria-label", "투자 카테고리별 메시지와 생산 과제 시간");

  const grid = document.createElement("div");
  grid.className = "diary-tr-summary-grid diary-tr-invest-quote-grid";

  const periodLabel =
    granularity === "month"
      ? formatMonthSlashFromYmd(ymdTen)
      : formatDateDisplay(String(ymdTen || "").slice(0, 10));

  const healthyMeals =
    granularity === "month"
      ? getMonthlyHealthyMealDetails(ymdTen)
      : getDailyHealthyMealDetails(ymdTen);

  const defs = [
    {
      key: "dream",
      categoryLabel: "꿈",
      headline: "꿈에 더 가까이",
      subtitle: null,
      iconSrc: DIARY_TR_ICON.dreamCloser,
    },
    {
      key: "sideincome",
      categoryLabel: "부수입",
      headline: "내 시간의 가치는 내가 올린다",
      subtitle: null,
      iconSrc: DIARY_TR_ICON.sideincomeValue,
    },
    {
      key: "health",
      categoryLabel: "건강",
      headline: "내가 더 존재할 수 있게!",
      subtitle: null,
      iconSrc: DIARY_TR_ICON.healthExist,
    },
    {
      key: "happiness",
      categoryLabel: "행복",
      headline: "행복하려고 사는거지!",
      subtitle: null,
      iconSrc: DIARY_TR_ICON.happinessLive,
    },
  ];

  defs.forEach((def) => {
    const mins = investProdCategoryMinutesRounded(snap, def.key);
    const art = document.createElement("article");
    art.className =
      "diary-tr-summary-card diary-tr-invest-quote-card diary-tr-invest-quote-card--action";
    art.setAttribute("role", "button");
    art.setAttribute("tabindex", "0");
    art.setAttribute(
      "aria-label",
      `${def.headline}, ${formatIntegerMinutesDurationKo(mins)}. 탭하면 과제별 시간 목록`,
    );

    const iconSlot = document.createElement("div");
    iconSlot.className = "diary-tr-summary-icon-slot diary-tr-summary-icon-slot--empty";
    iconSlot.setAttribute("aria-hidden", "true");
    if (def.iconSrc) fillDiaryTrSummaryIconSlot(iconSlot, def.iconSrc);

    const h = document.createElement("h3");
    h.className = "diary-tr-summary-title diary-tr-invest-quote-headline";
    h.textContent = def.headline;

    art.appendChild(iconSlot);
    art.appendChild(h);
    if (def.subtitle) {
      const sub = document.createElement("p");
      sub.className = "diary-tr-invest-quote-subtitle";
      sub.textContent = def.subtitle;
      art.appendChild(sub);
    }

    const timeEl = document.createElement("p");
    timeEl.className = "diary-tr-summary-time";
    timeEl.textContent = formatIntegerMinutesDurationKo(mins);
    art.appendChild(timeEl);

    const openDetail = () => {
      const taskRows =
        granularity === "month"
          ? getMonthlyProductiveCategoryTaskBreakdown(ymdTen, def.key)
          : getDailyProductiveCategoryTaskBreakdown(ymdTen, def.key);
      openTimeReportCategoryTaskDetailModal({
        headline: def.headline,
        categoryLabel: def.categoryLabel,
        rows: taskRows,
        periodLabel,
        emptyMessage: "이 기간에 해당하는 생산 과제 기록이 없습니다.",
      });
    };
    art.addEventListener("click", openDetail);
    art.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetail();
      }
    });

    grid.appendChild(art);
  });

  appendTimeReportMealIntakeCard(grid, {
    title: "건강한 섭취",
    iconSrc: DIARY_TR_ICON.healthyMealIntake,
    minutes:
      granularity === "month"
        ? getMonthlyHealthyMealIntakeMinutes(ymdTen)
        : getDailyHealthyMealIntakeMinutes(ymdTen),
    meals: healthyMeals,
  });

  section.appendChild(grid);
  scrollWrap.appendChild(section);
}

/** 소비 탭: 도넛 아래 근무·수면 한 줄 — 소비 리포트와 구분 */
function mountTimeReportWorkSleepStrip(scrollWrap, ymdTen, granularity) {
  const g =
    granularity === "month"
      ? getMonthlyTimeReportSummaryGrid(ymdTen)
      : getDailyTimeReportSummaryGrid(ymdTen);

  const section = document.createElement("section");
  section.className = "diary-tr-work-sleep-shell";
  section.setAttribute("aria-label", "근무 시간과 수면 시간");

  const grid = document.createElement("div");
  grid.className = "diary-tr-summary-grid";

  [
    { title: "근무시간", minutes: g.workMinutes, iconSrc: DIARY_TR_ICON.work },
    { title: "수면시간", minutes: g.sleepMinutes, iconSrc: DIARY_TR_ICON.sleep },
  ].forEach((c) => {
    const art = document.createElement("article");
    art.className = "diary-tr-summary-card";

    const iconSlot = document.createElement("div");
    iconSlot.className = "diary-tr-summary-icon-slot diary-tr-summary-icon-slot--empty";
    iconSlot.setAttribute("aria-hidden", "true");
    if (c.iconSrc) fillDiaryTrSummaryIconSlot(iconSlot, c.iconSrc);

    const h = document.createElement("h3");
    h.className = "diary-tr-summary-title";
    h.textContent = c.title;

    const timeEl = document.createElement("p");
    timeEl.className = "diary-tr-summary-time";
    timeEl.textContent = formatIntegerMinutesDurationKo(c.minutes);

    art.appendChild(iconSlot);
    art.appendChild(h);
    art.appendChild(timeEl);
    grid.appendChild(art);
  });

  section.appendChild(grid);
  scrollWrap.appendChild(section);
}

/** 소비 탭: 근무·수면 아래 — 해당 기간 과제별 기록 시간 Top 3 */
function mountTimeReportConsumptionTopTasks(scrollWrap, ymdTen, granularity) {
  const rows =
    granularity === "month"
      ? getMonthlyTimeReportTopTasksByMinutes(ymdTen, 3)
      : getDailyTimeReportTopTasksByMinutes(ymdTen, 3);
  if (!rows.length) return;

  const section = document.createElement("section");
  section.className = "diary-tr-consumption-top3-shell";
  section.setAttribute("aria-label", "시간을 많이 쓴 과제 상위 3개");

  const title = document.createElement("h3");
  title.className = "diary-tr-consumption-top3-title";
  title.textContent = "Top 3";

  const card = document.createElement("div");
  card.className = "diary-tr-consumption-top3-card";

  card.appendChild(title);

  rows.forEach((row, idx) => {
    const line = document.createElement("div");
    line.className = "diary-tr-consumption-top3-row";
    const rank = document.createElement("span");
    rank.className = "diary-tr-consumption-top3-rank";
    rank.textContent = String(idx + 1);
    const nameEl = document.createElement("span");
    nameEl.className = "diary-tr-consumption-top3-name";
    nameEl.textContent = row.taskName;
    const timeEl = document.createElement("span");
    timeEl.className = "diary-tr-consumption-top3-time";
    timeEl.textContent = formatIntegerMinutesDurationKo(row.minutes);
    line.appendChild(rank);
    line.appendChild(nameEl);
    line.appendChild(timeEl);
    card.appendChild(line);
  });

  section.appendChild(card);
  scrollWrap.appendChild(section);
}

/** 소비 탭 일·월 공통: 아이콘 자리(점선 원) + 제목 + 시간·(원) 요약 카드 그리드(근무·수면 제외) */
function mountTimeReportSummaryGrid(scrollWrap, ymdTen, granularity) {
  const g =
    granularity === "month"
      ? getMonthlyTimeReportSummaryGrid(ymdTen)
      : getDailyTimeReportSummaryGrid(ymdTen);
  const section = document.createElement("section");
  section.className = "diary-tr-summary-shell";
  section.setAttribute(
    "aria-label",
    granularity === "month"
      ? "선택한 달의 시간 소비 카테고리 요약"
      : "선택한 날의 시간 소비 카테고리 요약",
  );

  const grid = document.createElement("div");
  grid.className = "diary-tr-summary-grid";

  const showMoney = g.hourlyRate > 0;
  const periodLabel =
    granularity === "month"
      ? formatMonthSlashFromYmd(ymdTen)
      : formatDateDisplay(String(ymdTen || "").slice(0, 10));

  /** @type {Array<{ categoryKey: string, categoryLabel: string, title: string, minutes: number, lossWon?: number | null }>} */
  const specs = [
    {
      categoryKey: "media_watch",
      categoryLabel: "미디어 시청",
      title: "미디어 시청시간",
      minutes: g.mediaMinutes,
      lossWon: showMoney ? g.mediaLossWon : null,
      iconSrc: DIARY_TR_ICON.media,
    },
    {
      categoryKey: "pleasure",
      categoryLabel: "쾌락",
      title: "도파민 충전료",
      minutes: g.pleasureMinutes,
      iconSrc: DIARY_TR_ICON.pleasure,
    },
    {
      categoryKey: "unhealthy",
      categoryLabel: "비건강",
      title: "건강을 해치는데 쓴 시간",
      minutes: g.unhealthyMinutes,
      iconSrc: DIARY_TR_ICON.unhealthy,
    },
    {
      categoryKey: "moneylosing",
      categoryLabel: "돈을 잃는 일",
      title: "시간도 잃고, 돈도 잃고",
      minutes: g.moneylosingMinutes,
      lossWon: showMoney ? g.moneylosingLossWon : null,
      iconSrc: DIARY_TR_ICON.moneylosing,
    },
    {
      categoryKey: "unhappiness",
      categoryLabel: "불행",
      title: "불행해지는데 쓴 시간",
      minutes: g.unhappinessMinutes,
      lossWon: showMoney ? g.unhappinessLossWon : null,
      iconSrc: DIARY_TR_ICON.unhappiness,
    },
  ];

  specs.forEach((c) => {
    const art = document.createElement("article");
    art.className =
      "diary-tr-summary-card diary-tr-invest-quote-card--action";
    art.setAttribute("role", "button");
    art.setAttribute("tabindex", "0");
    art.setAttribute(
      "aria-label",
      `${c.title}, ${formatIntegerMinutesDurationKo(c.minutes)}. 탭하면 과제별 시간 목록`,
    );

    const iconSlot = document.createElement("div");
    iconSlot.className = "diary-tr-summary-icon-slot diary-tr-summary-icon-slot--empty";
    iconSlot.setAttribute("aria-hidden", "true");
    if (c.iconSrc) fillDiaryTrSummaryIconSlot(iconSlot, c.iconSrc);

    const h = document.createElement("h3");
    h.className = "diary-tr-summary-title";
    h.textContent = c.title;

    const timeEl = document.createElement("p");
    timeEl.className = "diary-tr-summary-time";
    timeEl.textContent = formatIntegerMinutesDurationKo(c.minutes);

    art.appendChild(iconSlot);
    art.appendChild(h);
    art.appendChild(timeEl);

    if (c.lossWon != null) {
      appendTimeReportSummaryMoney(
        art,
        formatLedgerLossKrwDisplay(c.lossWon),
        "loss",
      );
    }

    const openDetail = () => {
      const taskRows =
        granularity === "month"
          ? getMonthlyConsumptionCategoryTaskBreakdown(ymdTen, c.categoryKey)
          : getDailyConsumptionCategoryTaskBreakdown(ymdTen, c.categoryKey);
      openTimeReportCategoryTaskDetailModal({
        headline: c.title,
        categoryLabel: c.categoryLabel,
        rows: taskRows,
        periodLabel,
      });
    };
    art.addEventListener("click", openDetail);
    art.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetail();
      }
    });

    grid.appendChild(art);
  });

  appendTimeReportMealIntakeCard(grid, {
    title: "건강하지 않은 섭취",
    iconSrc: DIARY_TR_ICON.unhealthyMealIntake,
    minutes:
      granularity === "month"
        ? getMonthlyUnhealthyMealIntakeMinutes(ymdTen)
        : getDailyUnhealthyMealIntakeMinutes(ymdTen),
    meals: g.unhealthyMealDetails,
  });

  section.appendChild(grid);
  scrollWrap.appendChild(section);
}

/** 도넛 카드 아래 · 요약 그리드 위 — 구분선 + 소제목 */
function mountTimeReportConsumptionSectionHeader(scrollWrap) {
  const block = document.createElement("div");
  block.className = "diary-tr-consumption-section-header";

  const rule = document.createElement("hr");
  rule.className = "diary-tr-consumption-section-rule";
  rule.setAttribute("aria-hidden", "true");

  const h2 = document.createElement("h2");
  h2.className = "diary-tr-consumption-section-title";
  h2.textContent = "시간 소비 리포트";

  block.appendChild(rule);
  block.appendChild(h2);
  scrollWrap.appendChild(block);
}

/** 생산 막대·바이백 카드 아래 · 동기 카드 그리드 바로 위 — 소비와 동일 클래스·구조 */
function mountTimeReportInvestSectionHeader(scrollWrap) {
  const block = document.createElement("div");
  block.className = "diary-tr-consumption-section-header";

  const rule = document.createElement("hr");
  rule.className = "diary-tr-consumption-section-rule";
  rule.setAttribute("aria-hidden", "true");

  const h2 = document.createElement("h2");
  h2.className = "diary-tr-consumption-section-title";
  h2.textContent = "시간 투자 리포트";

  block.appendChild(rule);
  block.appendChild(h2);
  scrollWrap.appendChild(block);
}

/** 동기 카드 그리드 아래 · 루틴 트래커 영역 제목만(소비·시간 투자 리포트 제목과 동일 클래스) */
function mountTimeReportInvestRoutineTrackerHeader(scrollWrap) {
  const block = document.createElement("div");
  block.className = "diary-tr-consumption-section-header";

  const rule = document.createElement("hr");
  rule.className = "diary-tr-consumption-section-rule";
  rule.setAttribute("aria-hidden", "true");

  const h2 = document.createElement("h2");
  h2.className = "diary-tr-consumption-section-title";
  h2.textContent = "루틴트랙커";

  block.appendChild(rule);
  block.appendChild(h2);
  scrollWrap.appendChild(block);
}

/** 맵 로컬 스토리지에서 매일 반복(습관 트래커) KPI 목록 — id·표시명 */
function collectDailyRepeatKpisFromLocalMaps() {
  /** @type {Array<{ id: string, name: string }>} */
  const out = [];
  KPI_MAP_STORAGE_KEYS.forEach((key) => {
    try {
      const raw = readKpiMapScopedStorageRaw(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const kpis = parsed?.kpis || [];
      for (const k of kpis) {
        if (!k || !k.needHabitTracker) continue;
        const id = String(k.id || "").trim();
        const name = String(k.name || "").trim();
        if (!id || !name) continue;
        out.push({ id, name });
      }
    } catch (_) {}
  });
  const seen = new Set();
  return out
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

/** 루틴트랙커 제목 아래: KPI별 일·월 구간 합산 시간 — 1분 이상 체크 원, 0분 취소 원 */
function mountTimeReportInvestRoutineKpiTimeCards(scrollWrap, ymdTen, granularity) {
  const kpis = collectDailyRepeatKpisFromLocalMaps();
  if (kpis.length === 0) return;

  let start;
  let end;
  if (granularity === "month") {
    const range = getTimeReportMonthInclusiveRange(ymdTen);
    if (!range) return;
    start = range.start;
    end = range.end;
  } else {
    const d = normalizeDiaryDateStr(ymdTen);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    start = end = d;
  }

  const section = document.createElement("section");
  section.className = "diary-tr-routine-kpi-shell";
  section.setAttribute("aria-label", "매일 반복 KPI 과제 시간");

  const grid = document.createElement("div");
  grid.className = "diary-tr-summary-grid";

  kpis.forEach((k) => {
    const mins = getAccumulatedMinutesForKpiIdInDateRange(k.id, start, end);
    const art = document.createElement("article");
    art.className = "diary-tr-summary-card";

    const iconSlot = document.createElement("div");
    iconSlot.className = "diary-tr-summary-icon-slot diary-tr-summary-icon-slot--empty";
    iconSlot.setAttribute("aria-hidden", "true");
    fillDiaryTrSummaryIconSlot(
      iconSlot,
      mins >= 1 ? DIARY_TR_ICON.routineDone : DIARY_TR_ICON.routineZero,
    );

    const h = document.createElement("h3");
    h.className = "diary-tr-summary-title";
    h.textContent = k.name;

    if (granularity === "month") {
      const daysInMonth = countCalendarDaysInInclusiveRange(start, end);
      const activeDays = countKpiDaysWithRecordedMinutesInDateRange(
        k.id,
        start,
        end,
      );
      const freqEl = document.createElement("p");
      freqEl.className =
        "diary-tr-invest-quote-subtitle diary-tr-routine-kpi-freq";
      freqEl.textContent = `${daysInMonth}일 중 ${activeDays}일`;
      art.appendChild(iconSlot);
      art.appendChild(h);
      art.appendChild(freqEl);
    } else {
      art.appendChild(iconSlot);
      art.appendChild(h);
    }

    const timeEl = document.createElement("p");
    timeEl.className = "diary-tr-summary-time";
    timeEl.textContent = formatIntegerMinutesDurationKo(mins);

    art.appendChild(timeEl);
    grid.appendChild(art);
  });

  section.appendChild(grid);
  scrollWrap.appendChild(section);
}

/** 시간 레포트 가격 — 소비·투자 공통 클래스, 색만 --loss(파랑) / --gain(빨강) */
function appendTimeReportSummaryMoney(parent, text, polarity) {
  const money = document.createElement("p");
  money.className =
    polarity === "gain"
      ? "diary-tr-summary-money diary-tr-summary-money--gain"
      : "diary-tr-summary-money diary-tr-summary-money--loss";
  money.textContent = text;
  parent.appendChild(money);
}

/** 「시간 소비 리포트」 제목 직후 · 카드 그리드 직전: 비생산 합(컴팩트) */
function mountTimeReportNonproductiveWasteMini(scrollWrap, ymdTen, granularity) {
  const snap =
    granularity === "month"
      ? getMonthlyNonproductiveWastedSnapshot(ymdTen)
      : getDailyNonproductiveWastedSnapshot(ymdTen);

  const shell = document.createElement("div");
  shell.className = "diary-tr-waste-mini-shell";
  shell.setAttribute("aria-label", "비생산적 활동 시간 합");

  const ttl = document.createElement("p");
  ttl.className = "diary-tr-waste-mini-title";
  ttl.textContent = timeReportWasteMiniTitle(ymdTen, granularity);

  const val = document.createElement("p");
  val.className = "diary-tr-waste-mini-value";
  val.textContent = formatIntegerMinutesDurationKo(snap.wastedMinutesRounded);

  shell.appendChild(ttl);
  shell.appendChild(val);
  if (snap.hourlyRate > 0 && snap.wastedWon > 0) {
    appendTimeReportSummaryMoney(
      shell,
      formatLedgerLossKrwDisplay(snap.wastedWon),
      "loss",
    );
  }
  scrollWrap.appendChild(shell);
}

/** 「시간 투자 리포트」 직후 · 동기 카드 그리드 직전 — 투자 집계 시간(소비 낭비 미니와 동일 클래스) */
function mountTimeReportInvestMini(scrollWrap, ymdTen, granularity) {
  const snap =
    granularity === "month"
      ? getMonthlyInvestReclaimSnapshot(ymdTen)
      : getDailyInvestReclaimSnapshot(ymdTen);

  const shell = document.createElement("div");
  shell.className = "diary-tr-waste-mini-shell";
  shell.setAttribute("aria-label", "투자로 집계된 시간 합");

  const ttl = document.createElement("p");
  ttl.className = "diary-tr-waste-mini-title";
  ttl.textContent = timeReportInvestMiniTitle(ymdTen, granularity);

  const val = document.createElement("p");
  val.className = "diary-tr-waste-mini-value";
  val.textContent = formatIntegerMinutesDurationKo(snap.reclaimMinutesRounded);

  shell.appendChild(ttl);
  shell.appendChild(val);
  scrollWrap.appendChild(shell);
}

/** 소비 탭 일·월 공통 본문: 수면·근무 제외 세부 카테고리 도넛 */
function mountTimeReportDonut(scrollWrap, ymdTen, granularity) {
  const snap =
    granularity === "month"
      ? getMonthlyTimeReportDonutSnapshot(ymdTen)
      : getDailyTimeReportDonutSnapshot(ymdTen);
  const section = document.createElement("section");
  section.className = "diary-tr-donut-shell";
  if (granularity === "month") {
    section.classList.add("diary-tr-donut-shell--month-center-heading");
  }

  const headingId =
    granularity === "month"
      ? "diary-time-report-month-donut-heading"
      : "diary-time-report-day-donut-heading";
  const blockHeadingText =
    granularity === "month"
      ? timeReportMonthDonutBlockTitle(ymdTen)
      : timeReportDayDonutBlockTitle(ymdTen);
  section.setAttribute("aria-labelledby", headingId);

  const card = document.createElement("div");
  card.className = "diary-tr-donut-card";

  const cardHeading = document.createElement("h2");
  cardHeading.className = "diary-tr-consumption-section-title";
  cardHeading.id = headingId;
  cardHeading.textContent = blockHeadingText;

  const viz = document.createElement("div");
  viz.className = "diary-tr-donut-viz";

  const host = document.createElement("div");
  host.className = "diary-tr-donut-ring-host";

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 200");
  svg.classList.add("diary-tr-donut-svg");
  svg.setAttribute("aria-hidden", "true");

  const center = document.createElement("div");
  center.className = "diary-tr-donut-center";

  const cap = document.createElement("span");
  cap.className = "diary-tr-donut-center-caption";
  cap.textContent = "전체";

  const strong = document.createElement("strong");
  strong.className = "diary-tr-donut-center-value";

  center.appendChild(cap);
  center.appendChild(strong);

  host.appendChild(svg);
  host.appendChild(center);
  viz.appendChild(host);

  const legend = document.createElement("ul");
  legend.className = "diary-tr-donut-legend";

  const totalH = snap.totalHours;
  if (!totalH || totalH <= 0) {
    strong.textContent = "—";
    const circ = document.createElementNS(SVG_NS, "circle");
    circ.setAttribute("cx", "100");
    circ.setAttribute("cy", "100");
    circ.setAttribute("r", "71");
    circ.setAttribute("fill", "none");
    circ.setAttribute("stroke", "#e2e8f0");
    circ.setAttribute("stroke-width", "42");
    svg.appendChild(circ);
    const li = document.createElement("li");
    li.className = "diary-tr-donut-legend-empty";
    li.textContent =
      granularity === "month"
        ? "수면·근무를 뺀 뒤 집계할 생산·비생산 카테고리 시간이 없습니다. 시간가계부에서 해당 달 기록을 모아 두면 여기 표시됩니다."
        : "수면·근무를 뺀 뒤 집계할 생산·비생산 카테고리 시간이 없습니다. 시간가계부에서 해당 날짜를 기록해 보세요.";
    legend.appendChild(li);
  } else {
    strong.textContent = formatIntegerMinutesDurationKo(snap.totalMinutesRounded);
    const segs = snap.segments;
    const colors = segs.map((_, i) => REPORT_DONUT_PASTELS[i % REPORT_DONUT_PASTELS.length]);
    const pcts = legendIntegerPercents(
      segs.map((s) => s.hours),
      totalH,
    );

    const rOut = 92;
    const rIn = 48;
    let angle = -Math.PI / 2;

    segs.forEach((s, i) => {
      const span = (s.hours / totalH) * 2 * Math.PI;
      const a0 = angle;
      const a1 = angle + span;
      const d = annularSectorPath(100, 100, rOut, rIn, a0, a1);
      if (d) {
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", colors[i]);
        svg.appendChild(path);

        const showPct =
          span >= 0.18 && (pcts[i] >= 5 || (segs.length <= 3 && pcts[i] >= 1));
        if (showPct) {
          const mid = (a0 + a1) / 2;
          const tr = (rOut + rIn) / 2;
          const tx = 100 + tr * Math.cos(mid);
          const ty = 100 + tr * Math.sin(mid);
          const t = document.createElementNS(SVG_NS, "text");
          t.setAttribute("x", String(tx));
          t.setAttribute("y", String(ty));
          t.setAttribute("text-anchor", "middle");
          t.setAttribute("dominant-baseline", "middle");
          t.classList.add("diary-tr-donut-slice-pct");
          t.textContent = `${pcts[i]}%`;
          svg.appendChild(t);
        }
      }
      angle = a1;
    });

    segs.forEach((s, i) => {
      const li = document.createElement("li");
      li.className = "diary-tr-donut-legend-item";
      const dot = document.createElement("span");
      dot.className = "diary-tr-donut-legend-dot";
      dot.style.background = colors[i];
      const lbl = document.createElement("span");
      lbl.className = "diary-tr-donut-legend-label";
      lbl.textContent = s.label;
      li.appendChild(dot);
      li.appendChild(lbl);
      legend.appendChild(li);
    });
  }

  const cardRow = document.createElement("div");
  cardRow.className = "diary-tr-donut-card-row";
  cardRow.appendChild(viz);
  cardRow.appendChild(legend);

  card.appendChild(cardHeading);
  card.appendChild(cardRow);
  section.appendChild(card);
  scrollWrap.appendChild(section);
}

