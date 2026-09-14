import Link from "next/link";
import type { ReactNode } from "react";
import { getProfile } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { LegalFooter } from "@/components/LegalFooter";
import { getBranding, type Branding } from "@/lib/branding";

export const metadata = { title: "서비스 이용약관", description: "{b.name} 이용 조건 — 절대 수칙, 생성물의 권리와 책임, ro 결제·환불 기준.", alternates: { canonical: "/terms" } };
export const dynamic = "force-dynamic";

const UPDATED = "2026-09-14";
const CONTACT = "leehun0720@gmail.com";

const sections = (b: Branding): { h: string; body: ReactNode }[] => [
  {
    h: "제1조 (목적)",
    body: <p>이 약관은 {b.name}(이하 &ldquo;서비스&rdquo;)의 이용 조건과 절차, 이용자와 운영자의 권리·의무를 정합니다. 서비스는 농축협 디지털 프로젝트과정의 실습 도구로, 강의 수강생과 승인된 이용자에게 제공됩니다.</p>,
  },
  {
    h: "제2조 (서비스 내용)",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>AI를 이용한 문서(HWPX)·뉴스레터·카드뉴스·홍보영상·뮤직비디오·실습 영상 초안 생성</li>
        <li>생성물의 보관함 제공과 다운로드</li>
        <li>ro(크레딧) 기반 이용량 관리 및 충전·정액 결제</li>
      </ul>
    ),
  },
  {
    h: "제3조 (계정)",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>이메일 또는 구글 계정으로 가입합니다. 계정은 본인만 사용하며 타인에게 양도·대여할 수 없습니다.</li>
        <li>운영자는 강의 운영을 위해 계정의 구독 상태와 ro 잔액을 조정하거나, 약관 위반 시 이용을 제한·해지할 수 있습니다.</li>
      </ul>
    ),
  },
  {
    h: "제4조 (이용자의 의무 — 절대 수칙)",
    body: (
      <ol className="list-decimal space-y-1 pl-5">
        <li><b>개인정보 입력 금지</b>: 조합원·고객의 이름·연락처·계좌 등 타인의 개인정보를 입력하지 않습니다.</li>
        <li><b>AI 결과는 초안</b>: 날짜·숫자·연락처·법적 표현은 사람이 반드시 검토한 뒤 배포합니다.</li>
        <li><b>저작권·초상권</b>: 사진은 본인 사진 또는 동의를 받은 사진만 사용하며, 타인·유명인·미성년자의 사진, 제3자의 저작물을 무단으로 올리지 않습니다.</li>
        <li>선정적·폭력적·차별적·불법적 내용, 허위 정보 제작에 서비스를 사용하지 않습니다.</li>
      </ol>
    ),
  },
  {
    h: "제5조 (생성물의 권리와 책임)",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>이용자가 입력한 자료와 그로부터 생성된 결과물의 권리는 관련 법령과 각 AI 제공사의 이용 조건이 허용하는 범위에서 이용자에게 귀속됩니다.</li>
        <li>AI 생성물은 사실과 다르거나 제3자의 권리를 침해할 수 있습니다. 생성물의 검토·사용·배포에 따른 책임은 이용자에게 있습니다.</li>
        <li>운영자는 이용자가 공개 갤러리에 게시한 결과물을 강의 자료로 소개할 수 있습니다.</li>
      </ul>
    ),
  },
  {
    h: "제6조 (ro와 결제)",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>1 ro = 100원이며, 산출물 유형별 차감량은 요금 안내 페이지에 표시합니다. 가입 시 무료 ro가 지급됩니다.</li>
        <li>생성이 실패하면 차감된 ro는 자동 환급됩니다. 정상 생성된 결과물은 환불 대상이 아닙니다.</li>
        <li>충전한 ro의 미사용분 환불은 결제 후 7일 이내, 사용 이력이 없는 경우에 한해 결제 수단으로 환불합니다.</li>
      </ul>
    ),
  },
  {
    h: "제7조 (보관과 삭제)",
    body: (
      <p>실습 제작실의 사진과 생성물은 실습 종료 후 일정 기간(기본 7일) 뒤 자동 삭제됩니다. 그 외 보관함 자료는 이용자가 직접 삭제하거나 회원 탈퇴 시 삭제됩니다. 자세한 내용은 <Link href="/privacy" className="text-brand underline">개인정보처리방침</Link>을 따릅니다.</p>
    ),
  },
  {
    h: "제8조 (서비스 변경·중단, 면책)",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>운영자는 외부 AI 서비스의 장애·정책 변경, 점검 등 사유로 서비스의 일부 또는 전부를 변경·중단할 수 있으며, 이 경우 미리 공지합니다.</li>
        <li>운영자는 이용자가 약관을 위반하여 발생한 손해, 외부 서비스 장애로 인한 지연에 대해 고의·중과실이 없는 한 책임지지 않습니다.</li>
      </ul>
    ),
  },
  {
    h: "제9조 (약관 변경 및 문의)",
    body: <p>약관을 변경할 경우 시행 7일 전에 서비스 내 공지합니다. 문의: <a className="text-brand underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></p>,
  },
];

export default async function TermsPage() {
  const [profile, b] = await Promise.all([getProfile(), getBranding()]);
  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs uppercase tracking-[0.3em] text-brand">Terms of Service</p>
        <h1 className="display mt-2 text-4xl font-bold">서비스 이용약관</h1>
        <p className="mt-3 text-sm text-muted">시행일: {UPDATED}</p>
        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          {sections(b).map((s) => (
            <section key={s.h}>
              <h2 className="mb-2 text-lg font-bold">{s.h}</h2>
              {s.body}
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm"><Link href="/privacy" className="text-brand underline">개인정보처리방침 보기 →</Link></p>
      </main>
      <LegalFooter />
    </>
  );
}
