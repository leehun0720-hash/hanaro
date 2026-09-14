import { getSecret } from "@/lib/secrets";
import type { Provider } from "@/lib/usage";

/**
 * 업체가 실제로 집계·청구한 금액 조회 (관리자 보드 "업체 청구액").
 * 관리자(Admin) 키가 필요한 곳이 많다 — 키가 없으면 안내만 돌려준다. 어떤 실패도 보드를 깨뜨리지 않는다.
 */
export type VendorBilling = {
  provider: Provider;
  configured: boolean; // 조회 키가 설정됐는지
  ok: boolean;
  /** 기간 내 청구/사용 금액 (USD) */
  costUsd?: number;
  /** 잔여 크레딧 등 부가 정보 */
  balanceUsd?: number;
  note?: string; // 사람이 읽을 보조 설명
  error?: string;
  dashboardUrl: string;
  keyName: string; // 필요한 관리자 키 이름
  lines?: { label: string; costUsd: number }[];
};

const withTimeout = (ms: number) => AbortSignal.timeout(ms);

/** OpenAI — Admin API 키(sk-admin-…)로 /v1/organization/costs */
export async function openaiBilling(from: Date, to: Date): Promise<VendorBilling> {
  const base: VendorBilling = { provider: "openai", configured: false, ok: false, dashboardUrl: "https://platform.openai.com/usage", keyName: "OPENAI_ADMIN_KEY" };
  const key = await getSecret("OPENAI_ADMIN_KEY");
  if (!key) return base;
  try {
    let page: string | undefined;
    let total = 0;
    const lines = new Map<string, number>();
    for (let i = 0; i < 10; i++) {
      const u = new URL("https://api.openai.com/v1/organization/costs");
      u.searchParams.set("start_time", String(Math.floor(from.getTime() / 1000)));
      u.searchParams.set("end_time", String(Math.floor(to.getTime() / 1000)));
      u.searchParams.set("bucket_width", "1d");
      u.searchParams.set("limit", "31");
      u.searchParams.append("group_by", "line_item");
      if (page) u.searchParams.set("page", page);
      const r = await fetch(u, { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: withTimeout(15000) });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { data?: { results?: { amount?: { value?: number }; line_item?: string | null }[] }[]; has_more?: boolean; next_page?: string };
      for (const b of j.data ?? []) for (const res of b.results ?? []) {
        const v = Number(res.amount?.value ?? 0);
        total += v;
        const k = res.line_item ?? "(기타)";
        lines.set(k, (lines.get(k) ?? 0) + v);
      }
      if (!j.has_more || !j.next_page) break;
      page = j.next_page;
    }
    return { ...base, configured: true, ok: true, costUsd: total, lines: [...lines.entries()].map(([label, costUsd]) => ({ label, costUsd })).sort((a, b) => b.costUsd - a.costUsd).slice(0, 8) };
  } catch (e) {
    return { ...base, configured: true, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Anthropic — Admin API 키(sk-ant-admin…)로 /v1/organizations/cost_report (금액은 센트 단위 문자열) */
export async function anthropicBilling(from: Date, to: Date): Promise<VendorBilling> {
  const base: VendorBilling = { provider: "anthropic", configured: false, ok: false, dashboardUrl: "https://platform.claude.com/cost", keyName: "ANTHROPIC_ADMIN_KEY" };
  const key = await getSecret("ANTHROPIC_ADMIN_KEY");
  if (!key) return base;
  try {
    let page: string | undefined;
    let cents = 0;
    const lines = new Map<string, number>();
    for (let i = 0; i < 10; i++) {
      const u = new URL("https://api.anthropic.com/v1/organizations/cost_report");
      u.searchParams.set("starting_at", from.toISOString());
      u.searchParams.set("ending_at", to.toISOString());
      u.searchParams.append("group_by[]", "description");
      u.searchParams.set("limit", "31");
      if (page) u.searchParams.set("page", page);
      const r = await fetch(u, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, cache: "no-store", signal: withTimeout(15000) });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { data?: { results?: { amount?: string; description?: string | null; model?: string | null }[] }[]; has_more?: boolean; next_page?: string | null };
      for (const b of j.data ?? []) for (const res of b.results ?? []) {
        const v = Number(res.amount ?? 0);
        cents += v;
        const k = res.model ?? res.description ?? "(기타)";
        lines.set(k, (lines.get(k) ?? 0) + v);
      }
      if (!j.has_more || !j.next_page) break;
      page = j.next_page;
    }
    return { ...base, configured: true, ok: true, costUsd: cents / 100, lines: [...lines.entries()].map(([label, c]) => ({ label, costUsd: c / 100 })).sort((a, b) => b.costUsd - a.costUsd).slice(0, 8) };
  } catch (e) {
    return { ...base, configured: true, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** fal.ai — Admin 키로 /v1/models/usage (엔드포인트별 청구액) + /v1/account/billing (잔액) */
export async function falBilling(from: Date, to: Date): Promise<VendorBilling> {
  const base: VendorBilling = { provider: "fal", configured: false, ok: false, dashboardUrl: "https://fal.ai/dashboard/usage", keyName: "FAL_ADMIN_KEY" };
  const key = await getSecret("FAL_ADMIN_KEY");
  if (!key) return base;
  const headers = { Authorization: `Key ${key}` };
  try {
    let cursor: string | undefined;
    let total = 0;
    const lines = new Map<string, number>();
    for (let i = 0; i < 10; i++) {
      const u = new URL("https://api.fal.ai/v1/models/usage");
      u.searchParams.set("start", from.toISOString());
      u.searchParams.set("end", to.toISOString());
      u.searchParams.set("timeframe", "day");
      u.searchParams.set("expand", "time_series");
      if (cursor) u.searchParams.set("cursor", cursor);
      const r = await fetch(u, { headers, cache: "no-store", signal: withTimeout(15000) });
      if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
      const j = (await r.json()) as { time_series?: { results?: { endpoint_id?: string; cost_total?: number; cost?: number }[] }[]; has_more?: boolean; next_cursor?: string | null };
      for (const b of j.time_series ?? []) for (const res of b.results ?? []) {
        const v = Number(res.cost_total ?? res.cost ?? 0);
        total += v;
        const k = res.endpoint_id ?? "(기타)";
        lines.set(k, (lines.get(k) ?? 0) + v);
      }
      if (!j.has_more || !j.next_cursor) break;
      cursor = j.next_cursor;
    }
    let balanceUsd: number | undefined;
    try {
      const r = await fetch("https://api.fal.ai/v1/account/billing?expand=credits", { headers, cache: "no-store", signal: withTimeout(10000) });
      if (r.ok) balanceUsd = Number(((await r.json()) as { credits?: { current_balance?: number } }).credits?.current_balance ?? NaN) || undefined;
    } catch {}
    return { ...base, configured: true, ok: true, costUsd: total, balanceUsd, lines: [...lines.entries()].map(([label, costUsd]) => ({ label, costUsd })).sort((a, b) => b.costUsd - a.costUsd).slice(0, 8) };
  } catch (e) {
    return { ...base, configured: true, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** ElevenLabs — 일반 키로 /v1/user/subscription (user_read 권한 필요). 금액이 아니라 플랜 크레딧 사용량 */
export async function elevenlabsBilling(): Promise<VendorBilling> {
  const base: VendorBilling = { provider: "elevenlabs", configured: false, ok: false, dashboardUrl: "https://elevenlabs.io/app/subscription", keyName: "ELEVENLABS_API_KEY" };
  const key = await getSecret("ELEVENLABS_API_KEY");
  if (!key) return base;
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key.trim() }, cache: "no-store", signal: withTimeout(10000) });
    if (r.status === 401) return { ...base, configured: true, ok: false, error: "키에 user_read 권한이 없어요. ElevenLabs에서 키 권한에 'User: Read'를 추가하면 플랜 사용량이 보입니다." };
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    const j = (await r.json()) as { tier?: string; character_count?: number; character_limit?: number; next_character_count_reset_unix?: number };
    const used = Number(j.character_count ?? 0);
    const limit = Number(j.character_limit ?? 0);
    const reset = j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toLocaleDateString("ko-KR") : "";
    return { ...base, configured: true, ok: true, note: `플랜 ${j.tier ?? "-"} · 크레딧 ${used.toLocaleString()} / ${limit.toLocaleString()} 사용${reset ? ` · ${reset} 초기화` : ""}` };
  } catch (e) {
    return { ...base, configured: true, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Google — Gemini API에는 청구액 조회 API가 없다 (Cloud Billing 콘솔에서 확인) */
export async function googleBilling(): Promise<VendorBilling> {
  const key = await getSecret("GOOGLE_API_KEY");
  return { provider: "google", configured: Boolean(key), ok: Boolean(key), note: key ? "청구액은 Google Cloud 콘솔 → 결제에서 확인 (API 미제공)" : undefined, dashboardUrl: "https://console.cloud.google.com/billing", keyName: "GOOGLE_API_KEY" };
}

export async function allVendorBilling(from: Date, to: Date): Promise<VendorBilling[]> {
  return Promise.all([anthropicBilling(from, to), openaiBilling(from, to), falBilling(from, to), googleBilling(), elevenlabsBilling()]);
}
