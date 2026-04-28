import { Chess, type Move, type Square } from 'chess.js';
import type { MoveRecord, PlayerColor } from './types';

export const INITIAL_FEN = new Chess().fen();

export function createGame(fen?: string) {
  return fen ? new Chess(fen) : new Chess();
}

export function getLegalTargets(game: Chess, from: Square) {
  return game.moves({ square: from, verbose: true }).map((move) => move.to);
}

export function applyMove(game: Chess, from: Square, to: Square): Move | null {
  try {
    return game.move({ from, to, promotion: 'q' });
  } catch {
    return null;
  }
}

export function applyUciMove(game: Chess, uci: string): Move | null {
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  const promotion = uci.slice(4, 5) || 'q';

  try {
    return game.move({ from, to, promotion });
  } catch {
    return null;
  }
}

export function toMoveRecords(game: Chess): MoveRecord[] {
  const replay = new Chess();

  return game.history({ verbose: true }).map((move, index) => {
    replay.move(move);
    return {
      ply: index + 1,
      san: move.san,
      uci: `${move.from}${move.to}${move.promotion ?? ''}`,
      fenAfter: replay.fen()
    };
  });
}

export function getGameResult(game: Chess, playerColor: PlayerColor): string | null {
  if (!game.isGameOver()) {
    return null;
  }

  if (game.isDraw()) {
    return 'draw';
  }

  if (game.isCheckmate()) {
    const sideToMove = game.turn() === 'w' ? 'white' : 'black';
    const winner = sideToMove === 'white' ? 'black' : 'white';
    return winner === playerColor ? 'win' : 'loss';
  }

  return 'completed';
}

export function getStatusText(game: Chess, playerColor: PlayerColor) {
  if (game.isCheckmate()) {
    return getGameResult(game, playerColor) === 'win' ? 'Мат. Вы победили.' : 'Мат. Победил Stockfish.';
  }

  if (game.isDraw()) {
    return 'Ничья.';
  }

  if (game.isCheck()) {
    return 'Шах.';
  }

  return game.turn() === 'w' ? 'Ход белых.' : 'Ход черных.';
}

export function getGameOverReason(game: Chess) {
  if (game.isCheckmate()) return 'Мат';
  if (game.isStalemate()) return 'Пат';
  if (game.isThreefoldRepetition()) return 'Троекратное повторение';
  if (game.isInsufficientMaterial()) return 'Недостаточно материала';
  if (game.isDraw()) return 'Ничья';
  return 'Игра завершена';
}
