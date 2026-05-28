/**
 * 시간 레포트 AI 건강검진 — OpenAI (서버 키만 사용)
 *
 * 배포:
 *   supabase secrets set OPENAI_API_KEY=sk-...
 *   supabase secrets set OPENAI_MODEL=gpt-4o-mini   # 선택
 *   supabase functions deploy time-report-analyze
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ReportStatus = "good" | "caution" | "risk" | "neutral";

type AiSection = {
  id: string;
  title: string;
  status: ReportStatus;
  findings: string[];
  advice: string[];
};

type AiAnalysis = {
  score: number;
  grade: string;
  headline: string;
  summary: string;
  sections: AiSection[];
  highlights: string[];
  risks: string[];
  nextSteps: string[];
};

const VALID_STATUS = new Set(["good", "caution", "risk", "neutral"]);

function clampScore(n: unknown) {
  const v = Math.round(Number(n) || 0);
  return Math.min(100, Math.max(0, v));
}

function asStringArray(v: unknown, max = 6) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizeAnalysis(raw: unknown): AiAnalysis {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sectionsRaw = Array.isArray(o.sections) ? o.sections : [];
  const sections: AiSection[] = sectionsRaw.slice(0, 5).map((s, i) => {
    const row = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const status = String(row.status || "neutral").trim().toLowerCase();
    return {
      id: String(row.id || `section_${i}`).trim(),
      title: String(row.title || "항목").trim(),
      status: VALID_STATUS.has(status) ? (status as ReportStatus) : "neutral",
      findings: asStringArray(row.findings, 5),
      advice: asStringArray(row.advice, 4),
    };
  });

  return {
    score: clampScore(o.score),
    grade: String(o.grade || "—").trim().slice(0, 3),
    headline: String(o.headline || "시간 건강검진 결과").trim(),
    summary: String(o.summary || "").trim(),
    sections,
    highlights: asStringArray(o.highlights, 5),
    risks: asStringArray(o.risks, 5),
    nextSteps: asStringArray(o.nextSteps, 5),
  };
}

async function callOpenAi(facts: unknown, granularity: string): Promise<AiAnalysis> {
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  if (!apiKey) {
    throw new Error("openai_not_configured");
  }
  const model = Deno.env.get("OPENAI_MODEL")?.trim() || "gpt-4o-mini";
  const periodLabel = granularity === "month" ? "월간" : "일간";

  const system = `당신은 "시간 건강검진" 전문 코치입니다.
사용자의 시간가계부·예산 facts JSON 만 근거로 판단합니다.
facts에 없는 사실을 지어내지 마세요. 기록이 비어 있으면 "기록 부족"이라고 명시하세요.
투자=생산적 시간, 소비=비생산·낭비·여가 소비를 구분해 설명하세요.
예산(budget)은 일간에만 있을 수 있습니다.
반드시 요청 JSON 스키마에 맞는 JSON 객체만 출력하세요.`;

  const user = `${periodLabel} 시간 데이터를 건강검진처럼 분석해 주세요.

출력 JSON 스키마:
{
  "score": 0-100,
  "grade": "A|B|C|D|F",
  "headline": "한 줄 진단",
  "summary": "2-4문장 종합 소견",
  "sections": [
    {
      "id": "invest",
      "title": "시간 투자",
      "status": "good|caution|risk|neutral",
      "findings": ["관찰 1"],
      "advice": ["제안 1"]
    },
    {
      "id": "consume",
      "title": "시간 소비",
      "status": "good|caution|risk|neutral",
      "findings": [],
      "advice": []
    },
    {
      "id": "budget",
      "title": "예산 이행",
      "status": "good|caution|risk|neutral",
      "findings": [],
      "advice": []
    }
  ],
  "highlights": ["잘한 점"],
  "risks": ["주의할 점"],
  "nextSteps": ["다음 행동 제안"]
}

facts:
${JSON.stringify(facts)}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("openai error", res.status, errText.slice(0, 400));
    throw new Error("openai_request_failed");
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("openai_empty_response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (_) {
    throw new Error("openai_invalid_json");
  }

  return normalizeAnalysis(parsed);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser(jwt);

  if (userErr || !user?.id) {
    return new Response(JSON.stringify({ error: "invalid_session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch (_) {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const granularity =
    String(body.granularity || "day").trim().toLowerCase() === "month"
      ? "month"
      : "day";
  const facts = body.facts ?? body;
  if (!facts || typeof facts !== "object") {
    return new Response(JSON.stringify({ error: "missing_facts" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const analysis = await callOpenAi(facts, granularity);
    return new Response(JSON.stringify({ ok: true, analysis }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    if (msg === "openai_not_configured") {
      return new Response(
        JSON.stringify({
          error: "openai_not_configured",
          detail: "OPENAI_API_KEY 가 설정되지 않았습니다.",
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({
        error: "analysis_failed",
        detail: "AI 분석 중 오류가 발생했습니다.",
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
