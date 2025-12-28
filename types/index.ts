export interface Entry {
  entryId: string;
  gameId: string;
  authorName: string;
  text: string;
  createdAt: string;
  revealed: boolean;
  guessed: boolean;
}

export interface Game {
  gameId: string;
  gameOwner: string;
  question: string;
  createdAt: string;
  started: boolean;
  turnOrder: string[];
}

export interface Score {
  playerName: string;
  score: number;
}
