import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { AppearanceMode, MoveRecord, PlayerColor, ProfileStats, SavedGame, ThemeName, UserSettings } from './types';

export const defaultSettings: UserSettings = {
  theme: 'classic',
  appearance: 'dark',
  stockfishLevel: 6,
  preferredColor: 'white',
  language: 'ru',
  enableSound: true
};

type Client = Pick<SupabaseClient, 'from' | 'auth'>;
const localSettingsKey = 'supabase-chess:settings';
const localHistoryKey = 'supabase-chess:history';
const localCurrentGameKey = 'supabase-chess:current-game';

interface SaveGameInput {
  userId: string;
  status: 'completed' | 'abandoned';
  result: string | null;
  playerColor: PlayerColor;
  stockfishLevel: number;
  startedAt: string;
  endedAt: string;
  initialFen: string;
  finalFen: string;
  pgn: string;
  moves: MoveRecord[];
}

export interface LocalCurrentGame {
  pgn: string;
  fen: string;
  startedAt: string;
}

export function loadLocalSettings(): UserSettings {
  try {
    const raw = window.localStorage.getItem(localSettingsKey);
    if (!raw) {
      return defaultSettings;
    }

    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return {
      theme: parsed.theme ?? defaultSettings.theme,
      appearance: parsed.appearance ?? defaultSettings.appearance,
      stockfishLevel: parsed.stockfishLevel ?? defaultSettings.stockfishLevel,
      preferredColor: parsed.preferredColor ?? defaultSettings.preferredColor,
      language: 'ru',
      enableSound: parsed.enableSound ?? defaultSettings.enableSound
    };
  } catch {
    return defaultSettings;
  }
}

export function saveLocalSettings(settings: UserSettings) {
  window.localStorage.setItem(localSettingsKey, JSON.stringify(settings));
}

export function loadLocalHistory(): SavedGame[] {
  try {
    const raw = window.localStorage.getItem(localHistoryKey);
    return raw ? (JSON.parse(raw) as SavedGame[]) : [];
  } catch {
    return [];
  }
}

export function saveCompletedLocalGame(input: SaveGameInput) {
  const nextGame: SavedGame = {
    id: crypto.randomUUID(),
    status: input.status,
    result: input.result,
    playerColor: input.playerColor,
    stockfishLevel: input.stockfishLevel,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    initialFen: input.initialFen,
    finalFen: input.finalFen,
    pgn: input.pgn,
    moves: input.moves
  };
  const nextHistory = [nextGame, ...loadLocalHistory()].slice(0, 20);
  window.localStorage.setItem(localHistoryKey, JSON.stringify(nextHistory));
  return nextHistory;
}

export function loadLocalCurrentGame(): LocalCurrentGame | null {
  try {
    const raw = window.localStorage.getItem(localCurrentGameKey);
    return raw ? (JSON.parse(raw) as LocalCurrentGame) : null;
  } catch {
    return null;
  }
}

export function saveLocalCurrentGame(game: LocalCurrentGame) {
  window.localStorage.setItem(localCurrentGameKey, JSON.stringify(game));
}

export function clearLocalCurrentGame() {
  window.localStorage.removeItem(localCurrentGameKey);
}

function getAuthRedirectUrl() {
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  return redirectTo;
}

export async function signUpWithPassword(client: Client, email: string, password: string) {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: getAuthRedirectUrl() }
  });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signInWithPassword(client: Client, email: string, password: string) {
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw error;
  }

  return data.session;
}

export async function signOut(client: Client) {
  const { error } = await client.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function getInitialSession(client: Client): Promise<Session | null> {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }

  return data.session;
}

export function onAuthStateChange(client: Client, callback: (session: Session | null) => void) {
  const { data } = client.auth.onAuthStateChange((_event, session) => callback(session));
  return () => data.subscription.unsubscribe();
}

