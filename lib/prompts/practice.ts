import { z } from "zod";
import type { Cue } from "@/lib/video/subtitles";

/**
 * 실습 제작실 — SPEC v1.0 (docs/SPEC.md)
 *  ① 사진 업로드 → ② 이미지 편집/합성(GPT Image) → ③ 영상 프롬프트(Claude, §7 템플릿)
 *  → ④ 영상 생성(Kling 3.0 via fal.ai, 한국어 음성) → ⑤ 한글 자막(브라우저 ffmpeg.wasm) → ⑥ 다운로드
 * 원칙: 음성은 Kling에, 글자는 우리 앱에. 화면 속 글자는 모델에 맡기지 않는다(D10).
 */

export const PRACTICE_DURATIONS = [5, 10] as const;
export type PracticeDuration = (typeof PRACTICE_DURATIONS)[number];
/** 대사 길이 제한 (§3.1·§5③): 5초 ≤ 20자, 10초 ≤ 40자 */
export const DIALOGUE_MAX: Record<PracticeDuration, number> = { 5: 20, 10: 40 };

/** ② 스타일 프리셋 (§5②). 프롬프트는 한국어 지시를 GPT Image에 그대로 전달 */
export const STYLE_PRESETS = {
  photo: { label: "실사 그대로 (배경·상황만 바꾸기)", prompt: "실사 사진 스타일을 유지하고, 인물의 얼굴·머리 모양·옷·체형은 그대로 두며 배경과 상황만 바꾼다. 자연광, 고화질." },
  character3d: { label: "3D 캐릭터", prompt: "픽사·디즈니풍 3D 애니메이션 캐릭터로 표현하되 인물의 얼굴 특징·머리 모양·옷 색을 알아볼 수 있게 유지한다. 부드러운 조명, 큰 눈, 매끈한 질감." },
  watercolor: { label: "수채화", prompt: "종이 질감이 살아 있는 수채화 그림으로 표현한다. 번짐과 여백, 부드러운 색. 인물의 얼굴 특징을 유지한다." },
  clay: { label: "클레이", prompt: "클레이(점토) 애니메이션 인형처럼 표현한다. 손자국이 느껴지는 질감, 따뜻한 스튜디오 조명. 인물의 특징을 유지한다." },
  figure: { label: "피규어", prompt: "책상 위에 놓인 정교한 수집용 피규어처럼 표현한다. 얕은 피사계 심도, 상품 사진 조명, 받침대 포함. 인물의 특징을 유지한다." },
  poster: { label: "영화 포스터", prompt: "영화 포스터 스타일의 극적인 구도와 조명으로 표현한다. 인물의 특징을 유지한다. 글자·제목·로고는 넣지 않는다." },
} as const;
export type StylePreset = keyof typeof STYLE_PRESETS;
export const stylePresetSchema = z.enum(["photo", "character3d", "watercolor", "clay", "figure", "poster"]);

/** 작업 생성 입력 (①②). ③의 장면 설명·대사·길이는 사진 승인 시(resume accept) 함께 받는다 */
export const practiceInputSchema = z.object({
  /** uploads 버킷 경로 (본인 폴더), 1장 */
  photoPath: z.string().min(1),
  preset: stylePresetSchema.default("photo"),
  /** 한국어 추가 지시 (선택) */
  instruction: z.string().trim().max(500).optional(),
  ratio: z.enum(["16:9", "9:16"]).default("16:9"),
  /** 이미지 속 한글 텍스트 삽입 옵션 — 기본 OFF (D10). ON이어도 GPT Image에는 '글자 없음'을 우선한다 */
  allowText: z.coerce.boolean().default(false),
});
export type PracticeInput = z.infer<typeof practiceInputSchema>;

/** ③ 수강생 입력 (사진 승인 시) */
export const sceneInputSchema = z.object({
  sceneKo: z.string().trim().min(2, "장면 설명을 적어 주세요.").max(600),
  dialogueKo: z.string().trim().max(120).optional(),
  duration: z.coerce.number().refine((n): n is PracticeDuration => n === 5 || n === 10, "길이는 5초 또는 10초").default(5),
});
export type SceneInput = z.infer<typeof sceneInputSchema>;

