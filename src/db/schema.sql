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
  status text not null default 'draft' check (status in ('draft', 'approved', 'rejected', 'posted', 'failed')),
  x_post_id text null,
  risk_score numeric not null default 0,
  created_at timestamptz not null default now(),
  approved_at timestamptz null,
  posted_at timestamptz null
);

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

create index if not exists posts_user_id_idx on posts(user_id);
create index if not exists posts_status_idx on posts(status);
create index if not exists approval_logs_post_id_idx on approval_logs(post_id);
create index if not exists performance_metrics_post_id_idx on performance_metrics(post_id);

-- pgvector-ready placeholder for future semantic voice/profile memory.
-- alter table voice_examples add column if not exists embedding vector(1536);
