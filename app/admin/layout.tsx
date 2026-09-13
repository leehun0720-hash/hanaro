import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { Logo } from "@/components/Logo";
import { signOut } from "@/app/auth/actions";
import { Alert } from "@/components/Alert";
import { serviceKeyCheck } from "@/lib/admin-diag";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const svcError = await serviceKeyCheck();
  const tabs = [
    { href: "/admin", label: "회원·구독" },
    { href: "/admin/jobs", label: "작업 로그" },
    { href: "/admin/gallery", label: "갤러리 공개" },
    { href: "/admin/settings", label: "요금·ro 설정" },
    { href: "/admin/practice", label: "실습 현황" },
    { href: "/admin/keys", label: "API 키" },
  ];
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-6">
            <Logo href="/admin" />
            <span className="badge bg-danger-soft text-danger">관리자</span>
            <nav className="hidden gap-1 md:flex">
              {tabs.map((t) => <Link key={t.href} href={t.href} className="rounded-lg px-3 py-1.5 text-sm hover:bg-brand-soft">{t.label}</Link>)}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/studio" className="text-muted hover:text-foreground">스튜디오로</Link>
            <form action={signOut}><button className="text-muted hover:text-foreground">로그아웃</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6 md:p-8">
        {svcError && (
          <div className="mb-6">
            <Alert kind="error">
              <b>서버의 Supabase 서비스 키가 동작하지 않습니다.</b> 오류: {svcError}
              <br />Vercel → Settings → Environment Variables에서 <code>SUPABASE_SERVICE_ROLE_KEY</code>를 Supabase API Keys 화면의 <b>Secret key(sb_secret_…)</b>로 다시 입력(복사 아이콘 사용)하고 Redeploy 하세요. 이 키가 고장 나면 회원 관리·크레딧·API 키 저장·작업 실행이 모두 실패합니다.
            </Alert>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