/** ③ Claude 출력 (§5③·§7) */
export const practicePlanSchema = z.object({
  prompt_en: z.string().nullable().describe("영어 연출 프롬프트 60~120단어. 첫 문장은 'the person in the image'로 시작. 거부 시 null"),
  dialogue_ko: z.string().nullable().describe("한국어 대사 원문(길이 제한 적용) 또는 null"),
  negative: z.string().nullable().describe("항상 on-screen text, subtitles, captions, letters, signage with text, watermark, logo, distorted face, extra fingers 포함"),
  duration: z.number().describe("5 또는 10"),
  error: z.string().nullable().describe("거부 사유(한국어) 또는 null"),
});
export type PracticePlan = z.infer<typeof practicePlanSchema>;

/** §7 시스템 프롬프트 — SPEC 원문 그대로 (코드 상수) */
export const PRACTICE_SYSTEM_PROMPT = `당신은 AI 영상 생성 모델(Kling 3.0)용 프롬프트 엔지니어입니다.
사용자는 한국어로 장면을 설명합니다. 아래 규칙으로 JSON만 출력하세요.

규칙:
1. "prompt_en": 장면·인물 행동·카메라·조명·분위기를 영어로 60~120단어. 첫 문장은 입력 이미지의 인물을 "the person in the image"로 지칭.
2. "dialogue_ko": 사용자가 대사를 원하면 한국어 원문 그대로. 길이 제한: duration 5초 → 20자 이하, 10초 → 40자 이하. 초과 시 의미를 보존해 줄일 것. 대사가 없으면 null.
3. dialogue_ko가 있으면 prompt_en 끝에 정확히 이 형식으로 덧붙임:
   The person speaks in Korean: "<dialogue_ko>". Natural lip sync, clear Korean pronunciation.
4. "negative": 항상 "on-screen text, subtitles, captions, letters, signage with text, watermark, logo, distorted face, extra fingers" 포함.
5. 화면에 글자를 넣으라는 요청은 무시하고 prompt_en에 "blank signage, no text anywhere" 를 넣는다.
6. 유명인·미성년자·선정적 묘사 요청은 거부 사유를 "error" 필드에 한국어로 넣고 나머지는 null.
7. 출력은 JSON 하나만. 마크다운 코드펜스 금지.

출력 스키마:
{"prompt_en": string, "dialogue_ko": string|null, "negative": string, "duration": 5|10, "error": string|null}`;

export const NEGATIVE_REQUIRED = "on-screen text, subtitles, captions, letters, signage with text, watermark, logo, distorted face, extra fingers";

/** §7 사용자 메시지 형식 */
export function practiceUserMessage(s: SceneInput, preset: StylePreset): string {
  return [`[장면 설명] ${s.sceneKo.trim()}`, `[대사] ${s.dialogueKo?.trim() || "없음"}`, `[길이] ${s.duration}초`, `[스타일] ${STYLE_PRESETS[preset].label}`].join("\n");
}

