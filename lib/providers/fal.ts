import crypto from "node:crypto";
import { createFalClient, type FalClient } from "@fal-ai/client";
import { ProviderHttpError, withRetry } from "./retry";
import { requireSecret } from "@/lib/secrets";
import { recordUsage } from "@/lib/usage";

/**
 * fal.ai — Kling 3.0 이미지→영상 (SPEC D1·D2)
 *  submit  : fal.queue.submit(endpoint, { input, webhookUrl }) → request_id
 *  status  : fal.queue.status(endpoint, { requestId }) → IN_QUEUE(queue_position) | IN_PROGRESS | COMPLETED
 *  result  : fal.queue.result(endpoint, { requestId }) → data.video.url
 *  webhook : POST { request_id, status: "OK"|"ERROR", payload, error } + ED25519 서명 헤더
 *
 * 입력 스키마(turbo standard, 2026-09 확인): image_url(필수) · prompt(≤2500자) · duration "3"~"15"(기본 "5").
 * 720p 네이티브 오디오(한국어 대사 립싱크) 포함. negative_prompt·오디오 토글은 이 엔드포인트에 없다 → 부정 조건은 prompt 문장으로 넣는다.
 */
export const FAL_VIDEO_ENDPOINT_DEFAULT = process.env.FAL_VIDEO_ENDPOINT_DEFAULT ?? "fal-ai/kling-video/v3/turbo/standard/image-to-video";
export const FAL_VIDEO_ENDPOINT_PRO = process.env.FAL_VIDEO_ENDPOINT_PRO ?? "fal-ai/kling-video/v3/turbo/pro/image-to-video";
/** 텍스트→영상 (홍보영상·뮤직비디오 클립, 참조 사진 없을 때). aspect_ratio 16:9·9:16·1:1, duration 3~15, generate_audio, negative_prompt */
export const FAL_T2V_ENDPOINT_DEFAULT = process.env.FAL_T2V_ENDPOINT_DEFAULT ?? "fal-ai/kling-video/v3/turbo/standard/text-to-video";
export const FAL_T2V_ENDPOINT_PRO = process.env.FAL_T2V_ENDPOINT_PRO ?? "fal-ai/kling-video/v3/turbo/pro/text-to-video";
/**
 * 네이티브 오디오(현장음·효과음)가 되는 이미지→영상은 turbo가 아닌 v3 standard/pro 엔드포인트다.
 * 파라미터가 다르다: start_image_url · generate_audio · negative_prompt. 음성은 중국어·영어만 (한국어는 영어로 번역됨) → 한국어 음성은 TTS로.
 */
export const FAL_I2V_AUDIO_ENDPOINT_DEFAULT = process.env.FAL_I2V_AUDIO_ENDPOINT_DEFAULT ?? "fal-ai/kling-video/v3/standard/image-to-video";
export const FAL_I2V_AUDIO_ENDPOINT_PRO = process.env.FAL_I2V_AUDIO_ENDPOINT_PRO ?? "fal-ai/kling-video/v3/pro/image-to-video";

export const isTurboEndpoint = (endpoint: string) => endpoint.includes("/turbo/");

/** 초당 단가(USD) — fal 가격표(2026-09). 변동 가능, 관리자 비용 표시용 */
export function klingCostUsd(endpoint: string, seconds: number, audio = false): number {
  const pro = endpoint.includes("/pro/");
  const perSec = isTurboEndpoint(endpoint) ? (pro ? 0.14 : 0.112) : pro ? (audio ? 0.196 : 0.14) : audio ? 0.14 : 0.084; // v3 standard i2v(오디오)는 실제 청구 $0.14/초 (2026-09 fal 사용량 화면 확인)
  return Math.round(perSec * seconds * 10000) / 10000;
}

let _client: { key: string; c: FalClient } | null = null;
/** 관리자 화면 키(DB) 우선, 없으면 환경변수 */
async function client(): Promise<FalClient> {
  const key = await requireSecret("FAL_KEY");
  if (!_client || _client.key !== key) _client = { key, c: createFalClient({ credentials: key }) };
  return _client.c;
}

export type KlingDuration = 5 | 10;
export type KlingAspect = "16:9" | "9:16" | "1:1";

export type SubmitVideoInput = {
  /** 첫 프레임 이미지 URL. 있으면 image-to-video, 없으면 text-to-video */
  imageUrl?: string;
  prompt: string;
  /** 3~15초 (실습은 5·10) */
  duration: number;
  /** text-to-video 전용 */
  aspectRatio?: KlingAspect;
  generateAudio?: boolean;
  negativePrompt?: string;
  endpoint?: string;
  webhookUrl?: string;
};

