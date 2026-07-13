/**
 * 시간가계부 1일 타임박스 — 예상 일정(일간 예산·캘린더) → 5분 격자 블록
 */

import { buildExpectedScheduleSpansForDateKey } from "../views/Calendar.js";
import { getTaskOptionByName } from "../views/Time.js";
import { expectedSpanDisplayTaskName } from "./expectedScheduleDetail.js";

function resolveExpectedSpanCategory(span) {
  const taskName = String(span?.taskName || "").trim();
  const fromOpt = getTaskOptionByName(taskName)?.category;
  if (fromOpt) return fromOpt;
  const fromTask = String(span?._task?.category || "").trim();
  if (fromTask) return fromTask;
  return String(span?.category || "").trim();
}

function resolveExpectedSpanProdKey(span) {
  const taskName = String(span?.taskName || "").trim();
  const fromOpt = getTaskOptionByName(taskName)?.productivity;
  if (fromOpt) return fromOpt;
  const fromTask = String(span?._task?.productivity || "").trim();
  if (fromTask) return fromTask;
  return span?.prod || "other";
}

function formatClockMin(minOfDay) {
  const m = Math.max(0, Math.floor(Number(minOfDay) || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${String(h).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** @param {string} dayKey YYYY-MM-DD */
export function buildTimeLedgerExpectedDayTimeboxBlocks(dayKey) {
  const { spans } = buildExpectedScheduleSpansForDateKey(dayKey);
  return (spans || [])
    .map((span) => {
      const startMin = Number(span.startMin);
      const endMin = Number(span.endMin);
      if (
        !Number.isFinite(startMin) ||
        !Number.isFinite(endMin) ||
        endMin <= startMin
      ) {
        return null;
      }
      const prod = resolveExpectedSpanProdKey(span);
      const category = resolveExpectedSpanCategory(span);
      const taskName = expectedSpanDisplayTaskName(span);
      const memoParts = [span.scheduleMemo, span.scheduleDetail]
        .map((s) => String(s || "").trim())
        .filter(Boolean);
      return {
        startMin,
        endMin,
        prod,
        category,
        taskName,
        startDisplay: span.startDisplay || formatClockMin(startMin),
        endDisplay: span.endDisplay || formatClockMin(endMin),
        rowData: {
          taskName: String(span.taskName || "").trim(),
          feedback: memoParts.join("\n"),
        },
      };
    })
    .filter(Boolean);
}
