// Manage per-device player token for game player identity

const STORAGE_KEY = 'got_playerToken';

export function getPlayerToken(): string {
  if (typeof window === 'undefined') return '';
  let token = window.localStorage.getItem(STORAGE_KEY);
  if (!token) {
    token = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
    try {
      window.localStorage.setItem(STORAGE_KEY, token);
    } catch {}
  }
  return token;
}
