# 하나로AI스튜디오

농축협 디지털 프로젝트과정 강의안의 산출물(문서 HWP · 뉴스레터 · 카드뉴스 · 홍보영상 30초 · 뮤직비디오 1분)을
한 곳에서 최고 품질 API로 만드는 **정액 구독형 웹 서비스**입니다.

| 제작실 | 흐름 | ro(기본) |
|---|---|---|
| 문서 · HWP | Claude 구조화 초안 → HWPX(한글 2014+) 조립 | 3 |
| 뉴스레터 | Claude 5섹션 원고 → GPT Image 카톡용 3:4 이미지 | 8 |
| 카드뉴스 | Claude 장별 문구 → GPT Image 3~6장 → ZIP | 장당 5 |
| 홍보영상 30초 | Claude 3컷 설계 → Kling 3.0 클립 3개 + CTA 포스터 → ffmpeg 자막·합성 | 55 |
| 뮤직비디오 1분 | Claude 가사·장면 → ElevenLabs 음원 → Kling 3.0 4장면 → ffmpeg 합성 | 110 |
| 실습 · 내 사진 영상 | 사진 편집(GPT) → Claude §7 프롬프트 → Kling 3.0(fal.ai) 한국어 음성 5/10초 → 브라우저 자막 → 다운로드 | 40 + 하드캡 |

| 역할 | API |
|---|---|
| 기획·원고·가사·장면 설계 | Anthropic Claude `claude-opus-5` (구조화 출력, 서버측 폴백) |
| 이미지 | OpenAI Images `gpt-image-2.5-sunburst` |
| 영상 | fal.ai Kling 3.0 — 실습: `…/turbo/standard/image-to-video` · 홍보·MV: 사진 있으면 image-to-video, 없으면 `…/turbo/standard/text-to-video` |
| 음악 | ElevenLabs Music `music_v2` (composition_plan) |
| 결제 | 토스페이먼츠 자동결제(빌링키) + Vercel Cron 월 청구 |
| 회원·DB·파일 | Supabase (Auth · Postgres · Storage) |

설계서: `docs/superpowers/specs/2026-09-10-hanaro-ai-studio-design.md` · 단계별 계획: `docs/superpowers/plans/`

## 1. 준비물

- Node.js 20 이상 (Node 24에서 검증), npm
- Supabase 프로젝트 1개
- API 키: Anthropic, OpenAI, fal.ai(`FAL_KEY`, 모든 영상), ElevenLabs(뮤직비디오)
- 토스페이먼츠 개발자센터 키 (자동결제는 계약 후 실결제, 테스트 키로 개발 가능)
- ffmpeg는 `ffmpeg-static`으로 자동 포함(별도 설치 불필요)

## 2. 설치·실행

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev                  # http://localhost:3000
```

```bash
npm test               # 단위 테스트 (Vitest, 외부 API 없이 동작)
npm run smoke:ffmpeg   # ffmpeg 합성·한글 자막 번인 스모크 (out/smoke.mp4)
npm run lint
npm run build
```

환경변수가 없어도 랜딩·요금 페이지는 열리므로 화면만 먼저 확인할 수 있습니다.

## 3. Supabase 설정

1. Supabase 대시보드 → **SQL Editor** → `supabase/migrations/0001_init.sql`, 이어서 `0002_banana.sql`, `0003_practice.sql`, `0004_practice_spec.sql`, `0005_app_secrets.sql`, `0006_service_role_check.sql`을 순서대로 붙여넣고 실행.
   테이블·RLS·크레딧 함수(`deduct_credits`/`add_credits`/`set_credits`)·Storage 버킷(`uploads`, `outputs`)이 만들어집니다.
2. **Authentication → Providers**: Email 활성화. 구글 로그인은 Google 제공자에 OAuth 클라이언트 등록 후
   Redirect URL에 `https://<프로젝트>.supabase.co/auth/v1/callback` 추가.
3. **Authentication → URL Configuration**: Site URL과 Redirect URLs에 `NEXT_PUBLIC_SITE_URL`(로컬·배포 도메인)을 추가.
4. 가입 후 최초 관리자 지정:

```sql
-- SQL Editor는 서비스 롤 검사를 통과하지 못하므로 보호 트리거를 잠깐 끄고 바꾼다
alter table profiles disable trigger profiles_protect;
update profiles set role = 'admin' where email = '관리자이메일@example.com';
alter table profiles enable trigger profiles_protect;
```

이후 관리자는 `/admin`(회원·구독)에서 역할 선택으로 지정할 수 있습니다.

