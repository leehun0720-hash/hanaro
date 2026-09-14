/**
 * ElevenLabs Music — 응원송 음원 생성
 * POST https://api.elevenlabs.io/v1/music  (헤더 xi-api-key) → 오디오 바이트(MP3)
 * composition_plan: 섹션별 스타일·길이·가사(lines)로 정밀 제어
 */
import { ProviderHttpError, withRetry } from "./retry";
import { requireSecret } from "@/lib/secrets";
import { PRICES, recordUsage } from "@/lib/usage";

const BASE = "https://api.elevenlabs.io/v1";
/** 섹션(sections) 기반 composition_plan은 music_v1 형식이다. music_v2/v2_5는 다른 플랜 형식을 요구해 "Invalid type of composition_plan" 오류가 난다 */
export const MUSIC_MODEL = process.env.ELEVENLABS_MUSIC_MODEL ?? "music_v1";

export type CompositionSection = {
  section_name: string;
  positive_local_styles: string[];
  negative_local_styles: string[];
  duration_ms: number; // 3000~120000
  lines: string[]; // 가사, 최대 30줄·200자
};

export type CompositionPlan = {
  positive_global_styles: string[];
  negative_global_styles: string[];
  sections: CompositionSection[];
};

export async function composeMusic(plan: CompositionPlan, modelId: string = MUSIC_MODEL): Promise<Buffer> {
  return withRetry(
    async () => {
      const r = await fetch(`${BASE}/music?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": (await requireSecret("ELEVENLABS_API_KEY")).trim(), "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ composition_plan: plan, model_id: modelId }),
        cache: "no-store",
      });
      if (!r.ok) {
        let msg = r.statusText;
        try {
          const j = (await r.json()) as { detail?: { message?: string } | string };
          msg = typeof j.detail === "string" ? j.detail : j.detail?.message ?? msg;
        } catch {}
        // 모델이 이 플랜 형식을 받지 않으면 v1로 한 번 더
        if (r.status === 400 && /composition_plan/i.test(msg) && modelId !== "music_v1") return composeMusic(plan, "music_v1");
        throw new ProviderHttpError(r.status, `음원 생성 실패: ${msg}`);
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 1000) throw new Error("음원 생성 결과가 비어 있습니다.");
      await recordUsage({ provider: "elevenlabs", product: modelId, unit: "tracks", quantity: 1, costUsd: PRICES.musicPerTrack, meta: { bytes: buf.length } });
      return buf;
    },
    { tries: 3, label: "elevenlabs" },
  );
}

/** 가사 없는 배경음악(BGM) 플랜 — 실습 제작실용. 길이 3~120초 */
export function buildInstrumentalPlan(style: string, seconds: number): CompositionPlan {
  const styles = style
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
  const ms = Math.max(3000, Math.min(120000, Math.round(seconds * 1000)));
  return {
    positive_global_styles: [...(styles.length ? styles : ["warm acoustic", "gentle"]), "instrumental", "no vocals", "background music"],
    negative_global_styles: ["vocals", "lyrics", "spoken word", "explicit", "distorted"],
    sections: [{ section_name: "Main", positive_local_styles: ["steady", "clean intro", "soft ending"], negative_local_styles: [], duration_ms: ms, lines: [] }],
  };
}

export const planDurationMs = (plan: CompositionPlan) => plan.sections.reduce((a, s) => a + s.duration_ms, 0);