type FalError = { status?: number; message?: string; body?: { detail?: unknown } };

/** fal 오류를 상태 코드가 있는 오류로 정규화 */
function normalizeError(e: unknown): Error {
  if (e instanceof ProviderHttpError) return e;
  const fe = e as FalError;
  const status = typeof fe?.status === "number" ? fe.status : 0;
  const detail = fe?.body?.detail;
  const detailText = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d) => (typeof d === "string" ? d : (d as { msg?: string })?.msg ?? JSON.stringify(d))).join("; ") : detail ? JSON.stringify(detail) : "";
  const msg = `${fe?.message ?? "fal 요청 실패"}${detailText ? `: ${detailText}` : ""}`;
  return status ? new ProviderHttpError(status, msg) : new Error(msg);
}

/** 콘텐츠 필터·입력 거부(재시도 무의미)인지 */
export function isContentRejection(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  const status = e instanceof ProviderHttpError ? e.status : 0;
  if (status >= 500 || status === 429) return false;
  return /face|celebrit|public figure|nsfw|safety|moderation|content policy|prohibited|minor|child|sensitive|reject|violat|unsafe/i.test(e.message);
}

/** 실패 사유를 수강생용 한국어로 (SPEC ④) */
export function koReasonFor(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const l = m.toLowerCase();
  if (/celebrit|public figure/.test(l)) return "유명인으로 판단되어 영상을 만들 수 없어요. 본인 사진으로 다시 시도하세요.";
  if (/no face|face not|face.*detect|detect.*face/.test(l)) return "얼굴이 인식되지 않았어요. 얼굴이 정면으로 잘 보이는 사진으로 다시 시도하세요.";
  if (/minor|child|underage/.test(l)) return "미성년자로 판단된 사진은 처리할 수 없어요.";
  if (/nsfw|safety|moderation|content policy|prohibited|sensitive|unsafe/.test(l)) return "안전 정책에 걸려 영상을 만들 수 없어요. 장면 설명이나 사진을 바꿔 보세요.";
  if (/aspect|ratio|resolution|300px|too small/.test(l)) return "사진 크기·비율이 맞지 않아요. 가로세로 300px 이상, 비율 1:2.5 이내 사진을 올리세요.";
  if (/429|rate limit|too many/.test(l)) return "지금 요청이 많아 잠시 대기 후 자동으로 다시 시도합니다.";
  return `영상 생성에 실패했어요. (${m.slice(0, 160)})`;
}

export async function submitVideo(input: SubmitVideoInput): Promise<{ requestId: string; endpoint: string }> {
  const endpoint = input.endpoint ?? (input.imageUrl ? FAL_VIDEO_ENDPOINT_DEFAULT : FAL_T2V_ENDPOINT_DEFAULT);
  const duration = String(Math.max(3, Math.min(15, Math.round(input.duration))));
  const body: Record<string, unknown> = { prompt: input.prompt.slice(0, 2500), duration };
  if (input.imageUrl) {
    if (isTurboEndpoint(endpoint)) body.image_url = input.imageUrl; // turbo: 오디오·부정 조건 없음
    else {
      body.start_image_url = input.imageUrl;
      body.generate_audio = input.generateAudio ?? false;
      if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
    }
  } else {
    body.aspect_ratio = input.aspectRatio ?? "16:9";
    body.generate_audio = input.generateAudio ?? false;
    if (input.negativePrompt) body.negative_prompt = input.negativePrompt;
  }
  const requestId = await withRetry(
    async () => {
      try {
        const { request_id } = await (await client()).queue.submit(endpoint, {
          input: body,
          ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
        });
        return request_id;
      } catch (e) {
        throw normalizeError(e);
      }
    },
    { tries: 5, baseMs: 1000, maxMs: 16000, label: "fal-submit", retryIf: (e) => !isContentRejection(e) && (e instanceof ProviderHttpError ? [408, 409, 425, 429, 500, 502, 503, 504].includes(e.status) : true) },
  );
  const secs = Number(duration);
  await recordUsage({ provider: "fal", product: endpoint, unit: "seconds", quantity: secs, costUsd: klingCostUsd(endpoint, secs, Boolean(body.generate_audio)), meta: { request_id: requestId, audio: Boolean(body.generate_audio), i2v: Boolean(input.imageUrl) } });
  return { requestId, endpoint };
}

