/**
 * 레포트 — 비생산적 1~3점 «별로였던 이유» → 무기력을 유발하는 행동
 */

import {
  getTimeLedgerRowDisplayProductivity,
  parseTimeToHours,
} from "../views/Time.js";
import { normalizeTimeRatingForRow } from "./timeLedgerEntriesModel.js";
import {
  normalizeTimeBadFeelingReasonsForRow,
  shouldCollectTimeBadFeelingReasons,
  timeBadFeelingReasonLabelForId,
} from "./timeTaskBadFeelingReasons.js";

function rowMinutes(r) {
  const hrs = parseTimeToHours(r.timeTracked);
  if (!(hrs > 0) || !Number.isFinite(hrs)) return 0;
  return Math.round(hrs * 60);
}

function formatKoreanDurationFromMinutes(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h > 0 && r > 0) return `${h}시간 ${r}분`;
  if (h > 0) return `${h}시간`;
  return `${r}분`;
}

function isNonproductiveBadRatedRow(r) {
  if (getTimeLedgerRowDisplayProductivity(r) !== "nonproductive") return false;
  return shouldCollectTimeBadFeelingReasons(
    normalizeTimeRatingForRow(r?.timeRating),
  );
}

/**
 * @param {object[]} rows
 */
export function buildNonproductiveBadFeelingReportSnapshot(rows) {
  const badSessions = (rows || []).filter(isNonproductiveBadRatedRow);
  if (!badSessions.length) return null;

  /** @type {Map<string, { taskName: string, minutes: number, reasonCounts: Map<string, number> }>} */
  const byTask = new Map();
  /** @type {Map<string, number>} */
  const reasonPickCounts = new Map();
  let sessionsWithReasons = 0;

  for (const r of badSessions) {
    const reasons = normalizeTimeBadFeelingReasonsForRow(
      r.timeBadFeelingReasons,
    );
    const mins = rowMinutes(r);
    const taskName = String(r.taskName || "").trim() || "(이름 없음)";
    if (!byTask.has(taskName)) {
      byTask.set(taskName, {
        taskName,
        minutes: 0,
        reasonCounts: new Map(),
      });
    }
    const bucket = byTask.get(taskName);
    bucket.minutes += mins;
    if (!reasons.length) continue;
    sessionsWithReasons += 1;
    for (const id of reasons) {
      reasonPickCounts.set(id, (reasonPickCounts.get(id) || 0) + 1);
      bucket.reasonCounts.set(id, (bucket.reasonCounts.get(id) || 0) + 1);
    }
  }

  const behaviors = [...byTask.values()]
    .filter((b) => b.minutes > 0 || b.reasonCounts.size > 0)
    .map((b) => {
      let topReasonId = "";
      let topReasonCount = 0;
      for (const [id, count] of b.reasonCounts.entries()) {
        if (count > topReasonCount) {
          topReasonCount = count;
          topReasonId = id;
        }
      }
      return {
        taskName: b.taskName,
        minutes: b.minutes,
        durationLabel: formatKoreanDurationFromMinutes(b.minutes),
        topReasonId,
        topReasonLabel: topReasonId
          ? timeBadFeelingReasonLabelForId(topReasonId)
          : "",
        reasonPickTotal: [...b.reasonCounts.values()].reduce((s, n) => s + n, 0),
      };
    })
    .sort(
      (a, b) =>
        b.minutes - a.minutes ||
        b.reasonPickTotal - a.reasonPickTotal ||
        a.taskName.localeCompare(b.taskName, "ko"),
    );

  const topBehavior = behaviors[0] || null;
  let oneLiner =
    "비생산적 작업에 1~3점과 «별로였던 이유»를 남기면, 무기력을 키우는 행동이 정리됩니다.";
  if (topBehavior?.topReasonLabel && topBehavior.minutes > 0) {
    oneLiner = `주로 「${topBehavior.taskName}」를 ${topBehavior.durationLabel} 할 때 「${topBehavior.topReasonLabel}」를 많이 느꼈어요.`;
  } else if (topBehavior?.minutes > 0 && sessionsWithReasons === 0) {
    oneLiner = `1~3점 세션이 ${badSessions.length}건 있어요. 기록할 때 별로였던 이유를 고르면 더 구체적으로 보여요.`;
  }

  const reasonRanking = [...reasonPickCounts.entries()]
    .map(([id, count]) => ({
      id,
      label: timeBadFeelingReasonLabelForId(id),
      count,
    }))
    .filter((x) => x.label)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko"));

  return {
    sessionCount: badSessions.length,
    sessionsWithReasons,
    behaviors,
    reasonRanking,
    oneLiner,
    show: true,
  };
}
