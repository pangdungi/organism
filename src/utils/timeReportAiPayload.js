/**
 * 시간 레포트 AI — 투자·소비·예산 스냅샷을 판단용 facts JSON 으로 묶음
 */

import { getBudgetDayReportForDay } from "./diaryBudgetDayReport.js";
import {
  getDailyInvestReclaimSnapshot,
  getDailyNonproductiveWastedSnapshot,
  getDailyProductiveCategoryInvestBarsSnapshot,
  getDailyTimeReportDonutSnapshot,
  getDailyTimeReportHeroSnapshot,
  getDailyTimeReportSummaryGrid,
  getDailyTimeReportTopTasksByMinutes,
  getMonthlyInvestReclaimSnapshot,
  getMonthlyNonproductiveWastedSnapshot,
  getMonthlyProductiveCategoryInvestBarsSnapshot,
  getMonthlyTimeReportDonutSnapshot,
  getMonthlyTimeReportHeroSnapshot,
  getMonthlyTimeReportSummaryGrid,
  getMonthlyTimeReportTopTasksByMinutes,
  getTimeReportMonthInclusiveRange,
} from "../views/Time.js";

function normYmd(s) {
  return String(s || "").replace(/\//g, "-").slice(0, 10);
}

function minutesLabel(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}시간 ${r}분` : `${h}시간`;
}

function compactProdSegments(snap) {
  return (snap?.segments || []).map((s) => ({
    label: s.label,
    minutes: Math.round((s.hours || 0) * 60),
    pct: s.pctRounded,
    won: s.won,
  }));
}

function compactDonutSegments(snap) {
  return (snap?.segments || []).map((s) => ({
    label: s.label,
    minutes: Math.round((s.hours || 0) * 60),
  }));
}

function compactBudget(budget) {
  if (!budget) return null;
  return {
    wellDone: budget.wellDone.map((x) => ({
      task: x.taskName,
      achievementPct: x.barPct,
    })),
    needsAdjust: budget.productivity.map((x) => ({
      task: x.taskName,
      achievementPct: x.barPct,
    })),
    unplannedNonproductive: budget.unplannedNonproductive.map((x) => ({
      task: x.taskName,
      minutes: x.minutes,
    })),
  };
}

function compactSummaryGrid(grid) {
  if (!grid) return null;
  return {
    workMinutes: grid.workMinutes,
    sleepMinutes: grid.sleepMinutes,
    mediaMinutes: grid.mediaMinutes,
    pleasureMinutes: grid.pleasureMinutes,
    unhappinessMinutes: grid.unhappinessMinutes,
    unhealthyMinutes: grid.unhealthyMinutes,
    moneylosingMinutes: grid.moneylosingMinutes,
    mediaLossWon: grid.mediaLossWon,
    moneylosingLossWon: grid.moneylosingLossWon,
    hourlyRate: grid.hourlyRate,
  };
}

/**
 * @param {string} ymdTen
 * @param {"day"|"month"} granularity
 */
export function buildTimeReportAiFacts(ymdTen, granularity) {
  const ymd = normYmd(ymdTen);
  const isMonth = granularity === "month";

  const hero = isMonth
    ? getMonthlyTimeReportHeroSnapshot(ymd)
    : getDailyTimeReportHeroSnapshot(ymd);
  const invest = isMonth
    ? getMonthlyInvestReclaimSnapshot(ymd)
    : getDailyInvestReclaimSnapshot(ymd);
  const waste = isMonth
    ? getMonthlyNonproductiveWastedSnapshot(ymd)
    : getDailyNonproductiveWastedSnapshot(ymd);
  const prodBars = isMonth
    ? getMonthlyProductiveCategoryInvestBarsSnapshot(ymd)
    : getDailyProductiveCategoryInvestBarsSnapshot(ymd);
  const donut = isMonth
    ? getMonthlyTimeReportDonutSnapshot(ymd)
    : getDailyTimeReportDonutSnapshot(ymd);
  const summary = isMonth
    ? getMonthlyTimeReportSummaryGrid(ymd)
    : getDailyTimeReportSummaryGrid(ymd);
  const topTasks = isMonth
    ? getMonthlyTimeReportTopTasksByMinutes(ymd, 8)
    : getDailyTimeReportTopTasksByMinutes(ymd, 8);
  const budget = !isMonth ? getBudgetDayReportForDay(ymd) : null;
  const monthRange = isMonth ? getTimeReportMonthInclusiveRange(ymd) : null;

  return {
    meta: {
      ymd,
      granularity,
      monthRange: monthRange
        ? { start: monthRange.start, end: monthRange.end }
        : null,
    },
    scores: {
      productiveVsAvailablePct: hero.score,
      availableMinutes: hero.availableMinutes,
      productiveMinutes: hero.productiveMinutes,
      wasteMinutes: hero.wasteMinutes,
      netWon: hero.netWon,
      investWon: hero.investWon,
      wasteWon: hero.wasteWon,
      focusArea: hero.focusLabel
        ? { label: hero.focusLabel, pct: hero.focusPct }
        : null,
    },
    investment: {
      productiveMinutes: invest.reclaimMinutesRounded,
      productiveWon: invest.reclaimWon,
      categoryBreakdown: compactProdSegments(prodBars),
    },
    consumption: {
      wasteMinutes: waste.wastedMinutesRounded,
      wasteWon: waste.wastedWon,
      categoryBreakdown: compactDonutSegments(donut),
      topTasksByMinutes: topTasks,
      summary: compactSummaryGrid(summary),
    },
    budget: compactBudget(budget),
    labels: {
      available: minutesLabel(hero.availableMinutes),
      productive: minutesLabel(hero.productiveMinutes),
      waste: minutesLabel(hero.wasteMinutes),
    },
  };
}

/** 캐시 키용 — facts 핵심 수치 지문 */
export function timeReportAiFactsFingerprint(facts) {
  try {
    const s = facts?.scores || {};
    const b = facts?.budget;
    return [
      facts?.meta?.ymd,
      facts?.meta?.granularity,
      s.productiveMinutes,
      s.wasteMinutes,
      s.netWon,
      b?.wellDone?.length ?? 0,
      b?.unplannedNonproductive?.length ?? 0,
    ].join("|");
  } catch (_) {
    return "";
  }
}
