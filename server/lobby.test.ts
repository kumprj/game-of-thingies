import {describe, expect, it} from 'vitest';
import {answeredNames} from './lobby';

describe('answeredNames', () => {
  it('returns nothing for no entries', () => {
    expect(answeredNames([])).toEqual([]);
  });

  it('dedupes case-insensitively and sorts regardless of entry order', () => {
    const entries = [{authorName: 'carol'}, {authorName: 'Bob'}, {authorName: 'Alice'}, {authorName: 'CAROL'}, {authorName: 'Bob'}];
    expect(answeredNames(entries)).toEqual(['Alice', 'Bob', 'carol']);
  });

  it('skips entries without an author', () => {
    expect(answeredNames([{}, {authorName: 'Ann'}])).toEqual(['Ann']);
  });
});
