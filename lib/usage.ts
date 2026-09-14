import { AsyncLocalStorage } from "node:async_hooks";
import { adminClient } from "@/lib/supabase/admin";
import { supabaseConfigured } from "@/lib/auth";

/**
 * 외부 API 호출 기록 (api_usage, 마이그레이션 0009).
 * 각 provider 모듈이 호출 직후 recordUsage()를 부르고, 작업 컨텍스트(job·user)는 AsyncLocalStorage로 전달된다.
 * 기록 실패는 절대 작업을 멈추지 않는다 (best-effort).
 */

export type Provider = "anthropic" | "openai" | "fal" | "google" | "elevenlabs";
export type UsageUnit = "tokens" | "images" | "seconds" | "chars" | "tracks";

export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: "Anthropic (Claude)", openai: "OpenAI (이미지·음성)", fal: "fal.ai (Kling 영상)", google: "Google (Veo 영상)", elevenlabs: "ElevenLabs (음악)" };
export const UNIT_LABEL: Record<UsageUnit, string> = { tokens: "토큰", images: "장", seconds: "초", chars: "자", tracks: "곡" };

type UsageCtx = { jobId?: string; userId?: string; jobType?: string };
export const usageContext = new AsyncLocalStorage<UsageCtx>();

/** 공개 단가 (USD). 환경변수로 덮어쓸 수 있다 — 업체 가격 변동 시 조정 */
const num = (k: string, d: number) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v >= 0 ? v : d;
};
export const PRICES = {
  /** Claude: 100만 토큰당 (입력 / 출력 / 캐시 읽기) */
  claudeInPerM: num("PRICE_CLAUDE_IN_PER_M", 5),
  claudeOutPerM: num("PRICE_CLAUDE_OUT_PER_M", 25),
  claudeCacheReadPerM: num("PRICE_CLAUDE_CACHE_READ_PER_M", 0.5),
  /** GPT Image: 100만 토큰당 (텍스트 입력 / 이미지 입력 / 이미지 출력). usage가 없으면 품질별 장당 요금 */
  imageTextInPerM: num("PRICE_IMAGE_TEXT_IN_PER_M", 5),
  imageImageInPerM: num("PRICE_IMAGE_IMAGE_IN_PER_M", 10),
  imageOutPerM: num("PRICE_IMAGE_OUT_PER_M", 40),
  imagePerCall: { medium: num("PRICE_IMAGE_MEDIUM", 0.06), high: num("PRICE_IMAGE_HIGH", 0.19), xhigh: num("PRICE_IMAGE_XHIGH", 0.3) },
  /** TTS: 100만 자당 */
  ttsPerMChars: num("PRICE_TTS_PER_M_CHARS", 12),
  /** ElevenLabs Music: 곡당 (플랜 크레딧 환산 추정) */
  musicPerTrack: num("PRICE_MUSIC_PER_TRACK", 0.5),
  /** 환율 표시용 */
  krwPerUsd: num("KRW_PER_USD", 1400),
};

export type UsageRecord = {
  provider: Provider;
  product: string;
  unit: UsageUnit;
  quantity: number;
  costUsd: number;
  meta?: Record<string, unknown>;
  jobId?: string;
  userId?: string;
  jobType?: string;
};

/** 호출 1건 기록. 실패해도 조용히 넘어간다 */
export async function recordUsage(r: UsageRecord): Promise<void> {
  if (!supabaseConfigured()) return;
  const ctx = usageContext.getStore();
  try {
    await adminClient().from("api_usage").insert({
      provider: r.provider,
      product: r.product,
      unit: r.unit,
      quantity: Math.round(r.quantity * 1000) / 1000,
      cost_usd: Math.round(r.costUsd * 1_000_000) / 1_000_000,
      meta: r.meta ?? {},
      job_id: r.jobId ?? ctx?.jobId ?? null,
      user_id: r.userId ?? ctx?.userId ?? null,
      job_type: r.jobType ?? ctx?.jobType ?? null,
    });
  } catch (e) {
    console.warn("[usage] 기록 실패:", e instanceof Error ? e.message : e);
  }
}

// ---------- 집계 (관리자 보드) ----------

export type UsageRow = { created_at: string; user_id: string | null; job_id: string | null; job_type: string | null; provider: Provider; product: string; unit: UsageUnit; quantity: number; cost_usd: number };

