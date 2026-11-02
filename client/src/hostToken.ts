// The host token proves this device created the game. It's returned once by createGame and kept
// in localStorage, keyed by game id. If it's lost the device can no longer start or reset the game.
const key = (gameId: string) => `got_hostToken_${gameId}`;

export function saveHostToken(gameId: string, token: string) {
  try {
    window.localStorage.setItem(key(gameId), token);
  } catch { /* storage unavailable: this device just won't be the host */ }
}

export function getHostToken(gameId: string | undefined): string | null {
  if (!gameId) return null;
  try {
    return window.localStorage.getItem(key(gameId));
  } catch {
    return null;
  }
}
