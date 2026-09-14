import { ProviderHttpError, withRetry } from "./retry";
import { requireSecret } from "@/lib/secrets";
import { recordUsage } from "@/lib/usage";

/**
 * Google Veo 3.1 — Gemini API 직접 호출 (fal 경유보다 저렴, 실패 시 과금 없음)
 *  submit : POST /v1beta/models/{model}:predictLongRunning → { name: "models/…/operations/…" }
 *  status : GET  /v1beta/{name} → { done, response.generateVideoResponse.generatedSamples[0].video.uri | error }
 *  download: video.uri 에 x-goog-api-key 헤더 필요
 * 길이 4·6·8초, 비율 16:9·9:16, 720p(기본)·1080p. 오디오는 항상 생성되며 가격에 포함 → 앱에서 필요 없으면 합성 때 제거.
 */
const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** 앱 내부 엔드포인트 표기: "google/<model id>" — fal 엔드포인트와 구분 */
export const GOOGLE_PREFIX = "google/";
export const GOOGLE_VEO_FAST = `${GOOGLE_PREFIX}${process.env.GOOGLE_VEO_FAST_MODEL ?? "veo-3.1-fast-generate-preview"}`;
export const GOOGLE_VEO_LITE = `${GOOGLE_PREFIX}${process.env.GOOGLE_VEO_LITE_MODEL ?? "veo-3.1-lite-generate-preview"}`;
export const isGoogleEndpoint = (endpoint: string) => endpoint.startsWith(GOOGLE_PREFIX);

/** 초당 단가(USD, 720p 기준, 오디오 포함) — Gemini API 가격표 2026-09 */
export function googleVeoCostUsd(endpoint: string, seconds: number, resolution: "720p" | "1080p" = "720p"): number {
  const lite = endpoint.includes("lite");
  const perSec = lite ? (resolution === "1080p" ? 0.08 : 0.05) : resolution === "1080p" ? 0.12 : 0.1;
  return Math.round(perSec * seconds * 10000) / 10000;
}

async function headers() {
  return { "x-goog-api-key": (await requireSecret("GOOGLE_API_KEY")).trim(), "Content-Type": "application/json" };
}

async function errorOf(r: Response): Promise<Error> {
  let msg = r.statusText;
  try {
    const j = (await r.json()) as { error?: { message?: string; status?: string } };
    msg = j.error?.message ?? msg;
  } catch {}
  return new ProviderHttpError(r.status, `Google Veo ${r.status}: ${msg}`);
}

export type GoogleVeoInput = {
  endpoint: string; // google/<model>
  prompt: string;
  seconds: 4 | 6 | 8;
  aspectRatio: "16:9" | "9:16";
  resolution?: "720p" | "1080p";
  negativePrompt?: string;
  /** 첫 프레임 이미지 URL (서버가 내려받아 base64로 보냄) */
  imageUrl?: string;
};

