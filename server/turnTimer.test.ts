import {describe, expect, it} from 'vitest';
import {timerPayload, timerUpdate} from './turnTimer';

describe('timerUpdate', () => {
  it('writes nothing when the timer is off', () => {
    expect(timerUpdate(undefined, ['Ann'])).toEqual({clause: '', values: {}, deadline: undefined});
  });

  it('sets the deadline one turn length from now', () => {
    const update = timerUpdate(30, ['Ann', 'Ben'], 1_000);
    expect(update.deadline).toBe(31_000);
    expect(update.values).toEqual({':td': 31_000});
    expect(update.clause).toContain(':td');
  });

  it('clears the deadline once nobody is left to play', () => {
    expect(timerUpdate(30, [], 1_000).deadline).toBeNull();
  });
});

describe('timerPayload', () => {
  it('is empty when the timer is off', () => {
    expect(timerPayload(undefined)).toEqual({});
  });

  it('carries the deadline with the server clock', () => {
    expect(timerPayload(5_000, 2_000)).toEqual({turnDeadline: 5_000, serverTime: 2_000});
    expect(timerPayload(null, 2_000)).toEqual({turnDeadline: null, serverTime: 2_000});
  });
});
