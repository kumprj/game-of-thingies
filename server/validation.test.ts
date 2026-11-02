import {describe, expect, it} from 'vitest';
import {MAX_QUESTION_LENGTH} from './gameSetup';
import {
  checkNameLength, checkParam, DEFAULT_QUESTION, MAX_ID_LENGTH, MAX_NAME_LENGTH, MAX_TOKEN_LENGTH,
  validateGuess, validateParam, validateReset, validateTokenHeaders
} from './validation';

const fakeRes = () => {
  const res: any = {code: 0, body: undefined};
  res.status = (c: number) => { res.code = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res;
};

describe('validateReset', () => {
  it('trims the question', () => {
    expect(validateReset({question: '  Best pizza  '})).toEqual({ok: true, question: 'Best pizza'});
  });

  it.each([undefined, null, {}, {question: undefined}, {question: null}, {question: '   '}, {question: ''}, 'text', 5])(
      'falls back to the default for %j', (body) => {
        expect(validateReset(body)).toEqual({ok: true, question: DEFAULT_QUESTION});
      });

  it.each([5, true, ['a'], {a: 1}])('rejects a non-text question %j', (question) => {
    expect(validateReset({question})).toEqual({ok: false, error: 'Question must be text'});
  });

  it('enforces the question limit after trimming', () => {
    expect(validateReset({question: ` ${'q'.repeat(MAX_QUESTION_LENGTH)} `})).toMatchObject({ok: true});
    expect(validateReset({question: 'q'.repeat(MAX_QUESTION_LENGTH + 1)})).toMatchObject({ok: false});
  });
});

describe('validateGuess', () => {
  it('accepts two names unchanged', () => {
    expect(validateGuess({guesserName: ' Ann', guess: 'Ben'})).toEqual({ok: true, guesserName: ' Ann', guess: 'Ben'});
  });

  it.each([undefined, null, 'x', {}, {guesserName: 'A'}, {guess: 'B'}, {guesserName: 1, guess: 'B'},
    {guesserName: 'A', guess: ['B']}, {guesserName: {}, guess: null}])('rejects %j', (body) => {
    expect(validateGuess(body)).toMatchObject({ok: false});
  });

  it('enforces the name limit', () => {
    const max = 'n'.repeat(MAX_NAME_LENGTH);
    expect(validateGuess({guesserName: max, guess: max})).toMatchObject({ok: true});
    expect(validateGuess({guesserName: max + 'x', guess: 'B'})).toMatchObject({ok: false});
    expect(validateGuess({guesserName: 'A', guess: max + 'x'})).toMatchObject({ok: false});
  });
});

describe('checkNameLength / checkParam', () => {
  it('limits names', () => {
    expect(checkNameLength('a'.repeat(MAX_NAME_LENGTH))).toBeNull();
    expect(checkNameLength('a'.repeat(MAX_NAME_LENGTH + 1))).toContain('or fewer');
  });

  it('limits ids and player names', () => {
    expect(checkParam('gameId', 'ABCD')).toBeNull();
    expect(checkParam('entryId', 'e'.repeat(MAX_ID_LENGTH))).toBeNull();
    expect(checkParam('entryId', 'e'.repeat(MAX_ID_LENGTH + 1))).toContain('or fewer');
    expect(checkParam('playerName', 'p'.repeat(MAX_NAME_LENGTH))).toBeNull();
    expect(checkParam('playerName', 'p'.repeat(MAX_NAME_LENGTH + 1))).toContain('or fewer');
    expect(checkParam('gameId', undefined)).toBe('Invalid gameId');
  });

  it('validateParam responds 400 or continues', () => {
    let nexted = 0;
    const ok = fakeRes();
    validateParam({} as any, ok, () => nexted++, 'ABCD', 'gameId');
    expect(nexted).toBe(1);
    const bad = fakeRes();
    validateParam({} as any, bad, () => nexted++, 'x'.repeat(500), 'gameId');
    expect(nexted).toBe(1);
    expect(bad.code).toBe(400);
  });
});

describe('validateTokenHeaders', () => {
  const run = (headers: Record<string, unknown>) => {
    const res = fakeRes();
    let nexted = false;
    validateTokenHeaders({headers} as any, res, () => { nexted = true; });
    return {res, nexted};
  };

  it('passes missing and normal tokens', () => {
    expect(run({}).nexted).toBe(true);
    expect(run({'x-player-token': 'a'.repeat(MAX_TOKEN_LENGTH), 'x-host-token': 'h'}).nexted).toBe(true);
  });

  it('rejects oversize tokens', () => {
    const {res, nexted} = run({'x-host-token': 'a'.repeat(MAX_TOKEN_LENGTH + 1)});
    expect(nexted).toBe(false);
    expect(res.code).toBe(400);
    expect(res.body).toEqual({error: 'Invalid x-host-token header'});
  });
});
