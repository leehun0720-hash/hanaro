import { z } from "zod";
import { buildPrompt, projectContext } from "./rokmokjobun";
import type { Project } from "@/lib/types";
import { MOOD_OPTIONS, TEMPO_OPTIONS, VOCAL_OPTIONS, type MusicOptions } from "@/lib/music-options";

/** 강의안 '장르 고르기' 5종 */
export const MV_GENRES = {
  trot: {
    label: "트로트",
    use: "60대+ 조합원 잔치·행사 — 가장 안전한 선택 ★",
    style: "Korean trot (ppongjjak), semi-trot festive, brass section, accordion, electric guitar licks, punchy drums, bouncy shuffle rhythm, sing-along chorus, retro Korean pop production, clean modern mix",
    negative: "lo-fi, muddy, out of tune, rap, EDM drop",
    chorus: "big brass hits, full band, crowd-style backing vocals, key change energy",
    verse: "playful storytelling vocal, light accordion accompaniment",
  },
  folk: {
    label: "포크·통기타",
    use: "잔잔한 감동 — 조합 역사 이야기",
    style: "Korean acoustic folk, fingerpicked steel-string guitar, soft brushed drums, upright bass, harmonica touches, intimate warm vocal, natural room reverb, organic production",
    negative: "electronic, autotune, heavy drums, distortion",
    chorus: "layered vocal harmonies, strummed guitar swell, gentle strings",
    verse: "sparse fingerpicking, close-mic intimate vocal",
  },
  kids: {
    label: "동요풍",
    use: "온 가족 행사·어린이 손님",
    style: "Korean children's song, simple memorable melody, glockenspiel, ukulele, hand claps, bright piano, playful woodwinds, clear sweet vocal, easy to sing along",
    negative: "dark, aggressive, complex harmony, rap",
    chorus: "call-and-response, hand claps, group kids chorus",
    verse: "light piano and ukulele, cheerful vocal",
  },
  dance: {
    label: "댄스·팝",
    use: "청년 조합원·SNS 확산용",
    style: "modern K-pop dance pop, bright synth leads, punchy four-on-the-floor drums, funky bass, vocal chops, catchy hook, polished radio-ready mix, 2020s production",
    negative: "lo-fi, acoustic only, slow, trot",
    chorus: "big synth drop, layered vocals, energetic hook repetition",
    verse: "groovy bass, tight rhythm, confident vocal",
  },
  ballad: {
    label: "발라드",
    use: "감사 인사·연말 영상용",
    style: "Korean pop ballad, emotional grand piano, lush strings, soft pads, gentle drums entering in chorus, heartfelt expressive vocal, cinematic build, wide reverb",
    negative: "upbeat dance, brass, rap, distorted guitar",
    chorus: "soaring vocal, full string section, powerful drums",
    verse: "piano only, tender vocal, building anticipation",
  },
} as const;
export type MvGenre = keyof typeof MV_GENRES;

export const mvInputSchema = z.object({
  genre: z.enum(["trot", "folk", "kids", "dance", "ballad"]).default("trot"),
  orgName: z.string().trim().min(1).max(60),
  specialty: z.string().trim().min(1).max(60),
  region: z.string().trim().max(60).optional(),
  extra: z.string().trim().max(1000).optional(),
  /** 사용자가 고른 프로젝트 사진 경로 (없으면 참조 없이 text-to-video) */
  refPhoto: z.string().trim().min(1).nullable().optional(),
  /** 음악 세부 설정 (보컬·템포·분위기·악기·추가 지시) */
  music: z.object({ vocal: z.string().optional(), tempo: z.string().optional(), mood: z.string().optional(), instruments: z.string().optional(), extra: z.string().optional() }).optional(),
  /** 자막 스타일 */
  subtitle: z.object({ fontId: z.string().optional(), themeId: z.string().optional(), position: z.enum(["top", "bottom"]).optional(), fontSize: z.number().optional() }).optional(),
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
  musicStyles: z.array(z.string()).describe("이 노래에 어울리는 영문 음악 스타일 태그 5~8개 (악기·질감·시대감·보컬 표현 등, 장르명 반복 금지)").default([]),
});
export type MvOutput = z.infer<typeof mvOutputSchema>;

/** 사용자가 확인 화면에서 고친 가사·장면·스타일 (제목·가사·장면·태그만 수정 가능) */
export const mvEditableSchema = z.object({
  title: z.string().trim().min(1).max(30),
  lyrics: z.object({
    verse1: z.array(z.string().trim().max(60)).min(1).max(8),
    chorus: z.array(z.string().trim().max(60)).min(1).max(8),
    verse2: z.array(z.string().trim().max(60)).min(1).max(8),
    chorus2: z.array(z.string().trim().max(60)).min(1).max(8),
  }),
  scenes: z.array(z.object({ captionKo: z.string().trim().max(60), videoPrompt: z.string().trim().min(10).max(1200) })).length(MV_SCENES),
  musicStyles: z.array(z.string().trim().max(60)).max(12).default([]),
});

