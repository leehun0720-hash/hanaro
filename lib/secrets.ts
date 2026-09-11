import crypto from "node:crypto";
import { adminClient } from "@/lib/supabase/admin";

/**
 * API 키 저장소 — 관리자 화면(/admin/keys)에서 입력한 값을 DB(app_secrets)에 암호화해 두고,
 * 각 제공자 모듈이 호출 시점에 getSecret()으로 읽는다. DB에 없으면 환경변수로 대체.
 *  - 암호화: AES-256-GCM, 키는 SUPABASE_SERVICE_ROLE_KEY에서 파생 (별도 환경변수 불필요)
 *  - 캐시: 프로세스 내 60초 (서버리스 인스턴스마다 독립. 저장 직후 최대 1분 지연 가능)
 */

export const SECRET_DEFS = [
  { name: "OPENAI_API_KEY", label: "OpenAI (이미지 편집 · 뉴스레터·카드뉴스 이미지)", group: "실습·제작실", test: "openai" },
  { name: "ANTHROPIC_API_KEY", label: "Anthropic Claude (프롬프트·원고)", group: "실습·제작실", test: "anthropic" },
  { name: "FAL_KEY", label: "fal.ai (Kling 3.0 영상)", group: "실습·제작실", test: "fal" },
  { name: "FAL_WEBHOOK_SECRET", label: "fal 웹훅 토큰 (임의의 긴 문자열, 배포 시)", group: "실습·제작실", test: null },
  { name: "APP_BASE_URL", label: "앱 공개 주소 (웹훅 URL 조립용, 예: https://example.vercel.app)", group: "실습·제작실", test: null, secret: false },
  { name: "ELEVENLABS_API_KEY", label: "ElevenLabs (뮤직비디오 음원)", group: "홍보·MV", test: "elevenlabs" },
  { name: "TOSS_SECRET_KEY", label: "토스페이먼츠 시크릿 키 (결제)", group: "결제", test: null },
] as const;
export type SecretName = (typeof SECRET_DEFS)[number]["name"];
const NAMES = new Set<string>(SECRET_DEFS.map((d) => d.name));
export const isSecretName = (n: string): n is SecretName => NAMES.has(n);

const CACHE_MS = 60_000;
const cache = new Map<string, { value: string | null; at: number }>();

function derivedKey(): Buffer {
  const base = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base) throw new Error("SUPABASE_SERVICE_ROLE_KEY가 없어 키를 암호화할 수 없습니다.");
  return crypto.createHash("sha256").update(`hanaro-secrets:${base}`).digest();
}

export function encryptSecret(plain: string, key = derivedKey()): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(payload: string, key = derivedKey()): string {
  const [v, ivB, tagB, encB] = payload.split(".");
  if (v !== "v1" || !ivB || !tagB || !encB) throw new Error("암호문 형식 오류");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64url")), decipher.final()]).toString("utf8");
}

/** 표시용 힌트: 앞 3자 + … + 뒤 4자 */
export const maskSecret = (v: string) => (v.length <= 8 ? "•".repeat(v.length) : `${v.slice(0, 3)}…${v.slice(-4)}`);

/** DB 값 → 없으면 환경변수. 둘 다 없으면 null */
export async function getSecret(name: SecretName): Promise<string | null> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value ?? process.env[name] ?? null;
  let value: string | null = null;
  try {
    const { data } = await adminClient().from("app_secrets").select("ciphertext").eq("name", name).maybeSingle();
    if (data?.ciphertext) value = decryptSecret(data.ciphertext);
  } catch (e) {
    console.warn(`[secrets] ${name} 읽기 실패, 환경변수 사용:`, e instanceof Error ? e.message : e);
  }
  cache.set(name, { value, at: Date.now() });
  return value ?? process.env[name] ?? null;
}

/** 필수 키가 없으면 한국어 오류 */
export async function requireSecret(name: SecretName): Promise<string> {
  const v = await getSecret(name);
  if (!v) throw new Error(`${name}가 설정되지 않았습니다. 관리자 → API 키에서 입력하세요.`);
  return v;
}

export async function setSecret(name: SecretName, value: string, updatedBy: string | null): Promise<void> {
  const v = value.trim();
  if (!v) throw new Error("값이 비어 있습니다.");
  const { error } = await adminClient().from("app_secrets").upsert({ name, ciphertext: encryptSecret(v), hint: maskSecret(v), updated_by: updatedBy, updated_at: new Date().toISOString() });
  if (error) throw error;
  cache.delete(name);
}

export async function deleteSecret(name: SecretName): Promise<void> {
  const { error } = await adminClient().from("app_secrets").delete().eq("name", name);
  if (error) throw error;
  cache.delete(name);
}

export type SecretStatus = { name: SecretName; label: string; group: string; test: string | null; isSecret: boolean; source: "db" | "env" | "none"; hint: string | null; updated_at: string | null };

/** 관리자 화면용 상태 목록 (값은 노출하지 않음) */
export async function listSecretStatus(): Promise<SecretStatus[]> {
  const { data } = await adminClient().from("app_secrets").select("name, hint, updated_at");
  const rows = new Map((data ?? []).map((r) => [r.name as string, r as { hint: string | null; updated_at: string }]));
  return SECRET_DEFS.map((d) => {
    const row = rows.get(d.name);
    const env = process.env[d.name];
    return {
      name: d.name,
      label: d.label,
      group: d.group,
      test: d.test,
      isSecret: (d as { secret?: boolean }).secret !== false,
      source: row ? "db" : env ? "env" : "none",
      hint: row?.hint ?? (env ? maskSecret(env) : null),
      updated_at: row?.updated_at ?? null,
    };
  });
}

/** 실습 제작실에 필요한 키 중 빠진 것 */
export async function missingPracticeKeys(): Promise<SecretName[]> {
  const need: SecretName[] = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "FAL_KEY"];
  const values = await Promise.all(need.map((n) => getSecret(n))); // 순차 → 병렬 (왕복 3회 → 1회)
  return need.filter((_, i) => !values[i]);
}
