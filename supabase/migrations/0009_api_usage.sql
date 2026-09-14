-- 0009: 외부 API 호출 기록 (관리자 사용량·비용 보드)
create table if not exists api_usage (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references profiles(id) on delete set null,
  job_id uuid references jobs(id) on delete set null,
  job_type text,
  provider text not null,          -- anthropic | openai | fal | elevenlabs
  product text not null,           -- 모델·엔드포인트 (claude-opus-5, gpt-image-2.5-sunburst, fal-ai/kling-video/..., music_v1, gpt-4o-mini-tts)
  unit text not null,              -- tokens | images | seconds | chars | tracks
  quantity numeric not null default 0,
  cost_usd numeric(12,6) not null default 0,  -- 앱 추정치 (공개 단가 기준)
  meta jsonb not null default '{}'::jsonb
);
create index if not exists api_usage_created_idx on api_usage (created_at desc);
create index if not exists api_usage_provider_idx on api_usage (provider, created_at desc);
create index if not exists api_usage_user_idx on api_usage (user_id, created_at desc);

-- 서비스 키만 읽고 쓴다 (정책 없음 = 일반 사용자 접근 불가)
alter table api_usage enable row level security;
