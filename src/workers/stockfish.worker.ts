import { Chess } from 'chess.js';
import engineScriptUrl from 'stockfish/bin/stockfish-18-lite-single.js?url';
import engineWasmUrl from 'stockfish/bin/stockfish-18-lite-single.wasm?url';

type WorkerRequest = {
  id: string;
  fen: string;
  level: number;
};

type WorkerResponse =
  | { id: string; type: 'bestmove'; move: string }
  | { id: string; type: 'error'; message: string };

let engine: Worker | null = null;
let activeId: string | null = null;

function emit(message: WorkerResponse) {
  self.postMessage(message);
}

function ensureEngine() {
  if (engine) {
    return engine;
  }

  engine = new Worker(`${engineScriptUrl}#${encodeURIComponent(engineWasmUrl)}`);
  engine.onmessage = (event: MessageEvent<string>) => {
    const line = event.data ?? '';
    const match = line.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/);
    if (match && activeId) {
      emit({ id: activeId, type: 'bestmove', move: match[1] });
      activeId = null;
    }
  };
  engine.postMessage('uci');
  engine.postMessage('isready');
  return engine;
}

function fallbackMove(fen: string) {
  const game = new Chess(fen);
  const moves = game.moves({ verbose: true });
  const captures = moves.filter((move) => move.captured);
  const candidates = captures.length > 0 ? captures : moves;
  const move = candidates[Math.floor(Math.random() * candidates.length)];
  return move ? `${move.from}${move.to}${move.promotion ?? ''}` : '';
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, fen, level } = event.data;

  try {
    activeId = id;
    const skillLevel = Math.max(0, Math.min(20, Math.round(level * 2)));
    const depth = Math.max(3, Math.min(14, Math.round(level + 3)));
    const stockfish = ensureEngine();

    stockfish.postMessage('ucinewgame');
    stockfish.postMessage(`setoption name Skill Level value ${skillLevel}`);
    stockfish.postMessage(`position fen ${fen}`);
    stockfish.postMessage(`go depth ${depth}`);
  } catch (error) {
    const move = fallbackMove(fen);
    if (move) {
      emit({ id, type: 'bestmove', move });
      return;
    }

    emit({ id, type: 'error', message: error instanceof Error ? error.message : 'AI недоступен' });
  }
};
