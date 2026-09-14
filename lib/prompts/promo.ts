import { z } from "zod";
import { buildPrompt, projectContext } from "./rokmokjobun";
import type { Project } from "@/lib/types";

export const promoInputSchema = z.object({
  ratio: z.enum(["16:9", "9:16"]).default("16:9"),
  /** 사용자가 고른 프로젝트 사진 경로 (없으면 참조 없이 text-to-video) */
  refPhoto: z.string().trim().min(1).nullable().optional(),
  /** 소리: 현장음(Kling 네이티브 오디오) · 한국어 내레이션(자막 읽어주기, OpenAI TTS) */
  sound: z.object({ ambient: z.boolean().default(true), narration: z.boolean().default(true), voice: z.string().optional() }).default({ ambient: true, narration: true }),
  mood: z.string().trim().max(100).optional(),
  extra: z.string().trim().max(1000).optional(),
});
export type PromoInput = z.infer<typeof promoInputSchema>;

/** 30초 황금 구조: 후크 3초 · 메시지 20초(A 10 + B 10) · CTA 7초 */
export const PROMO_CUTS = [
  { key: "hook", seconds: 3, clipSeconds: 5 },
  { key: "messageA", seconds: 10, clipSeconds: 10 },
  { key: "messageB", seconds: 10, clipSeconds: 10 },
  { key: "cta", seconds: 7, clipSeconds: 0 },
] as const;

export const promoOutputSchema = z.object({
  cuts: z.object({
    hook: z.object({ caption: z.string().describe("첫 3초 자막, 손가락을 멈추게 하는 한 문장 20자 이내"), videoPrompt: z.string().describe("영문 Kling 프롬프트: 카메라+피사체+배경·시간+분위기, 60단어 이내, 사람 얼굴 클로즈업 금지") }),
    messageA: z.object({ caption: z.string().describe("자막 20자 이내: 무엇을"), videoPrompt: z.string() }),
    messageB: z.object({ caption: z.string().describe("자막 20자 이내: 언제·어디서·혜택"), videoPrompt: z.string() }),
    cta: z.object({ caption: z.string().describe("자막: 기한 + 연락처, 예 '9월 20일까지 ☎ 031-000-0000'") }),
  }),
  poster: z.object({
    headline: z.string().describe("CTA 포스터 큰 제목 12자 이내"),
    lines: z.array(z.string()).describe("핵심 2줄, 각 16자 이내"),
    footer: z.string().describe("연락처·기한 한 줄"),
    scene: z.string().describe("포스터 배경 장면 영문 30단어 이내"),
  }),
});
export type PromoOutput = z.infer<typeof promoOutputSchema>;

export function promoSystemPrompt() {
  return [
    "너는 10년 경력의 농협 홍보 영상 기획자다. 30초 황금 구조(후크 3초 → 메시지 20초 → 행동 유도 7초)로 3컷을 설계한다.",
    "무음으로 봐도 이해되도록 자막이 핵심을 다 말해야 한다. 자막은 짧고 큰 글씨용(20자 이내).",
    "videoPrompt는 영어로, [camera]+[subject]+[setting/time]+[mood] 공식. 밝은 실사풍, 급격한 전환 금지, 실존 인물 얼굴·브랜드 로고·글자 렌더링 요구 금지(자막은 따로 입힌다).",
    "출력은 지정된 JSON 스키마로만.",
  ].join("\n");
}

export function promoUserPrompt(input: PromoInput, project: Project, orgName: string | null) {
  return buildPrompt({
    role: "농협 홍보 영상 기획자",
    context: [...projectContext(project, orgName), `화면 비율: ${input.ratio}${input.ratio === "9:16" ? " (쇼츠·릴스 세로형)" : " (유튜브·매장 안내판)"}`, input.mood ? `분위기: ${input.mood}` : "분위기: 따뜻하고 신뢰감 있는 한국 농촌·매장", input.extra ? `추가 정보: ${input.extra}` : ""],
    goal: `이 영상을 본 사람이 '${project.cta || "매장 방문 또는 전화 문의"}' 행동을 하게 만든다.`,
    conditions: ["컷1 후크(3초): 궁금하게. 컷2 메시지A(10초): 무엇을. 컷3 메시지B(10초): 언제·어디서·혜택. 컷4 CTA(7초): 기한+연락처 포스터.", "연락처·날짜는 입력값만 사용."],
    format: "JSON 스키마대로. caption은 한국어, videoPrompt는 영어.",
  });
}

export function promoPosterPrompt(poster: PromoOutput["poster"], ratio: "16:9" | "9:16", orgName: string | null) {
  return [
    `홍보영상 마지막 컷용 ${ratio} 포스터. 큰 제목이 있는 깔끔한 포스터 스타일, 농협 초록(#0B6B3A)+흰색+가을 골드(#C9A227), 밝고 신뢰감 있는.`,
    `구성: 큰 제목 "${poster.headline}" → 핵심 2줄 "${poster.lines.join('" / "')}" → 아래 작은 글씨 "${poster.footer}".`,
    orgName ? `모서리에 작은 글씨 "${orgName}".` : "",
    `배경 장면: ${poster.scene}. 사람 얼굴 없이.`,
    "한글 문구는 위에 적힌 그대로 정확히, 오타·추가 문구 금지. 로고·브랜드 마크 금지.",
  ].filter(Boolean).join("\n");
}
