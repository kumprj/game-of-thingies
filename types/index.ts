export interface Entry {
  entryId: string;
  gameId: string;
  authorName: string;
  authorToken?: string;
  text: string;
  createdAt: string;
  revealed: boolean;
  guessed: boolean;
}

export interface Game {
  gameId: string;
  title?: string;
  gameOwner: string;
  hostName?: string;
  question: string;
  createdAt: string;
  started: boolean;
  turnOrder: string[];
  playerTokens?: Record<string, string>;
}

export interface Score {
  playerName: string;
  score: number;
}
