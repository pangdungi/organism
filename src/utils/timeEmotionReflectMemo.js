/**
 * 감정적이기 (부정적) — 사실 / 해석 메모
 * time_ledger_entries.memo(feedback) 에 [사실]·[해석] 블록으로 저장
 */

const FACT_MARK = "[사실]";
const INTERP_MARK = "[해석]";

/**
 * @param {string} fact
 * @param {string} interpretation
 */
export function packEmotionReflectMemo(fact, interpretation) {
  const f = String(fact ?? "").trim();
  const i = String(interpretation ?? "").trim();
  if (!f && !i) return "";
  return `${FACT_MARK}\n${f}\n\n${INTERP_MARK}\n${i}`.trim();
}

/**
 * @param {unknown} raw
 * @returns {{ fact: string, interpretation: string, isStructured: boolean }}
 */
export function parseEmotionReflectMemo(raw) {
  const s = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!s) return { fact: "", interpretation: "", isStructured: false };

  const hasFact = s.includes(FACT_MARK);
  const hasInterp = s.includes(INTERP_MARK);
  if (!hasFact && !hasInterp) {
    /* 예전 「상황 맥락과 계획」 한 칸 → 사실로 표시 */
    return { fact: s, interpretation: "", isStructured: false };
  }

  let fact = "";
  let interpretation = "";
  const fi = s.indexOf(FACT_MARK);
  const ii = s.indexOf(INTERP_MARK);

  if (hasFact && hasInterp) {
    if (fi < ii) {
      fact = s.slice(fi + FACT_MARK.length, ii).replace(/^\n+/, "").trim();
      interpretation = s
        .slice(ii + INTERP_MARK.length)
        .replace(/^\n+/, "")
        .trim();
    } else {
      interpretation = s
        .slice(ii + INTERP_MARK.length, fi)
        .replace(/^\n+/, "")
        .trim();
      fact = s.slice(fi + FACT_MARK.length).replace(/^\n+/, "").trim();
    }
  } else if (hasFact) {
    fact = s.slice(fi + FACT_MARK.length).replace(/^\n+/, "").trim();
  } else {
    interpretation = s.slice(ii + INTERP_MARK.length).replace(/^\n+/, "").trim();
  }

  return { fact, interpretation, isStructured: true };
}

/** 카드·레포트 표시용 */
export function formatEmotionReflectMemoDisplay(raw) {
  const { fact, interpretation, isStructured } = parseEmotionReflectMemo(raw);
  if (!isStructured && fact) return fact;
  const lines = [];
  if (fact) lines.push(`사실 ${fact}`);
  if (interpretation) lines.push(`해석 ${interpretation}`);
  return lines.join("\n");
}
