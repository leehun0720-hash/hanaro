import { z } from "zod";
import { buildPrompt, projectContext } from "./rokmokjobun";
import type { Project } from "@/lib/types";

/** 강의안 '장르 고르기' 5종 */
export const MV_GENRES = {
  trot: { label: "트로트", style: "Korean trot, upbeat, cheerful, brass and accordion, festive", use: "60대+ 조합원 잔치·행사 — 가장 안전한 선택 ★" },
  folk: { label: "포크·통기타", style: "Korean folk, acoustic guitar, warm, gentle male vocal", use: "잔잔한 감동 — 조합 역사 이야기" },
  kids: { label: "동요풍", style: "children's song style, bright, simple melody, playful", use: "온 가족 행사·어린이 손님" },
  dance: { label: "댄스·팝", style: "K-pop dance, energetic, synth, catchy hook", use: "청년 조합원·SNS 확산용" },
  ballad: { label: "발라드", style: "Korean ballad, emotional piano, strings, heartfelt vocal", use: "감사 인사·연말 영상용" },
} as const;
export type MvGenre = keyof typeof MV_GENRES;

export const mvInputSchema = z.object({
  genre: z.enum(["trot", "folk", "kids", "dance", "ballad"]).default("trot"),
  orgName: z.string().trim().min(1).max(60),
  specialty: z.string().trim().min(1).max(60),
  region: z.string().trim().max(60).optional(),
  extra: z.string().trim().max(1000).optional(),
});
export type MvInput = z.infer<typeof mvInputSchema>;

export const MV_SCENES = 4;
export const MV_SCENE_SECONDS = 15;

export const mvOutputSchema = z.object({
  title: z.string().describe("노래 제목 12자 이내"),
  lyrics: z.object({
    verse1: z.array(z.string()).describe("1절 4줄, 각 12자 내외"),
    chorus: z.array(z.string()).describe("후렴 4줄, 조합명·특산물 포함, 따라 부르기 쉽게"),
    verse2: z.array(z.string()).describe("2절 4줄"),
    chorus2: z.array(z.string()).describe("후렴 반복(같거나 살짝 변형)"),
  }),
  scenes: z
    .array(
      z.object({
        captionKo: z.string().describe("이 장면에 띄울 가사 한 줄(위 가사에서 발췌)"),
        videoPrompt: z.string().describe("영문 Kling 프롬프트 60단어 이내, 밝은 실사풍 한국 농촌, 얼굴 클로즈업·로고·글자 금지"),
      }),
    )
    .describe("정확히 4개, 각 15초"),
});
export type MvOutput = z.infer<typeof mvOutputSchema>;

export function mvSystemPrompt() {
  return [
    "너는 지역 농협의 마음을 잘 아는 작사가이자 뮤직비디오 연출가다.",
    "가사 구조: 1절 → 후렴 → 2절 → 후렴, 전체 1분(약 200자). 쉬운 우리말, 지역명과 특산물이 반드시 들어간다. 기존 곡 표절·특정 인물 언급 금지.",
    "scenes는 정확히 4개(각 15초): 1 황금 들녘·과수원 오프닝 → 2 일하는 손과 수확 → 3 매장·조합원 함께 → 4 웃는 마을·석양 엔딩. videoPrompt는 영어.",
    "출력은 지정된 JSON 스키마로만.",
  ].join("\n");
}

export function mvUserPrompt(input: MvInput, project: Project | null) {
  return buildPrompt({
    role: "지역 농협을 잘 아는 작사가",
    context: [
      `우리 조합: ${input.orgName}${input.region ? ` (${input.region})` : ""}`,
      `지역 특산물: ${input.specialty}`,
      `장르: ${MV_GENRES[input.genre].label}`,
      ...projectContext(project, null).filter((s) => !s.startsWith("우리 조합")),
      input.extra ? `추가로 담을 이야기: ${input.extra}` : "",
    ],
    goal: "듣는 조합원과 직원이 '우리 조합이 자랑스럽다'고 느끼고 함께 따라 부르게 만든다.",
    conditions: ["존댓말이 아니어도 됨. 후렴은 4줄 반복 구조로 외우기 쉽게.", "각 줄 12자 내외, 전체 200자 내외."],
    format: "JSON 스키마대로. scenes 정확히 4개.",
  });
}

/** 가사 + 장르 → ElevenLabs composition_plan (총 60초) */
export function buildCompositionPlan(out: MvOutput, genre: MvGenre) {
  const g = MV_GENRES[genre].style.split(",").map((s) => s.trim());
  const sec = (name: string, lines: string[], ms: number) => ({
    section_name: name,
    positive_local_styles: name.startsWith("Chorus") ? ["catchy", "full arrangement"] : ["verse", "storytelling"],
    negative_local_styles: [],
    duration_ms: ms,
    lines: lines.slice(0, 30).map((l) => l.slice(0, 200)),
  });
  return {
    positive_global_styles: [...g, "Korean lyrics", "clear vocals", "radio-ready mix"],
    negative_global_styles: ["explicit", "dark", "distorted", "spoken word"],
    sections: [sec("Verse 1", out.lyrics.verse1, 15000), sec("Chorus", out.lyrics.chorus, 15000), sec("Verse 2", out.lyrics.verse2, 15000), sec("Chorus 2", out.lyrics.chorus2, 15000)],
  };
}
