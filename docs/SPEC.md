# AI 영상 실습 앱 — 프로젝트 스펙 (SPEC.md)

> 강의 실습용 "내 사진 → AI 캐릭터/합성 이미지 → 한국어 영상 → 자막 → 다운로드" 웹앱.
> 이 문서는 코드 생성·리뷰 시 단일 진실 소스(SSOT)로 사용한다. 결정사항이 바뀌면 이 파일을 먼저 수정한다.

- 문서 버전: 1.0 (2026-09-11)
- 소유: 텐에이아이(TEN AI)
- 상태 표기: `[확정]` 결정 완료 / `[미결]` 결정 필요 / `[검증]` 파일럿에서 확인

---

## 1. 목표와 범위

| 항목 | 내용 |
|---|---|
| 용도 | 강의 실습. 수강생이 각자 노트북에서 전 과정을 1회 이상 완주 |
| 동시 사용자 | 최대 20명 (동시 제출 가능해야 함) |
| 수강생 전제 | 성인. 본인 사진 업로드에 동의 |
| 산출물 | 5~10초 영상(mp4), 한국어 음성·한글 자막 포함, 로컬 다운로드 |
| 언어 | UI·입력·자막·음성 전부 한국어. 영어 UI 없음 |
| 호스팅 | Vercel 또는 Netlify (서버리스) `[미결]` |
| 강사 장비 | 노트북 1대 = 관리자 대시보드 + 장애 시 Playground 직접 시연용. 서비스 호스팅 X |

### 파이프라인 (6단계)

```
① 사진 업로드 → ② 이미지 편집/합성 → ③ 영상 프롬프트 생성(Claude)
→ ④ 영상 생성(Kling 3.0 via fal.ai) → ⑤ 한글 자막 삽입(ffmpeg.wasm) → ⑥ 다운로드
```

---

## 2. 결정 로그 (Decision Log)

| # | 결정 | 상태 | 근거 |
|---|---|---|---|
| D1 | 영상 모델 = **Kling 3.0** (기본 Turbo Standard, 우수작 Turbo Pro) | `[확정]` | 실사 얼굴 입력 허용, 한국어 네이티브 음성·립싱크, 5초 $0.56 |
| D2 | 영상 API 경로 = **fal.ai** 단일 키 | `[확정]` | 큐·순번·웹훅 내장, 모델 스위칭 용이, 신용카드 결제 |
| D3 | Seedance 2.0 제외 (스타일화 경로에서만 옵션) | `[확정]` | 실사 얼굴 참조 이미지를 입력 단계에서 거부(딥페이크 필터). 한국어 음성 미지원 |
| D4 | Sora 2 제외 | `[확정]` | API 2026-09-24 종료 |
| D5 | Veo 3.1 이미지→영상 제외 | `[확정]` | 사람 얼굴 입력에 allowlist 승인 필요, 영어만 정식 지원 |
| D6 | 프롬프트 LLM = **Claude** | `[확정]` | 한국어 입력 → 영어 연출 프롬프트 + 한국어 대사 유지 변환 |
| D7 | 이미지 편집 = ChatGPT(gpt-image) **또는** Nano Banana(fal.ai) | `[미결]` | Nano Banana 선택 시 벤더가 fal.ai + Claude 2개로 축소. 한글 텍스트 렌더링은 Nano Banana Pro가 상대적 우위 |
| D8 | 자막 = **브라우저 ffmpeg.wasm** | `[확정]` | 서버리스에 FFmpeg 올리지 않음. 비용 0, 한글 폰트 번들 |
| D9 | 인증/DB/스토리지 = **Supabase** | `[확정]` | 20계정 사전 생성, 크레딧·작업 테이블, 이미지·영상 저장 |
| D10 | 화면 속 한글 글자는 **모델에 맡기지 않고 후처리 오버레이** | `[확정]` | 한글 자모 렌더링 정확도 보장 불가 |
| D11 | 별도 큐 서비스(Inngest 등) 미도입 | `[확정]` | fal.ai 큐 + 웹훅으로 충분. 이미지 편집도 fal.ai면 동일 패턴 |

