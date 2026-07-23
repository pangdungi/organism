/**
 * 섭취 레포트 — 맛 평가(별점) + 식단명(meal_detail) 집계
 */

import {
  isHealthyMealDetailTaskName,
  isUnhealthyMealDetailTaskName,
} from "./timeTaskOptionsConstants.js";
import { normalizeTimeRatingForRow } from "./timeLedgerEntriesModel.js";

function isMealIntakeTasteRow(r) {
  const tn = String(r?.taskName || "").trim();
  return (
    isHealthyMealDetailTaskName(tn) || isUnhealthyMealDetailTaskName(tn)
  );
}

/**
 * @param {object[]} rows
 */
export function buildMealTasteReportSnapshot(rows) {
  /** @type {{ food: string, rating: number, kind: "healthy"|"unhealthy" }[]} */
  const picks = [];
  for (const r of rows || []) {
    if (!isMealIntakeTasteRow(r)) continue;
    const rating = normalizeTimeRatingForRow(r.timeRating);
    if (rating == null) continue;
    const food = String(r.mealDetail || "").trim();
    if (!food) continue;
    picks.push({
      food,
      rating,
      kind: isHealthyMealDetailTaskName(r.taskName) ? "healthy" : "unhealthy",
    });
  }
  if (!picks.length) return null;

  /** @type {Map<string, { food: string, ratings: number[], healthyCount: number, unhealthyCount: number }>} */
  const byFood = new Map();
  for (const p of picks) {
    if (!byFood.has(p.food)) {
      byFood.set(p.food, {
        food: p.food,
        ratings: [],
        healthyCount: 0,
        unhealthyCount: 0,
      });
    }
    const bucket = byFood.get(p.food);
    bucket.ratings.push(p.rating);
    if (p.kind === "healthy") bucket.healthyCount += 1;
    else bucket.unhealthyCount += 1;
  }

  const foods = [...byFood.values()].map((b) => {
    const sum = b.ratings.reduce((a, n) => a + n, 0);
    const count = b.ratings.length;
    return {
      food: b.food,
      count,
      avg: count > 0 ? sum / count : 0,
      maxRating: Math.max(...b.ratings),
      minRating: Math.min(...b.ratings),
      fiveStarCount: b.ratings.filter((n) => n === 5).length,
      lowStarCount: b.ratings.filter((n) => n <= 2).length,
      healthyCount: b.healthyCount,
      unhealthyCount: b.unhealthyCount,
    };
  });

  const favorites = [...foods]
    .sort(
      (a, b) =>
        b.avg - a.avg ||
        b.maxRating - a.maxRating ||
        b.fiveStarCount - a.fiveStarCount ||
        b.count - a.count,
    )
    .slice(0, 8);

  const dislikes = [...foods]
    .filter((f) => f.avg < 4 || f.lowStarCount > 0)
    .sort(
      (a, b) =>
        a.avg - b.avg ||
        a.minRating - b.minRating ||
        b.lowStarCount - a.lowStarCount ||
        b.count - a.count,
    )
    .slice(0, 8);

  const fiveStarFoods = [...new Set(picks.filter((p) => p.rating === 5).map((p) => p.food))];
  const oneStarFoods = [
    ...new Set(picks.filter((p) => p.rating === 1).map((p) => p.food)),
  ];

  /** 평점(1~5)별 음식 · 해당 점수를 준 횟수 */
  /** @type {Map<number, Map<string, number>>} */
  const ratingMaps = new Map([
    [5, new Map()],
    [4, new Map()],
    [3, new Map()],
    [2, new Map()],
    [1, new Map()],
  ]);
  for (const p of picks) {
    const star = Math.round(Number(p.rating));
    if (star < 1 || star > 5) continue;
    const m = ratingMaps.get(star);
    m.set(p.food, (m.get(p.food) || 0) + 1);
  }
  const byRating = [5, 4, 3, 2, 1]
    .map((rating) => {
      const foodsAt = [...ratingMaps.get(rating).entries()]
        .map(([food, count]) => ({ food, count }))
        .sort(
          (a, b) =>
            b.count - a.count || a.food.localeCompare(b.food, "ko"),
        );
      return { rating, foods: foodsAt };
    })
    .filter((g) => g.foods.length > 0);

  return {
    ratedCount: picks.length,
    foodCount: foods.length,
    favorites,
    dislikes,
    byRating,
    fiveStarFoods: fiveStarFoods.slice(0, 10),
    oneStarFoods: oneStarFoods.slice(0, 10),
  };
}
