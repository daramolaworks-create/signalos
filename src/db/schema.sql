create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_chat_id text,
  x_user_id text,
  created_at timestamptz not null default now()
);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  platform text not null default 'x',
  type text not null default 'post',
  content text not null,
  status text not null default 'draft' check (status in ('draft','approved','scheduled','rejected','posted','failed')),
  x_post_id text null,
  risk_score numeric not null default 0,
  scheduled_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  approved_at timestamptz null,
  posted_at timestamptz null
);

alter table posts add column if not exists scheduled_at timestamptz null;
alter table posts add column if not exists last_error text null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'posts_status_check'
      and conrelid = 'posts'::regclass
  ) then
    alter table posts drop constraint posts_status_check;
  end if;

  alter table posts
    add constraint posts_status_check
    check (status in ('draft','approved','scheduled','rejected','posted','failed'));
end $$;

create table if not exists voice_examples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists performance_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  impressions integer not null default 0,
  likes integer not null default 0,
  replies integer not null default 0,
  reposts integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists approval_logs (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  decision text not null,
  source text not null default 'telegram',
  created_at timestamptz not null default now()
);

create table if not exists agent_settings (
  user_id uuid primary key references users(id) on delete cascade,
  persona_name text not null default 'Sharp Systems Thinker',
  persona_description text not null default 'Compressed, high-signal, philosophical, direct. Inspired by systems thinkers, but original.',
  style_rules text not null default 'No emojis. No hashtags. No fluff. No generic motivation. No marketing-only posts. Each post must contain a non-obvious insight.',
  topics text[] not null default array[
    'leverage',
    'incentives',
    'wealth',
    'power',
    'technology',
    'systems',
    'decision-making',
    'capital',
    'human behaviour'
  ],
  daily_post_count integer not null default 10 check (daily_post_count between 1 and 25),
  posting_interval_minutes integer not null default 90 check (posting_interval_minutes between 1 and 1440),
  schedule_cron text not null default '0 9 * * *',
  timezone text not null default 'Europe/London',
  risk_threshold numeric not null default 0.7 check (risk_threshold >= 0 and risk_threshold <= 1),
  updated_at timestamptz not null default now()
);

alter table agent_settings add column if not exists posting_interval_minutes integer not null default 90;

create index if not exists posts_user_id_idx on posts(user_id);
create index if not exists posts_status_idx on posts(status);
create index if not exists posts_scheduled_at_idx on posts(scheduled_at);
create index if not exists approval_logs_post_id_idx on approval_logs(post_id);
create index if not exists performance_metrics_post_id_idx on performance_metrics(post_id);

-- pgvector-ready placeholder for future semantic voice/profile memory.
-- alter table voice_examples add column if not exists embedding vector(1536);
