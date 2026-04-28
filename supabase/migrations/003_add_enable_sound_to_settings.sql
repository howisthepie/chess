alter table public.user_settings
  add column if not exists enable_sound boolean not null default true;
