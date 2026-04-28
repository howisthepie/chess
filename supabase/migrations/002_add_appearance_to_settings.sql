alter table public.user_settings
  add column if not exists appearance text not null default 'dark'
  check (appearance in ('dark', 'light'));
