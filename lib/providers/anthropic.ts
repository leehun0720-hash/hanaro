import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import { withRetry } from "./retry";
import { requireSecret } from "@/lib/secrets";
import { PRICES, recordUsage } from "@/lib/usage";

/**
 * Claude 호출 래퍼 — 기획·원고·가사·장면 설계 담당.
 * - 모델: claude-opus-5, 적응형 사고, 구조화 출력(zod 스키마)
 * - 서버측 폴백(fallbacks: "default")을 기본 적용해 분류기 거부 시 자동으로 대체 모델이 이어받는다.
 * - 이미지 입력(vision) 지원: images에 사진을 넘기면 사진을 보고 답한다.
 * - 429·과부하는 withRetry로 재시도 (SDK 자체 재시도 + 추가)
 */
export const CLAUDE_MODEL = "claude-opus-5";

let _client: { key: string; c: Anthropic } | null = null;
/** 관리자 화면 키(DB) 우선, 없으면 환경변수 */
async function client(): Promise<Anthropic> {
  const key = await requireSecret("ANTHROPIC_API_KEY");
  if (!_client || _client.key !== key) _client = { key, c: new Anthropic({ apiKey: key }) };
  return _client.c;
}

export class ClaudeRefusal extends Error {
  constructor(detail?: string) {
    super(`AI가 이 요청을 처리하지 않았습니다.${detail ? ` (${detail})` : ""} 소재 문구를 바꿔 다시 시도해 주세요.`);
    this.name = "ClaudeRefusal";
  }
}

export type Effort = "low" | "medium" | "high" | "xhigh";

export type ImageInput = { data: Buffer; mime: "image/png" | "image/jpeg" | "image/webp" | "image/gif" };

function userContent(text: string, images?: ImageInput[]): string | Anthropic.Beta.BetaContentBlockParam[] {
  if (!images?.length) return text;
  return [
    ...images.map<Anthropic.Beta.BetaImageBlockParam>((img) => ({
      type: "image",
      source: { type: "base64", media_type: img.mime, data: img.data.toString("base64") },
    })),
    { type: "text", text },
  ];
}

/** 응답 usage → 토큰 수·추정 비용 기록 */
async function logClaudeUsage(res: { model?: string; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null } }, kind: string) {
  const u = res.usage ?? {};
  const inTok = u.input_tokens ?? 0;
  const outTok = u.output_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cost = (inTok + cacheWrite * 1.25) * (PRICES.claudeInPerM / 1e6) + cacheRead * (PRICES.claudeCacheReadPerM / 1e6) + outTok * (PRICES.claudeOutPerM / 1e6);
  await recordUsage({ provider: "anthropic", product: res.model ?? CLAUDE_MODEL, unit: "tokens", quantity: inTok + outTok + cacheRead + cacheWrite, costUsd: cost, meta: { kind, input_tokens: inTok, output_tokens: outTok, cache_read: cacheRead, cache_write: cacheWrite } });
}

export async function generateJSON<S extends z.ZodType>(
  schema: S,
  opts: { system: string; user: string; effort?: Effort; maxTokens?: number; images?: ImageInput[] },
): Promise<z.infer<S>> {
  const res = await withRetry(
    async () =>
      (await client()).beta.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: opts.maxTokens ?? 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: opts.effort ?? "high", format: betaZodOutputFormat(schema) },
        system: opts.system,
        messages: [{ role: "user", content: userContent(opts.user, opts.images) }],
      }),
    { tries: 3, label: "claude" },
  );
  await logClaudeUsage(res, "json");

  if (res.stop_reason === "refusal") {
    const cat = res.stop_details && "category" in res.stop_details ? String(res.stop_details.category ?? "") : "";
    throw new ClaudeRefusal(cat || undefined);
  }
  if (res.stop_reason === "max_tokens") throw new Error("AI 응답이 너무 길어 잘렸습니다. 분량을 줄여 다시 시도해 주세요.");
  if (!res.parsed_output) throw new Error("AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.");
  return res.parsed_output;
}

export async function generateText(opts: { system: string; user: string; effort?: Effort; maxTokens?: number; images?: ImageInput[] }): Promise<string> {
  const res = await withRetry(
    async () =>
      (await client()).beta.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: opts.maxTokens ?? 8000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: opts.effort ?? "medium" },
        system: opts.system,
        messages: [{ role: "user", content: userContent(opts.user, opts.images) }],
      }),
    { tries: 3, label: "claude" },
  );
  await logClaudeUsage(res, "text");
  if (res.stop_reason === "refusal") throw new ClaudeRefusal();
  return res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
}
