-- Planned schema for Saudi-hosted Sanabil live classes.
-- Does not activate video, generate public admission links, or write any daily outcomes.
-- Admission/authentication functions will be added after provisioning the Saudi media gateway.
create table if not exists public.circle_video_rooms (
 id uuid primary key default extensions.gen_random_uuid(),
 circle_id text not null unique references public.circles(id) on delete restrict,
 room_slug uuid not null unique default extensions.gen_random_uuid(),
 enabled boolean not null default false,
 requires_approval boolean not null default true,
 allow_recording boolean not null default false,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.circle_video_sessions (
 id uuid primary key default extensions.gen_random_uuid(),
 room_id uuid not null references public.circle_video_rooms(id) on delete restrict,
 circle_id text not null references public.circles(id) on delete restrict,
 teacher_user_id uuid not null references auth.users(id) on delete restrict,
 status text not null check(status in ('starting','live','ended','cancelled')),
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 created_at timestamptz not null default now(),
 constraint session_ended_consistent check (
   (status in ('starting','live') and ended_at is null) or
   (status in ('ended','cancelled') and ended_at is not null)
 )
);
create unique index if not exists circle_video_one_active_session
 on public.circle_video_sessions(room_id) where status in ('starting','live');
create index if not exists circle_video_session_circle_date
 on public.circle_video_sessions(circle_id,started_at desc);
create table if not exists public.circle_video_join_requests (
 id uuid primary key default extensions.gen_random_uuid(),
 session_id uuid not null references public.circle_video_sessions(id) on delete restrict,
 student_id text not null references public.students(id) on delete restrict,
 status text not null default 'requested' check(status in ('requested','approved','denied','left')),
 requested_at timestamptz not null default now(),
 decided_at timestamptz,
 decided_by uuid references auth.users(id) on delete set null,
 unique(session_id,student_id),
 constraint reviewed_join_request_consistent check (
   (status='requested' and decided_at is null) or
   (status<>'requested')
 )
);
create index if not exists circle_video_join_queue
 on public.circle_video_join_requests(session_id,status,requested_at);

-- Access only through future carefully audited SECURITY DEFINER RPCs.
-- Until verified student identity and Saudi gateway are live, clients cannot
-- select/insert/update/delete these tables directly.
alter table public.circle_video_rooms enable row level security;
alter table public.circle_video_sessions enable row level security;
alter table public.circle_video_join_requests enable row level security;
revoke all on public.circle_video_rooms from public,anon,authenticated;
revoke all on public.circle_video_sessions from public,anon,authenticated;
revoke all on public.circle_video_join_requests from public,anon,authenticated;
