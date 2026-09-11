import { notFound } from "next/navigation";
import { SubtitleLab } from "./SubtitleLab";

export const metadata = { title: "자막 실험실 (개발용)" };
export const dynamic = "force-dynamic";

/** 개발 전용: 로그인 없이 브라우저 ffmpeg.wasm 자막 합성을 검증한다. 배포 환경에서는 404. */
export default function SubtitleLabPage() {
  if (process.env.NODE_ENV !== "development" && process.env.ENABLE_DEV_PAGES !== "1") notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <h1 className="text-xl font-bold">자막 실험실 (개발용)</h1>
      <p className="text-sm text-muted">mp4를 고르면 브라우저 안에서 ffmpeg.wasm으로 한글 자막을 입힙니다. 서버로 아무것도 보내지 않아요.</p>
      <SubtitleLab />
    </div>
  );
}
