export type TileKind = 'large' | 'small' | 'result';

export interface Tile {
  id: string;
  value: number;
  kind: TileKind;
  revealed: boolean;
}

export type Operation = '+' | '-' | '*' | '/';

export type GamePhase = 'IDLE' | 'REVEALING_TILES' | 'TARGET_ROLLING' | 'READY' | 'RUNNING' | 'ENDED';

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
