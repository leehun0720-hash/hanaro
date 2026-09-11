import { NextResponse } from "next/server";
import { z } from "zod";
import { getProfile } from "@/lib/auth";
import { deleteSecret, isSecretName, setSecret, type SecretName } from "@/lib/secrets";

export const dynamic = "force-dynamic";

const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : String(e));

/** 관리자 API 키 저장 (JSON). 실패 사유를 그대로 돌려준다 */
export async function POST(request: Request) {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });
  const parsed = z.object({ name: z.string(), value: z.string() }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !isSecretName(parsed.data.name)) return NextResponse.json({ error: "알 수 없는 항목이에요." }, { status: 400 });
  if (!parsed.data.value.trim()) return NextResponse.json({ error: "값을 입력하세요." }, { status: 400 });
  try {
    await setSecret(parsed.data.name as SecretName, parsed.data.value, me.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/keys] 저장 실패:", e);
    return NextResponse.json({ error: `저장 실패: ${errText(e)}` }, { status: 500 });
  }
}

/** DB 값 삭제 → 환경변수 값으로 되돌아간다 */
export async function DELETE(request: Request) {
  const me = await getProfile();
  if (!me || me.role !== "admin") return NextResponse.json({ error: "관리자만 할 수 있어요." }, { status: 403 });
  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  if (!name || !isSecretName(name)) return NextResponse.json({ error: "알 수 없는 항목이에요." }, { status: 400 });
  try {
    await deleteSecret(name as SecretName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[admin/keys] 삭제 실패:", e);
    return NextResponse.json({ error: `삭제 실패: ${errText(e)}` }, { status: 500 });
  }
}
