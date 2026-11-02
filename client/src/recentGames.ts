export interface RecentGame {
  gameId: string;
  title: string;
  lastVisited: number;
}

const STORAGE_KEY = 'got_recent_games';
const MAX_RECENT_GAMES = 5;

export function getRecentGames(): RecentGame[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentGame(gameId: string, title?: string | null): void {
  if (typeof window === 'undefined' || !gameId) return;
  const list = getRecentGames().filter(g => g.gameId.toUpperCase() !== gameId.toUpperCase());
  list.unshift({
    gameId: gameId.toUpperCase(),
    title: (title && title.trim()) || gameId.toUpperCase(),
    lastVisited: Date.now()
  });
  if (list.length > MAX_RECENT_GAMES) list.length = MAX_RECENT_GAMES;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

export function removeRecentGame(gameId: string): void {
  if (typeof window === 'undefined' || !gameId) return;
  const list = getRecentGames().filter(g => g.gameId.toUpperCase() !== gameId.toUpperCase());
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}
