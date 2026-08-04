/**
 * 시간 레포트 — 생산적 작업 초집중 분석
 * 몰입 요소·아쉬웠던 이유·별점·세션 길이
 */

import {
  getTimeLedgerRowDisplayProductivity,
  parseTimeToHours,
} from "../views/Time.js";
import { isMealIntakeTasteRatingTaskName } from "./timeTaskOptionsConstants.js";
import { normalizeTimeRatingForRow } from "./timeLedgerEntriesModel.js";
import {
  normalizeTimeFlowFactorsForRow,
  shouldCollectTimeFlowFactors,
  timeFlowFactorLabelForId,
} from "./timeTaskFlowFactors.js";
import {
  normalizeTimeFlowDisruptorsForRow,
  timeFlowDisruptorLabelForId,
  shouldCollectTimeFlowDisruptors,
  TIME_TASK_FLOW_DISRUPTOR_CATEGORIES,
  timeFlowDisruptorCategoryForId,
} from "./timeTaskFlowDisruptors.js";
import {
  normalizeTimeEndReasonsForRow,
  shouldCollectTimeEndReasons,
  timeEndReasonLabelForId,
  timeEndReasonLongerTipForId,
} from "./timeTaskEndReasons.js";

function rowMinutes(r) {
  const hrs = parseTimeToHours(r.timeTracked);
  if (!(hrs > 0) || !Number.isFinite(hrs)) return 0;
  return Math.round(hrs * 60);
}

