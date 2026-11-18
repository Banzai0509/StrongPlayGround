-- 강한 놀이터: Supabase 초기 설정 (SQL Editor에 통째로 붙여 넣고 Run)
-- 여러 번 실행해도 안전합니다.

-- 1) 기록판 테이블 ---------------------------------------------------
create table if not exists public.records (
  id      uuid primary key,                                   -- 익명 로그인 사용자 id (auth.uid())
  n       text   not null check (char_length(n) between 1 and 12),   -- 닉네임
  k       int    not null default 0 check (k between 0 and 5),       -- 캐릭터
  c       int    not null default 0 check (c between 0 and 5),       -- 옷 색깔
  best    jsonb  not null default '{"air":0,"globe":0,"mb":0}'::jsonb,
  streak  int    not null default 0 check (streak between 0 and 3650),
  last    text   not null default '' check (char_length(last) <= 10),
  done    int    not null default 0 check (done between 0 and 3650),
  t       bigint not null default 0,                           -- 마지막 갱신 시각(ms)
  -- 말도 안 되는 기록은 서버에서 거절 (체공 8초, 지구본 220km/h, 구름다리 2.5초 미만)
  constraint best_sane check (
    coalesce((best->>'air')::numeric,   0) between 0 and 8
    and coalesce((best->>'globe')::numeric, 0) between 0 and 220
    and (coalesce((best->>'mb')::numeric, 0) = 0 or (best->>'mb')::numeric >= 2.5)
  )
);

-- 2) 보안 규칙(RLS): 누구나 읽기, 쓰기는 본인 행만 ----------------------
alter table public.records enable row level security;

drop policy if exists "records_read_all"   on public.records;
drop policy if exists "records_insert_own" on public.records;
drop policy if exists "records_update_own" on public.records;

create policy "records_read_all"   on public.records for select to anon, authenticated using (true);
create policy "records_insert_own" on public.records for insert to authenticated with check (auth.uid() = id);
create policy "records_update_own" on public.records for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
-- delete 정책은 일부러 없음: 이상한 닉네임은 Table Editor에서 관리자가 직접 지웁니다.

-- 3) 기록판 실시간 갱신 ---------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null;
end $$;
