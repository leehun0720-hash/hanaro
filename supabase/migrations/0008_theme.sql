-- 0008: 사이트 색 테마 (관리자 브랜딩에서 선택: green·navy·purple·red·pink)
alter table site_settings add column if not exists theme text not null default 'green';
