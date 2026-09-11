# 5단계 — 실습 제작실 (SPEC v1.0 반영, 2026-09-11)

> 최종 결정은 `docs/SPEC.md`(단일 진실 소스). 이 문서는 구현 이력·체크리스트용.

## 변경 이력
- **1차**: 사진 GPT 합성 → Claude vision 프롬프트 → Seedance 2.0 → 서버 ffmpeg 자막·음악. 확인 대기(`waiting`)·`resume` API·Seedance 동시 실행 게이트·429 재시도 도입.
- **3차**: 홍보영상·뮤직비디오 클립도 fal.ai Kling 3.0으로 통일(사진 있으면 image-to-video, 없으면 text-to-video). BytePlus(`ARK_API_KEY`) 제거. 관리자 API 키 화면(`/admin/keys`, AES-256-GCM 저장) 추가.
- **2차 (SPEC 반영)**: 영상 모델을 **Kling 3.0(fal.ai)** 으로 교체(D1·D2·D3), 한국어 대사·네이티브 음성, §7 프롬프트 템플릿, **브라우저 ffmpeg.wasm 자막**(D8), 1인 하드캡(이미지 3·영상 2), 진행 중 작업 1개, 동의 게이트·삭제 배치, fal 웹훅(ED25519 검증), 관리자 실습 대시보드.

## 구현 파일
| 영역 | 파일 |
|---|---|
| 상태 머신·크레딧·비용 | `lib/pipelines/practice.ts`, `lib/practice-credits.ts`, `supabase/migrations/0004_practice_spec.sql` |
| 프롬프트(§7)·조립·자막 큐 | `lib/prompts/practice.ts` |
| fal.ai Kling·웹훅 검증 | `lib/providers/fal.ts`, `app/api/webhooks/fal/route.ts` |
| 동시성·큐 순번 | `lib/concurrency.ts` |
| 브라우저 자막 | `lib/video/wasm-subtitles.ts`, `components/SubtitleStudio.tsx`, `scripts/copy-ffmpeg-assets.mjs` |
| 화면 | `app/studio/practice/*`, `components/JobRunner.tsx`(`renderRunning`) |
| 관리자 | `app/admin/practice/*`, `lib/admin-overview.ts`, `app/api/admin/{overview,credits}` |
| 취소·삭제 | `app/api/jobs/[id]/cancel`, `app/api/cron/cleanup`(vercel.json) |
| 개발 검증 | `app/dev/subtitle-lab` (NODE_ENV=development 또는 ENABLE_DEV_PAGES=1) |

## 파일럿 체크리스트 (SPEC §14 발췌 + 구현 특이사항)
- [ ] `0004_practice_spec.sql` 실행 · `FAL_KEY`, `FAL_WEBHOOK_SECRET`, `APP_BASE_URL` 설정
- [ ] fal.ai Kling v3 동시 실행 상향 요청 → `MAX_CONCURRENT_VIDEO_JOBS` 반영
- [ ] 수강생 유형 사진으로 Kling 얼굴 필터 통과율 확인 (`koReasonFor` 문구 점검)
- [ ] 한국어 대사 발음·립싱크 확인 → 미달 시 TTS+립싱크 경로(SPEC 대안) 검토
- [ ] `/dev/subtitle-lab`에서 한글 자막 렌더링(폰트·줄바꿈·특수문자) 확인 — 로컬 브라우저 검증 완료 여부는 README 참고
- [ ] OpenAI IPM 티어(2 이상) 확인
- [ ] 5명 동시 제출 → 순번·웹훅·Storage 복사 확인 · 429/필터 거부/웹훅 유실 시나리오
- [ ] 관리자 `/admin/practice` 비용 임계치(`BUDGET_ALERT_USD`) 확인
