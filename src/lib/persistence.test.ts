import { describe, expect, it, vi } from 'vitest';
import { defaultSettings, loadSettings, saveCompletedGame } from './persistence';

function queryResult(data: unknown, error: unknown = null) {
  return Promise.resolve({ data, error });
}

describe('persistence helpers', () => {
  it('creates default settings when none exist', async () => {
    const upsert = vi.fn(() => queryResult(null));
    const maybeSingle = vi.fn(() => queryResult(null));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select, upsert }));

    const settings = await loadSettings({ from } as never, 'user-1');

    expect(settings).toEqual(defaultSettings);
    expect(from).toHaveBeenCalledWith('user_settings');
    expect(upsert).toHaveBeenCalled();
  });

  it('saves a completed game with move rows and updates stats', async () => {
    const single = vi.fn(() => queryResult({ id: 'game-1' }));
    const gameSelect = vi.fn(() => ({ single }));
    const gameInsert = vi.fn(() => ({ select: gameSelect }));
    const movesInsert = vi.fn(() => queryResult(null));
    const profileSingle = vi.fn(() => queryResult({ games_played: 1, wins: 0, losses: 0, draws: 0 }));
    const profileEqForSelect = vi.fn(() => ({ single: profileSingle }));
    const profileSelect = vi.fn(() => ({ eq: profileEqForSelect }));
    const profileEqForUpdate = vi.fn(() => queryResult(null));
    const profileUpdate = vi.fn(() => ({ eq: profileEqForUpdate }));
    const from = vi.fn((table: string) => {
      if (table === 'games') {
        return { insert: gameInsert };
      }
      if (table === 'game_moves') {
        return { insert: movesInsert };
      }
      return { select: profileSelect, update: profileUpdate };
    });

    await saveCompletedGame(
      { from } as never,
      {
        userId: 'user-1',
        status: 'completed',
        result: 'win',
        playerColor: 'white',
        stockfishLevel: 5,
        startedAt: '2026-04-26T00:00:00.000Z',
        endedAt: '2026-04-26T00:10:00.000Z',
        initialFen: 'start',
        finalFen: 'final',
        pgn: '1. e4 e5',
        moves: [{ ply: 1, san: 'e4', uci: 'e2e4', fenAfter: 'fen' }]
      }
    );

    expect(gameInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-1', result: 'win' }));
    expect(movesInsert).toHaveBeenCalledWith([expect.objectContaining({ game_id: 'game-1', ply: 1 })]);
    expect(profileUpdate).toHaveBeenCalledWith(expect.objectContaining({ games_played: 2, wins: 1 }));
  });
});
