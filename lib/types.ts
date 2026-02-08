export type TileKind = 'large' | 'small' | 'result';

export interface Tile {
  id: string;
  value: number;
  kind: TileKind;
  revealed: boolean;
}

export type Operation = '+' | '-' | '*' | '/';

export type GamePhase = 'IDLE' | 'REVEALING_TILES' | 'TARGET_ROLLING' | 'READY' | 'RUNNING' | 'ENDED';

export type AgeBand = 'Under 8' | '8–10' | '11–13' | '14–16' | '16+';

export interface LeaderboardEntry {
  name: string;
  ageBand: AgeBand;
  score: number;
  isUser?: boolean;
}

export interface UserProfile {
  username: string;
  email: string;
  ageBand: AgeBand;
  createdAt: number;
}

export interface ChallengeScore {
  score: number;
  accuracyScore: number;
  timeScore: number;
  diff: number;
  exact: boolean;
  timeRemaining: number;
  submittedAt: number;
}

export interface DailyScore {
  dateKey: string;
  totalScore: number;
  challengeScores: ChallengeScore[];
  username: string;
  ageBand: AgeBand;
  updatedAt: number;
}

export interface HistoryItem {
  ts: number;
  tilesAtStart: number[];
  target: number;
  userFinalValue: number | null;
  userSteps: string[];
  bestFinalValue: number | null;
  bestSteps: string[];
  points: number;
  didSubmit?: boolean;
  outcome?: 'OK' | 'FAIL';
}

export interface BestSolution {
  value: number;
  diff: number;
  steps: string[];
}

export interface RoundPayload {
  tiles: number[];
  target: number;
  seed?: string;
}
