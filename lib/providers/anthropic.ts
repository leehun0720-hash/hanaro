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

const MAX_TOKENS_CAP = 32000;

/**
 * 구조화 출력(JSON). SDK의 .parse()는 stop_reason 확인 전에 JSON을 파싱하다 잘린 응답에서
 * "Failed to parse structured output: Unexpected end of JSON input"으로 실패하므로, 직접 create → stop_reason 확인 → 파싱한다.
 * max_tokens에 걸리면(adaptive thinking이 예산을 많이 쓸 때) 한도를 두 배로 올려 한 번 더 시도한다.
 */
export async function generateJSON<S extends z.ZodType>(
  schema: S,
  opts: { system: string; user: string; effort?: Effort; maxTokens?: number; images?: ImageInput[] },
): Promise<z.infer<S>> {
  const format = betaZodOutputFormat(schema);
  let maxTokens = Math.min(MAX_TOKENS_CAP, opts.maxTokens ?? 20000);
  for (let attempt = 0; ; attempt++) {
    const res = await withRetry(
      async () =>
        (await client()).beta.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          thinking: { type: "adaptive" },
          output_config: { effort: opts.effort ?? "high", format: { type: "json_schema", schema: format.schema } },
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
    if (res.stop_reason === "max_tokens") {
      if (attempt === 0 && maxTokens < MAX_TOKENS_CAP) {
        maxTokens = Math.min(MAX_TOKENS_CAP, maxTokens * 2);
        continue;
      }
      throw new Error("AI 응답이 너무 길어 잘렸습니다. 분량을 줄여 다시 시도해 주세요.");
    }
    const text = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("").trim();
    if (!text) throw new Error("AI 응답이 비어 있습니다. 다시 시도해 주세요.");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("AI 응답을 해석하지 못했습니다(JSON 형식 오류). 다시 시도해 주세요.");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new Error(`AI 응답이 형식에 맞지 않습니다: ${parsed.error.issues[0]?.message ?? "확인 필요"}. 다시 시도해 주세요.`);
    return parsed.data;
  }
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
