import { Alert } from "@/components/Alert";
import { listSecretStatus } from "@/lib/secrets";
import { serviceKeyCheck } from "@/lib/admin-diag";
import { KeyRow } from "./KeyRow";

export const metadata = { title: "관리자 · API 키" };
export const dynamic = "force-dynamic";

/** API 키 관리 (관리자 전용). 값은 DB에 암호화 저장되며 화면에는 마스킹된 힌트만 표시 */
export default async function AdminKeysPage({ searchParams }: PageProps<"/admin/keys">) {
  const sp = await searchParams;
  const [rows, svcError] = await Promise.all([listSecretStatus(), serviceKeyCheck()]);
  const groups = Array.from(new Set(rows.map((r) => r.group)));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">API 키</h1>
        <p className="mt-1 text-sm text-muted">여기에 입력한 키가 환경변수보다 우선합니다. 값은 암호화되어 DB에 저장되고, 화면에는 앞 3자·뒤 4자만 보입니다. 저장 후 최대 1분 안에 반영됩니다.</p>
      </div>
      {typeof sp.ok === "string" && <Alert kind="success">{sp.ok}</Alert>}
      {typeof sp.error === "string" && <Alert kind="error">{sp.error}</Alert>}
      {!process.env.SUPABASE_SERVICE_ROLE_KEY && <Alert kind="error">서버에 SUPABASE_SERVICE_ROLE_KEY가 없어 키를 암호화할 수 없습니다. Vercel 환경변수를 확인하세요.</Alert>}
      {svcError && (
        <Alert kind="error">
          <b>서버의 Supabase 서비스 키가 동작하지 않습니다.</b> 오류: {svcError}
          <br />Vercel → Settings → Environment Variables에서 <code>SUPABASE_SERVICE_ROLE_KEY</code> 값을 Supabase API Keys 화면의 <b>Secret key(sb_secret_…)</b>로 다시 입력하고 Redeploy 하세요. 값 앞뒤에 공백·줄바꿈이 없어야 합니다.
        </Alert>
      )}
      <Alert kind="warn">키는 강사(관리자)만 볼 수 있는 이 화면에서만 다루세요. 대화·메일·문서에 키를 붙여 넣지 마세요.</Alert>

      {groups.map((g) => (
        <section key={g} className="space-y-3">
          <h2 className="font-semibold">{g}</h2>
          <div className="card divide-y divide-line p-0">
            {rows.filter((r) => r.group === g).map((r) => <KeyRow key={r.name} row={r} />)}
          </div>
        </section>
      ))}

      <div className="card text-sm text-muted space-y-1">
        <p><b>Supabase 키</b>(URL·anon·service role)는 앱이 뜨기 전에 필요하므로 여기서 관리하지 않고 `.env.local` 또는 Vercel 환경변수에 둡니다.</p>
        <p><b>토스 클라이언트 키</b>(`NEXT_PUBLIC_TOSS_CLIENT_KEY`)는 브라우저에 노출되는 공개 키라 환경변수로만 설정합니다.</p>
      </div>
    </div>
  );
}
