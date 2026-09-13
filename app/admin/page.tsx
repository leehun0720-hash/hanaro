import { adminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { Alert } from "@/components/Alert";
import type { Profile, Subscription } from "@/lib/types";
import { adjustCredits, setRole, setSubscriptionStatus, updateMember } from "./credits/actions";
import { DeleteMemberButton } from "./DeleteMemberButton";

export const metadata = { title: "관리자 · 회원" };
export const dynamic = "force-dynamic";

type Row = Profile & { subscriptions: Subscription[] | Subscription | null };

export default async function AdminHome({ searchParams }: PageProps<"/admin">) {
  const sp = await searchParams;
  const me = await requireAdmin();
  const { data } = await adminClient().from("profiles").select("*, subscriptions(*)").order("created_at", { ascending: false }).limit(500);
  const rows = (data ?? []) as Row[];
  const subOf = (r: Row) => (Array.isArray(r.subscriptions) ? r.subscriptions[0] : r.subscriptions) ?? null;
  const active = rows.filter((r) => subOf(r)?.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div><h1 className="text-2xl font-bold">회원·구독</h1><p className="mt-1 text-sm text-muted">전체 {rows.length}명 · 구독 중 {active}명</p></div>
      </div>
      {sp.ok && <Alert kind="success">반영되었습니다.</Alert>}
      {typeof sp.error === "string" && <Alert kind="error">{sp.error}</Alert>}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="bg-brand-soft text-left text-brand-deep">
            <tr><th className="px-4 py-2">회원</th><th className="px-4 py-2">역할</th><th className="px-4 py-2">구독</th><th className="px-4 py-2">다음 결제</th><th className="px-4 py-2">ro</th><th className="px-4 py-2">조정</th><th className="px-4 py-2">관리</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = subOf(r);
              return (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-4 py-3">
                    <form action={updateMember} className="space-y-1">
                      <input type="hidden" name="user_id" value={r.id} />
                      <div className="flex items-center gap-1">
                        <input name="name" defaultValue={r.name ?? ""} placeholder="이름" maxLength={60} className="input w-28 py-1 text-xs" />
                        <input name="org_name" defaultValue={r.org_name ?? ""} placeholder="소속" maxLength={60} className="input w-28 py-1 text-xs" />
                        <button className="btn-secondary px-2 py-1 text-xs">수정</button>
                      </div>
                      <div className="text-xs text-muted">{r.email}</div>
                      <div className="text-xs text-muted">{new Date(r.created_at).toLocaleDateString("ko-KR")} 가입</div>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <form action={setRole} className="flex items-center gap-1">
                      <input type="hidden" name="user_id" value={r.id} />
                      <select name="role" defaultValue={r.role} className="input py-1 text-xs"><option value="member">회원</option><option value="admin">관리자</option></select>
                      <button className="btn-secondary px-2 py-1 text-xs">저장</button>
                    </form>
                  </td>
                  <td className="px-4 py-3">
                    <form action={setSubscriptionStatus} className="flex items-center gap-1">
                      <input type="hidden" name="user_id" value={r.id} />
                      <select name="status" defaultValue={s?.status ?? "none"} className="input py-1 text-xs">
                        <option value="none">미구독</option><option value="active">활성</option><option value="past_due">결제실패</option><option value="canceled">해지</option>
                      </select>
                      <button className="btn-secondary px-2 py-1 text-xs">저장</button>
                    </form>
                    {s?.card_company && <div className="mt-1 text-xs text-muted">{s.card_company} {s.card_number_masked}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs">{s?.next_billing_at ? new Date(s.next_billing_at).toLocaleDateString("ko-KR") : "-"}</td>
                  <td className="px-4 py-3 font-semibold">{(r.credits + (r.banana_purchased ?? 0)).toLocaleString()}<div className="text-xs font-normal text-muted">월 {r.credits} · 충전 {r.banana_purchased ?? 0}</div></td>
                  <td className="px-4 py-3">
                    <form action={adjustCredits} className="flex items-center gap-1">
                      <input type="hidden" name="user_id" value={r.id} />
                      <input name="delta" type="number" step={1} placeholder="±" className="input w-20 py-1 text-xs" required />
                      <input name="reason" placeholder="사유" className="input w-28 py-1 text-xs" />
                      <button className="btn-primary px-2 py-1 text-xs">적용</button>
                    </form>
                  </td>
                  <td className="px-4 py-3"><DeleteMemberButton userId={r.id} email={r.email} disabled={r.id === me.id} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