---

## 3. 제약조건 (Constraints)

### 3.1 한국어 / 한글
- UI 문자열, 에러 메시지, 안내문 전부 한국어.
- 수강생 입력은 한국어. 영어 강제 없음.
- 영상 음성은 한국어. Kling 3.0 네이티브 오디오 사용(중·영·일·한·스페인어 지원).
- 화면 속 한글(간판·타이틀·자막)은 생성 모델이 그리지 않게 하고(`no on-screen text`), 전부 ffmpeg.wasm 오버레이로 삽입.
- 자막 폰트: Pretendard 또는 Noto Sans KR. 필요한 굵기 1~2종만 번들(각 3~5MB). UTF-8 고정.
- 5초 영상 대사 길이: 한국어 15~20자 이내(Claude가 자동 절단).

### 3.2 얼굴 / 개인정보
- 실사 얼굴 입력이 막히는 모델(Seedance 2.0, Veo 3.1 I2V) 사용 금지.
- 미성년자 얼굴은 대부분의 모델이 차단 → 성인 수강생 전제, 미성년 사진 업로드 금지 안내.
- 업로드 사진과 생성물은 실습 종료 후 N일 내 삭제(배치). 동의 체크박스 필수.
- 유명인 사진 업로드 금지 안내(Kling 공인 필터로 실패 원인이 됨).

### 3.3 동시성 / 인프라
- 20명 동시 제출 시 앱은 멈추지 않아야 하며, 순번·예상시간을 표시.
- 서버리스 함수 안에서 긴 작업(30초 이상)을 기다리지 않는다. 제출 → job id 저장 → 웹훅/폴링.
- 이미지 업로드는 브라우저 → Supabase Storage 직접(서명 URL). 서버리스 바디 제한 우회.
- 영상 결과 URL은 만료되므로 완료 즉시 Supabase Storage로 복사.
- fal.ai Kling v3 계열 기본 동시 실행은 계정당 1 → **실습 전 지원팀에 10~20으로 상향 요청** `[검증]`.
- OpenAI 이미지 API 사용 시 분당 이미지 수(IPM) 티어 제한 → 실습 1~2주 전 $50 이상 결제로 Tier 2 이상 확보 `[검증]`.

### 3.4 예산 가드
- 1인 크레딧 하드캡: 이미지 3회, 영상 2회 (자막은 로컬 처리로 무제한).
- 사용자별 진행 중 작업 1개 제한(중복 클릭 차단).
- 관리자 대시보드에서 실시간 누적 비용 표시, 임계치 알림.

---

## 4. 아키텍처

```
[브라우저: Next.js 위저드 UI (한국어)]
  ① 업로드 ─── 서명 URL로 Supabase Storage 직접 업로드
  ② 편집   ─── POST /api/image  → (ChatGPT | fal Nano Banana) → 결과 Storage 저장
  ③ 프롬프트 ─ POST /api/prompt → Claude → {en_prompt, ko_dialogue}
  ④ 영상   ─── POST /api/video  → fal.queue.submit(Kling) → job 저장 → 순번 폴링
             ◀── POST /api/webhooks/fal ← fal 완료 콜백 → mp4 Storage 복사 → job 완료
  ⑤ 자막   ─── 브라우저 ffmpeg.wasm (Pretendard 번들) → mp4 blob
  ⑥ 다운로드 ─ blob 저장 (+ 선택: Storage 업로드해 갤러리 보관)

[Supabase] Auth(수강생 20계정) · DB(profiles, credits, jobs, assets) · Storage(uploads, images, videos)
[Vercel/Netlify Functions] 짧은 요청만: 작업 생성 · 상태 조회 · 크레딧 차감 · 웹훅 수신
[강사 노트북] /admin 대시보드(실시간 큐·비용) + fal Playground 백업 시연
```

