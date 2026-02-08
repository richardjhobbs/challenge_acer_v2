import type { ChallengeScore, DailyScore, UserProfile, HistoryItem } from './types';

const HISTORY_KEY = 'acer_challenge_history_v2';
const PROFILE_KEY = 'acer_profile';
const DAILY_SCORES_KEY = 'acer_daily_scores';
const ACER_BENCHMARK_KEY = 'acer_challenge_acer_benchmark_v2';

export function loadHistory(): HistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function saveHistory(item: HistoryItem) {
  if (typeof window === 'undefined') return;
  const items = loadHistory();
  items.push(item);
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}

export function clearHistory() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(HISTORY_KEY);
}

export function loadProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserProfile) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearProfile() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PROFILE_KEY);
}

export function loadDailyScores(): DailyScore[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(DAILY_SCORES_KEY);
    return raw ? (JSON.parse(raw) as DailyScore[]) : [];
  } catch {
    return [];
  }
}

export function saveDailyScores(scores: DailyScore[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DAILY_SCORES_KEY, JSON.stringify(scores));
}

export function recordDailyChallenge(profile: UserProfile, dateKey: string, challenge: ChallengeScore): DailyScore[] {
  const scores = loadDailyScores();
  const index = scores.findIndex((item) => item.dateKey === dateKey && item.username === profile.username);
  if (index >= 0) {
    const existing = scores[index];
    const nextChallenges = [...existing.challengeScores, challenge].slice(0, 5);
    const totalScore = nextChallenges.reduce((sum, item) => sum + item.score, 0);
    scores[index] = {
      ...existing,
      challengeScores: nextChallenges,
      totalScore,
      updatedAt: Date.now()
    };
  } else {
    scores.push({
      dateKey,
      totalScore: challenge.score,
      challengeScores: [challenge],
      username: profile.username,
      ageBand: profile.ageBand,
      updatedAt: Date.now()
    });
  }
  saveDailyScores(scores);
  return scores;
}

export function readAcerBenchmark(dateKey: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACER_BENCHMARK_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const score = map[dateKey];
    return typeof score === 'number' ? score : null;
  } catch {
    return null;
  }
}

export function getMockAcerBenchmark(dateKey: string): number {
  const seed = dateKey.split('-').reduce((sum, part) => sum + Number(part), 0);
  return 320 + (seed % 120);
}

export function loadAcerBenchmark(dateKey: string): number {
  if (typeof window === 'undefined') return 420;
  const existing = readAcerBenchmark(dateKey);
  if (typeof existing === 'number') return existing;
  try {
    const raw = window.localStorage.getItem(ACER_BENCHMARK_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const score = getMockAcerBenchmark(dateKey);
    map[dateKey] = score;
    window.localStorage.setItem(ACER_BENCHMARK_KEY, JSON.stringify(map));
    return score;
  } catch {
    return 420;
  }
}
