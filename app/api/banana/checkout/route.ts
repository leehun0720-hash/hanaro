import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getPackages } from "@/lib/packages";
import { getBranding } from "@/lib/branding";

/** 충전 주문 생성: 서버가 금액을 확정하고 pending 구매 행을 만든다 (클라이언트 금액 신뢰 안 함) */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const parsed = z.object({ packageId: z.string().min(1) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "패키지를 선택하세요." }, { status: 400 });

  const pkg = (await getPackages()).find((p) => p.id === parsed.data.packageId);
  if (!pkg) return NextResponse.json({ error: "패키지를 찾을 수 없습니다." }, { status: 404 });

  const orderId = `bn_${user.id.replace(/-/g, "").slice(0, 8)}_${Date.now()}`;
  const { error } = await adminClient()
    .from("banana_purchases")
    .insert({ user_id: user.id, package_id: pkg.id, order_id: orderId, bananas: pkg.bananas, amount: pkg.price_krw, status: "pending" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const brand = await getBranding();
  return NextResponse.json({ orderId, amount: pkg.price_krw, orderName: `${brand.name} ro ${pkg.bananas.toLocaleString()}개 (${pkg.name})` });
}
