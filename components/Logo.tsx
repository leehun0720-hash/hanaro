import Link from "next/link";
import { getBranding } from "@/lib/branding";

/** 사이트 로고 — 관리자 브랜딩 설정(이름·로고 이미지)을 따른다. 서버 컴포넌트 전용 */
export async function Logo({ href = "/", light = false }: { href?: string; light?: boolean }) {
  const b = await getBranding();
  const initial = (b.name.trim()[0] ?? "R").toUpperCase();
  return (
    <Link href={href} className="flex items-center gap-2 font-black tracking-tight">
      {b.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- 관리자가 올린 임의 크기의 로고
        <img src={b.logoUrl} alt={b.name} className="h-8 w-auto max-w-[140px] object-contain" />
      ) : (
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm text-white">{initial}</span>
      )}
      <span className={light ? "text-white" : "text-foreground"}>
        {b.name}
        {b.byline && <span className={`ml-1.5 text-xs font-medium ${light ? "text-white/60" : "text-muted"}`}>{b.byline}</span>}
      </span>
    </Link>
  );
}