### 4.1 기술 스택

| 레이어 | 선택 | 메모 |
|---|---|---|
| 프론트 | Next.js (App Router), TypeScript, Tailwind | 위저드 6단계, 모바일 대응 불필요(노트북) |
| 인증 | Supabase Auth (이메일+초대코드 또는 매직링크) | 계정 20개 사전 생성 |
| DB/스토리지 | Supabase Postgres + Storage | RLS로 사용자별 격리 |
| 영상 | fal.ai `@fal-ai/client` | queue.submit + webhook |
| 이미지 | OpenAI Images API 또는 fal.ai Nano Banana | D7 미결 |
| LLM | Anthropic Claude (Messages API) | 프롬프트 변환·대사 생성 |
| 자막 | `@ffmpeg/ffmpeg` (wasm, 단일 스레드 우선) | COOP/COEP 헤더 없이 동작하는 빌드 선택 |
| 배포 | Vercel (우선) / Netlify | 함수 실행시간 제한 확인 |

---

## 5. 파이프라인 단계 상세

### ① 사진 업로드
- 입력: jpg/png/webp ≤ 10MB, 1장.
- 처리: 브라우저에서 리사이즈(최대 2048px) → 서명 URL → Storage `uploads/{user_id}/{uuid}.jpg`.
- 검증: 얼굴 1개 이상 권장, 미성년/유명인 금지 안내 모달.
- 실패: 파일 형식·크기 오류는 클라이언트에서 즉시.

### ② 이미지 편집/합성
- 입력: 원본 URL + 스타일 프리셋(예: 3D 캐릭터, 수채화, 클레이, 피규어, 영화 포스터) + 한국어 추가 지시.
- 출력: 편집 이미지 URL (Storage `images/{user_id}/{uuid}.png`).
- 규칙: 한글 텍스트 삽입 옵션은 기본 OFF (D10). ON 시 Nano Banana Pro만 허용 `[검증]`.
- 크레딧: 1회 차감. 실패(필터/타임아웃) 시 환불.

### ③ 영상 프롬프트 생성 (Claude)
- 입력: 수강생 한국어 설명(장면, 행동, 분위기), 원하는 대사(선택), 영상 길이(5/10초).
- 출력 JSON: `{ "prompt_en": string, "dialogue_ko": string|null, "negative": string, "duration": 5|10 }`.
- 규칙: 연출은 영어, 대사는 한국어 원문 유지, `no on-screen text, no subtitles, blank signage` 항상 포함, 대사 길이 제한(5초 ≤ 20자, 10초 ≤ 40자).
- 템플릿: §7 참조.

### ④ 영상 생성 (Kling 3.0 via fal.ai)
- 기본 엔드포인트: `fal-ai/kling-video/v3/turbo/standard/image-to-video` (720p, 음성 포함, $0.112/초)
- 고품질 옵션: `fal-ai/kling-video/v3/turbo/pro/image-to-video` (1080p, $0.14/초) — 관리자만 또는 우수작 재생성용
- 호출: `fal.queue.submit(endpoint, { input, webhookUrl })` → `request_id` 저장 → 클라이언트는 `/api/jobs/{id}` 폴링(3~5초 간격)로 `queue_position`·상태 표시
- 완료: 웹훅 수신 → 영상 URL을 Storage `videos/{user_id}/{job_id}.mp4`로 복사 → job `done`
- 실패: 필터 거부 → 한국어 사유 안내("얼굴이 인식되지 않았어요/유명인으로 판단되었어요") + 크레딧 환불. 429 → 지터 포함 지수 백오프 재시도(최대 5회).
- 소요: 5초 클립 약 1.5~3분(대기 제외). UI는 대기 중 ⑤ 자막 문구 작성 화면으로 유도.

