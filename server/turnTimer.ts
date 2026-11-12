/** Shortest and longest per-turn timer a host can pick, in seconds. */
export const MIN_TURN_SECONDS = 10;
export const MAX_TURN_SECONDS = 600;

/**
 * What a turn change writes to the Games row when the timer is on: a SET clause (append it to the
 * UpdateExpression), its values, and the new deadline. The deadline is epoch ms, or null once
 * nobody is left to play. With the timer off everything is empty and `deadline` is undefined, so
 * an untimed game is written exactly as before. The server only publishes the deadline; it never
 * ends a turn itself, clients show 0:00 and nudge the player.
 */
export function timerUpdate(turnSeconds: number | undefined, nextOrder: string[], now = Date.now()) {
  if (!turnSeconds) return {clause: '', values: {} as Record<string, number | null>, deadline: undefined};
  const deadline = nextOrder.length > 0 ? now + turnSeconds * 1000 : null;
  return {clause: ', turnDeadline = :td', values: {':td': deadline} as Record<string, number | null>, deadline};
}

/**
 * The timer fields clients get with a turn: the deadline plus the server's clock, so a device
 * measures time left against the server's now instead of trusting its own clock. Empty when off.
 */
export function timerPayload(deadline: number | null | undefined, now = Date.now()) {
  return deadline === undefined ? {} : {turnDeadline: deadline, serverTime: now};
}
