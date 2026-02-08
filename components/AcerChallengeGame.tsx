'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import HowToPlay from '@/components/HowToPlay';
import TargetDisplay from '@/components/TargetDisplay';
import TilesBoard from '@/components/TilesBoard';
import { applyOperation, scoreForDiff } from '@/lib/rules';
import { computeBestSolution } from '@/lib/solver';
import { loadAcerBenchmark, loadDailyScores, loadProfile, recordDailyChallenge, saveProfile } from '@/lib/storage';
import { createSeededRng, randInt, shuffle } from '@/lib/rng';
import { isSpeechSupported, pickVoice, speakText } from '@/lib/voice';
import type { AgeBand, BestSolution, DailyScore, GamePhase, LeaderboardEntry, Operation, Tile, UserProfile } from '@/lib/types';

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

const AGE_BANDS: AgeBand[] = ['Under 8', '8–10', '11–13', '14–16', '16+'];
const DAILY_LIMIT = 5;
const FIXED_TIMER = 60;

const buildDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  return new Date(year, month - 1, day);
};

const startOfWeek = (date: Date) => {
  const start = new Date(date);
  const day = start.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  start.setDate(start.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
};

const startOfMonth = (date: Date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
};

const MOCK_PLAYERS: Array<{ name: string; ageBand: AgeBand; baseScore: number }> = [
  { name: 'Nova', ageBand: '11–13', baseScore: 320 },
  { name: 'Rook', ageBand: '14–16', baseScore: 290 },
  { name: 'Echo', ageBand: '8–10', baseScore: 240 },
  { name: 'Quill', ageBand: '16+', baseScore: 355 },
  { name: 'Pulse', ageBand: '14–16', baseScore: 270 }
];

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
  const [largeCount, setLargeCount] = useState(1);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [timerHint, setTimerHint] = useState('Timer starts automatically after the target reveal.');
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [hasStarted, setHasStarted] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dailyScores, setDailyScores] = useState<DailyScore[]>([]);
  const [ageFilter, setAgeFilter] = useState<'All' | AgeBand>('All');
  const [registrationData, setRegistrationData] = useState({
    username: '',
    email: '',
    ageBand: AGE_BANDS[4]
  });
  const [registrationError, setRegistrationError] = useState<string | null>(null);
  const [roundResult, setRoundResult] = useState<{
    didSubmit: boolean;
    userFinalValue: number | null;
    points: number;
    accuracyScore: number;
    timeScore: number;
    timeRemaining: number;
    bestSolution: BestSolution | null;
  } | null>(null);
  const [typedBestSteps, setTypedBestSteps] = useState('');
  const [showDailyCompleteModal, setShowDailyCompleteModal] = useState(false);

  const todayKey = useMemo(() => buildDateKey(new Date()), []);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const revealAbortRef = useRef(false);
  const hasUserGestureRef = useRef(false);
  const welcomeSpokenRef = useRef(false);
  const lastGoAnnouncedRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const readyVoiceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const phaseRef = useRef<GamePhase>(phase);

  const isRevealing = phase === 'REVEALING_TILES';
  const isTargetRolling = phase === 'TARGET_ROLLING';
  const roundActive = phase !== 'IDLE' && phase !== 'ENDED';
  const canInteract = phase === 'RUNNING';

  const selectedIds = useMemo(() => {
    const ids: string[] = [];
    if (pendingFirstId) ids.push(pendingFirstId);
    if (pendingSecondId) ids.push(pendingSecondId);
    return ids;
  }, [pendingFirstId, pendingSecondId]);
  const canPickOperator = canInteract && pendingFirstId !== null;
  const canLockIn = canInteract && pendingFirstId !== null && pendingOp === null;
  const canBack =
    canInteract &&
    (pendingFirstId !== null || pendingOp !== null || appliedSteps.length > 0);
  const canReset =
    canInteract &&
    (pendingFirstId !== null || pendingOp !== null || appliedSteps.length > 0 || workLines.length > 0);
  const workMeta = roundActive ? `Tiles remaining: ${tiles.length}` : '';

  const pickHint = useMemo(() => {
    if (!roundActive) return 'Click “Reveal round” to begin.';
    if (isRevealing) return 'Revealing tiles...';
    if (isTargetRolling) return 'Generating target...';
    if (!canInteract) return 'Timer starting...';
    if (!pendingFirstId) return 'Pick a number';
    if (!pendingOp) return 'Pick an operator';
    return 'Pick the next number';
  }, [roundActive, isRevealing, isTargetRolling, canInteract, pendingFirstId, pendingOp]);

  const timeDisplay = useMemo(() => {
    if (timeRemaining === null) return '--';
    const sec = Math.max(timeRemaining, 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
  }, [timeRemaining]);

  const todayRecord = useMemo(
    () => dailyScores.find((item) => item.dateKey === todayKey && item.username === profile?.username),
    [dailyScores, profile?.username, todayKey]
  );
  const challengesCompleted = todayRecord?.challengeScores.length ?? 0;
  const dailyTotalScore = todayRecord?.totalScore ?? 0;
  const dailyLimitReached = challengesCompleted >= DAILY_LIMIT;
  const acerBenchmarkScore = useMemo(() => loadAcerBenchmark(todayKey), [todayKey]);
  const canRevealRound =
    Boolean(profile) && !dailyLimitReached && !roundActive && !isRevealing && !isTargetRolling;

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

  const validateRegistration = useCallback(() => {
    if (!registrationData.username.trim()) return 'Username is required.';
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(registrationData.username.trim())) {
      return 'Username must be 3–16 characters with letters, numbers, or underscores only.';
    }
    if (!registrationData.email.trim() || !registrationData.email.includes('@')) {
      return 'Email must be valid.';
    }
    if (!registrationData.ageBand) return 'Select an age band.';
    return null;
  }, [registrationData]);

  const handleRegisterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = validateRegistration();
    if (error) {
      setRegistrationError(error);
      return;
    }
    const nextProfile: UserProfile = {
      username: registrationData.username.trim(),
      email: registrationData.email.trim(),
      ageBand: registrationData.ageBand,
      createdAt: Date.now()
    };
    saveProfile(nextProfile);
    setProfile(nextProfile);
    setRegistrationError(null);
  };

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
    setProfile(loadProfile());
    setDailyScores(loadDailyScores());
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

  useEffect(() => () => {
    stopTimer();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    revealAbortRef.current = true;
  }, [stopTimer]);

  useEffect(() => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    if (readyVoiceTimeoutRef.current) {
      clearTimeout(readyVoiceTimeoutRef.current);
      readyVoiceTimeoutRef.current = null;
    }

    if (!roundResult?.bestSolution) {
      setTypedBestSteps('');
      return;
    }

    const fullText = roundResult.bestSolution.steps.length
      ? roundResult.bestSolution.steps.join('\n')
      : 'No steps available.';
    let index = 0;
    setTypedBestSteps('');

    const tick = () => {
      index += 1;
      setTypedBestSteps(fullText.slice(0, index));
      if (index < fullText.length) {
        typingTimeoutRef.current = setTimeout(tick, 200);
      } else {
        readyVoiceTimeoutRef.current = setTimeout(() => {
          announce('Ready for the next round');
        }, 2000);
      }
    };

    if (fullText.length) {
      typingTimeoutRef.current = setTimeout(tick, 200);
    } else {
      readyVoiceTimeoutRef.current = setTimeout(() => {
        announce('Ready for the next round');
      }, 2000);
    }
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (readyVoiceTimeoutRef.current) {
        clearTimeout(readyVoiceTimeoutRef.current);
        readyVoiceTimeoutRef.current = null;
      }
    };
  }, [announce, roundResult?.bestSolution]);

  const referenceDate = useMemo(() => parseDateKey(todayKey), [todayKey]);

  const userScoresByPeriod = useMemo(() => {
    if (!profile) {
      return {
        personal: null,
        today: null,
        week: null,
        month: null,
        all: null
      };
    }
    const userEntries = dailyScores.filter((item) => item.username === profile.username);
    if (!userEntries.length) {
      return {
        personal: null,
        today: null,
        week: null,
        month: null,
        all: null
      };
    }

    const todayEntry = userEntries.find((item) => item.dateKey === todayKey);
    const personal = Math.max(...userEntries.map((item) => item.totalScore));
    const weekStart = startOfWeek(referenceDate);
    const monthStart = startOfMonth(referenceDate);
    const weekTotal = userEntries
      .filter((item) => parseDateKey(item.dateKey) >= weekStart)
      .reduce((sum, item) => sum + item.totalScore, 0);
    const monthTotal = userEntries
      .filter((item) => parseDateKey(item.dateKey) >= monthStart)
      .reduce((sum, item) => sum + item.totalScore, 0);
    const allTotal = userEntries.reduce((sum, item) => sum + item.totalScore, 0);

    return {
      personal,
      today: todayEntry?.totalScore ?? null,
      week: weekTotal,
      month: monthTotal,
      all: allTotal
    };
  }, [dailyScores, profile, referenceDate, todayKey]);

  const buildLeaderboard = useCallback(
    (period: 'personal' | 'today' | 'week' | 'month' | 'all') => {
      const periodMultiplier = {
        personal: 1.1,
        today: 1,
        week: 4.2,
        month: 12.5,
        all: 32
      } as const;
      const mockEntries: LeaderboardEntry[] = MOCK_PLAYERS.map((player) => ({
        name: player.name,
        ageBand: player.ageBand,
        score: Math.round(player.baseScore * periodMultiplier[period])
      }));
      const entries = [...mockEntries];
      const userScore = userScoresByPeriod[period];
      if (profile && typeof userScore === 'number') {
        entries.push({
          name: profile.username,
          ageBand: profile.ageBand,
          score: userScore,
          isUser: true
        });
      }
      const filtered = entries.filter((entry) => ageFilter === 'All' || entry.ageBand === ageFilter);
      return filtered.sort((a, b) => b.score - a.score).slice(0, 10);
    },
    [ageFilter, profile, userScoresByPeriod]
  );

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

      const orderedTiles = [
        ...large.map((value, index) => ({ value, kind: 'large' as const, order: index })),
        ...small.map((value, index) => ({ value, kind: 'small' as const, order: index }))
      ].sort((a, b) => {
        const kindScore = (kind: 'large' | 'small') => (kind === 'large' ? 0 : 1);
        return kindScore(a.kind) - kindScore(b.kind) || a.order - b.order;
      });

      return orderedTiles.map((tile) => ({
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
    if (!canInteract) return;
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
    setTiles(tilesAtStart.map((tile) => ({ ...tile, revealed: true })));
    setWorkLines([]);
    setAppliedSteps([]);
    setPendingFirstId(null);
    setPendingOp(null);
    setPendingSecondId(null);
    setLockedId(null);
  };

  const endRound = useCallback(
    (options: {
      didSubmit: boolean;
      userFinalValue: number | null;
      points: number;
      exact: boolean;
      skipBuzzer?: boolean;
      accuracyScore: number;
      timeScore: number;
      timeRemaining: number;
      diff?: number;
    }) => {
      stopTimer();
      const bestSolution =
        target !== null && tilesAtStart.length
          ? computeBestSolution(
              tilesAtStart.map((tile) => tile.value),
              target
            )
          : null;
      const diff = options.diff ?? (bestSolution ? bestSolution.diff : target ? Math.abs(target) : 0);
      setPhase('ENDED');
      setRoundResult({
        didSubmit: options.didSubmit,
        userFinalValue: options.userFinalValue,
        points: options.points,
        accuracyScore: options.accuracyScore,
        timeScore: options.timeScore,
        timeRemaining: options.timeRemaining,
        bestSolution
      });

      if (target === null) {
        handleEndOfRoundEffects(options.exact, { skipBuzzer: options.skipBuzzer });
        return;
      }
      if (profile) {
        const updated = recordDailyChallenge(profile, todayKey, {
          score: options.points,
          accuracyScore: options.accuracyScore,
          timeScore: options.timeScore,
          diff,
          exact: options.exact,
          timeRemaining: options.timeRemaining,
          submittedAt: Date.now()
        });
        setDailyScores(updated);
        const updatedToday = updated.find((item) => item.dateKey === todayKey && item.username === profile.username);
        const updatedCount = updatedToday?.challengeScores.length ?? 0;
        if (updatedCount >= DAILY_LIMIT) {
          setShowDailyCompleteModal(true);
        }
      }
      handleEndOfRoundEffects(options.exact, { skipBuzzer: options.skipBuzzer });
    },
    [handleEndOfRoundEffects, profile, stopTimer, target, tilesAtStart, todayKey]
  );

  const lockInAnswer = () => {
    registerUserGesture();
    if (!canLockIn || target === null) return;
    const selected = tiles.find((tile) => tile.id === pendingFirstId);
    if (!selected) return;

    setLockedId(selected.id);
    const diff = Math.abs(target - selected.value);
    const remaining = timeRemaining ?? 0;
    const accuracyScore = scoreForDiff(diff) * 10;
    const timeScore = Math.max(0, Math.round((remaining / FIXED_TIMER) * 10));
    const points = accuracyScore + timeScore;

    endRound({
      didSubmit: true,
      userFinalValue: selected.value,
      points,
      exact: diff === 0,
      accuracyScore,
      timeScore,
      timeRemaining: remaining,
      diff
    });
  };

  const handleTimeUp = useCallback(() => {
    playBuzzer();
    if (target === null) return;
    const remaining = 0;
    const accuracyScore = 0;
    const timeScore = 0;
    const points = 0;
    endRound({
      didSubmit: false,
      userFinalValue: null,
      points,
      exact: false,
      accuracyScore,
      timeScore,
      timeRemaining: remaining,
      skipBuzzer: true
    });
  }, [endRound, playBuzzer, target]);

  const startTimer = () => {
    if (phaseRef.current === 'RUNNING' || phaseRef.current === 'ENDED') return;
    setPhase('RUNNING');
    setTimeRemaining(FIXED_TIMER);
    setTimerHint('Timer running');
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
    if (isRevealing || isTargetRolling || roundActive) return;
    revealAbortRef.current = false;

    const smallCount = 6 - largeCount;
    announce(`That’s ${largeCount} large and ${smallCount} small numbers`);

    stopTimer();
    setTimeRemaining(null);
    setTimerHint('Timer will start after the target locks.');
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
    announce('Timer is live');
    setTimerHint('Timer running');
    setTargetHint('Timer started. Lock in your answer.');
    startTimer();
  };

  const revealRoundWithInput = (largeCount: number) => {
    registerUserGesture();
    if (!canRevealRound) return;
    if (challengesCompleted === DAILY_LIMIT - 1 && !lastGoAnnouncedRef.current) {
      announce('and this is your last go today. Make sure you come back tomorrow.');
      lastGoAnnouncedRef.current = true;
    }
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
      announce("Welcome to Acer Challenge. Five rounds per day, sixty seconds each. Good luck.");
      welcomeSpokenRef.current = true;
    }
  };

  return (
    <>
      {!hasStarted ? (
        <div className="startOverlay">
            <div className="startOverlayCard">
              <h2>Acer Challenge</h2>
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
            Daily numbers challenge. Register once, then play 5 timed rounds per day.
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
        {!profile ? (
          <div className="registrationPane">
            <div className="registrationCard">
              <h2>Create your challenge ID</h2>
              <p className="muted">
                Usernames are public, email stays private. No real names, no social profiles, and no chat.
              </p>
              <form className="registrationForm" onSubmit={handleRegisterSubmit}>
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  autoComplete="off"
                  placeholder="Nickname only"
                  value={registrationData.username}
                  onChange={(event) =>
                    setRegistrationData((prev) => ({ ...prev, username: event.target.value }))
                  }
                />

                <label htmlFor="email">Email (private)</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="off"
                  placeholder="you@example.com"
                  value={registrationData.email}
                  onChange={(event) =>
                    setRegistrationData((prev) => ({ ...prev, email: event.target.value }))
                  }
                />

                <label htmlFor="ageBand">Age band</label>
                <select
                  id="ageBand"
                  value={registrationData.ageBand}
                  onChange={(event) =>
                    setRegistrationData((prev) => ({ ...prev, ageBand: event.target.value as AgeBand }))
                  }
                >
                  {AGE_BANDS.map((band) => (
                    <option key={band} value={band}>
                      {band}
                    </option>
                  ))}
                </select>

                {registrationError ? <div className="formError">{registrationError}</div> : null}
                <button type="submit">Register</button>
              </form>
            </div>
          </div>
        ) : (
          <>
            <div className="controls">
              <div>
                <label htmlFor="largeCount">Large numbers (0–4)</label>
                <select
                  id="largeCount"
                  value={largeCount}
                  onChange={(event) => setLargeCount(Number(event.target.value))}
                  disabled={roundActive}
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                  <option value={4}>4</option>
                </select>
              </div>
              <div>
                <label htmlFor="smallCount">Small numbers</label>
                <input id="smallCount" type="number" value={6 - largeCount} disabled />
              </div>
              <div>
                <label>Player</label>
                <div className="controlValue">{profile.username}</div>
              </div>
              <div>
                <label>Age band</label>
                <div className="controlValue">{profile.ageBand}</div>
              </div>
              <div className="controlStack">
                <div className="controlGroup">
                  <label>Daily challenges</label>
                  <div className="controlValue">
                    {challengesCompleted} / {DAILY_LIMIT}
                  </div>
                </div>
                <div className="smallNote dailyScoreNote">Daily score: {dailyTotalScore}</div>
              </div>
              <div>
                <label>Timer</label>
                <div className="controlValue">60 seconds (fixed)</div>
              </div>

              <div className="rowRight">
                <button id="newRoundBtn" disabled={!canRevealRound} onClick={() => revealRoundWithInput(largeCount)}>
                  {dailyLimitReached ? 'Daily limit reached' : roundActive ? 'Round in progress' : 'Reveal round'}
                </button>
                <button id="backBtn" className="btnGhost" disabled={!canBack} onClick={handleBack}>
                  Back
                </button>
                <button id="resetWorkBtn" className="btnGhost" disabled={!canReset} onClick={handleReset}>
                  Reset work
                </button>
              </div>
              <div className="controlNote">
                {roundResult
                  ? `Last round: ${roundResult.userFinalValue ?? '—'} · ${roundResult.points} pts (accuracy ${roundResult.accuracyScore}, time ${roundResult.timeScore})`
                  : 'Complete a round to log your first score.'}
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
                  interactionEnabled={canInteract}
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
                <div className="statusBox resultPanel">
                  <b>Result of this round!</b>
                  <div style={{ height: 10 }} />
                  {roundResult ? (
                    <>
                      <div>
                        Your answer:{' '}
                        {roundResult.didSubmit && roundResult.userFinalValue !== null
                          ? roundResult.userFinalValue
                          : 'FAIL!'}{' '}
                        – Points scored: {roundResult.points}
                      </div>
                      <div style={{ height: 12 }} />
                      <div className="bestAnswerLabel">
                        {roundResult.bestSolution?.diff === 0 ? 'Correct answer' : 'The Best Answer is'}
                      </div>
                      {roundResult.bestSolution ? (
                        <>
                          <div
                            className={`bestAnswerValue${roundResult.bestSolution.diff === 0 ? ' isExact' : ''}`}
                          >
                            {roundResult.bestSolution.value}
                          </div>
                          <div className="bestAnswerSteps">{typedBestSteps}</div>
                        </>
                      ) : (
                        <div className="muted">Best answer will appear here after the round.</div>
                      )}
                    </>
                  ) : (
                    <div className="muted">Complete a round to view the result and best answer.</div>
                  )}
                </div>
                <div className="statusBox">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <b>Working</b>
                    <span className="muted">{workMeta}</span>
                  </div>
                  <div style={{ height: 10 }} />
                  <div className="workArea">{workLines.length ? workLines.join('\n') : 'No steps yet.'}</div>
                </div>

                <div className="statusBox leaderboardPanel">
                  <div className="leaderboardHeader">
                    <div>
                      <b>Leaderboards</b>
                      <div className="smallNote">Acer benchmark is shown as a reference line only.</div>
                    </div>
                    <div>
                      <label htmlFor="ageFilter">Age band filter</label>
                      <select
                        id="ageFilter"
                        value={ageFilter}
                        onChange={(event) => setAgeFilter(event.target.value as 'All' | AgeBand)}
                      >
                        <option value="All">All age bands</option>
                        {AGE_BANDS.map((band) => (
                          <option key={band} value={band}>
                            {band}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="leaderboardGrid">
                    {[
                      { key: 'personal', label: 'Personal best' },
                      { key: 'today', label: 'Today' },
                      { key: 'week', label: 'This week' },
                      { key: 'month', label: 'This month' },
                      { key: 'all', label: 'All time' }
                    ].map((section) => {
                      const entries = buildLeaderboard(section.key as 'personal' | 'today' | 'week' | 'month' | 'all');
                      return (
                        <div key={section.key} className="leaderboardSection">
                          <div className="leaderboardTitle">{section.label}</div>
                          <ol className="leaderboardList">
                            {entries.length ? (
                              entries.map((entry, index) => (
                                <li
                                  key={`${section.key}-${entry.name}`}
                                  className={`leaderboardEntry${entry.isUser ? ' isUser' : ''}`}
                                >
                                  <span className="leaderboardRank">{index + 1}.</span>
                                  <span className="leaderboardName">{entry.name}</span>
                                  <span className="leaderboardScore">{entry.score}</span>
                                </li>
                              ))
                            ) : (
                              <li className="leaderboardEmpty">No scores yet.</li>
                            )}
                          </ol>
                        </div>
                      );
                    })}
                  </div>
                  <div className="benchmarkLine">Acer benchmark today: {acerBenchmarkScore}</div>
                </div>
              </div>

              <HowToPlay />
            </div>
          </>
        )}
      </div>

      {showDailyCompleteModal ? (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modalCard">
            <p>Thanks for challenging Acer. See you tomorrow.</p>
            <button type="button" onClick={() => setShowDailyCompleteModal(false)}>
              OK
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
