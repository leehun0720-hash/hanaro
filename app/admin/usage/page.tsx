import Link from "next/link";
import { Alert } from "@/components/Alert";
import { adminClient } from "@/lib/supabase/admin";
import { PRICES, PROVIDER_LABEL, UNIT_LABEL, usageSummary, type Provider } from "@/lib/usage";
import { allVendorBilling } from "@/lib/vendor-billing";
import { JOB_TYPE_LABEL, type JobType } from "@/lib/types";

export const metadata = { title: "관리자 · API 사용량" };
export const dynamic = "force-dynamic";

type Period = "today" | "7d" | "month" | "prev" | "30d";
const PERIODS: { id: Period; label: string }[] = [
  { id: "today", label: "오늘" },
  { id: "7d", label: "최근 7일" },
  { id: "month", label: "이번 달" },
  { id: "prev", label: "지난 달" },
  { id: "30d", label: "최근 30일" },
];

/** 기간 → [from, to) (KST 기준 자정) */
function range(p: Period): { from: Date; to: Date } {
  const KST = 9 * 60 * 60 * 1000;
  const now = new Date();
  const kst = new Date(now.getTime() + KST);
  const dayStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - KST);
  const monthStart = (y: number, m: number) => new Date(Date.UTC(y, m, 1) - KST);
  const tomorrow = new Date(dayStart(kst).getTime() + 86400_000);
  switch (p) {
    case "today": return { from: dayStart(kst), to: tomorrow };
    case "7d": return { from: new Date(dayStart(kst).getTime() - 6 * 86400_000), to: tomorrow };
    case "month": return { from: monthStart(kst.getUTCFullYear(), kst.getUTCMonth()), to: tomorrow };
    case "prev": return { from: monthStart(kst.getUTCFullYear(), kst.getUTCMonth() - 1), to: monthStart(kst.getUTCFullYear(), kst.getUTCMonth()) };
    default: return { from: new Date(dayStart(kst).getTime() - 29 * 86400_000), to: tomorrow };
  }
}

const usd = (v: number) => `$${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)}`;
const krw = (v: number) => `₩${Math.round(v * PRICES.krwPerUsd).toLocaleString("ko-KR")}`;
const qty = (v: number, unit: string) => `${v >= 1000 ? Math.round(v).toLocaleString("ko-KR") : Math.round(v * 10) / 10}${unit in UNIT_LABEL ? UNIT_LABEL[unit as keyof typeof UNIT_LABEL] : ""}`;
const PROVIDER_ORDER: Provider[] = ["anthropic", "openai", "fal", "google", "elevenlabs"];