function rowStartHour(r) {
  const st = String(r.startTime || "").trim();
  if (!st) return null;
  const m = st.match(/(?:^|\s|T|\.)(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  return h >= 0 && h <= 23 ? h : null;
}

function isProductiveRatedRow(r) {
  if (getTimeLedgerRowDisplayProductivity(r) !== "productive") return false;
  if (isMealIntakeTasteRatingTaskName(r?.taskName)) return false;
  return normalizeTimeRatingForRow(r.timeRating) != null;
}

function avgOf(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildRecipeOneLiner(tags, highFocusSessionCount) {
  if (!highFocusSessionCount) {
    return "생산적 작업에 4~5점 평가를 남기면 초집중 레시피가 채워집니다.";
  }
  if (!tags.length) {
    return `4~5점 세션 ${highFocusSessionCount}건 — 시간 기록할 때 「몰입 요소」를 골라 주세요.`;
  }
  const top = tags.slice(0, 3);
  const parts = top.map((t) => `「${t.label}」 ${t.pct}%`);
  return `4~5점 ${highFocusSessionCount}건 중 ${parts.join(" · ")}`;
}

function buildDisruptorOneLiner(ranking, sessionCount, totalPicks) {
  if (!sessionCount) {
    return "1~3점 세션이 쌓이면 아쉬웠던 이유 패턴이 보입니다.";
  }
  if (!totalPicks) {
    return `1~3점 세션 ${sessionCount}건 — 아쉬웠던 이유를 고르면 패턴이 정리됩니다.`;
  }
  const top = ranking[0];
  if (!top) return "";
  if (ranking.length === 1) {
    return `가장 많은 아쉬웠던 이유는 「${top.label}」입니다 (${top.count}회).`;
  }
  const second = ranking[1];
  if (second && top.count === second.count) {
    return `가장 자주 겹치는 아쉬웠던 이유는 「${top.label}」, 「${second.label}」입니다.`;
  }
  return `가장 많은 아쉬웠던 이유는 「${top.label}」입니다 (${top.count}회 · ${top.pct}%).`;
}

function buildEndReasonOneLiner(ranking, sessionCount, totalPicks) {
  if (!sessionCount) {
    return "4~5점 세션에 종료 이유를 남기면, 왜 잘하다 멈췄는지 패턴이 보입니다.";
  }
  if (!totalPicks) {
    return `4~5점 세션 ${sessionCount}건 — 「종료 이유」를 고르면 더 오래 유지하는 팁이 정리됩니다.`;
  }
  const top = ranking[0];
  if (!top) return "";
  return `잘하다 멈춘 이유로 「${top.label}」이(가) 가장 많았습니다 (${top.count}회).`;
}

function buildEndReasonAnalysis(_highFocusSessions) {
  /* 종료 이유 레포트 비표시 */
  return {
    sessionCount: 0,
    totalPicks: 0,
    ranking: [],
    oneLiner: "",
    show: false,
  };
}

function buildDisruptorAnalysis(productiveRated) {
  const lowRatedSessions = productiveRated.filter((r) =>
    shouldCollectTimeFlowDisruptors(normalizeTimeRatingForRow(r.timeRating)),
  );
  const sessionCount = lowRatedSessions.length;

  const flowDisruptorCounts = new Map();
  for (const r of lowRatedSessions) {
    for (const id of normalizeTimeFlowDisruptorsForRow(
      r.timeFlowDisruptors ?? r.timeFlowDisruptor,
    )) {
      flowDisruptorCounts.set(id, (flowDisruptorCounts.get(id) || 0) + 1);
    }
  }

  const totalPicks = [...flowDisruptorCounts.values()].reduce((s, n) => s + n, 0);
  const ranking = [...flowDisruptorCounts.entries()]
    .map(([id, count]) => ({
      id,
      label: timeFlowDisruptorLabelForId(id),
      count,
      pct:
        totalPicks > 0 ? Math.round((count / totalPicks) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || b.pct - a.pct);

  const categoryCounts = new Map();
  for (const [id, count] of flowDisruptorCounts.entries()) {
    const catId = timeFlowDisruptorCategoryForId(id)?.id || "";
    if (!catId) continue;
    categoryCounts.set(catId, (categoryCounts.get(catId) || 0) + count);
  }
  const categories = TIME_TASK_FLOW_DISRUPTOR_CATEGORIES.map(({ id, label }) => {
    const count = categoryCounts.get(id) || 0;
    return {
      id,
      label,
      count,
      pct: totalPicks > 0 ? Math.round((count / totalPicks) * 100) : 0,
    };
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || b.pct - a.pct);

  return {
    sessionCount,
    totalPicks,
    ranking,
    categories,
    oneLiner: buildDisruptorOneLiner(ranking, sessionCount, totalPicks),
    show: sessionCount > 0 || ranking.length > 0,
  };
}

/**
 * @param {object[]} rows
 */
export function buildFocusReportSnapshot(rows) {
  const productiveRated = (rows || []).filter(isProductiveRatedRow);
  if (!productiveRated.length) return null;

  const highFocusSessions = productiveRated.filter((r) =>
    shouldCollectTimeFlowFactors(normalizeTimeRatingForRow(r.timeRating)),
  );
  const highFocusSessionCount = highFocusSessions.length;

  const tagCounts = new Map();
  for (const r of highFocusSessions) {
    const factors = normalizeTimeFlowFactorsForRow(
      r.timeFlowFactors ?? r.timeFlowFactor,
    );
    const seen = new Set();
    for (const id of factors) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      tagCounts.set(id, (tagCounts.get(id) || 0) + 1);
    }
  }
  const recipeTags = [...tagCounts.entries()]
    .map(([id, count]) => ({
      id,
      label: timeFlowFactorLabelForId(id),
      count,
      pct:
        highFocusSessionCount > 0
          ? Math.round((count / highFocusSessionCount) * 100)
          : 0,
    }))
    .sort((a, b) => b.count - a.count || b.pct - a.pct);

  const disruptorAnalysis = buildDisruptorAnalysis(productiveRated);
  const flowDisruptors = disruptorAnalysis.ranking;
  const endReasonAnalysis = buildEndReasonAnalysis(highFocusSessions);

  const hourBuckets = Array.from({ length: 24 }, () => ({
    weighted: 0,
    minutes: 0,
    count: 0,
  }));
  for (const r of productiveRated) {
    const hour = rowStartHour(r);
    const rating = normalizeTimeRatingForRow(r.timeRating);
    if (hour == null || rating == null) continue;
    const mins = rowMinutes(r) || 15;
    hourBuckets[hour].weighted += rating * mins;
    hourBuckets[hour].minutes += mins;
    hourBuckets[hour].count += 1;
  }
  const hourGrid = hourBuckets.map((b, hour) => ({
    hour,
    avg: b.minutes > 0 ? b.weighted / b.minutes : null,
    count: b.count,
    minutes: b.minutes,
  }));

  const durations = productiveRated.map((r) => ({
    mins: rowMinutes(r) || 15,
    rating: normalizeTimeRatingForRow(r.timeRating),
  }));
  const avgMins =
    durations.reduce((s, d) => s + d.mins, 0) / durations.length;
  const highFocusDurations = durations
    .filter((d) => shouldCollectTimeFlowFactors(d.rating))
    .map((d) => d.mins);
  const avgHighFocusMins = avgOf(highFocusDurations);
  const maxMins = durations.reduce((m, d) => Math.max(m, d.mins), 0);

  const taskMap = new Map();
  for (const r of productiveRated) {
    const name = String(r.taskName || "").trim() || "(제목 없음)";
    const rating = normalizeTimeRatingForRow(r.timeRating);
    const mins = rowMinutes(r) || 15;
    if (rating == null) continue;
    if (!taskMap.has(name)) {
      taskMap.set(name, { weighted: 0, minutes: 0, count: 0 });
    }
    const t = taskMap.get(name);
    t.weighted += rating * mins;
    t.minutes += mins;
    t.count += 1;
  }
  const tasks = [...taskMap.entries()]
    .map(([name, b]) => ({
      name,
      avg: b.minutes > 0 ? b.weighted / b.minutes : 0,
      count: b.count,
      minutes: b.minutes,
    }))
    .filter((t) => t.count >= 1)
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 8);

  return {
    ratedCount: productiveRated.length,
    highFocusSessionCount,
    recipeTags,
    recipeOneLiner: buildRecipeOneLiner(recipeTags, highFocusSessionCount),
    flowDisruptors,
    disruptorAnalysis,
    endReasonAnalysis,
    hourGrid,
    duration: {
      avgMins,
      avgHighFocusMins,
      maxMins,
      count: durations.length,
      highFocusSessionCount: highFocusDurations.length,
    },
    tasks,
  };
}
