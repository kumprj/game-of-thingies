/**
 * An entry as GET /api/games/:id/entries returns it. The server hides what would give the game
 * away (#29): before the game starts, `text` is present only on the requester's own entries;
 * `authorName` is present only once the entry is `guessed`, and on the requester's own entries.
 * "Requester" means the x-player-token header matching the entry's author token.
 */
export interface Entry {
  entryId: string;
  gameId: string;
  authorName?: string;
  text?: string;
  createdAt: string;
  revealed: boolean;
  guessed: boolean;
  /** This entry was written by the requesting device. */
  mine: boolean;
}

export interface Game {
  gameId: string;
  title: string;
  hostName?: string;
  question: string;
  createdAt: string;
  started: boolean;
  turnOrder: string[];
  /** Everyone who wrote an answer this round (set when the game starts), for the guess picker. */
  players?: string[];
  /**
   * Before the game starts only: who has answered, deduped and sorted alphabetically (case-insensitive),
   * for the lobby line "Answers in (3): Alice, Bob, Carol". Names only. Never ordered or linked to
   * entries, so it can't reveal which text belongs to whom. Absent once the game has started
   * (`players` takes over).
   */
  answeredNames?: string[];
  /** Player name -> epoch ms of their last guess; picks the first player next round. Set when the game starts. */
  lastTurn?: Record<string, number>;
  /**
   * The per-turn timer length in seconds, set when the host starts the game with one; absent when
   * the timer is off.
   */
  turnSeconds?: number;
  /**
   * With the timer on: epoch ms when the current turn is due (null once nobody is left to play).
   * Compare it with `serverTime`, not the device clock. Nothing happens at the deadline: clients
   * show 0:00 and nudge the player.
   */
  turnDeadline?: number | null;
  /** The server's clock (epoch ms) when this was sent; sent with `turnDeadline`. */
  serverTime?: number;
}

export interface Score {
  playerName: string;
  score: number;
}
