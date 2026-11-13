import type {Entry, Game} from '../types/index';

/** An APNs device or Live Activity token; `sandbox` is true for development builds. */
export type ApnsToken = {token: string; sandbox: boolean};

/**
 * A game row as stored in the Games table: the public `Game` fields (some are only set once the game
 * starts) plus what the server keeps private. Never send it to clients as is.
 */
export type GameItem = Omit<Game, 'started' | 'turnOrder'> & {
  started?: boolean;
  turnOrder?: string[];
  hostToken: string;
  /** Lowercased player name -> the device token that claimed it. */
  playerTokens?: Record<string, string>;
  /** Lowercased player name -> the APNs token for "it's your turn" notifications (#71). */
  pushTokens?: Record<string, ApnsToken>;
  /** Lowercased player name -> the push token of their Live Activity (#71). */
  activityTokens?: Record<string, ApnsToken>;
  expiresAt: number;
  /** Games created before the rename stored the title here. */
  gameOwner?: string;
};

/** An entry row as stored in the Entries table (includes the author's name and token). */
export type EntryItem = Pick<Entry, 'entryId' | 'gameId' | 'createdAt'> & {
  authorName: string;
  authorToken?: string;
  text: string;
  revealed?: boolean;
  guessed?: boolean;
  expiresAt: number;
};