### ⑤ 자막 삽입 (브라우저)
- 입력: mp4 blob, 자막 라인(한국어), 위치(상/하), 크기, 배경 박스 여부.
- 처리: ffmpeg.wasm 로드(최초 1회, ~30MB 캐시) → 폰트 파일 FS 마운트 → ASS 자막 생성 → `-vf ass=sub.ass` 인코딩.
- 성능: 5~10초 720p 기준 30~90초. 진행률 표시.
- 규칙: UTF-8, 폰트명 정확 일치, 자막 라인당 ≤ 20자 권장.

### ⑥ 다운로드
- blob → `a[download]`. 파일명 `{닉네임}_{yyyyMMdd_HHmm}.mp4`.
- 선택: Storage 업로드 후 수업 갤러리(강사 화면)에서 열람.

### 대안 경로 (한국어 음성 품질 미달 시)
```
Claude 대사 → 한국어 TTS(Supertone | ElevenLabs | Clova Voice) → mp3
→ Kling 립싱크 엔드포인트(오디오→영상, fal.ai) → mp4
```
- 파일럿에서 Kling 네이티브 한국어 발음이 수업 기준 미달이면 이 경로로 전환. 엔드포인트 ID·가격 `[검증]`.

---

## 6. 한국어 처리 원칙 (5 지점)

| 지점 | 처리 위치 | 방법 |
|---|---|---|
| 1. 한국어 입력 → 영상 프롬프트 | Claude (③) | 연출 영어 변환, 대사 한국어 유지 |
| 2. 영상 속 한국어 음성 | Kling 3.0 네이티브 오디오 (④) | 실패 시 TTS + 립싱크 대안 |
| 3. 화면 속 한글 글자 | 앱 후처리 (⑤) | 모델에는 `no on-screen text`, 글자는 오버레이 |
| 4. 자막 | ffmpeg.wasm (⑤) | Pretendard/Noto Sans KR 번들, ASS 필터 |
| 5. 이미지 속 한글 | 기본 OFF, 필요 시 Nano Banana Pro (②) | 파일럿 통과율 확인 후 허용 |

**핵심 원칙: 음성은 Kling에, 글자는 우리 앱에.**

---

## 7. Claude 프롬프트 변환 템플릿

시스템 프롬프트 (그대로 코드 상수로 사용):

```text
당신은 AI 영상 생성 모델(Kling 3.0)용 프롬프트 엔지니어입니다.
사용자는 한국어로 장면을 설명합니다. 아래 규칙으로 JSON만 출력하세요.

규칙:
1. "prompt_en": 장면·인물 행동·카메라·조명·분위기를 영어로 60~120단어. 첫 문장은 입력 이미지의 인물을 "the person in the image"로 지칭.
2. "dialogue_ko": 사용자가 대사를 원하면 한국어 원문 그대로. 길이 제한: duration 5초 → 20자 이하, 10초 → 40자 이하. 초과 시 의미를 보존해 줄일 것. 대사가 없으면 null.
3. dialogue_ko가 있으면 prompt_en 끝에 정확히 이 형식으로 덧붙임:
   The person speaks in Korean: "<dialogue_ko>". Natural lip sync, clear Korean pronunciation.
4. "negative": 항상 "on-screen text, subtitles, captions, letters, signage with text, watermark, logo, distorted face, extra fingers" 포함.
5. 화면에 글자를 넣으라는 요청은 무시하고 prompt_en에 "blank signage, no text anywhere" 를 넣는다.
6. 유명인·미성년자·선정적 묘사 요청은 거부 사유를 "error" 필드에 한국어로 넣고 나머지는 null.
7. 출력은 JSON 하나만. 마크다운 코드펜스 금지.

출력 스키마:
{"prompt_en": string, "dialogue_ko": string|null, "negative": string, "duration": 5|10, "error": string|null}
```

사용자 메시지 형식:

```text
[장면 설명] {user_scene_ko}
[대사] {user_dialogue_ko | 없음}
[길이] {5|10}초
[스타일] {preset_name}
```