export function mvSystemPrompt() {
  return [
    "너는 지역 농협의 마음을 잘 아는 작사가이자 뮤직비디오 연출가다.",
    "가사 구조: 1절 → 후렴 → 2절 → 후렴, 전체 1분(약 200자). 쉬운 우리말, 지역명과 특산물이 반드시 들어간다. 기존 곡 표절·특정 인물 언급 금지.",
    "scenes는 정확히 4개(각 15초): 1 황금 들녘·과수원 오프닝 → 2 일하는 손과 수확 → 3 매장·조합원 함께 → 4 웃는 마을·석양 엔딩. videoPrompt는 영어, 한 장면 = 한 장소 + 카메라 동작 하나(static/slow dolly/slow pan), 흔들림·빠른 움직임 금지.",
    "musicStyles: 가사의 정서와 장르에 맞는 영문 스타일 태그 5~8개 (예: 'warm brass stabs', 'bright acoustic strum', '2010s Korean pop mix'). 장르명 자체는 넣지 않는다.",
    "출력은 지정된 JSON 스키마로만.",
  ].join("\n");
}

export function mvUserPrompt(input: MvInput, project: Project | null) {
  return buildPrompt({
    role: "지역 농협을 잘 아는 작사가",
    context: [
      `우리 조합: ${input.orgName}${input.region ? ` (${input.region})` : ""}`,
      `지역 특산물: ${input.specialty}`,
      `장르: ${MV_GENRES[input.genre].label} (${MV_GENRES[input.genre].style})`,
      input.music?.extra ? `음악 요청: ${input.music.extra}` : "",
      ...projectContext(project, null).filter((s) => !s.startsWith("우리 조합")),
      input.extra ? `추가로 담을 이야기: ${input.extra}` : "",
    ],
    goal: "듣는 조합원과 직원이 '우리 조합이 자랑스럽다'고 느끼고 함께 따라 부르게 만든다.",
    conditions: ["존댓말이 아니어도 됨. 후렴은 4줄 반복 구조로 외우기 쉽게.", "각 줄 12자 내외, 전체 200자 내외."],
    format: "JSON 스키마대로. scenes 정확히 4개.",
  });
}

/** 가사 + 장르 프리셋 + 사용자 세부 설정 + Claude 스타일 태그 → ElevenLabs composition_plan (총 60초) */
export function buildCompositionPlan(out: MvOutput, genre: MvGenre, music: MusicOptions) {
  const g = MV_GENRES[genre];
  const split = (t: string) => t.split(",").map((s) => s.trim()).filter(Boolean);
  const uniq = (arr: string[]) => Array.from(new Set(arr.map((s) => s.trim()).filter(Boolean)));
  const globalPos = uniq([
    ...split(g.style),
    ...VOCAL_OPTIONS[music.vocal].styles,
    ...TEMPO_OPTIONS[music.tempo].styles,
    ...MOOD_OPTIONS[music.mood].styles,
    ...(music.instruments ? split(music.instruments) : []),
    ...(out.musicStyles ?? []).slice(0, 8),
    ...(music.extra ? [music.extra] : []),
    "Korean lyrics sung clearly with correct pronunciation",
    "professional studio recording",
    "balanced mastering, no clipping",
  ]);
  const globalNeg = uniq([...split(g.negative), "explicit", "spoken word", "distorted", "off-key vocals", "muffled", "abrupt ending"]);
  const instrumental = music.vocal === "instrumental";
  const sec = (name: string, lines: string[], ms: number, local: string) => ({
    section_name: name,
    positive_local_styles: uniq(split(local)),
    negative_local_styles: [],
    duration_ms: ms,
    lines: instrumental ? [] : lines.slice(0, 30).map((l) => l.slice(0, 200)),
  });
  return {
    positive_global_styles: globalPos,
    negative_global_styles: globalNeg,
    sections: [
      sec("Verse 1", out.lyrics.verse1, 15000, `${g.verse}, intro establishes the groove`),
      sec("Chorus", out.lyrics.chorus, 15000, `${g.chorus}, catchy memorable hook`),
      sec("Verse 2", out.lyrics.verse2, 15000, `${g.verse}, slightly fuller than verse 1`),
      sec("Chorus 2", out.lyrics.chorus2, 15000, `${g.chorus}, final chorus, satisfying ending with clean resolve`),
    ],
  };
}
