-- 실습 제작실(사진→영상) + 사용자 확인 대기 상태
-- 0001_init.sql, 0002_banana.sql 다음에 실행

alter table jobs drop constraint if exists jobs_type_check;
alter table jobs add constraint jobs_type_check
  check (type in ('document','newsletter','cardnews','promo_video','music_video','practice'));

alter table jobs drop constraint if exists jobs_status_check;
alter table jobs add constraint jobs_status_check
  check (status in ('queued','running','waiting','succeeded','failed'));

-- Seedance 동시 실행 게이트가 빠르게 세도록
create index if not exists jobs_step_status on jobs (step, status);
