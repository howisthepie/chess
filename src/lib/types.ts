export type ThemeName = 'classic' | 'midnight' | 'garden';
export type AppearanceMode = 'dark' | 'light';
export type PlayerColor = 'white' | 'black';
export type GameStatus = 'active' | 'completed' | 'abandoned';

export interface UserSettings {
  theme: ThemeName;
  appearance: AppearanceMode;
  stockfishLevel: number;
  preferredColor: PlayerColor;
  language: 'ru';
  enableSound: boolean;
}

export interface MoveRecord {
  ply: number;
  san: string;
  uci: string;
  fenAfter: string;
}

export interface SavedGame {
  id: string;
  status: GameStatus;
  result: string | null;
  playerColor: PlayerColor;
  stockfishLevel: number;
  startedAt: string;
  endedAt: string | null;
  initialFen: string;
  finalFen: string | null;
  pgn: string | null;
  moves?: MoveRecord[];
}

export interface ProfileStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
}
