import {describe, expect, it} from 'vitest';
import {MAX_GAME_NAME_LENGTH, MAX_QUESTION_LENGTH, validateGameSetup} from './gameSetup';

describe('validateGameSetup', () => {
  it('trims both fields', () => {
    expect(validateGameSetup({name: '  Friday ', question: ' Worst power? '}))
        .toEqual({ok: true, name: 'Friday', question: 'Worst power?'});
  });

  it('accepts title instead of name', () => {
    expect(validateGameSetup({title: '  Friday ', question: ' Worst power? '}))
        .toEqual({ok: true, name: 'Friday', question: 'Worst power?'});
  });

  it.each([undefined, null, 'text', 42])('rejects a body of %s', (body) => {
    expect(validateGameSetup(body)).toMatchObject({ok: false});
  });

  it.each([
    [{question: 'Q'}, 'must be text'],
    [{name: 'N'}, 'must be text'],
    [{name: 5, question: 'Q'}, 'must be text'],
    [{name: '   ', question: 'Q'}, 'Title is required'],
    [{name: 'N', question: '  '}, 'Question is required'],
  ])('rejects %j', (body, message) => {
    const result = validateGameSetup(body);
    expect(result).toMatchObject({ok: false});
    expect((result as {error: string}).error).toContain(message);
  });

  it('enforces the length limits after trimming', () => {
    expect(validateGameSetup({name: ` ${'a'.repeat(MAX_GAME_NAME_LENGTH)} `, question: 'Q'})).toMatchObject({ok: true});
    expect(validateGameSetup({name: 'a'.repeat(MAX_GAME_NAME_LENGTH + 1), question: 'Q'})).toMatchObject({ok: false});
    expect(validateGameSetup({name: 'N', question: 'q'.repeat(MAX_QUESTION_LENGTH)})).toMatchObject({ok: true});
    expect(validateGameSetup({name: 'N', question: 'q'.repeat(MAX_QUESTION_LENGTH + 1)})).toMatchObject({ok: false});
  });
});
