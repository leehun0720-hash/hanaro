import { NextResponse } from "next/server";
import { buildInstrumentalPlan, composeMusic, MUSIC_MODEL } from "@/lib/providers/elevenlabs";
import { googleKeyProbe } from "@/lib/providers/google-veo";
import { getProfile } from "@/lib/auth";
import { getSecret, isSecretName, type SecretName } from "@/lib/secrets";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 관리자 → API 키 연결 테스트. 과금이 없거나 거의 없는 호출만 사용한다.
 *  - openai: GET /v1/models · anthropic: GET /v1/models · elevenlabs: GET /v1/user
 *  - fal: 존재하지 않는 요청 상태 조회 → 401/403이면 키 오류, 그 외(404·422)면 인증 통과
 */
/** 3초짜리 무가사 음원을 실제로 만들어 본다 — 뮤직 권한·플랜·플랜 형식(music_v1)을 한 번에 검증 (크레딧 소량 사용) */
async function musicProbe(): Promise<{ ok: boolean; message: string }> {
  try {
    const buf = await composeMusic(buildInstrumentalPlan("warm acoustic, gentle", 3));
    return { ok: true, message: `음원 생성 테스트 성공 (${MUSIC_MODEL}, ${Math.round(buf.length / 1024)}KB). 뮤직비디오를 만들 수 있어요.` };
  } catch (e) {
    return { ok: false, message: `음원 생성 테스트 실패: ${e instanceof Error ? e.message : String(e)} — 키 권한에 'Music'이 있는지, 플랜이 음악 생성을 지원하는지 확인하세요.` };
  }
}

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
      case "ELEVENLABS_API_KEY": {
        if (/\s/.test(key) || /[^ -~]/.test(key)) return NextResponse.json({ ok: false, message: "키에 공백·줄바꿈·특수문자가 섞여 있어요. 다시 복사해서 저장하세요." });
        r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key }, signal: ctl.signal });
        if (r.ok) {
          const sub = (await r.json().catch(() => ({}))) as { tier?: string; character_count?: number; character_limit?: number };
          const music = await musicProbe();
          return NextResponse.json({ ok: music.ok, message: `ElevenLabs 연결 성공 · 플랜 ${sub.tier ?? "?"} · 사용 ${sub.character_count ?? "?"}/${sub.character_limit ?? "?"} 문자. ${music.message}` });
        }
        {
          const body = await safeText(r);
          // 키가 유효하지만 '사용자 정보 읽기' 권한이 없는 제한 키(Restricted)는 400/401(missing_permissions)을 돌려준다 → 음악 생성 권한만 있으면 정상
          if (/invalid_api_key/.test(body)) {
            const hint = /API key ID/i.test(body) ? " 대시보드 목록의 짧은 ID가 아니라, 키 생성 직후 한 번만 표시되는 sk_로 시작하는 전체 키를 넣어야 해요. 새 키를 만들어 다시 저장하세요." : " 키를 다시 복사해 저장하세요.";
            return NextResponse.json({ ok: false, message: `ElevenLabs가 키를 거부했어요(invalid_api_key).${hint}` });
          }
          if (!key.startsWith("sk_")) return NextResponse.json({ ok: false, message: "ElevenLabs API 키는 sk_로 시작해요. 키 생성 직후 표시되는 전체 값을 넣어 주세요." });
          const music = await musicProbe();
          return NextResponse.json({ ok: music.ok, message: `키 인증 통과 ('사용자 정보 읽기' 권한 없는 제한 키, 응답 ${r.status}). ${music.message}` });
        }
      }
      case "GOOGLE_API_KEY":
        return NextResponse.json(await googleKeyProbe(key));
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
