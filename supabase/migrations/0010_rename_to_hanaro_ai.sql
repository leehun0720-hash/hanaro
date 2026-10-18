-- 0010: 사이트 이름을 '하나로ai'로 변경
-- 0007에서 만든 site_settings 1행의 name이 아직 이전 기본값일 때만 바꾼다.
-- (관리자 화면에서 이미 직접 지정한 이름은 건드리지 않음)
alter table site_settings alter column name set default '하나로ai';

update site_settings
   set name = '하나로ai',
       updated_at = now()
 where id = 1
   and name in ('runiq space', '');