export default async function AdminUsage({ searchParams }: PageProps<"/admin/usage">) {
  const sp = await searchParams;
  const period = (PERIODS.some((p) => p.id === sp.period) ? sp.period : "month") as Period;
  const { from, to } = range(period);
  const [summary, vendors] = await Promise.all([usageSummary(from, to), allVendorBilling(from, to)]);

  // 사용자 표시명
  const userIds = summary.byUser.map((u) => u.userId);
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data } = await adminClient().from("profiles").select("id, name, email, org_name").in("id", userIds);
    for (const p of data ?? []) names.set(p.id as string, [p.org_name, p.name || p.email].filter(Boolean).join(" · "));
  }
  const fmtDate = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  const maxDay = Math.max(0.0001, ...summary.byDay.map((d) => d.costUsd));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">API 사용량 · 비용</h1>
          <p className="mt-1 text-sm text-muted">앱이 기록한 호출량과 공개 단가 기준 <b>추정 비용</b>, 그리고 관리자 키가 있으면 업체가 실제 집계한 <b>청구액</b>을 함께 보여줍니다. {fmtDate(from)} ~ {fmtDate(new Date(to.getTime() - 1))} · 환율 1 USD = ₩{PRICES.krwPerUsd.toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {PERIODS.map((p) => (
            <Link key={p.id} href={`/admin/usage?period=${p.id}`} className={`rounded-lg border px-3 py-1.5 text-sm ${period === p.id ? "border-brand bg-brand-soft text-brand-deep" : "border-line hover:bg-brand-soft"}`}>{p.label}</Link>
          ))}
        </div>
      </div>

      {summary.tableMissing && <Alert kind="error">api_usage 테이블이 없습니다. Supabase SQL Editor에서 <code>supabase/migrations/0009_api_usage.sql</code>을 실행하세요. 실행 이후의 호출부터 기록됩니다.</Alert>}

      {/* 업체별 요약 카드 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {PROVIDER_ORDER.map((prov) => {
          const s = summary.byProvider.find((b) => b.provider === prov);
          const v = vendors.find((b) => b.provider === prov);
          const products = summary.byProduct.filter((p) => p.provider === prov);
          return (
            <div key={prov} className="card space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{PROVIDER_LABEL[prov]}</h2>
                <span className="text-xs text-muted">{s?.calls ?? 0}회</span>
              </div>
              <div>
                <p className="text-2xl font-bold">{usd(s?.costUsd ?? 0)}</p>
                <p className="text-xs text-muted">앱 추정 · {krw(s?.costUsd ?? 0)}</p>
              </div>
              <ul className="space-y-0.5 text-xs text-muted">
                {products.slice(0, 4).map((p) => (
                  <li key={p.product + p.unit} className="flex justify-between gap-2"><span className="truncate" title={p.product}>{p.product.replace(/^fal-ai\//, "")}</span><span className="shrink-0">{qty(p.quantity, p.unit)} · {usd(p.costUsd)}</span></li>
                ))}
                {!products.length && <li>기록 없음</li>}
              </ul>
              <div className="border-t border-line pt-2 text-xs">
                {v?.ok && typeof v.costUsd === "number" && <p><span className="font-medium text-brand-deep">업체 청구 {usd(v.costUsd)}</span> <span className="text-muted">· {krw(v.costUsd)}</span></p>}
                {v?.ok && typeof v.balanceUsd === "number" && <p className="text-muted">잔여 크레딧 {usd(v.balanceUsd)}</p>}
                {v?.ok && v.note && <p className="text-muted">{v.note}</p>}
                {v && !v.configured && <p className="text-muted">청구액 조회: <Link href="/admin/keys" className="underline">{v.keyName}</Link> 입력 시 표시</p>}
                {v && v.configured && !v.ok && <p className="text-danger">조회 실패: {v.error}</p>}
                <a href={v?.dashboardUrl} target="_blank" rel="noreferrer" className="text-brand underline">업체 대시보드 ↗</a>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">기간 합계 (앱 추정)</p>
          <p className="text-3xl font-bold">{usd(summary.total.costUsd)} <span className="text-base font-normal text-muted">≈ {krw(summary.total.costUsd)}</span></p>
        </div>
        <div className="text-right text-sm text-muted">
          <p>API 호출 {summary.total.calls.toLocaleString()}회</p>
          <p>업체 청구 합계 {usd(vendors.reduce((a, v) => a + (v.ok && typeof v.costUsd === "number" ? v.costUsd : 0), 0))} <span className="text-xs">(조회된 업체만)</span></p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 일별 */}
        <div className="card">
          <h2 className="mb-3 font-semibold">일별 추정 비용</h2>
          {summary.byDay.length === 0 ? (
            <p className="text-sm text-muted">기록 없음</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted"><tr><th className="py-1">날짜</th><th className="w-1/2"></th><th className="text-right">USD</th></tr></thead>
              <tbody>
                {summary.byDay.map((d) => (
                  <tr key={d.day} className="border-t border-line">
                    <td className="py-1.5 font-mono text-xs">{d.day}</td>
                    <td className="py-1.5 pr-3">
                      <div className="flex h-3 w-full overflow-hidden rounded bg-gray-100">
                        {PROVIDER_ORDER.map((p) => (d.per[p] ? <span key={p} className={`h-3 ${p === "anthropic" ? "bg-brand" : p === "openai" ? "bg-gold" : p === "fal" ? "bg-brand-deep" : p === "google" ? "bg-sky-500" : "bg-danger"}`} style={{ width: `${((d.per[p] ?? 0) / maxDay) * 100}%` }} title={`${PROVIDER_LABEL[p]} ${usd(d.per[p] ?? 0)}`} /> : null))}
                      </div>
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs">{d.costUsd.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint mt-2">막대 색: <span className="text-brand">■</span> Claude <span className="text-gold">■</span> OpenAI <span className="text-brand-deep">■</span> fal <span className="text-sky-500">■</span> Google <span className="text-danger">■</span> ElevenLabs</p>
        </div>

        {/* 제작실별 · 사용자별 */}
        <div className="space-y-4">
          <div className="card">
            <h2 className="mb-3 font-semibold">제작실별</h2>
            {summary.byJobType.length === 0 ? <p className="text-sm text-muted">기록 없음</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {summary.byJobType.map((t) => (
                    <tr key={t.jobType} className="border-t border-line first:border-0">
                      <td className="py-1.5">{(JOB_TYPE_LABEL as Record<string, string>)[t.jobType as JobType] ?? t.jobType}</td>
                      <td className="py-1.5 text-right text-xs text-muted">{t.calls}회</td>
                      <td className="py-1.5 text-right font-mono text-xs">{usd(t.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="card">
            <h2 className="mb-3 font-semibold">사용자별 상위 10</h2>
            {summary.byUser.length === 0 ? <p className="text-sm text-muted">기록 없음</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {summary.byUser.map((u) => (
                    <tr key={u.userId} className="border-t border-line first:border-0">
                      <td className="max-w-[16rem] truncate py-1.5" title={u.userId}>{names.get(u.userId) ?? u.userId.slice(0, 8)}</td>
                      <td className="py-1.5 text-right text-xs text-muted">{u.calls}회</td>
                      <td className="py-1.5 text-right font-mono text-xs">{usd(u.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* 업체 청구 상세 */}
      <div className="card">
        <h2 className="mb-1 font-semibold">업체 청구액 상세</h2>
        <p className="mb-3 text-xs text-muted">업체 API가 돌려준 값 그대로입니다. 앱 추정과 차이가 나면 단가(환경변수 PRICE_*)를 조정하거나, 앱 밖에서 같은 키를 쓴 사용이 있는지 확인하세요.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {vendors.map((v) => (
            <div key={v.provider} className="rounded-lg border border-line p-3 text-sm">
              <div className="flex items-center justify-between"><span className="font-medium">{PROVIDER_LABEL[v.provider]}</span>{v.ok && typeof v.costUsd === "number" && <span className="font-mono">{usd(v.costUsd)}</span>}</div>
              {!v.configured && <p className="mt-1 text-xs text-muted">관리자 키 <code>{v.keyName}</code>를 <Link href="/admin/keys" className="underline">API 키</Link>에 넣으면 조회됩니다.</p>}
              {v.configured && !v.ok && <p className="mt-1 text-xs text-danger">{v.error}</p>}
              {v.ok && v.note && <p className="mt-1 text-xs text-muted">{v.note}</p>}
              {v.ok && v.lines && v.lines.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {v.lines.map((l) => <li key={l.label} className="flex justify-between gap-2"><span className="truncate" title={l.label}>{l.label}</span><span className="shrink-0 font-mono">{usd(l.costUsd)}</span></li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>

      <details className="card text-sm">
        <summary className="cursor-pointer font-medium">추정 단가 (환경변수로 조정)</summary>
        <ul className="mt-2 grid gap-1 text-xs text-muted sm:grid-cols-2">
          <li>Claude 입력 ${PRICES.claudeInPerM}/M · 출력 ${PRICES.claudeOutPerM}/M · 캐시 읽기 ${PRICES.claudeCacheReadPerM}/M (PRICE_CLAUDE_IN_PER_M …)</li>
          <li>GPT Image 텍스트 입력 ${PRICES.imageTextInPerM}/M · 이미지 입력 ${PRICES.imageImageInPerM}/M · 출력 ${PRICES.imageOutPerM}/M, 토큰 정보 없으면 장당 medium ${PRICES.imagePerCall.medium} / high ${PRICES.imagePerCall.high}</li>
          <li>Kling turbo standard $0.112/초 · turbo pro $0.14/초 · standard(오디오) $0.14/초 · pro(오디오) $0.196/초(추정)</li>
          <li>Google Veo 3.1 Lite $0.05/초 · Fast $0.10/초 (720p, 오디오 포함) · 1080p Lite $0.08 · Fast $0.12</li>
          <li>OpenAI TTS ${PRICES.ttsPerMChars}/100만 자 (PRICE_TTS_PER_M_CHARS) · ElevenLabs Music 곡당 ${PRICES.musicPerTrack} (PRICE_MUSIC_PER_TRACK)</li>
          <li>환율 KRW_PER_USD={PRICES.krwPerUsd}</li>
        </ul>
      </details>
    </div>
  );
}
