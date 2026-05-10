/**
 * 홈 오늘 탭 시간사용: 해당 날짜 타임라인 **예상 블록이 있는 과제**만,
 * 예상 분 vs 시간가계부 실제 분
 */
import { buildExpectedScheduleSpansForDateKey } from "../views/Calendar.js";
import { loadTimeRows, parseTimeToHours } from "../views/Time.js";
import { getTimeCategoryColorsForTimetableExpected } from "../utils/todoSettings.js";

function normDateKey(s) {
  return (s || "").replace(/\//g, "-").trim().slice(0, 10);
}

function actualMinutesByTask(todayKey) {
  const m = {};
  loadTimeRows().forEach((r) => {
    if (normDateKey(r.date) !== todayKey) return;
    const name = (r.taskName || "").trim();
    if (!name) return;
    const add = Math.round((parseTimeToHours(r.timeTracked) || 0) * 60);
    m[name] = (m[name] || 0) + add;
  });
  return m;
}

function plannedMinutesByTask(spans) {
  const m = {};
  spans.forEach((s) => {
    const name = (s.taskName || "").trim();
    if (!name) return;
    const sm = Number(s.startMin);
    const em = Number(s.endMin);
    if (!Number.isFinite(sm) || !Number.isFinite(em)) return;
    m[name] = (m[name] || 0) + Math.max(0, em - sm);
  });
  return m;
}

/** @param {string} todayKey YYYY-MM-DD */
export function buildHomeTodayEventPulseModel(todayKey) {
  const { spans } = buildExpectedScheduleSpansForDateKey(todayKey);
  const plannedByTask = plannedMinutesByTask(spans);
  const actualByTask = actualMinutesByTask(todayKey);

  const meta = {};
  const sortedSpans = [...spans].sort(
    (a, b) =>
      Number(a.startMin) - Number(b.startMin) ||
      String(a.taskName || "").localeCompare(String(b.taskName || ""), "ko"),
  );
  sortedSpans.forEach((s) => {
    const n = (s.taskName || "").trim();
    if (!n || meta[n]) return;
    meta[n] = {
      sectionId: (s.sectionId || "").trim(),
      prod: (s.prod || "other").trim(),
      startMin: Number(s.startMin) || 0,
    };
  });

  const taskRows = Object.keys(plannedByTask)
    .filter((name) => (plannedByTask[name] || 0) > 0)
    .map((name) => {
      const planned = plannedByTask[name] || 0;
      const actual = actualByTask[name] || 0;
      const diff = actual - planned;
      let variant = "equal";
      if (diff > 0) variant = "over";
      else if (diff < 0) variant = "under";
      const maxM = Math.max(planned, actual, 1);
      return {
        taskName: name,
        planned,
        actual,
        diff,
        variant,
        plannedPct: Math.round((planned / maxM) * 100),
        actualPct: Math.round((actual / maxM) * 100),
        sectionId: meta[name]?.sectionId || "",
        prod: meta[name]?.prod || "other",
        sortKey: meta[name]?.startMin ?? 99999,
      };
    })
    .sort(
      (a, b) =>
        a.sortKey - b.sortKey ||
        a.taskName.localeCompare(b.taskName, "ko"),
    );

  const kpColors = getTimeCategoryColorsForTimetableExpected();

  return { taskRows, kpColors };
}