관리자는 `/admin`에서 회원·구독 상태 변경, 크레딧 조정, 요금·단가 설정, 작업 로그, 갤러리 공개를 관리합니다.
결제 연동 전에 테스트하려면 관리자 화면에서 회원의 구독을 "활성"으로 바꾸고 크레딧을 부여하면 됩니다.

## 4. 토스페이먼츠

- 개발자센터 → API 키의 **클라이언트 키**(`NEXT_PUBLIC_TOSS_CLIENT_KEY`)와 **시크릿 키**(`TOSS_SECRET_KEY`).
- 카드 정보는 토스 결제창에서만 입력됩니다. 서버는 `authKey → billingKey` 발급과 월 청구만 수행합니다.
- 월 청구: Vercel Cron(`vercel.json`, 매일 KST 03:00)이 `/api/cron/billing` 호출. `CRON_SECRET`을 Vercel 환경변수에 등록.
  로컬 테스트: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/billing`

## 5. 작업(job) 동작 방식

- `POST /api/jobs` — 구독 확인 → 크레딧 선차감 → job 생성 → 첫 단계 실행.
- `GET /api/jobs/[id]` — 화면이 4초마다 폴링. 진행 중이면 다음 단계를 실행하고 상태·결과 파일을 돌려줍니다.
  영상은 fal request_id를 저장해 두고 `video:wait` 단계에서 완료 여부만 확인합니다.
- 실패 시 `jobs.error`에 한국어 메시지, 크레딧 자동 환불(`credit_ledger` 사유 `refund:*`).
- **확인 대기(`waiting`)**: 파이프라인이 `await:*` 단계를 돌려주면 작업은 `waiting`이 되어 폴링해도 진행하지 않습니다.
  화면이 `POST /api/jobs/[id]/resume { action, data }`로 사용자 입력을 보내면 파이프라인의 `resume()`이 다음 단계를 정하고 폴링이 이어집니다.
- **동시 실행 게이트**: fal.ai Kling은 계정 동시 실행 한도(기본 1, 상향 요청)가 있어 `lib/concurrency.ts`가 진행 중 클립 수를 DB에서 세고,
  한도가 차 있으면 `video:start` 단계를 유지하며 "순서 대기 중"을 표시합니다(`MAX_CONCURRENT_VIDEO_JOBS`). 모든 외부 API 호출은 `lib/providers/retry.ts`로 429·5xx를 재시도합니다.
- 결과 파일은 Storage `outputs/{userId}/{jobId}/…`에 저장, `/api/assets/[id]`가 30분 서명 URL로 리다이렉트.

## 5-1. 실습 제작실 (`/studio/practice`) — SPEC v1.0 (`docs/SPEC.md`)

강의 실습용 6단계 위저드. 단일 진실 소스는 `docs/SPEC.md`이며, 결정사항이 바뀌면 그 문서를 먼저 수정합니다.

```
① 사진 업로드(브라우저 리사이즈 → Storage 직접) → ② 이미지 편집(GPT Image, 스타일 프리셋)
→ ③ 영상 프롬프트(Claude §7 템플릿: 한국어 설명 → 영어 연출 + 한국어 대사)
→ ④ 영상 생성(Kling 3.0 via fal.ai, 한국어 음성·립싱크, 5/10초) → ⑤ 한글 자막(브라우저 ffmpeg.wasm) → ⑥ 다운로드
```

| 항목 | 구현 |
|---|---|
| 상태 머신 | `photo → await:photo → prompt → await:prompt → video:start → video:wait → await:subtitle → done` (`lib/pipelines/practice.ts`) |
| 하드캡 | 1인 이미지 3회 · 영상 2회 (`practice_credits`, 관리자 `/admin/practice`에서 충전). 실패·취소 시 환불 |
| 동시성 | 사용자당 진행 중 작업 1개 · 전체 상한 `MAX_CONCURRENT_VIDEO_JOBS` · 초과분은 `video:start`에 머물며 순번·예상시간 표시 · fal 큐 `queue_position` 표시 |
| 웹훅 | `POST /api/webhooks/fal?token=FAL_WEBHOOK_SECRET` (ED25519 서명 검증) → 영상 Storage 복사 → 자막 단계. 폴링이 백업 |
| 자막 | 브라우저 `@ffmpeg/ffmpeg` 단일 스레드 + Noto Sans KR 번들(`/public/fonts`, postinstall 복사) · ASS 필터 · 선택 BGM 믹스. 실패 시 서버 ffmpeg 대체 합성 |
| 동의·삭제 | 최초 진입 시 동의 체크(`profiles.consent_at`) · 자산 `delete_after` + `/api/cron/cleanup` 일일 배치(`ASSET_RETENTION_DAYS`) |
| 관리자 | `/admin/practice`: 실시간 큐·누적 비용(`jobs.cost_usd`)·임계치 알림·크레딧 설정·강제 취소. `GET /api/admin/overview`, `POST /api/admin/credits` |

- 마이그레이션: `0003_practice.sql` → **`0004_practice_spec.sql`** 순서로 실행.
- fal.ai Kling v3 기본 동시 실행은 계정당 1 → 실습 전 상향 요청 후 `MAX_CONCURRENT_VIDEO_JOBS` 반영.
- 개발용 자막 실험실: `npm run dev` 후 `/dev/subtitle-lab` (로그인 없이 ffmpeg.wasm 검증, 배포에서는 404).
- Seedance(BytePlus)는 실사 얼굴 참조를 거부하므로 제외(D3). 앱 전체 영상 생성이 fal.ai Kling 3.0 하나로 통일되어 BytePlus 키가 필요 없습니다.

## 5-2. API 키 입력 (관리자 화면)

`/admin/keys`에서 OpenAI·Anthropic·fal.ai·BytePlus·ElevenLabs·토스 시크릿 키를 직접 입력할 수 있습니다.
- 값은 AES-256-GCM으로 암호화해 `app_secrets` 테이블에 저장(키는 `SUPABASE_SERVICE_ROLE_KEY`에서 파생)하며, 화면에는 앞 3자·뒤 4자만 표시됩니다.
- 관리자 입력 값이 환경변수보다 우선합니다. 삭제하면 환경변수 값으로 돌아갑니다. 반영까지 최대 1분(프로세스 캐시).
- "연결 테스트"는 과금 없는 조회 API로 키 유효성만 확인합니다.
- Supabase 키와 `NEXT_PUBLIC_*` 공개 키는 앱 부팅 전에 필요하므로 여전히 `.env.local`/Vercel 환경변수에 둡니다.
- 마이그레이션 **`0005_app_secrets.sql`** 실행 필요.

## 6. 배포 (Vercel)

1. GitHub 저장소를 Vercel에 연결.
2. `.env.example`의 모든 변수를 Environment Variables에 등록. `NEXT_PUBLIC_SITE_URL`은 배포 도메인.
3. 영상 합성 라우트는 `maxDuration = 300`이므로 **Pro 플랜** 권장(Hobby는 함수 60초 제한).
4. `next.config.ts`의 `outputFileTracingIncludes`가 `assets/`(HWPX 템플릿·자막 폰트)와 ffmpeg 바이너리를 함수에 포함합니다.

## 7. 폴더 구조

```
app/            페이지·라우트 (랜딩, 인증, studio/*, admin/*, api/*)
lib/providers/  anthropic · openai-image · fal(Kling 3.0) · elevenlabs · toss · retry
lib/prompts/    역관목조분 빌더, 제작실별 프롬프트·zod 스키마
lib/pipelines/  작업 종류별 단계 실행기 (practice.ts: 확인 대기·resume 포함)
lib/concurrency.ts  Kling(fal.ai) 동시 실행 게이트
lib/providers/retry.ts  외부 API 429·5xx 재시도
lib/hwpx/       HWPX 조립 (assets/hwpx/blank.hwpx 기반)
lib/video/      ffmpeg 실행·자막 필터
lib/jobs.ts     작업 생성·진행·실패(환불)
supabase/       마이그레이션 SQL
tests/          Vitest 단위 테스트
```

## 8. ro 요금정책 (지니젠 벤치마크)

- **1 ro = 정가 100원**. 정책 상세: `docs/superpowers/specs/2026-09-10-banana-pricing.md`
- 충전 패키지: 베이직 120B 10,000원 · 밸류 625B 50,000원 · 프로 1,300B 100,000원 · 비즈니스 6,750B 500,000원 · 엔터프라이즈 14,300B 1,000,000원 (ro당 83→70원)
- 월 정액 99,000원 → 매월 1,300B 지급(이월 없음). 충전분은 무기한. 가입 보너스 30B.
- 소모: 문서 3 · 뉴스레터 8 · 카드뉴스 장당 5 · 홍보영상 30초 55 · 뮤직비디오 1분 110
- 관리자 화면(`/admin/settings`)에서 월 요금·월 지급량·소모량을, `banana_packages` 테이블에서 패키지를 바꿀 수 있습니다.
- 마이그레이션: `0001_init.sql` 다음에 **`0002_banana.sql`**을 실행해야 합니다.
- 충전 결제는 토스 일반결제(결제창)이며 서버가 `/v1/payments/confirm`으로 승인한 뒤 ro를 지급합니다.
