import { describe, expect, it } from 'vitest';
import { applyMove, applyUciMove, createGame, getGameResult, getLegalTargets, toMoveRecords } from './chess';

describe('chess helpers', () => {
  it('returns legal targets for a selected piece', () => {
    const game = createGame();

    expect(getLegalTargets(game, 'e2')).toEqual(expect.arrayContaining(['e3', 'e4']));
  });

  it('applies normal and UCI moves and records PGN data', () => {
    const game = createGame();

    expect(applyMove(game, 'e2', 'e4')?.san).toBe('e4');
    expect(applyUciMove(game, 'e7e5')?.san).toBe('e5');

    expect(toMoveRecords(game)).toMatchObject([
      { ply: 1, san: 'e4', uci: 'e2e4' },
      { ply: 2, san: 'e5', uci: 'e7e5' }
    ]);
  });

  it('detects a player win after checkmate', () => {
    const game = createGame();
    applyMove(game, 'f2', 'f3');
    applyMove(game, 'e7', 'e5');
    applyMove(game, 'g2', 'g4');
    applyMove(game, 'd8', 'h4');

    expect(game.isCheckmate()).toBe(true);
    expect(getGameResult(game, 'black')).toBe('win');
    expect(getGameResult(game, 'white')).toBe('loss');
  });
});