export async function ensureProfile(client: Client, user: User) {
  const { error } = await client.from('profiles').upsert(
    {
      id: user.id,
      display_name: user.email?.split('@')[0] ?? 'Игрок',
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  );

  if (error) {
    throw error;
  }
}

export async function loadSettings(client: Client, userId: string): Promise<UserSettings> {
  const { data, error } = await client
    .from('user_settings')
    .select('theme, appearance, stockfish_level, preferred_color, language, enable_sound')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    await saveSettings(client, userId, defaultSettings);
    return defaultSettings;
  }

  return {
    theme: data.theme as ThemeName,
    appearance: (data.appearance ?? defaultSettings.appearance) as AppearanceMode,
    stockfishLevel: data.stockfish_level,
    preferredColor: data.preferred_color as PlayerColor,
    language: 'ru',
    enableSound: data.enable_sound ?? defaultSettings.enableSound
  };
}

export async function saveSettings(client: Client, userId: string, settings: UserSettings) {
  const { error } = await client.from('user_settings').upsert(
    {
      user_id: userId,
      theme: settings.theme,
      appearance: settings.appearance,
      stockfish_level: settings.stockfishLevel,
      preferred_color: settings.preferredColor,
      language: settings.language,
      enable_sound: settings.enableSound,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw error;
  }
}

export async function saveCompletedGame(client: Client, input: SaveGameInput) {
  const { data, error } = await client
    .from('games')
    .insert({
      user_id: input.userId,
      status: input.status,
      result: input.result,
      player_color: input.playerColor,
      stockfish_level: input.stockfishLevel,
      started_at: input.startedAt,
      ended_at: input.endedAt,
      initial_fen: input.initialFen,
      final_fen: input.finalFen,
      pgn: input.pgn
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  if (input.moves.length > 0) {
    const { error: moveError } = await client.from('game_moves').insert(
      input.moves.map((move) => ({
        game_id: data.id,
        ply: move.ply,
        san: move.san,
        uci: move.uci,
        fen_after: move.fenAfter
      }))
    );

    if (moveError) {
      throw moveError;
    }
  }

  await updateProfileStats(client, input.userId, input.result);
  return data.id as string;
}

export async function loadHistory(client: Client, userId: string): Promise<SavedGame[]> {
  const { data, error } = await client
    .from('games')
    .select(
      'id, status, result, player_color, stockfish_level, started_at, ended_at, initial_fen, final_fen, pgn, game_moves(ply, san, uci, fen_after)'
    )
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('started_at', { ascending: false })
    .order('ply', { referencedTable: 'game_moves', ascending: true })
    .limit(20);

  if (error) {
    throw error;
  }

  return (data ?? []).map((game) => ({
    id: game.id,
    status: game.status,
    result: game.result,
    playerColor: game.player_color,
    stockfishLevel: game.stockfish_level,
    startedAt: game.started_at,
    endedAt: game.ended_at,
    initialFen: game.initial_fen,
    finalFen: game.final_fen,
    pgn: game.pgn,
    moves: (game.game_moves ?? []).map((move) => ({
      ply: move.ply,
      san: move.san,
      uci: move.uci,
      fenAfter: move.fen_after
    }))
  }));
}

async function updateProfileStats(client: Client, userId: string, result: string | null) {
  const { data, error } = await client
    .from('profiles')
    .select('games_played, wins, losses, draws')
    .eq('id', userId)
    .single();

  if (error) {
    throw error;
  }

  const stats = toStats(data);
  const next: ProfileStats = {
    gamesPlayed: stats.gamesPlayed + 1,
    wins: stats.wins + (result === 'win' ? 1 : 0),
    losses: stats.losses + (result === 'loss' ? 1 : 0),
    draws: stats.draws + (result === 'draw' ? 1 : 0)
  };

  const { error: updateError } = await client
    .from('profiles')
    .update({
      games_played: next.gamesPlayed,
      wins: next.wins,
      losses: next.losses,
      draws: next.draws,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (updateError) {
    throw updateError;
  }
}

function toStats(row: {
  games_played: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
}): ProfileStats {
  return {
    gamesPlayed: row.games_played ?? 0,
    wins: row.wins ?? 0,
    losses: row.losses ?? 0,
    draws: row.draws ?? 0
  };
}
