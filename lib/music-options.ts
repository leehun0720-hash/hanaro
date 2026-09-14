/** 뮤직비디오 음악 세부 설정 — 클라이언트·서버 공용 (장르 프리셋은 lib/prompts/mv.ts) */
export const VOCAL_OPTIONS = {
  female: { label: "여성 보컬", styles: ["female lead vocal", "warm clear female voice"] },
  male: { label: "남성 보컬", styles: ["male lead vocal", "warm confident male voice"] },
  duet: { label: "남녀 듀엣", styles: ["male and female duet", "harmonized vocals"] },
  choir: { label: "합창·떼창", styles: ["group chorus vocals", "sing-along crowd chorus", "unison singing"] },
  instrumental: { label: "무보컬 (연주곡)", styles: ["instrumental", "no vocals"] },
} as const;
export type VocalOption = keyof typeof VOCAL_OPTIONS;

export const TEMPO_OPTIONS = {
  slow: { label: "느리게 (70~85 BPM)", styles: ["slow tempo", "75 bpm", "relaxed groove"] },
  medium: { label: "보통 (95~115 BPM)", styles: ["medium tempo", "105 bpm", "steady groove"] },
  fast: { label: "빠르게 (125~140 BPM)", styles: ["fast tempo", "130 bpm", "driving energetic rhythm"] },
} as const;
export type TempoOption = keyof typeof TEMPO_OPTIONS;

export const MOOD_OPTIONS = {
  bright: { label: "밝고 신나게", styles: ["bright", "cheerful", "uplifting", "major key"] },
  warm: { label: "따뜻하고 정겹게", styles: ["warm", "nostalgic", "heartfelt", "friendly"] },
  grand: { label: "웅장하게", styles: ["grand", "anthemic", "big build-up", "wide stereo"] },
  emotional: { label: "감성적으로", styles: ["emotional", "tender", "intimate", "gentle dynamics"] },
} as const;
export type MoodOption = keyof typeof MOOD_OPTIONS;

export type MusicOptions = { vocal: VocalOption; tempo: TempoOption; mood: MoodOption; instruments?: string; extra?: string };
export const DEFAULT_MUSIC_OPTIONS: MusicOptions = { vocal: "duet", tempo: "medium", mood: "bright" };

const key = <T extends object>(o: T, v: unknown, d: keyof T): keyof T => (typeof v === "string" && v in o ? (v as keyof T) : d);
export function normalizeMusicOptions(raw: unknown): MusicOptions {
  const r = (raw ?? {}) as Partial<Record<keyof MusicOptions, unknown>>;
  return {
    vocal: key(VOCAL_OPTIONS, r.vocal, DEFAULT_MUSIC_OPTIONS.vocal),
    tempo: key(TEMPO_OPTIONS, r.tempo, DEFAULT_MUSIC_OPTIONS.tempo),
    mood: key(MOOD_OPTIONS, r.mood, DEFAULT_MUSIC_OPTIONS.mood),
    instruments: typeof r.instruments === "string" ? r.instruments.trim().slice(0, 120) || undefined : undefined,
    extra: typeof r.extra === "string" ? r.extra.trim().slice(0, 300) || undefined : undefined,
  };
}