/** 영상 생성 요청 → 작업(operation) 이름 */
export async function googleSubmitVideo(input: GoogleVeoInput): Promise<{ requestId: string }> {
  const model = input.endpoint.slice(GOOGLE_PREFIX.length);
  const instance: Record<string, unknown> = { prompt: input.prompt.slice(0, 2500) };
  if (input.imageUrl) {
    const r = await fetch(input.imageUrl, { cache: "no-store" });
    if (!r.ok) throw new Error(`참조 이미지를 읽지 못했어요 (${r.status})`);
    const mimeType = r.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    instance.image = { inlineData: { mimeType, data: Buffer.from(await r.arrayBuffer()).toString("base64") } };
  }
  const parameters: Record<string, unknown> = {
    aspectRatio: input.aspectRatio,
    durationSeconds: String(input.resolution === "1080p" ? 8 : input.seconds),
    resolution: input.resolution ?? "720p",
    personGeneration: input.imageUrl ? "allow_adult" : "allow_all",
  };
  if (input.negativePrompt) parameters.negativePrompt = input.negativePrompt;

  const name = await withRetry(
    async () => {
      const r = await fetch(`${BASE}/models/${model}:predictLongRunning`, { method: "POST", headers: await headers(), body: JSON.stringify({ instances: [instance], parameters }), cache: "no-store" });
      if (!r.ok) throw await errorOf(r);
      const j = (await r.json()) as { name?: string };
      if (!j.name) throw new Error("Google Veo가 작업 ID를 돌려주지 않았어요.");
      return j.name;
    },
    { tries: 4, baseMs: 1500, maxMs: 20000, label: "google-veo-submit", retryIf: (e) => (e instanceof ProviderHttpError ? [408, 429, 500, 502, 503, 504].includes(e.status) : true) },
  );
  const secs = input.resolution === "1080p" ? 8 : input.seconds;
  await recordUsage({ provider: "google", product: input.endpoint, unit: "seconds", quantity: secs, costUsd: googleVeoCostUsd(input.endpoint, secs, input.resolution), meta: { operation: name, i2v: Boolean(input.imageUrl), resolution: input.resolution ?? "720p" } });
  return { requestId: name };
}

type Operation = {
  done?: boolean;
  error?: { message?: string; code?: number };
  response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[]; raiMediaFilteredCount?: number; raiMediaFilteredReasons?: string[] } };
};

async function getOperation(name: string): Promise<Operation> {
  return withRetry(
    async () => {
      const r = await fetch(`${BASE}/${name}`, { headers: await headers(), cache: "no-store" });
      if (!r.ok) throw await errorOf(r);
      return (await r.json()) as Operation;
    },
    { tries: 3, label: "google-veo-status" },
  );
}

/** fal과 같은 모양의 상태 — 구글은 큐 위치가 없다 */
export async function googleVideoStatus(name: string): Promise<{ status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" }> {
  const op = await getOperation(name);
  if (op.error) throw new Error(`Google Veo 오류: ${op.error.message ?? "unknown"}`);
  return { status: op.done ? "COMPLETED" : "IN_PROGRESS" };
}

/** 완료된 작업의 영상 URL (+ 내려받을 때 필요한 헤더) */
export async function googleVideoResult(name: string): Promise<{ videoUrl: string; headers: Record<string, string> }> {
  const op = await getOperation(name);
  if (op.error) throw new Error(`Google Veo 오류: ${op.error.message ?? "unknown"}`);
  const res = op.response?.generateVideoResponse;
  const uri = res?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const reasons = res?.raiMediaFilteredReasons?.join("; ");
    if (res?.raiMediaFilteredCount || reasons) throw new Error(`safety filter: ${reasons ?? "영상이 안전 정책으로 걸러졌어요"}`);
    throw new Error("Google Veo 결과에 영상이 없어요. 다시 시도해 주세요.");
  }
  const h = await headers();
  return { videoUrl: uri, headers: { "x-goog-api-key": h["x-goog-api-key"] } };
}

/** 키 연결 테스트: 모델 목록에 Veo가 보이면 성공 */
export async function googleKeyProbe(key: string): Promise<{ ok: boolean; message: string }> {
  const r = await fetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key.trim() }, cache: "no-store" });
  if (!r.ok) return { ok: false, message: `Google 응답 ${r.status}: ${(await r.text()).slice(0, 160)}` };
  const j = (await r.json()) as { models?: { name?: string }[] };
  const veo = (j.models ?? []).filter((m) => /veo/i.test(m.name ?? "")).map((m) => (m.name ?? "").replace(/^models\//, ""));
  if (!veo.length) return { ok: false, message: "키는 유효하지만 이 프로젝트에서 Veo 모델이 보이지 않아요. Google Cloud에서 결제 계정을 연결했는지 확인하세요." };
  return { ok: true, message: `Google 연결 성공 · 사용 가능한 Veo: ${veo.slice(0, 4).join(", ")}${veo.length > 4 ? " …" : ""}` };
}
