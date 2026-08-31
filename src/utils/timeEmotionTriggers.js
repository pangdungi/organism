/**
 * 감정적이기(부정) 트리거 — 대분류 + 세부 선택
 * meal_detail 저장 형식: "사람 · 무시 당함"
 * 레포트 문장: "사람들이 나를 무시할 때 짜증·분노의 감정을 느낍니다."
 */

/**
 * @typedef {{
 *   id: string,
 *   label: string,
 *   hint: string,
 *   subs: Array<{ label: string, phrase: string }>
 * }} EmotionTriggerCategory
 */

/** @type {EmotionTriggerCategory[]} */
export const EMOTION_TRIGGER_CATEGORIES = [
  {
    id: "people",
    label: "사람",
    hint: "관계에서 온 것",
    subs: [
      {
        label: "무시 당함",
        phrase: "사람들이 나를 무시할 때",
      },
      {
        label: "비난·지적 받음",
        phrase: "사람들이 나를 비난·지적할 때",
      },
      {
        label: "기대와 다른 태도",
        phrase: "사람들이 기대와 다른 태도를 보일 때",
      },
      {
        label: "부탁·요구를 받음",
        phrase: "사람들이 나에게 부탁·요구를 할 때",
      },
      {
        label: "오해 받음",
        phrase: "사람들이 나를 오해할 때",
      },
      {
        label: "이기적 행동",
        phrase: "사람들이 이기적 행동을 할 때",
      },
    ],
  },
  {
    id: "work",
    label: "일",
    hint: "해야 하는 것에서 온 것",
    subs: [
      {
        label: "마감·압박",
        phrase: "일에서 마감이 다가오거나 압박감이 올 때",
      },
      {
        label: "실수·결과 미달",
        phrase:
          "일에서 실수를 하거나 원하는 결과에 도달하지 못했을 때",
      },
      {
        label: "통제할 수 없는 지시·변경",
        phrase: "일에서 내가 통제할 수 없는 지시를 받았을 때",
      },
      {
        label: "과부하",
        phrase: "일에서 과부하가 올 때",
      },
      {
        label: "의미 없는 반복",
        phrase: "의미 없는 반복된 일을 할 때",
      },
    ],
  },
  {
    id: "self",
    label: "나 자신",
    hint: "내가 나에게 한 것",
    subs: [
      {
        label: "계획을 못 지킴",
        phrase: "나 자신이 계획을 못 지킬 때",
      },
      {
        label: "남과 비교",
        phrase: "나 자신이 남과 비교할 때",
      },
      {
        label: "과거 후회",
        phrase: "나 자신이 과거를 후회할 때",
      },
      {
        label: "미래 걱정",
        phrase: "나 자신이 미래를 걱정할 때",
      },
      {
        label: "결정 못 함",
        phrase: "나 자신이 결정을 못 할 때",
      },
    ],
  },
  {
    id: "body",
    label: "몸",
    hint: "상태에서 온 것",
    subs: [
      {
        label: "수면 부족",
        phrase: "수면이 부족할 때",
      },
      {
        label: "피로 누적",
        phrase: "피로가 누적될 때",
      },
      {
        label: "배고픔·과식",
        phrase: "배가 고프거나 너무 많이 먹을 때",
      },
      {
        label: "통증·컨디션",
        phrase: "몸이 아프거나 컨디션이 좋지 않을 때",
      },
      {
        label: "중독적 행동",
        phrase: "중독적 행동을 끊지 못할 때",
      },
    ],
  },
  {
    id: "external",
    label: "외부 상황",
    hint: "내 밖에서 온 것",
    subs: [
      {
        label: "갑작스러운 변경·돌발",
        phrase: "갑작스러운 변경 또는 돌발 상황에서",
      },
      {
        label: "기다림·지연",
        phrase: "무언가가 지연될 때",
      },
      {
        label: "돈",
        phrase: "돈문제로 인해",
      },
      {
        label: "주변환경",
        phrase: "주변환경에서 오는 스트레스로",
      },
      {
        label: "SNS",
        phrase: "SNS를 볼 때",
      },
    ],
  },
];

/** 레거시 평면 6칩 → 새 대분류 */
const LEGACY_FLAT_TO_CATEGORY = new Map([
  ["사람·관계", "사람"],
  ["업무·성취", "일"],
  ["신체 상태", "몸"],
  ["환경·외부 자극", "외부 상황"],
  ["디지털·정보", "외부 상황"],
  ["돈·미래", "외부 상황"],
]);

/** 예전 세부 라벨 → 현재 세부 */
const LEGACY_SUB_TO_CURRENT = new Map([
  ["술·카페인", "중독적 행동"],
  ["돈·지출", "돈"],
  ["소음·혼잡·이동", "주변환경"],
  ["뉴스·SNS", "SNS"],
  ["무시당함 / 반응이 없음", "무시 당함"],
  ["무시당함/반응이 없음", "무시 당함"],
  ["무시당함", "무시 당함"],
  ["비난·지적받음", "비난·지적 받음"],
  ["오해받음", "오해 받음"],
  ["이기적행동", "이기적 행동"],
]);

const CAT_BY_LABEL = new Map(
  EMOTION_TRIGGER_CATEGORIES.map((c) => [c.label, c]),
);
const CAT_BY_ID = new Map(EMOTION_TRIGGER_CATEGORIES.map((c) => [c.id, c]));

/** @type {Map<string, { categoryLabel: string, phrase: string }>} */
const SUB_META = new Map();
for (const c of EMOTION_TRIGGER_CATEGORIES) {
  for (const sub of c.subs) {
    SUB_META.set(sub.label, {
      categoryLabel: c.label,
      phrase: sub.phrase,
    });
  }
}

