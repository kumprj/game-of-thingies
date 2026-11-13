import {act, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import TurnTimer, {formatClock} from './TurnTimer';

describe('formatClock', () => {
  it.each([[0, '0:00'], [9, '0:09'], [75, '1:15'], [600, '10:00'], [-3, '0:00']])('%s -> %s', (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });
});

describe('TurnTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('renders nothing when the timer is off', () => {
    const {container} = render(<TurnTimer endsAt={null} hurry="Hurry up!"/>);
    expect(container).toBeEmptyDOMElement();
  });

  it('counts down to 0:00 and then tells the player to hurry, without disappearing', () => {
    render(<TurnTimer endsAt={Date.now() + 3_000} hurry="Hurry up!"/>);
    expect(screen.getByRole('timer')).toHaveTextContent('0:03');
    expect(screen.queryByText('Hurry up!')).not.toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.getByRole('timer')).toHaveTextContent('0:01');

    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(screen.getByText('Hurry up!')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(screen.getByText('Hurry up!')).toBeInTheDocument();
  });

  it('shows 0:00 straight away for a deadline already past', () => {
    render(<TurnTimer endsAt={Date.now() - 5_000} hurry="Hurry up!"/>);
    expect(screen.getByRole('timer')).toHaveTextContent('0:00');
    expect(screen.getByText('Hurry up!')).toBeInTheDocument();
  });

  it('restarts when a new deadline arrives', () => {
    const {rerender} = render(<TurnTimer endsAt={Date.now() + 1_000} hurry="Hurry up!"/>);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.getByText('Hurry up!')).toBeInTheDocument();
    rerender(<TurnTimer endsAt={Date.now() + 30_000} hurry="Hurry up!"/>);
    expect(screen.getByRole('timer')).toHaveTextContent('0:30');
    expect(screen.queryByText('Hurry up!')).not.toBeInTheDocument();
  });
});
