import OpenAI, { toFile } from "openai";
import { withRetry } from "./retry";
import { requireSecret } from "@/lib/secrets";
import { PRICES, recordUsage } from "@/lib/usage";

/**
 * OpenAI Images — 뉴스레터·카드뉴스·포스터 이미지 담당.
 * 모델 gpt-image-2.5-sunburst: 편집 정밀도·한글 텍스트 렌더링에 강점.
 * 크기는 16의 배수 자유 규격 (1:3 ~ 3:1).
 */
export const IMAGE_MODEL = "gpt-image-2.5-sunburst";

export const IMAGE_SIZES = {
  portrait34: "1024x1360", // 카톡 뉴스레터·카드뉴스 3:4
  landscape169: "1536x864", // 홍보영상 16:9 포스터 컷
  portrait916: "864x1536", // 쇼츠 9:16 포스터 컷
  square: "1024x1024",
} as const;

export type ImageSize = (typeof IMAGE_SIZES)[keyof typeof IMAGE_SIZES];
export type ImageQuality = "medium" | "high" | "xhigh";

let _client: { key: string; c: OpenAI } | null = null;
/** 관리자 화면 키(DB) 우선, 없으면 환경변수. 키가 바뀌면 클라이언트를 다시 만든다 */
export async function openaiClient(): Promise<OpenAI> {
  const key = await requireSecret("OPENAI_API_KEY");
  if (!_client || _client.key !== key) _client = { key, c: new OpenAI({ apiKey: key }) };
  return _client.c;
}

/** 응답 usage(토큰)가 있으면 토큰 단가로, 없으면 품질별 장당 요금으로 추정 */
async function logImageUsage(res: { usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } } }, kind: "generate" | "edit", quality: ImageQuality, size: string) {
  const u = res.usage;
  let cost: number;
  if (u && (u.input_tokens || u.output_tokens)) {
    const text = u.input_tokens_details?.text_tokens ?? u.input_tokens ?? 0;
    const img = u.input_tokens_details?.image_tokens ?? 0;
    cost = text * (PRICES.imageTextInPerM / 1e6) + img * (PRICES.imageImageInPerM / 1e6) + (u.output_tokens ?? 0) * (PRICES.imageOutPerM / 1e6);
  } else cost = PRICES.imagePerCall[quality] ?? PRICES.imagePerCall.high;
  await recordUsage({ provider: "openai", product: IMAGE_MODEL, unit: "images", quantity: 1, costUsd: cost, meta: { kind, quality, size, input_tokens: u?.input_tokens, output_tokens: u?.output_tokens } });
}

export async function generateImage(opts: { prompt: string; size: ImageSize; quality?: ImageQuality }): Promise<Buffer> {
  const res = await withRetry(
    async () =>
      (await openaiClient()).images.generate({
        model: IMAGE_MODEL,
        prompt: opts.prompt,
        size: opts.size,
        quality: opts.quality ?? "high",
        output_format: "png",
        n: 1,
      }),
    { tries: 3, label: "gpt-image" },
  );
  await logImageUsage(res, "generate", opts.quality ?? "high", opts.size);
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("이미지 생성 결과가 비어 있습니다. 다시 시도해 주세요.");
  return Buffer.from(b64, "base64");
}

/** 참조 사진(우리 조합 사진)을 바탕으로 생성 */
export async function editImage(opts: {
  prompt: string;
  size: ImageSize;
  quality?: ImageQuality;
  references: { data: Buffer; name: string; mime: string }[];
}): Promise<Buffer> {
  const files = await Promise.all(opts.references.map((r) => toFile(r.data, r.name, { type: r.mime })));
  const res = await withRetry(
    async () =>
      (await openaiClient()).images.edit({
        model: IMAGE_MODEL,
        image: files,
        prompt: opts.prompt,
        size: opts.size,
        quality: opts.quality ?? "high",
        output_format: "png",
        // input_fidelity: gpt-image-2.5-sunburst 는 이 파라미터를 지원하지 않음 (400)
        n: 1,
      }),
    { tries: 3, label: "gpt-image-edit" },
  );
  await logImageUsage(res, "edit", opts.quality ?? "high", String(opts.size));
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("이미지 생성 결과가 비어 있습니다. 다시 시도해 주세요.");
  return Buffer.from(b64, "base64");
}
