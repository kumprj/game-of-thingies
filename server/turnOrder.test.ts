import {describe, expect, it} from 'vitest';
import {buildTurnOrder} from './turnOrder';

const players = ['Ann', 'Ben', 'Cy', 'Di'];

describe('buildTurnOrder', () => {
  it('puts the player who went longest ago first', () => {
    for (let i = 0; i < 50; i++) {
      const order = buildTurnOrder(players, {Ann: 400, Ben: 100, Cy: 300, Di: 200});
      expect(order[0]).toBe('Ben');
    }
  });

  it('treats players who never went as oldest', () => {
    for (let i = 0; i < 50; i++) {
      expect(buildTurnOrder(players, {Ann: 1, Ben: 2, Di: 3})[0]).toBe('Cy');
    }
  });

  it('breaks ties randomly', () => {
    const firsts = new Set<string>();
    for (let i = 0; i < 200; i++) firsts.add(buildTurnOrder(players, {})[0]);
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('keeps every player exactly once and does not mutate the input', () => {
    const input = [...players];
    const order = buildTurnOrder(input, {Ann: 5});
    expect([...order].sort()).toEqual([...players].sort());
    expect(input).toEqual(players);
  });

  it('handles an empty player list', () => {
    expect(buildTurnOrder([], {})).toEqual([]);
  });

  it('ignores timestamps for names that are not players', () => {
    expect(buildTurnOrder(['Ann', 'Ben'], {Ann: 5, Ben: 9, Ghost: 1})[0]).toBe('Ann');
  });
});
