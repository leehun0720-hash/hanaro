"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/studio", label: "대시보드", icon: "▦" },
  { href: "/studio/projects", label: "프로젝트(소재)", icon: "◎" },
  { href: "/studio/document", label: "문서 · HWP", icon: "▤" },
  { href: "/studio/newsletter", label: "뉴스레터", icon: "✉" },
  { href: "/studio/cardnews", label: "카드뉴스", icon: "▣" },
  { href: "/studio/promo-video", label: "홍보영상 30초", icon: "▶" },
  { href: "/studio/music-video", label: "뮤직비디오 1분", icon: "♪" },
  { href: "/studio/practice", label: "실습 · 내 사진 영상", icon: "✦" },
  { href: "/studio/library", label: "보관함", icon: "◫" },
  { href: "/studio/billing", label: "구독 · 결제", icon: "▥" },
];

export function StudioNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  const all = isAdmin ? [...items, { href: "/admin", label: "관리자", icon: "★" }] : items;
  return (
    <nav className="space-y-0.5">
      {all.map((it) => {
        const active = it.href === "/studio" ? path === "/studio" : path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
              active ? "bg-brand text-white font-medium" : "text-foreground hover:bg-brand-soft"
            }`}
          >
            <span className="w-4 text-center opacity-80">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
