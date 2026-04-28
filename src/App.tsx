import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Chess, Square } from 'chess.js';
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  History,
  LogIn,
  LogOut,
  Moon,
  Palette,
  Radio,
  RotateCcw,
  Save,
  Settings,
  Sun,
  UserRound,
  Volume2,
  VolumeX
} from 'lucide-react';
import {
  applyMove,
  applyUciMove,
  createGame,
  getGameOverReason,
  getGameResult,
  getLegalTargets,
  getStatusText,
  INITIAL_FEN,
  toMoveRecords
} from './lib/chess';
import {
  clearLocalCurrentGame,
  ensureProfile,
  getInitialSession,
  loadLocalCurrentGame,
  loadHistory,
  loadLocalHistory,
  loadLocalSettings,
  loadSettings,
  onAuthStateChange,
  saveCompletedGame,
  saveCompletedLocalGame,
  saveLocalCurrentGame,
  saveLocalSettings,
  saveSettings,
  signInWithPassword,
  signOut,
  signUpWithPassword
} from './lib/persistence';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import type { PlayerColor, SavedGame, ThemeName, UserSettings } from './lib/types';

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const pieceGlyphs: Record<string, string> = {
  wp: '♟',
  wn: '♞',
  wb: '♝',
  wr: '♜',
  wq: '♛',
  wk: '♚',
  bp: '♟',
  bn: '♞',
  bb: '♝',
  br: '♜',
  bq: '♛',
  bk: '♚'
};

const themes: Array<{ id: ThemeName; label: string }> = [
  { id: 'classic', label: 'Классика' },
  { id: 'midnight', label: 'Ночь' },
  { id: 'garden', label: 'Сад' }
];

const appearances = [
  { id: 'dark', label: 'Темная', Icon: Moon },
  { id: 'light', label: 'Белая', Icon: Sun }
] as const;

const localModeKey = 'supabase-chess:local-mode';

type WorkerMessage = { id: string; type: 'bestmove'; move: string } | { id: string; type: 'error'; message: string };
type PendingAiMove = {
  fen: string;
  resolve: (move: string) => void;
};
type AuthMode = 'sign-in' | 'sign-up';
type AppView = 'game' | 'settings' | 'history';

