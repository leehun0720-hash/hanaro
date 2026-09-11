/**
 * 토스페이먼츠 자동결제(빌링) API v1
 * - 카드 정보는 토스 결제창에서만 입력되며, 이 서버는 authKey → billingKey 발급과 청구만 담당한다.
 * - 문서: https://docs.tosspayments.com/guides/v2/billing
 */
import { requireSecret } from "@/lib/secrets";

const BASE = "https://api.tosspayments.com/v1";

const authHeader = async () => "Basic " + Buffer.from(`${await requireSecret("TOSS_SECRET_KEY")}:`).toString("base64");

export type TossCard = { company?: string; issuerCode?: string; number?: string; cardType?: string };
export type BillingKeyResult = { billingKey: string; customerKey: string; card?: TossCard; method?: string };
export type TossPayment = {
  paymentKey: string;
  orderId: string;
  status: string;
  approvedAt?: string;
  totalAmount?: number;
  card?: TossCard;
};

class TossError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TossError";
    this.code = code;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: await authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const j = (await r.json()) as T & { code?: string; message?: string };
  if (!r.ok) throw new TossError(j.code ?? "UNKNOWN", j.message ?? "토스페이먼츠 요청 실패");
  return j;
}

export function issueBillingKey(authKey: string, customerKey: string) {
  return post<BillingKeyResult>("/billing/authorizations/issue", { authKey, customerKey });
}

export function chargeBillingKey(p: {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerEmail?: string;
  customerName?: string;
}) {
  const { billingKey, ...body } = p;
  return post<TossPayment>(`/billing/${encodeURIComponent(billingKey)}`, body);
}

/** 일반결제(결제창) 승인: 클라이언트 successUrl의 paymentKey·orderId·amount로 서버가 최종 승인 */
export function confirmPayment(p: { paymentKey: string; orderId: string; amount: number }) {
  return post<TossPayment>("/payments/confirm", p);
}