---

## 8. 동시성·큐 설계

- fal.ai 큐 사용: `queue.submit` → `queue.status`(`queue_position` 포함) → 웹훅.
- 앱 내부 정책:
  - 사용자당 진행 중 job 1개(상태 `queued|running`이면 제출 버튼 비활성).
  - 전체 진행 중 job 상한 = fal 승인 동시 실행 수(예: 20). 초과분은 DB에 `pending`으로 두고 서버가 순차 제출(cron 또는 웹훅 수신 시 다음 건 제출).
  - 순번·예상시간 표시: `예상 = 앞선 대기 수 × 평균 생성시간 / 동시 실행 수`.
- 재시도: 429·5xx → 지터 포함 지수 백오프(1s, 2s, 4s, 8s, 16s). 필터 거부(4xx 콘텐츠)는 재시도 금지.
- 폴링 주기: 클라이언트 → 자체 API 3~5초. 자체 API → fal은 웹훅 우선, 폴링은 백업(30초 이상 웹훅 미수신 시).
- 실습 운영 백업: 강사 화면에서 특정 job 강제 재제출/취소.

---

## 9. 데이터 모델 (Supabase)

```sql
-- 수강생 프로필
create table profiles (
  id uuid primary key references auth.users(id),
  nickname text not null,
  role text not null default 'student' check (role in ('student','admin')),
  consent_at timestamptz,             -- 사진 업로드·처리 동의 시각
  created_at timestamptz default now()
);

-- 크레딧 (하드캡)
create table credits (
  user_id uuid primary key references profiles(id),
  image_left int not null default 3,
  video_left int not null default 2,
  updated_at timestamptz default now()
);

-- 작업
create table jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  kind text not null check (kind in ('image','prompt','video')),
  status text not null default 'pending'
    check (status in ('pending','queued','running','done','failed','cancelled')),
  provider text,                      -- 'fal' | 'openai' | 'anthropic'
  provider_request_id text,           -- fal request_id 등
  input jsonb not null,               -- 프롬프트·파라미터
  output jsonb,                       -- 결과 URL, usage 등
  error_ko text,                      -- 한국어 실패 사유
  cost_usd numeric(10,4) default 0,
  queue_position int,
  created_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index on jobs (user_id, created_at desc);
create index on jobs (status) where status in ('pending','queued','running');

-- 파일 자산
create table assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  job_id uuid references jobs(id),
  kind text not null check (kind in ('upload','image','video','final')),
  storage_path text not null,
  bytes int,
  created_at timestamptz default now(),
  delete_after timestamptz             -- 실습 종료 후 삭제 예정일
);

-- RLS: 학생은 본인 행만, admin은 전체
```

---

## 10. API 라우트

| 메서드/경로 | 역할 | 비고 |
|---|---|---|
| `POST /api/upload-url` | Storage 서명 URL 발급 | 크레딧 미차감 |
| `POST /api/image` | 이미지 편집 job 생성 | 크레딧 image_left 차감 |
| `POST /api/prompt` | Claude 변환 → JSON | 동기(수 초), 크레딧 미차감 |
| `POST /api/video` | fal 제출, job 생성 | 크레딧 video_left 차감, 진행 중 1개 제한 |
| `GET /api/jobs/:id` | 상태·순번 조회 | 3~5초 폴링 대상 |
| `POST /api/webhooks/fal` | fal 완료 콜백 | 서명 검증, 영상 Storage 복사 |
| `POST /api/jobs/:id/cancel` | 취소·크레딧 환불 | 관리자/본인 |
| `GET /api/admin/overview` | 큐·비용·사용자 현황 | admin 전용 |
| `POST /api/admin/credits` | 크레딧 충전 | admin 전용 |

---

## 11. 환경변수

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # 서버 전용

