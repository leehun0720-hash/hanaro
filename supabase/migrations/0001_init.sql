-- 하나로AI스튜디오 초기 스키마
-- Supabase Dashboard → SQL Editor 에 붙여넣어 실행하세요.

create extension if not exists pgcrypto;

-- ---------- 테이블 ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  org_name text,
  role text not null default 'member' check (role in ('member','admin')),
  credits integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists plan_settings (
  id integer primary key default 1 check (id = 1),
  name text not null default '하나로AI스튜디오 월 정액',
  price_krw integer not null default 99000,
  monthly_credits integer not null default 200,
  credit_costs jsonb not null default '{"document":1,"newsletter":2,"cardnews_page":1,"promo_video":20,"music_video":30}',
  updated_at timestamptz not null default now()
);
insert into plan_settings (id) values (1) on conflict do nothing;

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'none' check (status in ('none','active','past_due','canceled')),
  customer_key text not null,
  billing_key text,
  card_company text,
  card_number_masked text,
  started_at timestamptz,
  next_billing_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  order_id text not null unique,
  amount integer not null,
  status text not null,
  toss_payment_key text,
  raw jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists credit_ledger (
  id bigserial primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  delta integer not null,
  balance_after integer not null,
  reason text not null,
  job_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  what text not null,
  when_text text,
  where_text text,
  audience text,
  cta text,
  photos jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  type text not null check (type in ('document','newsletter','cardnews','promo_video','music_video')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  step text,
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  error text,
  credits integer not null default 0,
  provider_task_ids jsonb not null default '{}',
  lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists jobs_user_created on jobs (user_id, created_at desc);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  kind text not null check (kind in ('image','video','audio','hwpx','zip')),
  storage_path text not null,
  mime text not null,
  size integer,
  meta jsonb not null default '{}',
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- 함수 ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure handle_new_user();

create or replace function deduct_credits(p_user uuid, p_amount integer, p_reason text, p_job uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  update profiles set credits = credits - p_amount
    where id = p_user and credits >= p_amount
    returning credits into v_balance;
  if v_balance is null then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into credit_ledger (user_id, delta, balance_after, reason, job_id)
    values (p_user, -p_amount, v_balance, p_reason, p_job);
  return v_balance;
end $$;

create or replace function add_credits(p_user uuid, p_amount integer, p_reason text, p_job uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_balance integer;
begin
  update profiles set credits = credits + p_amount where id = p_user returning credits into v_balance;
  insert into credit_ledger (user_id, delta, balance_after, reason, job_id)
    values (p_user, p_amount, v_balance, p_reason, p_job);
  return v_balance;
end $$;

create or replace function set_credits(p_user uuid, p_amount integer, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_old integer; v_new integer;
begin
  select credits into v_old from profiles where id = p_user for update;
  update profiles set credits = p_amount where id = p_user returning credits into v_new;
  insert into credit_ledger (user_id, delta, balance_after, reason)
    values (p_user, v_new - v_old, v_new, p_reason);
  return v_new;
end $$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists jobs_touch on jobs;
create trigger jobs_touch before update on jobs for each row execute procedure touch_updated_at();

-- ---------- RLS ----------
alter table profiles enable row level security;
alter table plan_settings enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table credit_ledger enable row level security;
alter table projects enable row level security;
alter table jobs enable row level security;
alter table assets enable row level security;

drop policy if exists "profiles select" on profiles;
create policy "profiles select" on profiles for select using (id = auth.uid() or is_admin());
drop policy if exists "profiles update own" on profiles;
create policy "profiles update own" on profiles for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "plan readable" on plan_settings;
create policy "plan readable" on plan_settings for select using (true);

drop policy if exists "subscriptions select" on subscriptions;
create policy "subscriptions select" on subscriptions for select using (user_id = auth.uid() or is_admin());
drop policy if exists "payments select" on payments;
create policy "payments select" on payments for select using (user_id = auth.uid() or is_admin());
drop policy if exists "ledger select" on credit_ledger;
create policy "ledger select" on credit_ledger for select using (user_id = auth.uid() or is_admin());

drop policy if exists "projects own" on projects;
create policy "projects own" on projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "projects admin read" on projects;
create policy "projects admin read" on projects for select using (is_admin());

drop policy if exists "jobs select" on jobs;
create policy "jobs select" on jobs for select using (user_id = auth.uid() or is_admin());
drop policy if exists "assets select" on assets;
create policy "assets select" on assets for select using (user_id = auth.uid() or is_admin() or is_public);

-- role 컬럼은 본인이 바꿀 수 없도록 트리거로 보호
create or replace function protect_profile_role() returns trigger language plpgsql as $$
begin
  if new.role <> old.role and not is_admin() and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'ROLE_CHANGE_FORBIDDEN';
  end if;
  if new.credits <> old.credits and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'CREDITS_CHANGE_FORBIDDEN';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect on profiles;
create trigger profiles_protect before update on profiles for each row execute procedure protect_profile_role();

-- ---------- Storage ----------
insert into storage.buckets (id, name, public)
  values ('uploads','uploads',false), ('outputs','outputs',false)
  on conflict (id) do nothing;

drop policy if exists "storage own folder" on storage.objects;
create policy "storage own folder" on storage.objects for all
  using (bucket_id in ('uploads','outputs') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('uploads','outputs') and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- 최초 관리자 지정 (이메일 수정 후 실행) ----------
-- SQL Editor에서는 보호 트리거를 잠깐 꺼야 한다:
-- alter table profiles disable trigger profiles_protect;
-- update profiles set role = 'admin' where email = 'admin@example.com';
-- alter table profiles enable trigger profiles_protect;