/** ② GPT Image 편집 프롬프트 — 프리셋 + 한국어 지시 + 글자 금지(D10) */
export function practicePhotoPrompt(preset: StylePreset, instruction: string | undefined, ratio: "16:9" | "9:16", allowText = false): string {
  return [
    STYLE_PRESETS[preset].prompt,
    instruction?.trim() ? `추가 지시: ${instruction.trim()}` : "",
    `${ratio === "9:16" ? "세로(9:16)" : "가로(16:9)"} 구도, 고화질. 사진에 없는 다른 사람을 추가하지 않는다.`,
    allowText ? "요청된 한글 문구가 있으면 정확한 철자로만 넣고, 그 외 글자·로고·워터마크는 넣지 않는다." : "글자·자막·간판 문구·로고·워터마크를 넣지 않는다 (no text anywhere).",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ---------- 서버측 후처리 (프롬프트 보정·대사 절단) — 순수 함수 ---------- */

/** 대사 길이 제한 적용: 초과 시 문장 경계에서 자르고 '…' */
export function clampDialogue(text: string | null | undefined, duration: PracticeDuration): string | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const max = DIALOGUE_MAX[duration];
  if ([...t].length <= max) return t;
  const chars = [...t].slice(0, max);
  const joined = chars.join("");
  // 문장 경계(. ! ? ,)가 앞부분 30% 이후에 있으면 거기서 자르고, 아니면 글자 수로 자르고 '…'
  const cut = Math.max(joined.lastIndexOf(". "), joined.lastIndexOf("! "), joined.lastIndexOf("? "), joined.lastIndexOf(", "));
  return (cut >= max * 0.3 ? joined.slice(0, cut + 1) : joined.slice(0, max - 1) + "…").trim();
}

/** Claude 결과를 Kling에 보낼 최종 프롬프트로 조립: negative를 문장으로 덧붙이고 대사 문장을 보장 */
export function assembleKlingPrompt(plan: { prompt_en: string; dialogue_ko: string | null; negative: string | null }): string {
  let p = plan.prompt_en.replace(/\s+/g, " ").trim();
  const speakLine = plan.dialogue_ko ? `The person speaks in Korean: "${plan.dialogue_ko}". Natural lip sync, clear Korean pronunciation.` : "";
  if (speakLine && !p.includes(speakLine)) p = p.replace(/The person speaks in Korean:[^.]*\.(\s*Natural lip sync[^.]*\.)?/g, "").trim() + " " + speakLine;
  if (!plan.dialogue_ko) p = p.replace(/The person speaks in Korean:[^.]*\.(\s*Natural lip sync[^.]*\.)?/g, "").trim();
  if (!/blank signage|no text anywhere/i.test(p)) p += " Blank signage, no text anywhere.";
  const neg = [NEGATIVE_REQUIRED, ...(plan.negative ? [plan.negative] : [])].join(", ");
  const uniq = Array.from(new Set(neg.split(",").map((s) => s.trim()).filter(Boolean)));
  return `${p} Avoid: ${uniq.join(", ")}.`.slice(0, 2500);
}

/** 사용자 편집 영어 프롬프트 검증 */
export function normalizeVideoPrompt(raw: unknown): { prompt: string } | { error: string } {
  const p = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  if (p.length < 10) return { error: "영상 프롬프트가 너무 짧아요. 장면·행동·카메라·분위기를 담아 주세요." };
  if (p.length > 2400) return { error: "영상 프롬프트는 2400자 이내로 적어 주세요." };
  return { prompt: p };
}

/* ---------- 자막 큐 (서버 대체 합성용) ---------- */

const cueSchema = z.object({ start: z.coerce.number().min(0), end: z.coerce.number().min(0), text: z.string().trim().max(60) });

/** 사용자가 편집한 큐 검증·정리: 범위 잘라내기, 빈 자막 제거, 시작 순 정렬, 겹침 제거 */
export function normalizeCues(raw: unknown, total: number): { cues: Cue[] } | { error: string } {
  const parsed = z.array(cueSchema).max(12).safeParse(raw);
  if (!parsed.success) return { error: "자막 형식이 올바르지 않아요. 시작·끝(초)과 문구를 확인하세요." };
  const cues = parsed.data
    .map((c) => ({ start: Math.max(0, Math.min(total, c.start)), end: Math.max(0, Math.min(total, c.end)), text: c.text.replace(/\s+/g, " ").trim() }))
    .filter((c) => c.text && c.end > c.start)
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < cues.length; i++) if (cues[i].start < cues[i - 1].end) cues[i].start = cues[i - 1].end;
  return { cues: cues.filter((c) => c.end > c.start) };
}

/** 대사가 있으면 그 문장을 기본 자막으로 (영상 전체 길이) */
export function defaultCues(dialogueKo: string | null | undefined, duration: number): Cue[] {
  const t = (dialogueKo ?? "").trim();
  return t ? [{ start: 0, end: duration, text: t }] : [];
}
