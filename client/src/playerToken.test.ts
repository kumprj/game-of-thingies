import {describe, it, expect, beforeEach, vi} from 'vitest';

describe('axios player token interceptor (#90)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.resetModules();
  });

  it('creates the token on first request and reuses it', async () => {
    const {default: axios} = await import('./gameConfig');
    const seen: Array<string | undefined> = [];
    const adapter = async (config: any) => {
      seen.push(config.headers.get('x-player-token'));
      return {data: {}, status: 200, statusText: 'OK', headers: {}, config};
    };
    await axios.get('/a', {adapter});
    await axios.get('/b', {adapter});
    expect(seen[0]).toBeTruthy();
    expect(seen[1]).toBe(seen[0]);
    expect(window.localStorage.getItem('got_playerToken')).toBe(seen[0]);
  });
});
