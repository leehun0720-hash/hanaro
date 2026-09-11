-- 관리자 화면에서 입력하는 API 키 저장소 (서비스 롤 전용)
-- 값은 서버에서 AES-256-GCM으로 암호화해 저장한다 (키 파생: SUPABASE_SERVICE_ROLE_KEY)
create table if not exists app_secrets (
  name text primary key,
  ciphertext text not null,
  hint text,                       -- 마지막 4자리 등 표시용
  updated_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table app_secrets enable row level security;
-- 정책 없음: anon/authenticated 접근 불가, 서비스 롤만 읽고 쓴다
