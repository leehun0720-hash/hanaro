import { requireProfile, getSubscription } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { customerKeyFor } from "@/lib/billing";
import { getPackages } from "@/lib/packages";
import { totalBananas } from "@/lib/credits";
import { Alert } from "@/components/Alert";
import { BuyBananas } from "@/components/BuyBananas";
import { SubscribeButton } from "./BillingClient";
import type { BananaPurchase, CreditLedger, Payment, PlanSettings } from "@/lib/types";

export const metadata = { title: "ro · 구독" };

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : "-");
const REASON: Record<string, string> = { "bonus:signup": "가입 보너스", subscription_start: "구독 시작 지급", subscription_renewal: "월 지급" };
const reasonLabel = (r: string) => REASON[r] ?? (r.startsWith("purchase:") ? "ro 충전" : r.startsWith("refund:") ? "실패 환불" : r.startsWith("job:") ? `사용 (${r.slice(4)})` : r.startsWith("admin:") ? "관리자 조정" : r);

export default async function BillingPage({ searchParams }: PageProps<"/studio/billing">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const sub = await getSubscription(profile.id);
  const supabase = await createClient();
  const [{ data: plan }, { data: payments }, { data: purchases }, { data: ledger }, packages] = await Promise.all([
    supabase.from("plan_settings").select("*").eq("id", 1).single(),
    supabase.from("payments").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(12),
    supabase.from("banana_purchases").select("*").eq("user_id", profile.id).eq("status", "paid").order("created_at", { ascending: false }).limit(12),
    supabase.from("credit_ledger").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(20),
    getPackages(),
  ]);
  const p = plan as PlanSettings;
  const active = sub?.status === "active";
  const total = totalBananas(profile);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ro · 구독</h1>
        <p className="mt-1 text-sm text-muted">1 ro = 100원. 충전하거나 월 정액으로 매달 받아서 다섯 제작실에 씁니다.</p>
      </div>

      {sp.ok && <Alert kind="success">구독이 시작되었습니다. ro {p.monthly_credits.toLocaleString()}개가 지급되었습니다.</Alert>}
      {typeof sp.charged === "string" && <Alert kind="success">ro {Number(sp.charged).toLocaleString()}개가 충전되었습니다.</Alert>}
      {sp.canceled && <Alert kind="info">구독이 해지되었습니다. 남은 ro는 계속 쓸 수 있고, 다음 결제는 진행되지 않습니다.</Alert>}
      {typeof sp.error === "string" && <Alert kind="error">{sp.error}</Alert>}

      <section className="card flex flex-wrap items-center justify-between gap-4 bg-gold-soft border-gold/40">
        <div>
          <p className="text-sm text-gold-deep">내 ro</p>
          <p className="display text-4xl font-bold text-brand-deep">{total.toLocaleString()} ro</p>
          <p className="hint">월 지급분 {profile.credits.toLocaleString()} (다음 결제일에 재설정) · 충전분 {profile.banana_purchased.toLocaleString()} (무기한)</p>
        </div>
        <div className="text-right text-xs text-muted">
          <p>문서 3 · 뉴스레터 8 · 카드뉴스 장당 5</p>
          <p>홍보영상 55 · 뮤직비디오 110</p>
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card space-y-4">
          <div>
            <h2 className="font-semibold">ro 충전</h2>
            <p className="hint">일회성 결제. 많이 살수록 ro당 단가가 내려갑니다.</p>
          </div>
          <BuyBananas packages={packages} customerKey={customerKeyFor(profile.id)} email={profile.email} name={profile.name ?? ""} />
        </section>

        <section className="card space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">{p.name}</h2>
              <p className="text-2xl font-black mt-1">{p.price_krw.toLocaleString()}<span className="text-sm font-medium text-muted">원 / 월</span></p>
              <p className="text-sm text-muted mt-1">매월 ro {p.monthly_credits.toLocaleString()}개 자동 지급 (ro당 {Math.round(p.price_krw / p.monthly_credits)}원) · 언제든 해지</p>
            </div>
            <span className={`badge ${active ? "bg-brand-soft text-brand-deep" : sub?.status === "past_due" ? "bg-danger-soft text-danger" : "bg-gray-100 text-muted"}`}>
              {active ? "구독 중" : sub?.status === "past_due" ? "결제 실패" : sub?.status === "canceled" ? "해지됨" : "미구독"}
            </span>
          </div>
          {(active || sub?.status === "past_due") && (
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div><p className="text-muted">등록 카드</p><p className="font-medium">{sub?.card_company ?? "-"} {sub?.card_number_masked ?? ""}</p></div>
              <div><p className="text-muted">시작일</p><p className="font-medium">{fmtDate(sub?.started_at ?? null)}</p></div>
              <div><p className="text-muted">다음 결제일</p><p className="font-medium">{fmtDate(sub?.next_billing_at ?? null)}</p></div>
            </div>
          )}
          {sub?.status === "past_due" && <Alert kind="warn">최근 자동결제에 실패했습니다. 카드를 다시 등록하면 즉시 결제되고 구독이 재개됩니다.</Alert>}
          {!active && <SubscribeButton customerKey={customerKeyFor(profile.id)} email={profile.email} name={profile.name ?? ""} priceKrw={p.price_krw} planName={p.name} />}
          {active && (
            <form action="/api/billing/cancel" method="post"><button type="submit" className="btn-danger">구독 해지</button></form>
          )}
          <p className="hint">월 지급분은 다음 결제일에 새로 채워지며 이월되지 않습니다. 충전분은 영향을 받지 않습니다.</p>
        </section>
      </div>

      <section className="card">
        <h2 className="font-semibold mb-3">ro 내역</h2>
        {(ledger as CreditLedger[] | null)?.length ? (
          <table className="w-full text-sm">
            <thead className="text-muted text-left"><tr><th className="py-1.5">일시</th><th>내용</th><th className="text-right">증감</th><th className="text-right">잔여</th></tr></thead>
            <tbody>
              {(ledger as CreditLedger[]).map((x) => (
                <tr key={x.id} className="border-t border-line">
                  <td className="py-2">{new Date(x.created_at).toLocaleString("ko-KR")}</td>
                  <td>{reasonLabel(x.reason)}</td>
                  <td className={`text-right font-medium ${x.delta < 0 ? "text-danger" : "text-brand"}`}>{x.delta > 0 ? "+" : ""}{x.delta.toLocaleString()}</td>
                  <td className="text-right">{x.balance_after.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">아직 내역이 없습니다.</p>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold mb-3">결제 내역</h2>
        {((purchases as BananaPurchase[] | null)?.length ?? 0) + ((payments as Payment[] | null)?.length ?? 0) > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-muted text-left"><tr><th className="py-1.5">일시</th><th>구분</th><th>주문번호</th><th className="text-right">금액</th></tr></thead>
            <tbody>
              {(purchases as BananaPurchase[] | null)?.map((x) => (
                <tr key={x.id} className="border-t border-line"><td className="py-2">{new Date(x.paid_at ?? x.created_at).toLocaleString("ko-KR")}</td><td>ro {x.bananas.toLocaleString()}개 충전</td><td className="font-mono text-xs">{x.order_id}</td><td className="text-right">{x.amount.toLocaleString()}원</td></tr>
              ))}
              {(payments as Payment[] | null)?.map((x) => (
                <tr key={x.id} className="border-t border-line"><td className="py-2">{new Date(x.created_at).toLocaleString("ko-KR")}</td><td>월 정액 {x.status === "FAILED" ? "(실패)" : ""}</td><td className="font-mono text-xs">{x.order_id}</td><td className="text-right">{x.amount.toLocaleString()}원</td></tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">아직 결제 내역이 없습니다.</p>
        )}
      </section>
    </div>
  );
}
