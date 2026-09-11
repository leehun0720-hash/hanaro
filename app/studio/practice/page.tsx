import { requireProfile } from "@/lib/auth";
import { getCosts, costFor } from "@/lib/credits";
import { jobWithAssets } from "@/lib/jobs";
import { getPracticeCredits } from "@/lib/practice-credits";
import { hasActivePracticeJob } from "@/lib/concurrency";
import { missingPracticeKeys } from "@/lib/secrets";
import { Alert } from "@/components/Alert";
import { PracticeClient } from "./PracticeClient";
import { recordConsent } from "./actions";

export const metadata = { title: "실습 · 내 사진으로 영상 만들기" };
export const dynamic = "force-dynamic";

const RETENTION_DAYS = Math.max(1, Number(process.env.ASSET_RETENTION_DAYS ?? 7) || 7);

export default async function PracticePage({ searchParams }: PageProps<"/studio/practice">) {
  const sp = await searchParams;
  const profile = await requireProfile();
  const [costs, credits, missing] = await Promise.all([getCosts(), getPracticeCredits(profile.id), missingPracticeKeys()]);
  const error = typeof sp.error === "string" ? sp.error : null;

  // 진행 중인 실습이 있으면 그 작업을 이어서 보여준다 (사용자당 1개)
  const jobId = typeof sp.job === "string" ? sp.job : await hasActivePracticeJob(profile.id);
  const initial = jobId ? await jobWithAssets(jobId, profile.id).catch(() => null) : null;
  const resumable = initial?.job && initial.job.type === "practice" ? initial : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">실습 — 내 사진으로 말하는 영상 만들기</h1>
        <p className="mt-1 text-sm text-muted">
          ① 사진 올리기 → ② 스타일 합성 → ③ 한국어로 장면·대사 쓰기(Claude가 영상 프롬프트로 변환) → ④ Kling 3.0이 한국어 음성 영상 생성 → ⑤ 내 브라우저에서 한글 자막 입히기 → ⑥ 다운로드
        </p>
      </div>
      {error && <Alert kind="error">{error}</Alert>}
      {missing.length > 0 && (
        <Alert kind="error">
          {profile.role === "admin" ? (
            <>API 키가 설정되지 않았습니다: <b>{missing.join(", ")}</b> — <a href="/admin/keys" className="font-semibold underline">관리자 → API 키</a>에서 입력하세요.</>
          ) : (
            <>아직 실습 준비가 되지 않았어요. 강사에게 API 키 설정을 요청하세요.</>
          )}
        </Alert>
      )}

      {!profile.consent_at ? (
        <form action={recordConsent} className="card space-y-4">
          <h2 className="font-semibold">시작 전 동의</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>올리는 사진은 <b>본인</b> 사진입니다. 타인·유명인·미성년자 사진은 올리지 않습니다.</li>
            <li>사진과 생성물은 AI 서비스(OpenAI·Anthropic·fal.ai)로 전송되어 처리됩니다.</li>
            <li>사진과 생성물은 실습 종료 후 <b>{RETENTION_DAYS}일 이내 자동 삭제</b>됩니다. 필요한 결과물은 직접 다운로드하세요.</li>
            <li>선정적·폭력적 요청, 조합원 개인정보 입력은 금지입니다.</li>
          </ul>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="agree" required /> 위 내용을 읽고 동의합니다.</label>
          <div className="flex justify-end"><button className="btn-primary">동의하고 시작</button></div>
        </form>
      ) : (
        <>
          <Alert kind="warn">
            <b>업로드 금지:</b> 타인·유명인·미성년자 사진, 선정적·폭력적 요청. 남은 횟수 — 이미지 편집 <b>{credits.image_left}회</b> · 영상 생성 <b>{credits.video_left}회</b> (자막은 무제한).
          </Alert>
          <PracticeClient userId={profile.id} nickname={profile.name || profile.email.split("@")[0]} credits={costFor("practice", costs)} practiceCredits={credits} initial={resumable} />
        </>
      )}
    </div>
  );
}
