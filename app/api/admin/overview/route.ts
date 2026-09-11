import { NextResponse } from "next/server";
import { getAdminOverview } from "@/lib/admin-overview";
import { getProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 관리자 대시보드 데이터 (SPEC §10): 큐·비용·사용자 현황. /admin/practice가 5초마다 호출 */
export async function GET() {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "관리자만 볼 수 있어요." }, { status: 403 });
  return NextResponse.json(await getAdminOverview());
}
