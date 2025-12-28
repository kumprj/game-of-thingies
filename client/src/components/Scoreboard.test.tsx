// src/components/Scoreboard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Scoreboard from './Scoreboard';

describe('Scoreboard Component', () => {
  const mockScores = [
    { playerName: 'Alice', score: 10 },
    { playerName: 'Bob', score: 5 },
    { playerName: 'Charlie', score: 2 },
  ];

  it('renders all players and scores', () => {
    render(<Scoreboard scores={mockScores} />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();

    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('assigns correct ranks', () => {
    render(<Scoreboard scores={mockScores} />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });
});
