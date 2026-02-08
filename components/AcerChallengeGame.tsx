'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HowToPlay from '@/components/HowToPlay';
import HistoryTable from '@/components/HistoryTable';
import TargetDisplay from '@/components/TargetDisplay';
import TilesBoard from '@/components/TilesBoard';
import { applyOperation, scoreForDiff } from '@/lib/rules';
import { computeBestSolution } from '@/lib/solver';
import { clearHistory, loadHistory, saveHistory } from '@/lib/storage';
import { createSeededRng, randInt, shuffle } from '@/lib/rng';
import { isSpeechSupported, pickVoice, speakText } from '@/lib/voice';
import type { BestSolution, GamePhase, HistoryItem, Operation, Tile } from '@/lib/types';

const LARGE_POOL = [25, 50, 75, 100];
const SMALL_POOL = Array.from({ length: 10 }, (_, i) => i + 1).flatMap((n) => [n, n]);

interface AppliedStep {
  beforeTiles: Tile[];
  afterTiles: Tile[];
  workLinesBefore: string[];
}

const DEFAULT_DIGITS = [
  { value: '-', locked: false },
  { value: '-', locked: false },
  { value: '-', locked: false }
];

// Round payload shape for future server sync (tiles, target, optional seed).
const roundPayloadNote = {
  tiles: 'tiles',
  target: 'target',
  seed: 'seed'
};