export type VideoStatus = { status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED"; queuePosition?: number };

export async function getVideoStatus(endpoint: string, requestId: string): Promise<VideoStatus> {
  return withRetry(
    async () => {
      try {
        const s = await (await client()).queue.status(endpoint, { requestId, logs: false });
        return { status: s.status, queuePosition: s.status === "IN_QUEUE" ? s.queue_position : undefined };
      } catch (e) {
        throw normalizeError(e);
      }
    },
    { tries: 3, label: "fal-status" },
  );
}

export async function getVideoResult(endpoint: string, requestId: string): Promise<{ videoUrl: string }> {
  return withRetry(
    async () => {
      try {
        const r = await (await client()).queue.result(endpoint, { requestId });
        const url = (r.data as { video?: { url?: string } })?.video?.url;
        if (!url) throw new Error("영상 결과에 파일이 없습니다.");
        return { videoUrl: url };
      } catch (e) {
        throw normalizeError(e);
      }
    },
    { tries: 3, label: "fal-result" },
  );
}

/* ---------- 웹훅 서명 검증 (ED25519, JWKS) ---------- */

const JWKS_URLS = ["https://rest.fal.ai/.well-known/jwks.json", "https://rest.alpha.fal.ai/.well-known/jwks.json"];
let jwksCache: { keys: Buffer[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 6 * 60 * 60 * 1000; // 문서: 24시간 이하로 캐시

async function fetchJwks(): Promise<Buffer[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys;
  for (const url of JWKS_URLS) {
    try {
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const j = (await r.json()) as { keys?: { x?: string }[] };
      const keys = (j.keys ?? []).map((k) => k.x).filter((x): x is string => Boolean(x)).map((x) => Buffer.from(x, "base64url"));
      if (keys.length) {
        jwksCache = { keys, fetchedAt: Date.now() };
        return keys;
      }
    } catch {}
  }
  return jwksCache?.keys ?? [];
}

/** raw 32바이트 ED25519 공개키 → Node KeyObject (SPKI DER 접두사) */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const toKeyObject = (raw: Buffer) => crypto.createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });

export type WebhookHeaders = { requestId: string | null; userId: string | null; timestamp: string | null; signature: string | null };

/** 순수 검증 로직 (테스트용): 메시지 = request_id\nuser_id\ntimestamp\nsha256hex(body) */
export function verifyFalSignature(h: WebhookHeaders, rawBody: Buffer, publicKeys: Buffer[], nowSec = Math.floor(Date.now() / 1000)): { ok: boolean; reason?: string } {
  if (!h.requestId || !h.userId || !h.timestamp || !h.signature) return { ok: false, reason: "서명 헤더 누락" };
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return { ok: false, reason: "타임스탬프 허용 범위(±5분) 초과" };
  const bodyHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const message = Buffer.from(`${h.requestId}\n${h.userId}\n${h.timestamp}\n${bodyHash}`, "utf8");
  let sig: Buffer;
  try {
    sig = Buffer.from(h.signature, "hex");
  } catch {
    return { ok: false, reason: "서명 형식 오류" };
  }
  for (const raw of publicKeys) {
    try {
      if (crypto.verify(null, message, toKeyObject(raw), sig)) return { ok: true };
    } catch {}
  }
  return { ok: false, reason: "서명 불일치" };
}

/** 라우트용: 헤더 추출 + JWKS 조회 + 검증 */
export async function verifyFalWebhook(headers: Headers, rawBody: Buffer): Promise<{ ok: boolean; reason?: string }> {
  const h: WebhookHeaders = {
    requestId: headers.get("x-fal-webhook-request-id"),
    userId: headers.get("x-fal-webhook-user-id"),
    timestamp: headers.get("x-fal-webhook-timestamp"),
    signature: headers.get("x-fal-webhook-signature"),
  };
  const keys = await fetchJwks();
  if (!keys.length) return { ok: false, reason: "JWKS를 가져오지 못했습니다" };
  const r = verifyFalSignature(h, rawBody, keys);
  if (!r.ok && r.reason === "서명 불일치") {
    // 키 회전 가능성 → 캐시 비우고 한 번 더
    jwksCache = null;
    return verifyFalSignature(h, rawBody, await fetchJwks());
  }
  return r;
}

export type FalWebhookBody = { request_id?: string; gateway_request_id?: string; status?: "OK" | "ERROR"; payload?: unknown; error?: string; payload_error?: string };
