"use client";
import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
import type { BananaPackage } from "@/lib/packages";

type Props = { packages: BananaPackage[]; customerKey: string; email: string; name: string };

const per = (p: BananaPackage) => Math.round(p.price_krw / p.bananas);
const pct = (p: BananaPackage) => Math.round((1 - p.price_krw / p.list_price_krw) * 100);

export function BuyBananas({ packages, customerKey, email, name }: Props) {
  const [selected, setSelected] = useState(packages[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pkg = packages.find((p) => p.id === selected);

  async function buy() {
    if (!pkg) return;
    setBusy(true);
    setError(null);
    try {
      const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
      if (!clientKey) throw new Error("결제 설정(NEXT_PUBLIC_TOSS_CLIENT_KEY)이 없습니다. 관리자에게 문의하세요.");
      const r = await fetch("/api/banana/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packageId: pkg.id }) });
      const j = (await r.json()) as { orderId?: string; amount?: number; orderName?: string; error?: string };
      if (!r.ok || !j.orderId) throw new Error(j.error ?? "주문을 만들 수 없습니다.");
      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey });
      const origin = window.location.origin;
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: j.amount! },
        orderId: j.orderId,
        orderName: j.orderName!,
        successUrl: `${origin}/api/banana/success`,
        failUrl: `${origin}/studio/billing?error=${encodeURIComponent("결제가 취소되었거나 실패했습니다.")}`,
        customerEmail: email,
        customerName: name || undefined,
        card: { useCardPoint: false, flowMode: "DEFAULT", useAppCardOnly: false },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "결제창을 열 수 없습니다.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {packages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p.id)}
            className={`relative flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${selected === p.id ? "border-brand bg-brand-soft" : "border-line hover:bg-gray-50"}`}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{p.name}</span>
                {p.id === "basic" && <span className="badge bg-gold-soft text-gold-deep">가장 인기</span>}
              </div>
              <div className="mt-0.5 text-sm"><b className="text-brand-deep">{p.bananas.toLocaleString()}</b> ro · <b>{p.price_krw.toLocaleString()}원</b> <s className="text-xs text-muted">{p.list_price_krw.toLocaleString()}원</s></div>
              {p.description && <div className="text-xs text-muted">{p.description}</div>}
            </div>
            <div className="text-right text-xs">
              <div className="badge bg-danger-soft text-danger">-{pct(p)}%</div>
              <div className="mt-1 text-muted"><s>₩100</s> <b className="text-brand-deep">ro당 {per(p)}원</b></div>
            </div>
          </button>
        ))}
      </div>
      {pkg && (
        <div className="rounded-xl border border-line bg-white p-4 text-sm">
          <div className="flex justify-between"><span className="text-muted">선택한 패키지</span><b>{pkg.name}</b></div>
          <div className="flex justify-between"><span className="text-muted">ro</span><b>{pkg.bananas.toLocaleString()}개</b></div>
          <div className="flex justify-between"><span className="text-muted">할인</span><b className="text-brand">-{pct(pkg)}%</b></div>
          <div className="mt-2 flex justify-between border-t border-line pt-2 text-base"><span>총 결제 금액</span><b className="text-brand-deep">{pkg.price_krw.toLocaleString()}원</b></div>
        </div>
      )}
      <button onClick={buy} disabled={busy || !pkg} className="btn-primary w-full text-base">{busy ? "결제창 여는 중…" : "국내 카드 결제"}</button>
      {error && <p className="text-sm text-danger">{error}</p>}
      <p className="hint">충전 ro는 유효기간이 없습니다. 구매 후 7일 이내 미사용분은 환불되며, 7일 초과 시 환불되지 않습니다. 무료 지급분은 환불 대상이 아닙니다.</p>
    </div>
  );
}