export function App() {
  const [game, setGame] = useState(() => createInitialLocalGame());
  const [startedAt, setStartedAt] = useState(() => loadLocalCurrentGame()?.startedAt ?? new Date().toISOString());
  const [settings, setSettings] = useState<UserSettings>(() => loadLocalSettings());
  const [session, setSession] = useState<Session | null>(null);
  const [history, setHistory] = useState<SavedGame[]>(() => loadLocalHistory());
  const [localMode, setLocalMode] = useState(() => window.localStorage.getItem(localModeKey) === 'true');
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<string[]>([]);
  const [replayPly, setReplayPly] = useState<number | null>(null);
  const [dragFromSquare, setDragFromSquare] = useState<Square | null>(null);
  const [dragOverSquare, setDragOverSquare] = useState<Square | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [authLoading, setAuthLoading] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('game');
  const [notice, setNotice] = useState('');
  const [savedFinalFen, setSavedFinalFen] = useState<string | null>(null);
  const [activeReplay, setActiveReplay] = useState<SavedGame | null>(null);
  const [showGameOverModal, setShowGameOverModal] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const pendingAiRef = useRef<Map<string, PendingAiMove>>(new Map());

  const user = session?.user ?? null;
  const playerTurn = (settings.preferredColor === 'white' && game.turn() === 'w') || (settings.preferredColor === 'black' && game.turn() === 'b');
  const statusText = getStatusText(game, settings.preferredColor);
  const moveRecords = useMemo(() => toMoveRecords(game), [game]);
  const totalPlies = moveRecords.length;
  const isReplayMode = replayPly !== null;
  const replayFen = useMemo(() => {
    if (!isReplayMode) {
      return null;
    }
    if (replayPly === 0) {
      return INITIAL_FEN;
    }
    return moveRecords[replayPly - 1]?.fenAfter ?? game.fen();
  }, [game, isReplayMode, moveRecords, replayPly]);
  const displayedGame = useMemo(() => createGame(replayFen ?? game.fen()), [game, replayFen]);
  const boardSquares = useMemo(() => getBoardSquares(settings.preferredColor), [settings.preferredColor]);
  const canInteractBoard = !isReplayMode && !game.isGameOver() && playerTurn && !aiThinking;
  const checkSquare = useMemo(() => {
    if (!displayedGame.isCheck()) return null;
    const turn = displayedGame.turn();
    const board = displayedGame.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece && piece.type === 'k' && piece.color === turn) {
          return `${files[c]}${8 - r}` as Square;
        }
      }
    }
    return null;
  }, [displayedGame]);
  const clearSelection = useCallback(() => {
    setSelectedSquare(null);
    setLegalTargets([]);
    setDragFromSquare(null);
    setDragOverSquare(null);
  }, []);

  const playSound = useCallback((soundName: string) => {
    if (!settings.enableSound) return;
    const audio = new Audio(`/sounds/${soundName}.mp3`);
    audio.play().catch(() => {});
  }, [settings.enableSound]);

  const handleMoveSound = useCallback((g: Chess, move: { flags: string }) => {
    if (g.isCheckmate() || g.isDraw()) {
      const result = getGameResult(g, settings.preferredColor);
      if (result === 'win') playSound('victory');
      else if (result === 'loss') playSound('defeat');
      else playSound('draw');
    } else if (g.isCheck()) {
      playSound('check');
    } else if (move.flags.includes('p')) {
      playSound('promote');
    } else if (move.flags.includes('k') || move.flags.includes('q')) {
      playSound('castle');
    } else if (move.flags.includes('c') || move.flags.includes('e')) {
      playSound('capture');
    } else {
      playSound('move');
    }
  }, [playSound, settings.preferredColor]);

  const requestAiMove = useCallback((fen: string, level: number) => {
    if (!workerRef.current) {
      return Promise.resolve(getFallbackMove(fen));
    }

    return new Promise<string>((resolve) => {
      const id = crypto.randomUUID();
      pendingAiRef.current.set(id, { fen, resolve });
      workerRef.current?.postMessage({ id, fen, level });
      window.setTimeout(() => {
        const pending = pendingAiRef.current.get(id);
        if (pending) {
          pendingAiRef.current.delete(id);
          resolve(getFallbackMove(fen));
        }
      }, 1400);
    });
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.appearance = settings.appearance;
  }, [settings.appearance, settings.theme]);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    getInitialSession(supabase).then(setSession).catch((error) => setNotice(error.message));
    return onAuthStateChange(supabase, setSession);
  }, []);

  useEffect(() => {
    if (!supabase || !user) {
      setHistory(loadLocalHistory());
      setSettings(loadLocalSettings());
      return;
    }

    let cancelled = false;

    async function syncUser() {
      try {
        await ensureProfile(supabase!, user!);
        
        // Load settings and history separately to handle individual failures
        try {
          const remoteSettings = await loadSettings(supabase!, user!.id);
          if (!cancelled) setSettings(remoteSettings);
        } catch (error) {
          console.warn('Failed to load remote settings, using local:', error);
          // Don't set notice here to avoid bothering the user with sync errors if local works
        }

        try {
          const remoteHistory = await loadHistory(supabase!, user!.id);
          if (!cancelled) setHistory(remoteHistory);
        } catch (error) {
          console.warn('Failed to load remote history:', error);
          if (!cancelled) setNotice('Не удалось загрузить историю из облака.');
        }
      } catch (error) {
        if (!cancelled) {
          setNotice(error instanceof Error ? error.message : 'Не удалось синхронизировать профиль');
        }
      }
    }

    syncUser();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    try {
      workerRef.current = new Worker(new URL('./workers/stockfish.worker.ts', import.meta.url), { type: 'module' });
      workerRef.current.onmessage = (event: MessageEvent<WorkerMessage>) => {
        const pending = pendingAiRef.current.get(event.data.id);
        if (!pending) {
          return;
        }

        pendingAiRef.current.delete(event.data.id);
        pending.resolve(event.data.type === 'bestmove' && event.data.move ? event.data.move : getFallbackMove(pending.fen));
      };
      workerRef.current.onerror = () => {
        for (const [id, pending] of pendingAiRef.current) {
          pendingAiRef.current.delete(id);
          pending.resolve(getFallbackMove(pending.fen));
        }
        workerRef.current?.terminate();
        workerRef.current = null;
      };
    } catch {
      workerRef.current = null;
    }

    return () => workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    if (game.isGameOver() || playerTurn || aiThinking) {
      return;
    }

    let cancelled = false;
    setAiThinking(true);

    requestAiMove(game.fen(), settings.stockfishLevel)
      .then(async (uci) => {
        if (cancelled || !uci) {
          return;
        }

        // Add a small delay for natural feel and to separate sounds
        await new Promise((resolve) => setTimeout(resolve, 600));
        if (cancelled) return;

        const next = cloneGame(game);
        const move = applyUciMove(next, uci);
        if (move) {
          setGame(next);
          handleMoveSound(next, move);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setAiThinking(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [game, playerTurn, requestAiMove, settings.stockfishLevel]);

  const jumpToStart = useCallback(() => {
    if (totalPlies === 0) {
      return;
    }
    setReplayPly(0);
    clearSelection();
  }, [clearSelection, totalPlies]);

  const stepReplayBackward = useCallback(() => {
    if (totalPlies === 0) {
      return;
    }
    setReplayPly((current) => {
      if (current === null) {
        return Math.max(0, totalPlies - 1);
      }
      return Math.max(0, current - 1);
    });
    clearSelection();
  }, [clearSelection, totalPlies]);

  const stepReplayForward = useCallback(() => {
    if (totalPlies === 0) {
      return;
    }
    setReplayPly((current) => {
      if (current === null) {
        return null;
      }
      if (current >= totalPlies) {
        return null;
      }
      const next = current + 1;
      return next >= totalPlies ? null : next;
    });
    clearSelection();
  }, [clearSelection, totalPlies]);

  const exitReplayMode = useCallback(() => {
    setReplayPly(null);
    clearSelection();
  }, [clearSelection]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typingTarget =
        target?.closest('input, textarea, [contenteditable="true"]') ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA';

      if (typingTarget || totalPlies === 0) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        stepReplayBackward();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        stepReplayForward();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        jumpToStart();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        exitReplayMode();
      }
    }

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [exitReplayMode, jumpToStart, stepReplayBackward, stepReplayForward, totalPlies]);

  useEffect(() => {
    if (!game.isGameOver() || savedFinalFen === game.fen()) {
      return;
    }

    const result = getGameResult(game, settings.preferredColor);
    const endedAt = new Date().toISOString();
    setSavedFinalFen(game.fen());
    setShowGameOverModal(true);
    const completedGame = {
      userId: user?.id ?? 'local-player',
      status: 'completed' as const,
      result,
      playerColor: settings.preferredColor,
      stockfishLevel: settings.stockfishLevel,
      startedAt,
      endedAt,
      initialFen: INITIAL_FEN,
      finalFen: game.fen(),
      pgn: game.pgn(),
      moves: toMoveRecords(game)
    };

    if (!supabase || !user) {
      setHistory(saveCompletedLocalGame(completedGame));
      setNotice('Партия сохранена локально.');
      return;
    }

    const client = supabase;
    saveCompletedGame(client, completedGame)
      .then(() => loadHistory(client, user.id))
      .then(setHistory)
      .then(() => setNotice('Партия сохранена в Supabase.'))
      .catch((error) => setNotice(error instanceof Error ? error.message : 'Не удалось сохранить партию'));
  }, [game, savedFinalFen, settings.preferredColor, settings.stockfishLevel, startedAt, user]);

  useEffect(() => {
    if (isReplayMode && !playerTurn && !game.isGameOver()) {
      setReplayPly(null);
      clearSelection();
    }
  }, [clearSelection, game, isReplayMode, playerTurn]);

  useEffect(() => {
    if (user) {
      return;
    }

    saveLocalCurrentGame({
      pgn: game.pgn(),
      fen: game.fen(),
      startedAt
    });
  }, [game, startedAt, user]);

  function tryPlayerMove(from: Square, to: Square) {
    if (!canInteractBoard) {
      return false;
    }

    const next = cloneGame(game);
    const move = applyMove(next, from, to);
    if (!move) {
      return false;
    }

    setGame(next);
    handleMoveSound(next, move);
    setReplayPly(null);
    clearSelection();
    return true;
  }

  function handleSquareClick(square: Square) {
    if (!canInteractBoard) {
      return;
    }

    const piece = game.get(square);
    if (selectedSquare && legalTargets.includes(square)) {
      tryPlayerMove(selectedSquare, square);
      return;
    }

    if (piece && piece.color === game.turn()) {
      setSelectedSquare(square);
      setLegalTargets(getLegalTargets(game, square));
      return;
    }

    clearSelection();
  }

  function handlePieceDragStart(event: DragEvent<HTMLSpanElement>, square: Square) {
    if (!canInteractBoard) {
      event.preventDefault();
      return;
    }

    const piece = game.get(square);
    if (!piece || piece.color !== game.turn()) {
      event.preventDefault();
      return;
    }

    setDragFromSquare(square);
    setDragOverSquare(square);
    setSelectedSquare(square);
    setLegalTargets(getLegalTargets(game, square));
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', square);
  }

  function handleSquareDragOver(event: DragEvent<HTMLButtonElement>, square: Square) {
    if (!dragFromSquare) {
      return;
    }

    event.preventDefault();
    if (dragOverSquare !== square) {
      setDragOverSquare(square);
    }
  }

  function handleSquareDrop(event: DragEvent<HTMLButtonElement>, square: Square) {
    if (!dragFromSquare) {
      return;
    }

    event.preventDefault();
    const from = dragFromSquare;
    setDragFromSquare(null);
    setDragOverSquare(null);
    if (from !== square) {
      tryPlayerMove(from, square);
    }
  }

  function handlePieceDragEnd() {
    setDragFromSquare(null);
    setDragOverSquare(null);
  }

  function startNewGame(nextColor = settings.preferredColor) {
    const nextSettings = { ...settings, preferredColor: nextColor };
    setGame(createGame());
    setSettings(nextSettings);
    if (!user) {
      saveLocalSettings(nextSettings);
    } else if (supabase) {
      saveSettings(supabase, user.id, nextSettings).catch((error) => setNotice(error instanceof Error ? error.message : 'Не удалось сохранить настройки'));
    }
    setStartedAt(new Date().toISOString());
    clearLocalCurrentGame();
    setSavedFinalFen(null);
    setReplayPly(null);
    setSelectedSquare(null);
    setLegalTargets([]);
    setActiveReplay(null);
    setNotice('');
  }

  async function updateSettings(next: UserSettings) {
    setSettings(next);
    if (!user) {
      saveLocalSettings(next);
      return;
    }

    if (supabase && user) {
      try {
        await saveSettings(supabase, user.id, next);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : 'Не удалось сохранить настройки');
      }
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setNotice('Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local.');
      return;
    }

    setAuthLoading(true);
    try {
      const normalizedEmail = email.trim();
      const session =
        authMode === 'sign-up'
          ? await signUpWithPassword(supabase, normalizedEmail, password)
          : await signInWithPassword(supabase, normalizedEmail, password);

      setPassword('');
      setLocalMode(false);
      window.localStorage.removeItem(localModeKey);
      if (authMode === 'sign-up' && !session) {
        setNotice('Аккаунт создан. Проверьте почту и подтвердите email по ссылке.');
        return;
      }

      setNotice(authMode === 'sign-up' ? 'Аккаунт создан, вы вошли.' : 'Вы вошли в аккаунт.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось войти в аккаунт');
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await signOut(supabase);
    setLocalMode(false);
    window.localStorage.removeItem(localModeKey);
    setNotice('Вы вышли из аккаунта.');
  }

  function continueLocally() {
    setLocalMode(true);
    window.localStorage.setItem(localModeKey, 'true');
    setSettings(loadLocalSettings());
    setHistory(loadLocalHistory());
    setNotice('Локальный режим включен. Игры сохраняются на этом устройстве.');
  }

  function loadSavedGame(savedGame: SavedGame) {
    try {
      const nextGame = createGame();
      if (savedGame.pgn) {
        nextGame.loadPgn(savedGame.pgn);
      } else if (savedGame.finalFen) {
        nextGame.load(savedGame.finalFen);
      } else {
        nextGame.load(INITIAL_FEN);
      }
      
      setGame(nextGame);
      setStartedAt(savedGame.startedAt);
      setSavedFinalFen(savedGame.finalFen);
      
      // Calculate ply count correctly from the loaded game
      const history = nextGame.history();
      setReplayPly(history.length);
      
      setActiveView('game');
      setNotice(`Просмотр партии от ${new Date(savedGame.startedAt).toLocaleDateString('ru-RU')}`);
      
      // Scroll to the top of the board when a game is loaded
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      console.error('Failed to load game:', error);
      setNotice('Не удалось загрузить партию для просмотра');
    }
  }

  function renderHistoryView() {
    return (
      <section className="history-page" aria-label="История игр">
        <div className="settings-header">
          <button className="text-button" type="button" onClick={() => setActiveView('game')}>
            <ChevronLeft size={18} aria-hidden />
            Назад к игре
          </button>
          <div>
            <p className="eyebrow">History</p>
            <h2>История ваших партий</h2>
          </div>
        </div>

        <div className="history-content">
          {history.length === 0 ? (
            <div className="empty-history-state">
              <History size={48} aria-hidden />
              <p>{user ? 'Вы еще не сыграли ни одной партии.' : 'В локальном режиме здесь появятся последние 20 игр.'}</p>
              <button className="text-button" onClick={() => setActiveView('game')}>Начать новую игру</button>
            </div>
          ) : (
            <div className="history-grid-view">
              {history.map((savedGame) => (
                <div className="history-card" key={savedGame.id}>
                  <div className="card-header">
                    <span className={`outcome-badge ${savedGame.result}`}>{formatResult(savedGame.result)}</span>
                    <span className="date-badge">{new Date(savedGame.startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>
                  </div>
                  <div className="card-body">
                    <div className="bot-info">
                      <Bot size={16} />
                      <span>Stockfish Уровень {savedGame.stockfishLevel}</span>
                    </div>
                    <div className="game-stats">
                      <span>{savedGame.playerColor === 'white' ? 'Белыми' : 'Черными'}</span>
                      <span>{savedGame.moves?.length ?? 0} ходов</span>
                    </div>
                  </div>
                  <div className="card-footer">
                    <button className="replay-button" onClick={() => loadSavedGame(savedGame)}>
                      <Radio size={16} />
                      Смотреть
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  function renderAuthForm() {
    return (
      <form className="login-form" onSubmit={handleLogin}>
        <div className="auth-mode" aria-label="Режим аккаунта">
          <button className={authMode === 'sign-in' ? 'active' : ''} type="button" onClick={() => setAuthMode('sign-in')}>
            Вход
          </button>
          <button className={authMode === 'sign-up' ? 'active' : ''} type="button" onClick={() => setAuthMode('sign-up')}>
            Регистрация
          </button>
        </div>
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" autoComplete="email" required />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Пароль"
          autoComplete={authMode === 'sign-up' ? 'new-password' : 'current-password'}
          minLength={6}
          required
        />
        <button className="text-button" type="submit" disabled={!isSupabaseConfigured || authLoading}>
          <LogIn size={17} aria-hidden />
          {authLoading ? 'Подождите...' : authMode === 'sign-up' ? 'Создать аккаунт' : 'Войти'}
        </button>
      </form>
    );
  }

  function renderSettingsView() {
    return (
      <section className="settings-page" aria-label="Настройки">
        <div className="settings-header">
          <button className="text-button" type="button" onClick={() => setActiveView('game')}>
            <ChevronLeft size={18} aria-hidden />
            Назад к игре
          </button>
          <div>
            <p className="eyebrow">Settings</p>
            <h2>Настройки</h2>
          </div>
        </div>

        <div className="settings-grid">
          <section className="settings-panel">
            <div className="panel-heading">
              <Sun size={18} aria-hidden />
              <h2>Оформление</h2>
            </div>
            <div className="appearance-toggle" aria-label="Оформление">
              {appearances.map(({ id, label, Icon }) => (
                <button
                  className={settings.appearance === id ? 'active' : ''}
                  key={id}
                  onClick={() => updateSettings({ ...settings, appearance: id })}
                  type="button"
                >
                  <Icon size={17} aria-hidden />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-panel">
            <div className="panel-heading">
              <Palette size={18} aria-hidden />
              <h2>Цвет доски</h2>
            </div>
            <div className="theme-preview-grid">
              {themes.map((theme) => (
                <button
                  className={settings.theme === theme.id ? 'theme-preview-card active' : 'theme-preview-card'}
                  data-theme-preview={theme.id}
                  key={theme.id}
                  onClick={() => updateSettings({ ...settings, theme: theme.id })}
                  type="button"
                >
                  <MiniBoardPreview />
                  <span>{theme.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-panel">
            <div className="panel-heading">
              <Bot size={18} aria-hidden />
              <h2>Игра</h2>
            </div>
            <label>
              Уровень Stockfish
              <input
                type="range"
                min="1"
                max="10"
                value={settings.stockfishLevel}
                onChange={(event) => updateSettings({ ...settings, stockfishLevel: Number(event.target.value) })}
              />
              <output>{settings.stockfishLevel}</output>
            </label>
            <div className="segmented" aria-label="Цвет игрока">
              <button className={settings.preferredColor === 'white' ? 'active' : ''} type="button" onClick={() => startNewGame('white')}>
                Белые
              </button>
              <button className={settings.preferredColor === 'black' ? 'active' : ''} type="button" onClick={() => startNewGame('black')}>
                Черные
              </button>
            </div>
          </section>

          <section className="settings-panel">
            <div className="panel-heading">
              <Volume2 size={18} aria-hidden />
              <h2>Звук</h2>
            </div>
            <div className="appearance-toggle">
              <button
                className={settings.enableSound ? 'active' : ''}
                onClick={() => updateSettings({ ...settings, enableSound: true })}
                type="button"
              >
                <Volume2 size={17} aria-hidden />
                <span>Вкл</span>
              </button>
              <button
                className={!settings.enableSound ? 'active' : ''}
                onClick={() => updateSettings({ ...settings, enableSound: false })}
                type="button"
              >
                <VolumeX size={17} aria-hidden />
                <span>Выкл</span>
              </button>
            </div>
          </section>

          <section className="settings-panel account-settings">
            <div className="panel-heading">
              <UserRound size={18} aria-hidden />
              <h2>Аккаунт</h2>
            </div>
            {user ? (
              <div className="settings-account-row">
                <div>
                  <strong>{user.email}</strong>
                  <p className="empty-state">Синхронизация Supabase включена.</p>
                </div>
                <button className="text-button" type="button" onClick={handleSignOut}>
                  <LogOut size={17} aria-hidden />
                  Выйти
                </button>
              </div>
            ) : (
              <>
                <p className="empty-state">Сейчас включён локальный режим. Войдите, чтобы сохранять историю и настройки в Supabase.</p>
                {renderAuthForm()}
              </>
            )}
            {notice && <p className="notice">{notice}</p>}
          </section>
        </div>
      </section>
    );
  }

  if (!user && !localMode) {
    return (
      <main className="auth-gate">
        <section className="auth-card" aria-label="Вход в игру">
          <p className="eyebrow">Chess</p>
          <h1>Шахматы против Stockfish</h1>
          <p className="auth-copy">Войдите или создайте аккаунт, чтобы синхронизировать историю и настройки через Supabase.</p>
          {renderAuthForm()}
          <button className="local-link" type="button" onClick={continueLocally}>
            Продолжить без входа
          </button>
          <p className="auth-copy small">Локальный режим сохранит настройки и историю только на этом устройстве.</p>
          {notice && <p className="notice">{notice}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="topbar" aria-label="Статус приложения">
        <div>
          <p className="eyebrow">Chess</p>
          <h1>Шахматы против Stockfish</h1>
        </div>
        <div className="topbar-actions">
          <div className="sync-pill">
            <Save size={17} aria-hidden />
            {user ? 'Синхронизация включена' : 'Локальная партия'}
          </div>
          <button
            className={`icon-button ${activeView === 'history' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveView(activeView === 'history' ? 'game' : 'history')}
            title={activeView === 'history' ? 'Вернуться к игре' : 'История'}
            aria-label={activeView === 'history' ? 'Вернуться к игре' : 'История'}
          >
            {activeView === 'history' ? <ChevronLeft size={19} /> : <History size={19} />}
          </button>
          <button
            className={`icon-button ${activeView === 'settings' ? 'active' : ''}`}
            type="button"
            onClick={() => setActiveView(activeView === 'settings' ? 'game' : 'settings')}
            title={activeView === 'settings' ? 'Вернуться к игре' : 'Настройки'}
            aria-label={activeView === 'settings' ? 'Вернуться к игре' : 'Настройки'}
          >
            {activeView === 'settings' ? <ChevronLeft size={19} /> : <Settings size={19} />}
          </button>
        </div>
      </section>

      {activeView === 'settings' ? (
        renderSettingsView()
      ) : activeView === 'history' ? (
        renderHistoryView()
      ) : (
        <>

      <section className="game-layout">
        <div className="board-panel">
          <div className="game-status">
            <div>
              <span>{isReplayMode ? `Режим анализа: ход ${replayPly === 0 ? 'начальная позиция' : replayPly}` : statusText}</span>
              <strong>
                {isReplayMode ? 'Просмотр позиции' : aiThinking ? 'Stockfish думает...' : playerTurn ? 'Ваш ход' : 'Ожидание AI'}
              </strong>
            </div>
            <button className="icon-button" type="button" onClick={() => startNewGame()} title="Новая партия" aria-label="Новая партия">
              <RotateCcw size={19} />
            </button>
          </div>

          <div className="board" role="grid" aria-label="Шахматная доска">
            {boardSquares.map((square) => {
              const piece = displayedGame.get(square);
              const livePiece = game.get(square);
              const isLight = (files.indexOf(square[0]) + Number(square[1])) % 2 === 0;
              const isSelected = selectedSquare === square;
              const isTarget = legalTargets.includes(square);
              const isDragOver = dragOverSquare === square && dragFromSquare !== square;
              const canDragPiece = Boolean(canInteractBoard && livePiece && livePiece.color === game.turn());

              return (
                <button
                  className={`square ${isLight ? 'light' : 'dark'} ${isSelected ? 'selected' : ''} ${isTarget ? 'target' : ''} ${isDragOver ? 'drag-over' : ''} ${checkSquare === square ? 'check' : ''}`}
                  key={square}
                  onClick={() => handleSquareClick(square)}
                  onDragOver={(event) => handleSquareDragOver(event, square)}
                  onDrop={(event) => handleSquareDrop(event, square)}
                  role="gridcell"
                  type="button"
                  aria-label={square}
                >
                  <span
                    className={piece ? `piece ${piece.color === 'w' ? 'white-piece' : 'black-piece'}` : undefined}
                    draggable={canDragPiece}
                    onDragStart={(event) => handlePieceDragStart(event, square)}
                    onDragEnd={handlePieceDragEnd}
                  >
                    {piece ? pieceGlyphs[`${piece.color}${piece.type}`] : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="side-panel" aria-label="Управление партией">
          <section className="control-group">
            <div className="panel-heading">
              <Bot size={18} aria-hidden />
              <h2>Игра</h2>
            </div>
            <label>
              Уровень Stockfish
              <input
                type="range"
                min="1"
                max="10"
                value={settings.stockfishLevel}
                onChange={(event) => updateSettings({ ...settings, stockfishLevel: Number(event.target.value) })}
              />
              <output>{settings.stockfishLevel}</output>
            </label>
            <div className="segmented" aria-label="Цвет игрока">
              <button className={settings.preferredColor === 'white' ? 'active' : ''} type="button" onClick={() => startNewGame('white')}>
                Белые
              </button>
              <button className={settings.preferredColor === 'black' ? 'active' : ''} type="button" onClick={() => startNewGame('black')}>
                Черные
              </button>
            </div>
          </section>



          <section className="control-group">
            <div className="panel-heading">
              <Moon size={18} aria-hidden />
              <h2>Ходы</h2>
            </div>
            <div className="analysis-controls" aria-label="Навигация по ходам">
              <button
                className="analysis-button"
                type="button"
                onClick={jumpToStart}
                disabled={totalPlies === 0}
              >
                <ChevronsLeft size={17} aria-hidden />
                <span>Начало</span>
              </button>
              <button
                className="analysis-button"
                type="button"
                onClick={stepReplayBackward}
                disabled={totalPlies === 0}
              >
                <ChevronLeft size={17} aria-hidden />
                <span>Назад</span>
              </button>
              <button
                className="analysis-button"
                type="button"
                onClick={stepReplayForward}
                disabled={!isReplayMode}
              >
                <span>Вперед</span>
                <ChevronRight size={17} aria-hidden />
              </button>
              <button
                className="analysis-button"
                type="button"
                onClick={exitReplayMode}
                disabled={!isReplayMode}
              >
                <Radio size={17} aria-hidden />
                <span>Live</span>
              </button>
            </div>
            <div className="move-list-container">
              <ol className="move-list">
                {Array.from({ length: Math.ceil(moveRecords.length / 2) }).map((_, i) => {
                  const whiteMove = moveRecords[i * 2];
                  const blackMove = moveRecords[i * 2 + 1];
                  const moveNumber = i + 1;

                  return (
                    <li className="move-row" key={moveNumber}>
                      <span className="move-number">{moveNumber}.</span>
                      <div className="move-pair">
                        {whiteMove && (
                          <button
                            className={replayPly === whiteMove.ply ? 'move-button active' : 'move-button'}
                            type="button"
                            onClick={() => {
                              setReplayPly(whiteMove.ply);
                              clearSelection();
                            }}
                          >
                            {whiteMove.san}
                          </button>
                        )}
                        {blackMove && (
                          <button
                            className={replayPly === blackMove.ply ? 'move-button active' : 'move-button'}
                            type="button"
                            onClick={() => {
                              setReplayPly(blackMove.ply);
                              clearSelection();
                            }}
                          >
                            {blackMove.san}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        </aside>
      </section>

      <section className="lower-layout">
        <div className="auth-panel">
          <div className="panel-heading">
            <UserRound size={18} aria-hidden />
            <h2>Аккаунт</h2>
          </div>
          {user ? (
            <div className="account-row">
              <span>{user.email}</span>
              <button className="text-button" type="button" onClick={handleSignOut}>
                <LogOut size={17} aria-hidden />
                Выйти
              </button>
            </div>
          ) : (
            renderAuthForm()
          )}
          {notice && <p className="notice">{notice}</p>}
        </div>

        <div className="history-panel">
          <div className="panel-heading">
            <History size={18} aria-hidden />
            <h2>История</h2>
          </div>
          {history.length === 0 ? (
            <p className="empty-state">{user ? 'Сыгранные партии появятся здесь.' : 'Локально сохраненные партии появятся здесь.'}</p>
          ) : (
            <div className="history-list">
              {history.map((savedGame) => (
                <button 
                  className={`history-item ${activeReplay?.id === savedGame.id ? 'active' : ''}`} 
                  key={savedGame.id} 
                  type="button" 
                  onClick={() => {
                    setActiveReplay(savedGame);
                    loadSavedGame(savedGame);
                  }}
                >
                  <div className="history-item-header">
                    <span className={`outcome-dot ${savedGame.result}`}></span>
                    <span>{formatResult(savedGame.result)}</span>
                  </div>
                  <strong>{new Date(savedGame.startedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</strong>
                  <div className="history-item-footer">
                    <small>{savedGame.moves?.length ?? 0} полуходов</small>
                    <small>Уровень {savedGame.stockfishLevel}</small>
                  </div>
                </button>
              ))}
            </div>
          )}
          {activeReplay && (
            <div className="replay">
              <strong>{formatResult(activeReplay.result)}</strong>
              <p>{activeReplay.pgn || 'PGN не сохранен.'}</p>
            </div>
          )}
        </div>
      </section>

        </>
      )}

      {showGameOverModal && (
        <div className="modal-backdrop">
          <div className="game-over-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <h2>Игра завершена</h2>
            <div className="result-title" id="modal-title">
              {formatResult(getGameResult(game, settings.preferredColor))}
            </div>
            <div className="reason">
              {getGameOverReason(game)}
            </div>
            <div className="modal-actions">
              <button className="primary-button" onClick={() => {
                setShowGameOverModal(false);
                startNewGame();
              }}>
                <RotateCcw size={20} />
                Новая партия
              </button>
              <button className="secondary-button" onClick={() => setShowGameOverModal(false)}>
                Анализировать позицию
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function getBoardSquares(playerColor: PlayerColor) {
  const ranks = playerColor === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const orderedFiles = playerColor === 'white' ? files : [...files].reverse();
  return ranks.flatMap((rank) => orderedFiles.map((file) => `${file}${rank}` as Square));
}

function MiniBoardPreview() {
  const previewGame = createGame();
  return (
    <span className="mini-board" aria-hidden>
      {getBoardSquares('white').map((square) => {
        const piece = previewGame.get(square);
        const isLight = (files.indexOf(square[0]) + Number(square[1])) % 2 === 0;
        return (
          <span className={isLight ? 'mini-square light' : 'mini-square dark'} key={square}>
            {piece ? pieceGlyphs[`${piece.color}${piece.type}`] : ''}
          </span>
        );
      })}
    </span>
  );
}

function createInitialLocalGame() {
  const savedGame = loadLocalCurrentGame();
  if (!savedGame) {
    return createGame();
  }

  const game = createGame();
  if (savedGame.pgn) {
    try {
      game.loadPgn(savedGame.pgn);
      return game;
    } catch {
      return createGame(savedGame.fen);
    }
  }

  return createGame(savedGame.fen);
}

function cloneGame(game: Chess) {
  const next = createGame();
  const pgn = game.pgn();
  if (pgn) {
    next.loadPgn(pgn);
  }

  return next;
}

function getFallbackMove(fen: string) {
  const game = createGame(fen);
  const moves = game.moves({ verbose: true });
  const capture = moves.find((move) => move.captured);
  const move = capture ?? moves[0];
  return move ? `${move.from}${move.to}${move.promotion ?? ''}` : '';
}

function formatResult(result: string | null) {
  if (result === 'win') {
    return 'Победа';
  }
  if (result === 'loss') {
    return 'Поражение';
  }
  if (result === 'draw') {
    return 'Ничья';
  }
  return 'Завершена';
}
