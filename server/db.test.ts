import {afterEach, describe, expect, it, vi} from 'vitest';

describe('tables', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('reads the table names SST sets', async () => {
    vi.stubEnv('GAMES_TABLE', 'game-of-things-dev-Games');
    vi.stubEnv('ENTRIES_TABLE', 'game-of-things-dev-Entries');
    vi.stubEnv('SCORES_TABLE', 'game-of-things-dev-Scores');
    const {tables} = await import('./db.js');
    expect(tables).toEqual({
      games: 'game-of-things-dev-Games',
      entries: 'game-of-things-dev-Entries',
      scores: 'game-of-things-dev-Scores',
    });
  });

  it('refuses to start without them, rather than guessing at production tables', async () => {
    vi.stubEnv('GAMES_TABLE', '');
    vi.stubEnv('ENTRIES_TABLE', 'Entries');
    vi.stubEnv('SCORES_TABLE', 'Scores');
    await expect(import('./db.js')).rejects.toThrow('GAMES_TABLE is not set');
  });
});

describe('expiresAt', () => {
  it('is a day after the write, in epoch seconds as DynamoDB TTL expects', async () => {
    vi.stubEnv('GAMES_TABLE', 'Games');
    vi.stubEnv('ENTRIES_TABLE', 'Entries');
    vi.stubEnv('SCORES_TABLE', 'Scores');
    const {expiresAt} = await import('./db.js');
    expect(expiresAt(Date.UTC(2026, 0, 1, 12, 0, 0, 999))).toBe(Date.UTC(2026, 0, 2, 12) / 1000);
  });
});
