/**
 * 시간 레포트 AI — Supabase Edge Function 호출
 */

import { supabase } from "../supabase.js";
import {
  buildTimeReportAiFacts,
  timeReportAiFactsFingerprint,
} from "./timeReportAiPayload.js";

const CACHE_PREFIX = "lp_time_report_ai_v1_";

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.analysis || !parsed?.cachedAt) return null;
    return parsed.analysis;
  } catch (_) {
    return null;
  }
}

function writeCache(key, analysis) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ cachedAt: Date.now(), analysis }),
    );
  } catch (_) {}
}

/**
 * @param {{ ymdTen: string, granularity: "day"|"month", force?: boolean }} opts
 * @returns {Promise<{ ok: true, analysis: object, facts: object, fromCache?: boolean } | { ok: false, msg: string, facts?: object }>}
 */
export async function fetchTimeReportAiAnalysis(opts) {
  const ymdTen = String(opts?.ymdTen || "").replace(/\//g, "-").slice(0, 10);
  const granularity = opts?.granularity === "month" ? "month" : "day";
  const facts = buildTimeReportAiFacts(ymdTen, granularity);
  const fp = timeReportAiFactsFingerprint(facts);
  const cacheKey = `${CACHE_PREFIX}${granularity}_${ymdTen}_${fp}`;

  if (!opts?.force) {
    const cached = readCache(cacheKey);
    if (cached) {
      return { ok: true, analysis: cached, facts, fromCache: true };
    }
  }

  if (!supabase) {
    return { ok: false, msg: "Supabase에 연결되지 않았습니다.", facts };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, msg: "로그인 후 AI 분석을 받을 수 있습니다.", facts };
  }

  const base = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");
  if (!base || !anon) {
    return { ok: false, msg: "앱 설정을 확인할 수 없습니다.", facts };
  }

  let res;
  try {
    res = await fetch(`${base}/functions/v1/time-report-analyze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ymdTen, granularity, facts }),
    });
  } catch (_) {
    return {
      ok: false,
      msg: "네트워크 오류로 AI 분석에 연결하지 못했습니다.",
      facts,
    };
  }

  let body = {};
  try {
    body = await res.json();
  } catch (_) {}

  if (!res.ok) {
    if (res.status === 404) {
      return {
        ok: false,
        msg: "AI 분석 기능이 아직 서버에 배포되지 않았습니다. OPENAI_API_KEY 설정 후 Edge Function을 배포해 주세요.",
        facts,
      };
    }
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : typeof body.error === "string"
          ? body.error
          : "";
    return {
      ok: false,
      msg: detail || "AI 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      facts,
    };
  }

  const analysis = body?.analysis;
  if (!analysis || typeof analysis !== "object") {
    return { ok: false, msg: "AI 응답 형식이 올바르지 않습니다.", facts };
  }

  writeCache(cacheKey, analysis);
  return { ok: true, analysis, facts };
}
