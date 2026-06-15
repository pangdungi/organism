/**
 * 시간 레포트 — 생산적 작업 초집중 분석
 * 몰입 요소·종료 사유·별점·세션 길이
 */

import {
  getTimeLedgerRowDisplayProductivity,
  parseTimeToHours,
} from "../views/Time.js";
import { normalizeTimeRatingForRow } from "./timeLedgerEntriesModel.js";
import {
  normalizeTimeFlowFactorsForRow,
  timeFlowFactorLabelForId,
  TIME_TASK_FLOW_FACTOR_OPTIONS,
} from "./timeTaskFlowFactors.js";
import {
  normalizeTimeEndReasonsForRow,
  timeEndReasonLabelForId,
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
  return normalizeTimeRatingForRow(r.timeRating) != null;
}

function avgOf(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function buildRecipeOneLiner(tags, fiveStarCount) {
  if (!fiveStarCount) {
    return "생산적 작업에 5점 평가를 남기면 초집중 레시피가 채워집니다.";
  }
  if (!tags.length) {
    return `5점 세션 ${fiveStarCount}건 — 몰입 요소를 고르면 자주 겹치는 조건이 보입니다.`;
  }
  const top = tags.slice(0, 3);
  const parts = top.map((t) => `「${t.label}」 ${t.pct}%`);
  return `5점 ${fiveStarCount}건 중 ${parts.join(" · ")}`;
}

function buildPeakHourLine(peakHours) {
  if (!peakHours.length) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const labels = peakHours.map((h) => `${pad(h.hour)}시`);
  if (labels.length === 1) return `${labels[0]}에 집중이 가장 잘 됩니다.`;
  return `${labels[0]}~${labels[labels.length - 1]}에 집중이 가장 잘 됩니다.`;
}

/**
 * @param {object[]} rows
 */
export function buildFocusReportSnapshot(rows) {
  const productiveRated = (rows || []).filter(isProductiveRatedRow);
  if (!productiveRated.length) return null;

  const fiveStar = productiveRated.filter(
    (r) => normalizeTimeRatingForRow(r.timeRating) === 5,
  );
  const fiveStarCount = fiveStar.length;

  const tagCounts = new Map();
  for (const r of fiveStar) {
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
      pct: fiveStarCount > 0 ? Math.round((count / fiveStarCount) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count || b.pct - a.pct);

  const conditionCompare = TIME_TASK_FLOW_FACTOR_OPTIONS.map(({ id, label }) => {
    const withRatings = [];
    const withoutRatings = [];
    for (const r of productiveRated) {
      const factors = normalizeTimeFlowFactorsForRow(
        r.timeFlowFactors ?? r.timeFlowFactor,
      );
      const rating = normalizeTimeRatingForRow(r.timeRating);
      if (rating == null) continue;
      if (factors.includes(id)) withRatings.push(rating);
      else withoutRatings.push(rating);
    }
    const withAvg = avgOf(withRatings);
    const withoutAvg = avgOf(withoutRatings);
    return {
      id,
      label,
      withAvg,
      withoutAvg,
      withCount: withRatings.length,
      withoutCount: withoutRatings.length,
      delta:
        withAvg != null && withoutAvg != null ? withAvg - withoutAvg : null,
    };
  })
    .filter((c) => c.withCount > 0)
    .sort((a, b) => (b.delta ?? -99) - (a.delta ?? -99));

  const endReasonCounts = new Map();
  for (const r of productiveRated) {
    for (const reason of normalizeTimeEndReasonsForRow(
      r.timeEndReasons ?? r.timeEndReason,
    )) {
      endReasonCounts.set(reason, (endReasonCounts.get(reason) || 0) + 1);
    }
  }
  const endReasons = [...endReasonCounts.entries()]
    .map(([id, count]) => ({
      id,
      label: timeEndReasonLabelForId(id),
      count,
    }))
    .sort((a, b) => b.count - a.count);

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
  const peakHours = [...hourGrid]
    .filter((h) => h.count > 0)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
    .slice(0, 3);

  const durations = productiveRated.map((r) => ({
    mins: rowMinutes(r) || 15,
    rating: normalizeTimeRatingForRow(r.timeRating),
  }));
  const avgMins =
    durations.reduce((s, d) => s + d.mins, 0) / durations.length;
  const fiveStarDurations = durations
    .filter((d) => d.rating === 5)
    .map((d) => d.mins);
  const avgFiveStarMins = avgOf(fiveStarDurations);
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
    fiveStarCount,
    recipeTags,
    recipeOneLiner: buildRecipeOneLiner(recipeTags, fiveStarCount),
    peakHourLine: buildPeakHourLine(peakHours),
    conditionCompare,
    endReasons,
    hourGrid,
    peakHours,
    duration: {
      avgMins,
      avgFiveStarMins,
      maxMins,
      count: durations.length,
      fiveStarCount: fiveStarDurations.length,
    },
    tasks,
  };
}
