import {afterEach, describe, expect, it, vi} from 'vitest';

async function load() {
  vi.resetModules();
  return (await import('./apiUrl')).API_URL;
}

describe('API_URL', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('uses VITE_API_URL without its trailing slash', async () => {
    // SST's service URL ends in a slash
    vi.stubEnv('VITE_API_URL', 'https://api.gameofthings.fun/');
    expect(await load()).toBe('https://api.gameofthings.fun');
  });

  it('falls back to the local server', async () => {
    vi.stubEnv('VITE_API_URL', undefined as unknown as string);
    expect(await load()).toBe('http://localhost:3001');
  });
});
