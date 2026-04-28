create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'classic' check (theme in ('classic', 'midnight', 'garden')),
  stockfish_level integer not null default 6 check (stockfish_level between 1 and 10),
  preferred_color text not null default 'white' check (preferred_color in ('white', 'black')),
  language text not null default 'ru' check (language = 'ru'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('active', 'completed', 'abandoned')),
  result text check (result in ('win', 'loss', 'draw', 'completed')),
  player_color text not null check (player_color in ('white', 'black')),
  stockfish_level integer not null check (stockfish_level between 1 and 10),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  initial_fen text not null,
  final_fen text,
  pgn text,
  created_at timestamptz not null default now()
);

create table public.game_moves (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  ply integer not null check (ply > 0),
  san text not null,
  uci text not null,
  fen_after text not null,
  created_at timestamptz not null default now(),
  unique (game_id, ply)
);

create index profiles_updated_at_idx on public.profiles (updated_at desc);
create index user_settings_user_id_idx on public.user_settings (user_id);
create index games_user_started_idx on public.games (user_id, started_at desc);
create index games_user_status_started_idx on public.games (user_id, status, started_at desc);
create index game_moves_game_id_idx on public.game_moves (game_id);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.games enable row level security;
alter table public.game_moves enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "settings_all_own"
  on public.user_settings for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "games_all_own"
  on public.games for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "moves_select_own_game"
  on public.game_moves for select
  to authenticated
  using (
    exists (
      select 1
      from public.games
      where games.id = game_moves.game_id
        and games.user_id = (select auth.uid())
    )
  );

create policy "moves_insert_own_game"
  on public.game_moves for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.games
      where games.id = game_moves.game_id
        and games.user_id = (select auth.uid())
    )
  );

create policy "moves_update_own_game"
  on public.game_moves for update
  to authenticated
  using (
    exists (
      select 1
      from public.games
      where games.id = game_moves.game_id
        and games.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.games
      where games.id = game_moves.game_id
        and games.user_id = (select auth.uid())
    )
  );

create policy "moves_delete_own_game"
  on public.game_moves for delete
  to authenticated
  using (
    exists (
      select 1
      from public.games
      where games.id = game_moves.game_id
        and games.user_id = (select auth.uid())
    )
  );
