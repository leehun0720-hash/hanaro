import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { getProfile, supabaseConfigured } from "@/lib/auth";
import { BANANA_KRW, COST_DETAIL, COST_LABEL, DEFAULT_COSTS } from "@/lib/credits";
import { getPackages, perBanana, discountPct } from "@/lib/packages";
import { SiteHeader } from "@/components/SiteHeader";
import type { PlanSettings } from "@/lib/types";
import { getBranding } from "@/lib/branding";

export const metadata = { title: "요금 안내", description: "1 ro = 100원. 문서·뉴스레터·카드뉴스·홍보영상·뮤직비디오 산출물별 ro 차감량과 충전 패키지, 월 정액 안내.", alternates: { canonical: "/pricing" } };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const [profile, packages, brand] = await Promise.all([getProfile(), getPackages(), getBranding()]);
  let plan: PlanSettings | null = null;
  if (supabaseConfigured()) {
    const { data } = await adminClient().from("plan_settings").select("*").eq("id", 1).single();
    plan = data as PlanSettings | null;
  }
  const p = plan ?? { name: `${brand.name} 월 정액`, price_krw: 99000, monthly_credits: 1300, credit_costs: DEFAULT_COSTS };
  const costs = { ...DEFAULT_COSTS, ...p.credit_costs };
  const cta = profile ? "/studio/billing" : "/signup";

  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto max-w-5xl px-6 py-14 space-y-14">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-brand">ro 요금제</p>
          <h1 className="display mt-2 text-4xl font-bold">1 ro = 100원</h1>
          <p className="mt-3 text-muted">필요한 만큼 충전하거나, 월 정액으로 매달 받으세요. 가입만 해도 ro 30개를 드립니다.</p>
        </div>

        <section>
          <h2 className="mb-4 text-xl font-bold">ro 충전 (일회성 · 유효기간 없음)</h2>
          <div className="grid gap-4 md:grid-cols-5">
            {packages.map((pk) => (
              <div key={pk.id} className={`card relative flex flex-col ${pk.id === "basic" ? "border-brand" : ""}`}>
                {pk.id === "basic" && <span className="badge absolute -top-2.5 left-4 bg-gold-soft text-[#7a5d00]">가장 인기</span>}
                <span className="badge absolute -top-2.5 right-4 bg-danger-soft text-danger">-{discountPct(pk)}%</span>
                <h3 className="font-semibold">{pk.name}</h3>
                <p className="display mt-2 text-3xl font-bold text-brand-deep">{pk.bananas.toLocaleString()}<span className="ml-1 text-sm font-medium text-muted">ro</span></p>
                <p className="mt-1 text-lg font-bold">{pk.price_krw.toLocaleString()}원 <s className="text-xs font-normal text-muted">{pk.list_price_krw.toLocaleString()}원</s></p>
                <p className="text-xs text-muted"><s>₩{BANANA_KRW}</s> → ro당 <b className="text-brand">{perBanana(pk)}원</b></p>
                <p className="mt-2 text-xs text-muted">{pk.description}</p>
                <Link href={cta} className="btn-secondary mt-4 text-xs">충전하기</Link>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="card border-brand/40">
            <p className="text-xs uppercase tracking-[0.3em] text-brand">정기 할인</p>
            <h2 className="mt-1 font-semibold">{p.name}</h2>
            <p className="text-4xl font-black mt-2">{p.price_krw.toLocaleString()}<span className="text-base font-medium text-muted">원 / 월</span></p>
            <ul className="mt-4 space-y-1.5 text-sm">
              <li>· 매월 ro <b>{p.monthly_credits.toLocaleString()}개</b> 자동 지급 (ro당 {Math.round(p.price_krw / p.monthly_credits)}원, 프로 패키지 수량)</li>
              <li>· 월 지급분은 다음 결제일에 새로 채워짐 (이월 없음) · 충전분은 무기한</li>
              <li>· 카드 자동결제, 언제든 해지</li>
            </ul>
            <Link href={cta} className="btn-primary mt-6 w-full">{profile ? "구독 시작하기" : "가입하고 시작하기"}</Link>
          </div>
          <div className="card">
            <h2 className="font-semibold mb-3">산출물별 ro</h2>
            <table className="w-full text-sm">
              <tbody>
                {Object.keys(COST_LABEL).map((k) => (
                  <tr key={k} className="border-t border-line first:border-0 align-top">
                    <td className="py-2"><div>{COST_LABEL[k]}</div><div className="text-xs text-muted">{COST_DETAIL[k]}</div></td>
                    <td className="py-2 text-right whitespace-nowrap"><b>{costs[k]}</b> ro<div className="text-xs text-muted">{(costs[k] * BANANA_KRW).toLocaleString()}원</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="hint mt-3">예) 베이직 120개로 뉴스레터 {Math.floor(120 / costs.newsletter)}건, 프로 1,300개로 홍보영상 {Math.floor(1300 / costs.promo_video)}편 또는 뮤직비디오 {Math.floor(1300 / costs.music_video)}편. 실패한 작업은 전액 자동 환불.</p>
          </div>
        </section>

        <section className="rounded-2xl bg-brand-soft p-6 text-sm text-brand-deep">
          <h2 className="font-semibold">규칙</h2>
          <ul className="mt-2 grid gap-1 md:grid-cols-2">
            <li>· 작업 시작 시 선차감, 실패 시 전액 환불</li>
            <li>· 차감 순서: 월 지급분 → 충전분</li>
            <li>· 충전 후 7일 이내 미사용분 환불, 7일 초과 환불 불가</li>
            <li>· 무료 지급분(가입 보너스 등)은 환불 대상 아님</li>
          </ul>
        </section>
      </main>
    </>
  );
}
