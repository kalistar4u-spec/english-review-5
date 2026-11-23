-- English Review 5 — Supabase 스키마와 보안 규칙(RLS)
-- Supabase 대시보드 > SQL Editor에 전체를 붙여 넣고 Run 합니다. 여러 번 실행해도 안전합니다.
--
-- 원칙
--   * 학생(로그인 없음, anon): 학습 기록을 "추가"만 할 수 있고, 아무 기록도 읽을 수 없음
--   * 교사(이메일 로그인, authenticated): 자기가 만든 학급과 그 학급의 기록만 읽을 수 있음
--   * 학생 실명은 저장하지 않음(학급 코드 + 번호만)

-- 1) 학급
create table if not exists public.classes (
  code        text primary key check (code ~ '^[A-Z0-9]{4,12}$'),
  teacher_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text check (char_length(name) <= 40),
  created_at  timestamptz not null default now()
);

-- 2) 학습 기록(문항 하나 = 한 줄)
create table if not exists public.attempts (
  id          bigint generated always as identity primary key,
  class_code  text not null references public.classes (code) on delete cascade,
  student_no  int  not null check (student_no between 1 and 60),
  unit        int  not null check (unit between 7 and 11),
  skill       text not null check (skill in ('listen', 'speak', 'read', 'write', 'diagnose')),
  level       text check (level in ('basic', 'core', 'challenge')),
  item_id     text not null check (char_length(item_id) <= 80),
  correct     boolean,
  answer      text check (char_length(answer) <= 300),
  self_rating text check (self_rating in ('know', 'some', 'hard')),
  created_at  timestamptz not null default now()
);
create index if not exists attempts_class_student_idx on public.attempts (class_code, student_no, created_at);

-- 3) 권한: 기본 권한을 모두 거두고 필요한 것만 줌
revoke all on public.classes  from anon, authenticated;
revoke all on public.attempts from anon, authenticated;
grant select, insert, delete on public.classes  to authenticated;
grant insert                 on public.attempts to anon, authenticated;
grant select                 on public.attempts to authenticated;

alter table public.classes  enable row level security;
alter table public.attempts enable row level security;

-- 4) 교사: 자기 학급만
drop policy if exists "teacher reads own classes"   on public.classes;
drop policy if exists "teacher creates own classes" on public.classes;
drop policy if exists "teacher deletes own classes" on public.classes;
create policy "teacher reads own classes"   on public.classes for select to authenticated using (teacher_id = auth.uid());
create policy "teacher creates own classes" on public.classes for insert to authenticated with check (teacher_id = auth.uid());
create policy "teacher deletes own classes" on public.classes for delete to authenticated using (teacher_id = auth.uid());

-- 5) 학습 기록: 누구나 추가(없는 학급 코드는 외래키로 거부), 읽기는 그 학급 교사만
drop policy if exists "anyone adds attempts"            on public.attempts;
drop policy if exists "teacher reads own class attempts" on public.attempts;
create policy "anyone adds attempts" on public.attempts for insert to anon, authenticated with check (true);
create policy "teacher reads own class attempts" on public.attempts for select to authenticated
  using (exists (select 1 from public.classes c where c.code = attempts.class_code and c.teacher_id = auth.uid()));

-- 6) 학생 입장 화면에서 학급 코드가 맞는지만 확인(학급 목록은 보여 주지 않음)
create or replace function public.class_exists(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.classes where code = upper(p_code));
$$;
revoke all on function public.class_exists(text) from public;
grant execute on function public.class_exists(text) to anon, authenticated;
