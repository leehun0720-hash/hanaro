import Link from "next/link";
import type { ReactNode } from "react";
import { getProfile } from "@/lib/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { LegalFooter } from "@/components/LegalFooter";

export const metadata = { title: "개인정보처리방침" };
export const dynamic = "force-dynamic";

const RETENTION_DAYS = Math.max(1, Number(process.env.ASSET_RETENTION_DAYS ?? 7) || 7);
const UPDATED = "2026-09-14";
const CONTACT = "leehun0720@gmail.com";

const sections: { h: string; body: ReactNode }[] = [
  {
    h: "1. 수집하는 개인정보",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li><b>계정 정보</b>: 이메일 주소, 이름(표시명). 구글 계정으로 로그인하면 구글이 제공하는 이메일·이름·프로필 사진 URL을 받습니다. 비밀번호는 저장하지 않습니다(이메일 링크·구글 로그인만 사용).</li>
        <li><b>실습 자료</b>: 사용자가 직접 올린 사진, 입력한 소재·문구, 그리고 이를 바탕으로 생성된 이미지·프롬프트·영상·음원·문서.</li>
        <li><b>이용 기록</b>: 작업 생성 시각·유형·상태, 사용한 ro(크레딧) 수량, 접속 로그(IP·브라우저 종류). 서비스 운영과 오류 확인 목적입니다.</li>
      </ul>
    ),
  },
  {
    h: "2. 이용 목적",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>회원 식별과 로그인, 작업 결과물(보관함) 제공</li>
        <li>AI 산출물(문서·뉴스레터·카드뉴스·영상·뮤직비디오·실습 영상) 생성</li>
        <li>ro(크레딧) 관리, 결제 처리, 이용 한도 적용</li>
        <li>강의 운영(수강생 실습 현황 확인) 및 부정 이용 방지</li>
      </ul>
    ),
  },
  {
    h: "3. 제3자 제공 및 처리 위탁",
    body: (
      <>
        <p>산출물 생성을 위해 사용자가 입력한 텍스트·사진은 아래 서비스에 전송되어 처리됩니다. 각 서비스는 자체 개인정보처리방침에 따라 데이터를 취급하며, 생성 목적 외에 사용하지 않도록 API 이용 조건을 적용합니다.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Anthropic (Claude)</b> — 기획·원고·프롬프트 작성, 사진 분석</li>
          <li><b>OpenAI (GPT Image)</b> — 이미지 생성·편집</li>
          <li><b>fal.ai (Kling)</b> — 영상 생성</li>
          <li><b>ElevenLabs</b> — 음원 생성</li>
          <li><b>Supabase</b> — 계정·데이터베이스·파일 저장</li>
          <li><b>Vercel</b> — 웹 서비스 호스팅</li>
          <li><b>토스페이먼츠</b> — 결제 (카드 정보는 결제사가 처리하며 본 서비스에 저장되지 않습니다)</li>
        </ul>
        <p className="mt-2">이 외에 법령에 따른 요청이 있는 경우를 제외하고 개인정보를 제3자에게 제공하거나 판매하지 않습니다.</p>
      </>
    ),
  },
  {
    h: "4. 보유 기간 및 삭제",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li><b>실습 제작실</b>에 올린 사진과 생성물: 실습 종료 후 <b>{RETENTION_DAYS}일 이내 자동 삭제</b>됩니다. 필요한 결과물은 직접 다운로드하세요.</li>
        <li>그 외 보관함의 산출물: 회원 탈퇴 또는 삭제 요청 시 지체 없이 삭제합니다.</li>
        <li>계정 정보: 회원 탈퇴 시 즉시 삭제합니다. 다만 전자상거래법 등 관련 법령이 정한 결제·거래 기록은 해당 기간(5년) 동안 별도 보관합니다.</li>
      </ul>
    ),
  },
  {
    h: "5. 사용자의 권리",
    body: (
      <p>사용자는 언제든지 자신의 개인정보를 열람·정정·삭제하거나 회원 탈퇴를 요청할 수 있습니다. 보관함에서 산출물을 직접 삭제할 수 있으며, 계정 삭제는 아래 연락처로 요청하면 처리합니다. 구글 계정 연결은 구글 계정 설정 → 보안 → 타사 앱에서 언제든 해제할 수 있습니다.</p>
    ),
  },
  {
    h: "6. 사용자의 의무",
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>조합원·고객 등 <b>타인의 개인정보(이름·연락처·계좌 등)를 입력하지 않습니다.</b> 서비스는 이러한 입력을 전제로 설계되지 않았습니다.</li>
        <li>사진은 본인 사진 또는 초상권 동의를 받은 사진만 올립니다. 타인·유명인·미성년자 사진은 금지합니다.</li>
      </ul>
    ),
  },
  {
    h: "7. 쿠키 및 보안",
    body: (
      <p>로그인 유지를 위한 세션 쿠키만 사용하며 광고·추적 쿠키는 사용하지 않습니다. 저장 데이터는 전송 구간 암호화(HTTPS)와 접근 통제(행 단위 보안 정책)로 보호하며, 외부 AI 서비스 API 키는 암호화하여 보관합니다.</p>
    ),
  },
  {
    h: "8. 문의",
    body: (
      <p>개인정보 관련 문의·요청: <a className="text-brand underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> (개인정보 보호책임자: 하나로AI스튜디오 운영자). 접수 후 10일 이내에 답변합니다.</p>
    ),
  },
];

export default async function PrivacyPage() {
  const profile = await getProfile();
  return (
    <>
      <SiteHeader profile={profile} />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <p className="text-xs uppercase tracking-[0.3em] text-brand">Privacy Policy</p>
        <h1 className="display mt-2 text-4xl font-bold">개인정보처리방침</h1>
        <p className="mt-3 text-sm text-muted">하나로AI스튜디오(이하 &ldquo;서비스&rdquo;)는 농축협 디지털 프로젝트과정 수강생의 실습을 위한 AI 제작 도구입니다. 서비스는 개인정보보호법 등 관련 법령을 준수하며, 다음과 같이 개인정보를 처리합니다. 시행일: {UPDATED}</p>
        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          {sections.map((s) => (
            <section key={s.h}>
              <h2 className="mb-2 text-lg font-bold">{s.h}</h2>
              {s.body}
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm"><Link href="/terms" className="text-brand underline">서비스 이용약관 보기 →</Link></p>
      </main>
      <LegalFooter />
    </>
  );
}
