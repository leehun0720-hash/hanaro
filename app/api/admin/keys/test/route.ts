import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { getSecret, isSecretName, type SecretName } from "@/lib/secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 관리자 → API 키 연결 테스트. 과금이 없거나 거의 없는 호출만 사용한다.
 *  - openai: GET /v1/models · anthropic: GET /v1/models · elevenlabs: GET /v1/user
 *  - fal: 존재하지 않는 요청 상태 조회 → 401/403이면 키 오류, 그 외(404·422)면 인증 통과
 */
export async function POST(request: Request) {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });
  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  if (!name || !isSecretName(name)) return NextResponse.json({ error: "알 수 없는 항목" }, { status: 400 });
  const key = await getSecret(name as SecretName);
  if (!key) return NextResponse.json({ ok: false, message: "키가 설정되어 있지 않아요." });

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    let r: Response;
    switch (name) {
      case "OPENAI_API_KEY":
        r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: ctl.signal });
        return NextResponse.json(r.ok ? { ok: true, message: "OpenAI 연결 성공" } : { ok: false, message: `OpenAI 응답 ${r.status}: ${await safeText(r)}` });
      case "ANTHROPIC_API_KEY":
        r = await fetch("https://api.anthropic.com/v1/models", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: ctl.signal });
        return NextResponse.json(r.ok ? { ok: true, message: "Anthropic 연결 성공" } : { ok: false, message: `Anthropic 응답 ${r.status}: ${await safeText(r)}` });
      case "ELEVENLABS_API_KEY":
        r = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key }, signal: ctl.signal });
        return NextResponse.json(r.ok ? { ok: true, message: "ElevenLabs 연결 성공" } : { ok: false, message: `ElevenLabs 응답 ${r.status}` });
      case "FAL_KEY":
        r = await fetch("https://queue.fal.run/fal-ai/kling-video/requests/00000000-0000-0000-0000-000000000000/status", { headers: { Authorization: `Key ${key}` }, signal: ctl.signal });
        if (r.status === 401 || r.status === 403) return NextResponse.json({ ok: false, message: `fal.ai 인증 실패 (${r.status}). 키를 확인하세요.` });
        return NextResponse.json({ ok: true, message: `fal.ai 인증 통과 (응답 ${r.status})` });
      default:
        return NextResponse.json({ ok: true, message: "이 항목은 연결 테스트를 지원하지 않아요. 값은 저장되어 있습니다." });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, message: `요청 실패: ${e instanceof Error ? e.message : String(e)}` });
  } finally {
    clearTimeout(t);
  }
}

async function safeText(r: Response) {
  try {
    return (await r.text()).slice(0, 160);
  } catch {
    return "";
  }
}