export default function AcerChallengeGame() {
  const rng = useMemo(() => createSeededRng(), []);
  const [phase, setPhase] = useState<GamePhase>('IDLE');
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [tilesAtStart, setTilesAtStart] = useState<Tile[]>([]);
  const [pendingFirstId, setPendingFirstId] = useState<string | null>(null);
  const [pendingOp, setPendingOp] = useState<Operation | null>(null);
  const [pendingSecondId, setPendingSecondId] = useState<string | null>(null);
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [workLines, setWorkLines] = useState<string[]>([]);
  const [appliedSteps, setAppliedSteps] = useState<AppliedStep[]>([]);
  const [target, setTarget] = useState<number | null>(null);
  const [digits, setDigits] = useState(DEFAULT_DIGITS);
  const [targetHint, setTargetHint] = useState('Reveal the round to generate a target.');
  const [timerMode, setTimerMode] = useState(30);
  const [largeCount, setLargeCount] = useState(1);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [timerHint, setTimerHint] = useState('Timer starts automatically after the target reveal.');
  const [bestAnswer, setBestAnswer] = useState<BestSolution | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [typedBestSteps, setTypedBestSteps] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [roundResult, setRoundResult] = useState<{
    didSubmit: boolean;
    userFinalValue: number | null;
    points: number;
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const autoStartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const revealAbortRef = useRef(false);
  const hasUserGestureRef = useRef(false);
  const welcomeSpokenRef = useRef(false);
  const phaseRef = useRef<GamePhase>(phase);
  const lockedIdRef = useRef<string | null>(null);
  const autoStartCancelledRef = useRef(false);

  const isRevealing = phase === 'REVEALING_TILES';
  const isTargetRolling = phase === 'TARGET_ROLLING';
  const roundActive = phase !== 'IDLE' && phase !== 'ENDED';

  const selectedIds = useMemo(() => {
    const ids: string[] = [];
    if (pendingFirstId) ids.push(pendingFirstId);
    if (pendingSecondId) ids.push(pendingSecondId);
    return ids;
  }, [pendingFirstId, pendingSecondId]);
  const canPickOperator = roundActive && !isRevealing && !isTargetRolling && pendingFirstId !== null;
  const canLockIn = roundActive && !isRevealing && !isTargetRolling && pendingFirstId !== null && pendingOp === null;
  const canBack =
    roundActive &&
    !isRevealing &&
    !isTargetRolling &&
    (pendingFirstId !== null || pendingOp !== null || appliedSteps.length > 0);
  const canReset =
    roundActive &&
    !isRevealing &&
    !isTargetRolling &&
    (pendingFirstId !== null || pendingOp !== null || appliedSteps.length > 0 || workLines.length > 0);
  const workMeta = roundActive ? `Tiles remaining: ${tiles.length}` : '';

  const pickHint = useMemo(() => {
    if (!roundActive) return 'Click “Reveal round” to begin.';
    if (isRevealing) return 'Revealing tiles...';
    if (isTargetRolling) return 'Generating target...';
    if (!pendingFirstId) return 'Pick a number';
    if (!pendingOp) return 'Pick an operator';
    return 'Pick the next number';
  }, [roundActive, isRevealing, isTargetRolling, pendingFirstId, pendingOp]);

  const timeDisplay = useMemo(() => {
    if (timeRemaining === null) return '--';
    if (timerMode === 0) return 'Unlimited';
    const sec = Math.max(timeRemaining, 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }, [timeRemaining, timerMode]);

  const announce = useCallback(
    (text: string) => {
      if (!isSpeechSupported()) return;
      speakText(text, voice);
    },
    [voice]
  );

  const announceCountdown = useCallback(
    (text: string) => {
      if (!hasUserGestureRef.current) return;
      if (!isSpeechSupported()) return;
      speakText(text, voice, { interrupt: true });
    },
    [voice]
  );

  const resetTarget = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setTarget(null);
    setDigits(DEFAULT_DIGITS);
    setTargetHint('Reveal the round to generate a target.');
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearAutoStartTimer = useCallback(() => {
    if (autoStartTimeoutRef.current) {
      clearTimeout(autoStartTimeoutRef.current);
      autoStartTimeoutRef.current = null;
    }
    autoStartCancelledRef.current = true;
  }, []);

  const registerUserGesture = useCallback(() => {
    hasUserGestureRef.current = true;
    if (audioContextRef.current?.state === 'suspended') {
      void audioContextRef.current.resume().catch(() => {});
    }
  }, []);

  const getAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!hasUserGestureRef.current) return null;
    if (audioContextRef.current) return audioContextRef.current;
    const AudioContextCtor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return null;
    try {
      const context = new AudioContextCtor();
      audioContextRef.current = context;
      if (context.state === 'suspended') {
        void context.resume().catch(() => {});
      }
      return context;
    } catch {
      return null;
    }
  }, []);

  const playTone = useCallback(
    (options: { type: OscillatorType; frequency: number; duration: number; peak: number }) => {
      const context = getAudioContext();
      if (!context) return;
      if (context.state === 'suspended') {
        void context.resume().catch(() => {});
      }
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = options.type;
      oscillator.frequency.value = options.frequency;
      gain.gain.value = 0;
      oscillator.connect(gain);
      gain.connect(context.destination);
      const now = context.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(options.peak, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + options.duration);
      oscillator.start(now);
      oscillator.stop(now + options.duration + 0.05);
    },
    [getAudioContext]
  );

  const playBuzzer = useCallback(() => {
    playTone({ type: 'sawtooth', frequency: 180, duration: 0.4, peak: 0.2 });
  }, [playTone]);

  const playBoom = useCallback(() => {
    playTone({ type: 'sine', frequency: 70, duration: 0.5, peak: 0.25 });
  }, [playTone]);

  const handleEndOfRoundEffects = useCallback(
    (exact: boolean, options?: { skipBuzzer?: boolean }) => {
      if (!hasUserGestureRef.current) return;
      if (!options?.skipBuzzer) {
        playBuzzer();
      }
      setTimeout(() => {
        announce("Let's see how you did");
      }, 450);
      if (exact) {
        setTimeout(() => {
          playBoom();
        }, 1200);
      }
    },
    [announce, playBoom, playBuzzer]
  );

  useEffect(() => {
    if (typingRef.current) {
      clearInterval(typingRef.current);
      typingRef.current = null;
    }
    if (!bestAnswer) {
      setTypedBestSteps('');
      return;
    }
    const fullText = bestAnswer.steps.length ? bestAnswer.steps.join('\n') : '—';
    setTypedBestSteps('');
    let index = 0;
    typingRef.current = setInterval(() => {
      index += 1;
      setTypedBestSteps(fullText.slice(0, index));
      if (index >= fullText.length && typingRef.current) {
        clearInterval(typingRef.current);
        typingRef.current = null;
      }
    }, 200);
  }, [bestAnswer]);

  useEffect(() => {
    setHistoryItems(loadHistory());
    if (!isSpeechSupported()) {
      return;
    }
    const syncVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const picked = pickVoice(voices);
      setVoice(picked);
    };
    syncVoices();
    window.speechSynthesis.onvoiceschanged = () => syncVoices();
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    lockedIdRef.current = lockedId;
  }, [lockedId]);

  useEffect(() => () => {
    stopTimer();
    if (autoStartTimeoutRef.current) {
      clearTimeout(autoStartTimeoutRef.current);
      autoStartTimeoutRef.current = null;
    }
    if (typingRef.current) {
      clearInterval(typingRef.current);
      typingRef.current = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    revealAbortRef.current = true;
  }, [stopTimer]);

  const createTileId = useCallback(() => {
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
      const buffer = new Uint32Array(2);
      crypto.getRandomValues(buffer);
      return Array.from(buffer)
        .map((n) => n.toString(16))
        .join('');
    }
    return `${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  }, []);

  const drawTiles = useCallback(
    (largeCount: number) => {
      const smallCount = 6 - largeCount;
      const large = shuffle(rng, LARGE_POOL).slice(0, largeCount);
      const small = shuffle(rng, SMALL_POOL).slice(0, smallCount);

      return shuffle(rng, [
        ...large.map((value) => ({ value, kind: 'large' as const })),
        ...small.map((value) => ({ value, kind: 'small' as const }))
      ]).map((tile) => ({
        id: createTileId(),
        value: tile.value,
        kind: tile.kind,
        revealed: false
      }));
    },
    [createTileId, rng]
  );

  const pushAppliedStep = useCallback((beforeTiles: Tile[], afterTiles: Tile[], workLinesBefore: string[]) => {
    setAppliedSteps((prev) => [
      ...prev,
      {
        beforeTiles: beforeTiles.map((tile) => ({ ...tile })),
        afterTiles: afterTiles.map((tile) => ({ ...tile })),
        workLinesBefore: workLinesBefore.slice()
      }
    ]);
  }, []);

  const applyPendingOperation = useCallback(
    (firstId: string, secondId: string, op: Operation) => {
      const first = tiles.find((tile) => tile.id === firstId);
      const second = tiles.find((tile) => tile.id === secondId);
      if (!first || !second || !first.revealed || !second.revealed) return;

      try {
        const result = applyOperation(first.value, second.value, op);
        const remaining = tiles.filter((tile) => tile.id !== firstId && tile.id !== secondId);
        const resultTile: Tile = { id: createTileId(), value: result.value, kind: 'result', revealed: true };
        const nextTiles: Tile[] = [...remaining, resultTile];
        const nextWorkLines = [...workLines, result.expression];

        pushAppliedStep(tiles, nextTiles, workLines);

        setTiles(nextTiles);
        setWorkLines(nextWorkLines);
        setPendingFirstId(null);
        setPendingOp(null);
        setPendingSecondId(null);
        setLockedId(null);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setPendingSecondId(null);
        announce(`Not allowed ${message}`);
      }
    },
    [announce, createTileId, pushAppliedStep, tiles, workLines]
  );

  const handleTileClick = (id: string) => {
    registerUserGesture();
    if (!roundActive || isRevealing || isTargetRolling) return;
    const tile = tiles.find((item) => item.id === id);
    if (!tile || !tile.revealed) return;

    if (!pendingFirstId) {
      setPendingFirstId(id);
      setPendingOp(null);
      setPendingSecondId(null);
    } else if (!pendingOp) {
      if (pendingFirstId === id) {
        setPendingFirstId(null);
      } else {
        setPendingFirstId(id);
      }
      setPendingSecondId(null);
    } else if (pendingFirstId !== id) {
      setPendingSecondId(id);
      applyPendingOperation(pendingFirstId, id, pendingOp);
    }

    if (lockedId && lockedId !== id) setLockedId(null);
  };

  const handleOperation = (op: Operation) => {
    registerUserGesture();
    if (!canPickOperator) return;
    setPendingOp(op);
    setPendingSecondId(null);
  };

  const handleBack = () => {
    registerUserGesture();
    if (!canBack) return;
    if (pendingFirstId && !pendingOp) {
      setPendingFirstId(null);
      setPendingSecondId(null);
      return;
    }
    if (pendingFirstId && pendingOp) {
      setPendingOp(null);
      setPendingSecondId(null);
      return;
    }

    setAppliedSteps((prev) => {
      if (!prev.length) return prev;
      const next = prev.slice(0, -1);
      const last = prev[prev.length - 1];
      setTiles(last.beforeTiles.map((tile) => ({ ...tile })));
      setWorkLines(last.workLinesBefore.slice());
      setPendingFirstId(null);
      setPendingOp(null);
      setPendingSecondId(null);
      setLockedId(null);
      return next;
    });
  };

  const handleReset = () => {
    registerUserGesture();
    if (!canReset) return;
    if (!tilesAtStart.length) return;
    clearAutoStartTimer();
    setTiles(tilesAtStart.map((tile) => ({ ...tile, revealed: true })));
    setWorkLines([]);
    setAppliedSteps([]);
    setPendingFirstId(null);
    setPendingOp(null);
    setPendingSecondId(null);
    setLockedId(null);
  };

  const computeBest = useCallback(
    (sourceTiles: Tile[], targetValue: number) => {
      const best = computeBestSolution(sourceTiles.map((tile) => tile.value), targetValue);
      setBestAnswer(best);
      return best;
    },
    []
  );

  const endRound = useCallback(
    (options: {
      didSubmit: boolean;
      userFinalValue: number | null;
      points: number;
      exact: boolean;
      skipBuzzer?: boolean;
    }) => {
      stopTimer();
      clearAutoStartTimer();
      setPhase('ENDED');
      setRoundResult({
        didSubmit: options.didSubmit,
        userFinalValue: options.userFinalValue,
        points: options.points
      });

      if (target === null) {
        handleEndOfRoundEffects(options.exact, { skipBuzzer: options.skipBuzzer });
        return;
      }

      const best = computeBest(tilesAtStart.length ? tilesAtStart : tiles, target);
      const outcome = options.didSubmit ? 'OK' : 'FAIL';

      saveHistory({
        ts: Date.now(),
        tilesAtStart: tilesAtStart.map((tile) => tile.value),
        target,
        userFinalValue: options.userFinalValue,
        userSteps: workLines.slice(),
        bestFinalValue: best ? best.value : null,
        bestSteps: best ? best.steps : [],
        points: options.points,
        didSubmit: options.didSubmit,
        outcome
      });

      setHistoryItems(loadHistory());
      handleEndOfRoundEffects(options.exact, { skipBuzzer: options.skipBuzzer });
    },
    [
      clearAutoStartTimer,
      computeBest,
      handleEndOfRoundEffects,
      stopTimer,
      target,
      tiles,
      tilesAtStart,
      workLines
    ]
  );

  const lockInAnswer = () => {
    registerUserGesture();
    if (!canLockIn || target === null) return;
    const selected = tiles.find((tile) => tile.id === pendingFirstId);
    if (!selected) return;

    setLockedId(selected.id);
    const diff = Math.abs(target - selected.value);
    const points = scoreForDiff(diff);

    endRound({
      didSubmit: true,
      userFinalValue: selected.value,
      points,
      exact: diff === 0
    });
  };

  const handleTimeUp = useCallback(() => {
    playBuzzer();
    endRound({
      didSubmit: false,
      userFinalValue: null,
      points: 0,
      exact: false,
      skipBuzzer: true
    });
  }, [endRound, playBuzzer]);

  const startTimer = () => {
    if (phaseRef.current !== 'READY') return;
    setPhase('RUNNING');
    setTimeRemaining(timerMode);
    setTimerHint(timerMode === 0 ? 'Unlimited' : 'Timer running');

    if (timerMode === 0) return;
    stopTimer();
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null) return prev;
        const next = prev - 1;
        if (next <= 5 && next >= 1) {
          announceCountdown(String(next));
        }
        if (next <= 0) {
          handleTimeUp();
          return 0;
        }
        return next;
      });
    }, 1000);
  };

  const rollTargetAndFix = useCallback(
    () =>
      new Promise<number>((resolve) => {
        setPhase('TARGET_ROLLING');
        const final1 = randInt(rng, 1, 9);
        const final2 = randInt(rng, 0, 9);
        const final3 = randInt(rng, 0, 9);
        const finalTarget = final1 * 100 + final2 * 10 + final3;

        const start = performance.now();
        let lock1 = false;
        let lock2 = false;
        let lock3 = false;

        const tick = (now: number) => {
          if (revealAbortRef.current) return;
          const elapsed = (now - start) / 1000;

          if (elapsed >= 4 && !lock1) {
            lock1 = true;
            setDigits((prev) => [
              { value: String(final1), locked: true },
              prev[1],
              prev[2]
            ]);
          }
          if (elapsed >= 6 && !lock2) {
            lock2 = true;
            setDigits((prev) => [prev[0], { value: String(final2), locked: true }, prev[2]]);
          }
          if (elapsed >= 7 && !lock3) {
            lock3 = true;
            setDigits((prev) => [prev[0], prev[1], { value: String(final3), locked: true }]);
          }

          if (!lock1) {
            setDigits((prev) => [
              { value: String(randInt(rng, 0, 9)), locked: false },
              prev[1],
              prev[2]
            ]);
          }
          if (!lock2) {
            setDigits((prev) => [prev[0], { value: String(randInt(rng, 0, 9)), locked: false }, prev[2]]);
          }
          if (!lock3) {
            setDigits((prev) => [prev[0], prev[1], { value: String(randInt(rng, 0, 9)), locked: false }]);
          }

          if (lock3) {
            setTarget(finalTarget);
            setPhase('READY');
            resolve(finalTarget);
            return;
          }
          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      }),
    [rng]
  );

  const revealRound = async (largeCount: number) => {
    if (isRevealing || isTargetRolling) return;
    revealAbortRef.current = false;

    const smallCount = 6 - largeCount;
    announce(`That’s ${largeCount} large and ${smallCount} small numbers`);

    stopTimer();
    clearAutoStartTimer();
    setTimeRemaining(null);
    setTimerHint('Timer starts automatically after the target reveal.');
    setBestAnswer(null);
    setRoundResult(null);
    setPendingFirstId(null);
    setPendingOp(null);
    setPendingSecondId(null);
    setLockedId(null);
    setWorkLines([]);
    setAppliedSteps([]);
    resetTarget();

    setPhase('REVEALING_TILES');
    const freshTiles = drawTiles(largeCount);
    setTiles(freshTiles);
    setTilesAtStart(freshTiles.map((tile) => ({ ...tile, revealed: true })));

    for (let i = 0; i < freshTiles.length; i += 1) {
      await new Promise((res) => setTimeout(res, 1000));
      setTiles((prev) =>
        prev.map((tile, index) => (index === i ? { ...tile, revealed: true } : tile))
      );
    }

    setPhase('TARGET_ROLLING');
    await new Promise((res) => setTimeout(res, 2000));
    announce('And the number is');
    const finalTarget = await rollTargetAndFix();
    announce(String(finalTarget));
    setPhase('READY');
    announce('Timer starts in 10 seconds');
    setTimerHint('Timer starts in 10 seconds.');
    setTargetHint('Timer starts automatically after the reveal.');
    autoStartCancelledRef.current = false;
    if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current);
    autoStartTimeoutRef.current = setTimeout(() => {
      if (autoStartCancelledRef.current) return;
      if (phaseRef.current === 'ENDED' || lockedIdRef.current) return;
      startTimer();
    }, 10000);
  };

  const revealRoundWithInput = (largeCount: number) => {
    registerUserGesture();
    void revealRound(largeCount);
  };

  const handleStart = async () => {
    setHasStarted(true);
    hasUserGestureRef.current = true;
    try {
      const context = getAudioContext();
      if (context?.state === 'suspended') {
        await context.resume();
      }
    } catch {
      // no-op
    }
    try {
      window.speechSynthesis?.getVoices?.();
    } catch {
      // no-op
    }
    if (!welcomeSpokenRef.current) {
      announce("Welcome to Challenge Acer. Can you beat him? Choose how many large numbers and let's go.");
      welcomeSpokenRef.current = true;
    }
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistoryItems([]);
  };

  const resultAnswerText =
    roundResult === null ? '—' : roundResult.didSubmit ? String(roundResult.userFinalValue ?? '—') : 'FAIL!';
  const resultPointsText =
    roundResult === null ? '—' : roundResult.didSubmit ? String(roundResult.points) : '0';

  return (
    <>
      {!hasStarted ? (
        <div className="startOverlay">
          <div className="startOverlayCard">
            <h2>Acer Challenge</h2>
            <p className="muted">Tap Start for voice and sound</p>
            <button type="button" onClick={handleStart}>
              Start
            </button>
          </div>
        </div>
      ) : null}
      <div className="topbar">
        <div>
          <h1>Acer Challenge</h1>
          <div className="muted">
            Pick your numbers, reveal the tiles, reveal the target, then the clock auto-starts after 10 seconds.
          </div>
        </div>
        <div className="topbarRight">
          <img
            className="headerLogo"
            src="/images/acer-can-winner-logo.png"
            alt="Acer Challenge logo"
            loading="eager"
          />
        </div>
      </div>

      <div className="stage">
        <div className="controls">
          <div>
            <label htmlFor="largeCount">Large numbers (0–4)</label>
            <select id="largeCount" value={largeCount} onChange={(event) => setLargeCount(Number(event.target.value))}>
              <option value={0}>0</option>
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </div>
          <div>
            <label htmlFor="smallCount">Small numbers (auto so total = 6)</label>
            <input id="smallCount" type="number" value={6 - largeCount} disabled />
          </div>
          <div>
            <label htmlFor="timerMode">Timer</label>
            <select id="timerMode" value={timerMode} onChange={(event) => setTimerMode(Number(event.target.value))}>
              <option value={30}>30 seconds</option>
              <option value={60}>60 seconds</option>
              <option value={0}>Unlimited</option>
            </select>
          </div>

          <div className="rowRight">
            <button id="newRoundBtn" onClick={() => revealRoundWithInput(largeCount)}>
              Reveal round
            </button>
            <button id="backBtn" className="btnGhost" disabled={!canBack} onClick={handleBack}>
              Back
            </button>
            <button id="resetWorkBtn" className="btnGhost" disabled={!canReset} onClick={handleReset}>
              Reset work
            </button>
          </div>
        </div>

        <div className="arena">
          <div className="displayRow">
            <div className="topRow">
              <TargetDisplay digits={digits} hint={targetHint} />

              <div className="box timerBox">
                <div className="muted">Time</div>
                <div className="led">
                  <span>{timeDisplay}</span>
                </div>
                <div className="smallNote">{timerHint}</div>
              </div>
            </div>

            <TilesBoard
              tiles={tiles}
              selectedIds={selectedIds}
              lockedId={lockedId}
              onTileClick={handleTileClick}
              hint={pickHint}
              canPickOperator={canPickOperator}
              pendingOp={pendingOp}
              onOperation={handleOperation}
              canLockIn={canLockIn}
              onLockIn={lockInAnswer}
            />
          </div>

          <div className="statusRow">
            <div className="statusBox">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <b>Working</b>
                <span className="muted">{workMeta}</span>
              </div>
              <div style={{ height: 10 }} />
              <div className="workArea">{workLines.length ? workLines.join('\n') : 'No steps yet.'}</div>
            </div>

            <div className="statusBox">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <b>Result of this round!</b>
              </div>
              <div style={{ height: 10 }} />
              <div>Your answer: {resultAnswerText} , Points scored: {resultPointsText}</div>
              <div style={{ height: 10 }} />
              <div style={{ fontWeight: 800 }}>The Best Answer:</div>
              <div style={{ marginTop: 12 }}>
                <div className="good" style={{ fontSize: '2em', fontWeight: 800 }}>
                  {bestAnswer ? bestAnswer.value : '---'}
                </div>

                <div
                  className="mono good"
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: '2em',
                    marginTop: 8,
                  }}
                >
                  {bestAnswer ? typedBestSteps : '---'}
                </div>
              </div>
            </div>
          </div>

          <HistoryTable items={historyItems} onClear={handleClearHistory} />
          <HowToPlay />
        </div>
      </div>

      <div className="smallNote">
        Multiplayer readiness: seed-based RNG hooks and round payload shape ({roundPayloadNote.tiles},{' '}
        {roundPayloadNote.target},{' '}{roundPayloadNote.seed}) are ready for server sync and validation.
      </div>
    </>
  );
}