# fal.ai (영상, 선택: 이미지)
FAL_KEY=
FAL_WEBHOOK_SECRET=                 # 웹훅 서명 검증
FAL_VIDEO_ENDPOINT_DEFAULT=fal-ai/kling-video/v3/turbo/standard/image-to-video
FAL_VIDEO_ENDPOINT_PRO=fal-ai/kling-video/v3/turbo/pro/image-to-video
FAL_IMAGE_ENDPOINT=                 # Nano Banana 선택 시

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=                    # 프롬프트 변환용 모델 ID

# OpenAI (ChatGPT 이미지 선택 시)
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=

# 앱
APP_BASE_URL=                       # 웹훅 URL 조립용
DEFAULT_IMAGE_CREDITS=3
DEFAULT_VIDEO_CREDITS=2
MAX_CONCURRENT_VIDEO_JOBS=          # fal 승인 동시 실행 수
ASSET_RETENTION_DAYS=7
```

- 모든 키는 서버 환경변수. 클라이언트 번들에 노출 금지 (`NEXT_PUBLIC_` 접두어는 Supabase 공개 키만).

---

## 12. 비용 산정 (20명 × 1회 실습)

| 항목 | 산정 | 금액(USD) |
|---|---|---|
| 영상 (Kling 3.0 Turbo Standard 5초, 음성 포함) | 20명 × 2편 × $0.56 | 22.4 |
| 영상 재생성 여유 (실패·재시도 20%) | | 4.5 |
| 이미지 편집 | 20명 × 3장 × $0.05~0.20 | 3~12 |
| Claude 프롬프트 변환 | 20명 × 수 회 | < 1 |
| 인프라 (Vercel Hobby/Pro, Supabase Free/Pro) | 무료 티어로 시작 가능 | 0~20 |
| **합계** | | **약 $30~60 (4~8만 원)** |

- 우수작 Turbo Pro(1080p) 재생성 1편당 +$0.70.
- TTS+립싱크 대안 경로 사용 시 TTS 비용 별도(수강생 20명 × 2건, 수 달러 수준).
- 참고: Seedance 경로였다면 리소스팩 최소 선구매 $30.1(7팩) + 480p 편당 약 $1.1.

---

## 13. 보안·개인정보

- API 키: 서버 환경변수만. 웹훅은 서명 검증.
- RLS: 학생은 본인 jobs/assets만 조회. Storage 버킷은 비공개 + 서명 URL(짧은 만료).
- 동의: 최초 로그인 시 "본인 사진 업로드·AI 처리·N일 후 삭제" 동의 체크 → `profiles.consent_at` 기록. 미동의 시 업로드 차단.
- 삭제: `assets.delete_after` 기준 일일 배치로 Storage·DB 정리.
- 금지 안내(업로드 화면 고정 문구): 타인·유명인·미성년자 사진 금지, 선정적·폭력적 요청 금지.
- 로그: job별 프롬프트·비용·사유 저장(관리자 열람). 사진 원본은 로그에 남기지 않음.

---

## 14. 체크리스트

### 파일럿 (실습 1~2주 전, 2~3명)
- [ ] fal.ai Kling v3 동시 실행 상향 요청 → 승인 수치 확인 → `MAX_CONCURRENT_VIDEO_JOBS` 반영
- [ ] 수강생 유형 사진(셀카·단체·역광·어두운 사진)으로 Kling 얼굴 필터 통과율 확인
- [ ] 한국어 대사 발음·립싱크 품질 확인 → 미달이면 TTS+립싱크 경로로 전환
- [ ] 한글 자막 렌더링(폰트·줄바꿈·특수문자) 확인
- [ ] 한국어 프롬프트 직접 입력 vs Claude 영어 변환 결과 비교
- [ ] 이미지 편집 벤더 확정(D7) 및 한글 텍스트 렌더링 통과율(허용 시)
- [ ] OpenAI 사용 시 IPM 티어 확인(Tier 2 이상)
- [ ] 5명 동시 제출 → 큐 순번·웹훅·Storage 복사 정상 동작
- [ ] 429·필터 거부·웹훅 유실 시나리오 각 1회 강제 발생 후 복구 확인

### 실습 전날
- [ ] 수강생 20계정 + 초대코드 생성, 크레딧 충전
- [ ] fal.ai 잔액 충전(예산 × 1.5), Anthropic/OpenAI 잔액 확인
- [ ] 스타일 프리셋 5~6개, 프롬프트 예시 3개, 자막 예시 준비
- [ ] 관리자 대시보드 열어 큐·비용 표시 확인
- [ ] 장애 백업: fal Playground 로그인 상태, 시연용 이미지 준비

### 실습 당일
- [ ] 동의 체크 안내 → 업로드 금지 항목 구두 설명
- [ ] 영상 대기 중 자막 작성 단계로 유도(대기 체감 축소)
- [ ] 큐 정체 시 강사가 우수 프롬프트 1건 Turbo Pro로 시연
- [ ] 종료 후 삭제 배치 일정 공지

---

## 15. 참고 수치 (2026-09 기준, 변동 가능 — 사용 전 재확인)

### fal.ai Kling 3.0 이미지→영상 가격
| 엔드포인트 | 가격 |
|---|---|
| `fal-ai/kling-video/v3/turbo/standard/image-to-video` | $0.112/초, 720p, 음성 포함 (5초 $0.56) |
| `fal-ai/kling-video/v3/turbo/pro/image-to-video` | $0.14/초, 1080p (5초 $0.70) |
| `fal-ai/kling-video/v3/standard/image-to-video` | $0.084/초(무음) · $0.126/초(음성) · $0.154/초(음성+보이스 컨트롤) |
| `fal-ai/kling-video/v3/pro/image-to-video` | $0.224/초(무음) · $0.336/초(음성) · $0.392/초(보이스 컨트롤) |
| `fal-ai/kling-video/o3/standard/image-to-video` | $0.084/초(무음) · $0.112/초(음성). 5초 생성 약 94초(Pro는 약 318초) |
- fal.ai Kling v3 계열 기본 동시 실행: 계정당 1 (요청으로 상향 가능)
- Kling 3.0 언어: 중국어·영어·일본어·한국어·스페인어 대사 립싱크, 최대 15초, 프레임 내 텍스트 렌더링 기능 보유(한글 정확도 미검증)

### 제외 모델 근거
- Sora 2: 앱 2026-04-26 종료, API 2026-09-24 종료.
- Veo 3.1 I2V: 사람 얼굴 입력 allowlist 필요, 영어만 정식 지원, 피크 시 최대 6분, 결과 2일 보관.
- Seedance 2.0(BytePlus ModelArk): 실사 얼굴 참조 거부. 리소스팩 $4.3/1M토큰(최소 7팩·90일 만료·환불 불가), Fast $3.3/1M(최소 9팩). 계정당 모델 버전별 동시 5개(1.0 계열 문서 기준), 초과 시 큐 대기. 지원 언어에 한국어 없음. 자사 모델(Seedream 등)이 생성한 얼굴 포함 결과물은 30일 내 입력 허용.

### 기타 대안 (참고)
- Hailuo(MiniMax): 최저가·최고속 계열, 음성 제한적.
- Wan 2.6(Alibaba): $0.05/초, 실사 허용, 품질 한 단계 아래.
- Runway Gen-4.5: $0.15/초, 편집 도구 강점, 실습엔 과함.

### 출처
- fal.ai 모델 페이지: https://fal.ai/models/fal-ai/kling-video/v3/turbo/standard/image-to-video
- Kling 3.0 언어 지원: https://morphic.com/kr/resources/how-to/kling-3.0-guide
- Sora 종료 안내: https://help.openai.com/en/articles/20001152-what-to-know-about-the-sora-discontinuation
- Veo 3.1 문서: https://ai.google.dev/gemini-api/docs/veo
- BytePlus Seedance 리소스팩: https://docs.byteplus.com/en/docs/modelark/2191775
- Seedance 얼굴 필터 설명: https://docs.apiyi.com/en/faq/seedance2-asset-face-reference

---

## 16. 미결 사항 (착수 전 확정 필요)

1. **D7 이미지 편집 벤더**: ChatGPT(gpt-image) 유지 vs fal.ai Nano Banana로 통일.
2. **배포 플랫폼**: Vercel vs Netlify.
3. **영상 기본 길이**: 5초 고정 vs 5/10초 선택.
4. **갤러리 기능**: 다운로드만 vs 수업 갤러리 보관.
5. **자산 보관 기간**: `ASSET_RETENTION_DAYS` 값(기본 7일).


---

## 부록 A. 구현 메모 (하나로AI스튜디오 통합, 2026-09-11)

이 SPEC은 기존 하나로AI스튜디오(Next.js·Supabase) 안의 **실습 제작실(`/studio/practice`)** 로 구현했다. 기존 홍보영상·뮤직비디오 제작실은 그대로(Seedance 2.5) 두고, 실습 경로만 이 문서를 따른다.

| SPEC 항목 | 구현 위치 | 비고 |
|---|---|---|
| ① 업로드 | `app/studio/practice/PracticeClient.tsx` | 브라우저 리사이즈 2048px → `uploads/{uid}/practice/` 직접 업로드(RLS) |
| ② 이미지 편집 | `lib/pipelines/practice.ts` `photo` · `lib/prompts/practice.ts` `STYLE_PRESETS` | D7: **gpt-image 유지**(기존 연동). Nano Banana 전환 시 `lib/providers/openai-image.ts`의 `editImage`만 교체 |
| ③ 프롬프트 | `PRACTICE_SYSTEM_PROMPT`(§7 원문) + `assembleKlingPrompt` | negative는 Kling turbo 스키마에 없어 프롬프트 문장 `Avoid: …`로 부착. 이미지도 Claude에 함께 전달 |
| ④ 영상 | `lib/providers/fal.ts` · `video:start`/`video:wait` · `app/api/webhooks/fal` | turbo standard 기본, Pro는 체크박스. 결과 URL 즉시 Storage 복사 |
| ⑤ 자막 | `lib/video/wasm-subtitles.ts` · `components/SubtitleStudio.tsx` | `@ffmpeg/core` 단일 스레드, `/public/ffmpeg`·`/public/fonts` 자체 호스팅(postinstall). 실패 시 서버 ffmpeg 대체 |
| ⑥ 다운로드 | `SubtitleStudio` | `{닉네임}_{yyyyMMdd_HHmm}.mp4`. 갤러리 보관은 선택(outputs 업로드 후 `finish`) |
| §3.4 예산 가드 | `practice_credits` + `practice_use/refund/set` RPC · `/admin/practice` | 이미지 3 · 영상 2 · 진행 중 1개 · 누적 비용 `jobs.cost_usd` · `BUDGET_ALERT_USD` |
| §8 큐 | `lib/concurrency.ts` | DB 기반 전체 상한, 순번·예상시간, fal `queue_position` 표시, 429 지수 백오프 |
| §9 데이터 모델 | `supabase/migrations/0004_practice_spec.sql` | 기존 `jobs/assets` 테이블을 확장(`cost_usd`, `queue_position`, `delete_after`, `consent_at`) |
| §13 보안 | 웹훅 토큰 + ED25519 JWKS 검증, RLS, 동의 게이트, 일일 삭제 배치 | |

### 미결 사항에 대한 현재 값 (§16)
1. D7 이미지 벤더: **gpt-image** (기존 연동 재사용). 2. 배포: **Vercel**. 3. 길이: **5/10초 선택**. 4. 갤러리: **다운로드 기본 + 보관 선택**. 5. 보관 기간: **7일**(`ASSET_RETENTION_DAYS`).
