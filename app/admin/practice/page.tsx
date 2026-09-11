import { requireAdmin } from "@/lib/auth";
import { getAdminOverview } from "@/lib/admin-overview";
import { AdminPracticeClient } from "./AdminPracticeClient";

export const metadata = { title: "관리자 · 실습 현황" };
export const dynamic = "force-dynamic";

/** 강사 대시보드 (SPEC §4·§3.4): 실시간 큐·누적 비용·크레딧 충전·강제 취소 */
export default async function AdminPracticePage() {
  await requireAdmin();
  const overview = await getAdminOverview();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">실습 현황</h1>
        <p className="mt-1 text-sm text-muted">5초마다 자동 갱신 · 동시 실행 상한 {overview.limit} (MAX_CONCURRENT_VIDEO_JOBS) · 비용 임계치 ${overview.budget_alert_usd}</p>
      </div>
      <AdminPracticeClient initial={overview} />
    </div>
  );
}
