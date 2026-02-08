import type { HistoryItem } from './types';

const HISTORY_KEY = 'acer_challenge_history_v2';

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
