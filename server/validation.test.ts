import {describe, expect, it} from 'vitest';
import {MAX_QUESTION_LENGTH} from './gameSetup';
import {
  checkNameLength, checkParam, DEFAULT_QUESTION, MAX_ANSWER_LENGTH, MAX_ID_LENGTH, MAX_NAME_LENGTH, MAX_TOKEN_LENGTH,
  validateEntryInput, validateEntryText, validateGuess, validateParam, validateReset, validateTokenHeaders
} from './validation';

const fakeRes = () => {
  const res: any = {code: 0, body: undefined};
  res.status = (c: number) => { res.code = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res;
};

describe('validateEntryInput', () => {
  it('accepts and trims valid name and answer', () => {
    expect(validateEntryInput({authorName: '  Alice  ', text: '  My Answer  '})).toEqual({
      ok: true,
      authorName: 'Alice',
      text: 'My Answer'
    });
  });

  it.each([
    undefined,
    null,
    'string',
    123,
    {},
    {authorName: 'Alice'},
    {text: 'Answer'},
    {authorName: 123, text: 'Answer'},
    {authorName: 'Alice', text: 456},
    {authorName: null, text: null}
  ])('rejects non-string input %j', (body) => {
    expect(validateEntryInput(body)).toEqual({ok: false, error: 'Name and answer must be text'});
  });

  it('rejects missing or empty trimmed name', () => {
    expect(validateEntryInput({authorName: '', text: 'Answer'})).toEqual({ok: false, error: 'Name is required'});
    expect(validateEntryInput({authorName: '   ', text: 'Answer'})).toEqual({ok: false, error: 'Name is required'});
  });

  it('rejects missing or empty trimmed answer', () => {
    expect(validateEntryInput({authorName: 'Alice', text: ''})).toEqual({ok: false, error: 'Answer is required'});
    expect(validateEntryInput({authorName: 'Alice', text: '   '})).toEqual({ok: false, error: 'Answer is required'});
  });

  it('enforces maximum name length', () => {
    const validName = 'n'.repeat(MAX_NAME_LENGTH);
    const oversizeName = 'n'.repeat(MAX_NAME_LENGTH + 1);
    expect(validateEntryInput({authorName: validName, text: 'Answer'})).toMatchObject({ok: true, authorName: validName});
    expect(validateEntryInput({authorName: oversizeName, text: 'Answer'})).toEqual({
      ok: false,
      error: `Name must be ${MAX_NAME_LENGTH} characters or fewer`
    });
  });

  it('enforces maximum answer length', () => {
    const validAnswer = 'a'.repeat(MAX_ANSWER_LENGTH);
    const oversizeAnswer = 'a'.repeat(MAX_ANSWER_LENGTH + 1);
    expect(validateEntryInput({authorName: 'Alice', text: validAnswer})).toMatchObject({ok: true, text: validAnswer});
    expect(validateEntryInput({authorName: 'Alice', text: oversizeAnswer})).toEqual({
      ok: false,
      error: `Answer must be ${MAX_ANSWER_LENGTH} characters or fewer`
    });
  });
});

describe('validateEntryText', () => {
  it('accepts and trims valid answer text', () => {
    expect(validateEntryText({text: '  My Answer  '})).toEqual({
      ok: true,
      text: 'My Answer'
    });
  });

  it.each([
    undefined,
    null,
    'string',
    123,
    {},
    {text: 123},
    {text: null},
    {text: {}}
  ])('rejects non-string text %j', (body) => {
    expect(validateEntryText(body)).toEqual({ok: false, error: 'Answer must be text'});
  });

  it('rejects missing or empty trimmed answer', () => {
    expect(validateEntryText({text: ''})).toEqual({ok: false, error: 'Answer is required'});
    expect(validateEntryText({text: '   '})).toEqual({ok: false, error: 'Answer is required'});
  });

  it('enforces maximum answer length', () => {
    const validAnswer = 'a'.repeat(MAX_ANSWER_LENGTH);
    const oversizeAnswer = 'a'.repeat(MAX_ANSWER_LENGTH + 1);
    expect(validateEntryText({text: validAnswer})).toMatchObject({ok: true, text: validAnswer});
    expect(validateEntryText({text: oversizeAnswer})).toEqual({
      ok: false,
      error: `Answer must be ${MAX_ANSWER_LENGTH} characters or fewer`
    });
  });
});

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
