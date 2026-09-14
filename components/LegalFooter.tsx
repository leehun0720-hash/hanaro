import Link from "next/link";
import { Logo } from "@/components/Logo";

/** 첫 화면·약관 페이지 공용 푸터 — 개인정보처리방침·이용약관 링크 (구글 OAuth 브랜딩 요건) */
export function LegalFooter() {
  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted">
        <Logo />
        <p>절대 수칙 ① 개인정보 입력 금지 ② AI 결과는 초안, 검토는 사람 ③ 저작권·초상권 확인</p>
        <p className="flex flex-wrap items-center gap-3">
          <Link href="/privacy" className="hover:underline">개인정보처리방침</Link>
          <Link href="/terms" className="hover:underline">이용약관</Link>
          <span>© {new Date().getFullYear()} 하나로AI스튜디오</span>
        </p>
      </div>
    </footer>
  );
}