export const EMOTION_TRIGGER_SEP = " · ";

function normalizeSubLabel(sub) {
  const s = String(sub || "").trim();
  if (!s) return "";
  return LEGACY_SUB_TO_CURRENT.get(s) || s;
}

/**
 * @param {string} categoryLabel
 * @param {string} subLabel
 */
export function formatEmotionTrigger(categoryLabel, subLabel) {
  const cat = String(categoryLabel || "").trim();
  const sub = normalizeSubLabel(subLabel);
  if (!cat && !sub) return "";
  if (cat && sub) return `${cat}${EMOTION_TRIGGER_SEP}${sub}`;
  return cat || sub;
}

/**
 * @param {string} raw
 * @returns {{ categoryLabel: string, subLabel: string, label: string, known: boolean, legacy: boolean, phrase: string }}
 */
export function parseEmotionTrigger(raw) {
  const v = String(raw || "").trim();
  if (!v) {
    return {
      categoryLabel: "",
      subLabel: "",
      label: "",
      known: false,
      legacy: false,
      phrase: "",
    };
  }

  let cat = "";
  let sub = "";
  const sepIdx = v.indexOf(EMOTION_TRIGGER_SEP);
  if (sepIdx >= 0) {
    cat = v.slice(0, sepIdx).trim();
    sub = normalizeSubLabel(v.slice(sepIdx + EMOTION_TRIGGER_SEP.length));
  } else if (SUB_META.has(normalizeSubLabel(v))) {
    sub = normalizeSubLabel(v);
    cat = SUB_META.get(sub)?.categoryLabel || "";
  } else if (CAT_BY_LABEL.has(v)) {
    cat = v;
  } else if (LEGACY_FLAT_TO_CATEGORY.has(v)) {
    return {
      categoryLabel: LEGACY_FLAT_TO_CATEGORY.get(v) || "",
      subLabel: "",
      label: v,
      known: false,
      legacy: true,
      phrase: "",
    };
  } else {
    return {
      categoryLabel: "",
      subLabel: "",
      label: v,
      known: false,
      legacy: true,
      phrase: "",
    };
  }

  const meta = sub ? SUB_META.get(sub) : null;
  const known = !!(meta && (!cat || cat === meta.categoryLabel));
  const categoryLabel = known ? meta.categoryLabel : cat;
  const phrase = known ? meta.phrase : "";
  return {
    categoryLabel,
    subLabel: sub,
    label: formatEmotionTrigger(categoryLabel, sub),
    known,
    legacy: false,
    phrase,
  };
}

/** 세부(또는 저장값) → 상황 문구 */
export function emotionTriggerSituationPhrase(rawOrSub) {
  const p = parseEmotionTrigger(rawOrSub);
  if (p.phrase) return p.phrase;
  const subOnly = normalizeSubLabel(rawOrSub);
  return SUB_META.get(subOnly)?.phrase || "";
}

/**
 * 데이터 기반 패턴 문장
 * @param {string} triggerRawOrSub
 * @param {string} emotionLabel
 */
export function buildEmotionTriggerPatternSentence(triggerRawOrSub, emotionLabel) {
  const emotion = String(emotionLabel || "").trim();
  const phrase = emotionTriggerSituationPhrase(triggerRawOrSub);
  if (!phrase || !emotion) return "";
  return `${phrase} ${emotion}의 감정을 느낍니다.`;
}

/** @param {string} value @returns {{ label: string, known: boolean }} */
export function resolveEmotionTriggerLabel(value) {
  const p = parseEmotionTrigger(value);
  if (!p.label) return { label: "", known: false };
  if (p.known) return { label: p.label, known: true };
  if (p.legacy && p.categoryLabel && !p.subLabel) {
    return { label: p.categoryLabel, known: false };
  }
  return { label: p.label, known: p.known };
}

export function emotionTriggerCategoryLabels() {
  return EMOTION_TRIGGER_CATEGORIES.map((c) => c.label);
}

/** @param {string} label */
export function isEmotionTriggerCategoryLabel(label) {
  return CAT_BY_LABEL.has(String(label || "").trim());
}

/**
 * 대분류만 골라도 저장. 세부는 있으면 같이 붙인다.
 * @param {string} raw
 * @param {string} [categoryFallback]
 */
export function emotionTriggerValueForSave(raw, categoryFallback = "") {
  const parsed = parseEmotionTrigger(raw);
  const cat = parsed.categoryLabel || String(categoryFallback || "").trim();
  if (!isEmotionTriggerCategoryLabel(cat)) return "";
  return formatEmotionTrigger(cat, parsed.subLabel);
}

/** @param {string} categoryLabel @returns {string[]} */
export function emotionTriggerSubsForCategory(categoryLabel) {
  const c = CAT_BY_LABEL.get(String(categoryLabel || "").trim());
  return c ? c.subs.map((s) => s.label) : [];
}

/** @param {string} categoryLabel */
export function emotionTriggerCategoryHint(categoryLabel) {
  return CAT_BY_LABEL.get(String(categoryLabel || "").trim())?.hint || "";
}

export function emotionTriggerReportKey(raw) {
  const p = parseEmotionTrigger(raw);
  if (p.subLabel) return p.subLabel;
  if (p.categoryLabel) return p.categoryLabel;
  if (p.label) return p.label;
  return "미선택";
}

export function emotionTriggerCategoryKey(raw) {
  const p = parseEmotionTrigger(raw);
  if (p.categoryLabel) return p.categoryLabel;
  return "기타";
}

export function getEmotionTriggerCategoryById(id) {
  return CAT_BY_ID.get(String(id || "").trim()) || null;
}

export const EMOTION_TRIGGER_OPTIONS = emotionTriggerCategoryLabels();
