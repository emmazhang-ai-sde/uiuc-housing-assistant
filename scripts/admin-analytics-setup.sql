-- admin-analytics-setup.sql
--
-- All the Supabase SQL behind the admin activity dashboard, the Rate & Report
-- feedback feature, and the test-account split. Run in the Supabase SQL Editor.
-- Each block is idempotent (safe to re-run). Ordering doesn't matter between
-- top-level sections, but run a section top-to-bottom.
--
-- Context: service_role is the key used by the Next.js admin API routes
-- (lib/supabase/admin.ts). It bypasses RLS but still needs table-level grants.
-- The founder's test emails live in ADMIN_EMAIL (comma-separated) and are
-- filtered out of every metric in code; keeping them out of the waitlist here
-- keeps the waitlist counts clean too.


-- ============================================================================
-- 1. Activity events  (powers /admin/activity)
-- ============================================================================

create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_user_id_idx    on public.events(user_id);
create index if not exists events_created_at_idx  on public.events(created_at desc);

alter table public.events enable row level security;

-- Users may only write events attributed to themselves; nobody reads via the
-- anon/authenticated roles (the dashboard reads through service_role).
drop policy if exists "Users can insert their own events" on public.events;
create policy "Users can insert their own events"
  on public.events for insert to authenticated
  with check (user_id = auth.uid());

revoke all on public.events from anon, authenticated;
grant insert on public.events to authenticated;
grant select on public.events to service_role;

-- View that joins the email in, for the dashboard.
create or replace view public.events_with_email as
select e.id, e.user_id, u.email, e.event_type, e.metadata, e.created_at
from public.events e
join auth.users u on u.id = e.user_id;

revoke all on public.events_with_email from anon, authenticated;
grant select on public.events_with_email to service_role;


-- ============================================================================
-- 2. Feedback  (powers /feedback and /admin/feedback)
-- ============================================================================

create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int check (rating between 1 and 5),
  message text,
  image_path text,
  created_at timestamptz not null default now()
);

alter table public.feedback enable row level security;

drop policy if exists "Users can insert their own feedback" on public.feedback;
create policy "Users can insert their own feedback"
  on public.feedback for insert to authenticated
  with check (user_id = auth.uid());

revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to authenticated;
grant select on public.feedback to service_role;

create or replace view public.feedback_with_email as
select f.id, f.user_id, u.email, f.rating, f.message, f.image_path, f.created_at
from public.feedback f
join auth.users u on u.id = f.user_id;

revoke all on public.feedback_with_email from anon, authenticated;
grant select on public.feedback_with_email to service_role;

-- Private bucket for screenshots. Uploads go through service_role in the API
-- route, so no storage RLS policies are needed; the admin route reads them
-- back via short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('feedback', 'feedback', false)
on conflict (id) do nothing;


-- ============================================================================
-- 3. Test accounts split  (registration = waitlist OR test)
-- ============================================================================

-- The founder's internal test emails, kept out of the real waitlist so they
-- don't inflate waitlist counts or conversion.
create table if not exists public.test (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.test enable row level security;
revoke all on public.test from anon, authenticated;

insert into public.test (email) values
  ('sz94@illinois.edu'),
  ('shuyangzhang.cs@gmail.com'),
  ('shuyangzhang.life@gmail.com')
on conflict (email) do nothing;

delete from public.waitlist
where lower(email) in (
  'sz94@illinois.edu',
  'shuyangzhang.cs@gmail.com',
  'shuyangzhang.life@gmail.com'
);

-- Login gate (called from the frontend by name — keep the name). Returns true
-- if the email is on the waitlist OR in the test table.
create or replace function public.is_email_on_waitlist(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.waitlist where lower(email) = lower(trim(p_email)))
      or exists (select 1 from public.test     where lower(email) = lower(trim(p_email)));
$$;

revoke all on function public.is_email_on_waitlist(text) from public;
grant execute on function public.is_email_on_waitlist(text) to anon, authenticated;

-- Server-side "Before User Created" hook — same union gate.
create or replace function public.restrict_signup_to_waitlist(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare addr text := lower(event->'user'->>'email');
begin
  if not exists (select 1 from public.waitlist where lower(email) = addr)
     and not exists (select 1 from public.test where lower(email) = addr) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This email is not on the beta waitlist.'
      )
    );
  end if;
  return event;
end;
$$;


-- ============================================================================
-- 4. Waitlist read grant  (for the "Waitlist conversion" metric)
-- ============================================================================

-- The dashboard counts waitlist signups through service_role. Without this the
-- card shows a dash.
grant select on public.waitlist to service_role;