export type UsageSummary = {
  from: string;
  to: string;
  total: { calls: number; costUsd: number };
  byProvider: { provider: Provider; calls: number; quantity: number; unit: UsageUnit | "mixed"; costUsd: number }[];
  byProduct: { provider: Provider; product: string; calls: number; quantity: number; unit: UsageUnit; costUsd: number }[];
  byDay: { day: string; costUsd: number; per: Partial<Record<Provider, number>> }[];
  byJobType: { jobType: string; calls: number; costUsd: number }[];
  byUser: { userId: string; calls: number; costUsd: number }[];
  tableMissing: boolean;
};

export async function usageSummary(from: Date, to: Date): Promise<UsageSummary> {
  const empty: UsageSummary = { from: from.toISOString(), to: to.toISOString(), total: { calls: 0, costUsd: 0 }, byProvider: [], byProduct: [], byDay: [], byJobType: [], byUser: [], tableMissing: false };
  if (!supabaseConfigured()) return empty;
  const { data, error } = await adminClient()
    .from("api_usage")
    .select("created_at, user_id, job_id, job_type, provider, product, unit, quantity, cost_usd")
    .gte("created_at", from.toISOString())
    .lt("created_at", to.toISOString())
    .order("created_at", { ascending: true })
    .limit(20000);
  if (error) return { ...empty, tableMissing: /api_usage/.test(error.message) };
  const rows = (data ?? []) as UsageRow[];

  const prov = new Map<Provider, { calls: number; quantity: number; units: Set<UsageUnit>; costUsd: number }>();
  const prod = new Map<string, UsageSummary["byProduct"][number]>();
  const day = new Map<string, { costUsd: number; per: Partial<Record<Provider, number>> }>();
  const jt = new Map<string, { calls: number; costUsd: number }>();
  const us = new Map<string, { calls: number; costUsd: number }>();
  let calls = 0;
  let costUsd = 0;
  for (const r of rows) {
    const cost = Number(r.cost_usd) || 0;
    const qty = Number(r.quantity) || 0;
    calls++;
    costUsd += cost;
    const p = prov.get(r.provider) ?? { calls: 0, quantity: 0, units: new Set<UsageUnit>(), costUsd: 0 };
    p.calls++;
    p.quantity += qty;
    p.units.add(r.unit);
    p.costUsd += cost;
    prov.set(r.provider, p);
    const pk = `${r.provider}|${r.product}|${r.unit}`;
    const pr = prod.get(pk) ?? { provider: r.provider, product: r.product, unit: r.unit, calls: 0, quantity: 0, costUsd: 0 };
    pr.calls++;
    pr.quantity += qty;
    pr.costUsd += cost;
    prod.set(pk, pr);
    const d = r.created_at.slice(0, 10);
    const dd = day.get(d) ?? { costUsd: 0, per: {} };
    dd.costUsd += cost;
    dd.per[r.provider] = (dd.per[r.provider] ?? 0) + cost;
    day.set(d, dd);
    const t = r.job_type ?? "(기타)";
    const tt = jt.get(t) ?? { calls: 0, costUsd: 0 };
    tt.calls++;
    tt.costUsd += cost;
    jt.set(t, tt);
    if (r.user_id) {
      const uu = us.get(r.user_id) ?? { calls: 0, costUsd: 0 };
      uu.calls++;
      uu.costUsd += cost;
      us.set(r.user_id, uu);
    }
  }
  return {
    ...empty,
    total: { calls, costUsd },
    byProvider: [...prov.entries()].map(([provider, v]) => ({ provider, calls: v.calls, quantity: v.quantity, unit: (v.units.size === 1 ? [...v.units][0] : "mixed") as UsageUnit | "mixed", costUsd: v.costUsd })).sort((a, b) => b.costUsd - a.costUsd),
    byProduct: [...prod.values()].sort((a, b) => b.costUsd - a.costUsd),
    byDay: [...day.entries()].map(([d, v]) => ({ day: d, costUsd: v.costUsd, per: v.per })).sort((a, b) => a.day.localeCompare(b.day)),
    byJobType: [...jt.entries()].map(([jobType, v]) => ({ jobType, ...v })).sort((a, b) => b.costUsd - a.costUsd),
    byUser: [...us.entries()].map(([userId, v]) => ({ userId, ...v })).sort((a, b) => b.costUsd - a.costUsd).slice(0, 10),
  };
}
