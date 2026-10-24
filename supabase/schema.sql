create extension if not exists pgcrypto;

create table if not exists public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('youtube', 'tiktok')),
  video_url text not null,
  title text not null,
  caption text not null default '',
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'processing', 'published', 'failed', 'cancelled')),
  external_id text,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  published_at timestamptz
);

create index if not exists scheduled_posts_due_idx
  on public.scheduled_posts (status, scheduled_at);

create index if not exists scheduled_posts_platform_idx
  on public.scheduled_posts (platform, status, scheduled_at);

create unique index if not exists scheduled_posts_no_duplicates
  on public.scheduled_posts (platform, md5(video_url))
  where status in ('scheduled', 'processing', 'published');

create table if not exists public.platform_tokens (
  platform text primary key,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz,
  account_label text,
  needs_reauth boolean not null default false,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.platform_tokens add column if not exists scopes text;
alter table public.platform_tokens add column if not exists access_token text;
alter table public.scheduled_posts add column if not exists note text;
alter table public.scheduled_posts add column if not exists clip_key text;
create index if not exists scheduled_posts_clip_key_idx on public.scheduled_posts (clip_key) where clip_key is not null;
alter table public.scheduled_posts add column if not exists attempts integer not null default 0;
alter table public.platform_tokens add column if not exists expires_at timestamptz;
alter table public.platform_tokens add column if not exists account_label text;
alter table public.platform_tokens add column if not exists needs_reauth boolean not null default false;
alter table public.platform_tokens add column if not exists connected_at timestamptz not null default now();

alter table public.scheduled_posts enable row level security;
alter table public.platform_tokens enable row level security;
