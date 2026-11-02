import {render, screen, waitFor} from '@testing-library/react';
import {beforeEach, describe, it, expect, vi} from 'vitest';
import {BrowserRouter, MemoryRouter, Route, Routes} from 'react-router-dom';
import SpectatorPage from './SpectatorPage';
import axios from '../gameConfig';

vi.mock('../gameConfig', () => ({
  default: {
    get: vi.fn(),
  },
  socket: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  API_URL: 'http://test',
}));

describe('SpectatorPage (#73)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders pre-game lobby with question and submitted count', async () => {
    (axios.get as any).mockImplementation((url: string) => {
      if (url.endsWith('/entries')) {
        return Promise.resolve({data: [{entryId: '1', text: 'Answer 1'}, {entryId: '2', text: 'Answer 2'}]});
      }
      if (url.endsWith('/scores')) {
        return Promise.resolve({data: []});
      }
      return Promise.resolve({
        data: {
          gameId: 'TEST',
          title: 'Party Game',
          question: 'What is your favorite animal?',
          started: false,
        }
      });
    });

    render(
      <MemoryRouter initialEntries={['/TEST/watch']}>
        <Routes>
          <Route path="/:gameId/watch" element={<SpectatorPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Party Game')).toBeInTheDocument();
    expect(screen.getByText('What is your favorite animal?')).toBeInTheDocument();
    expect(screen.getByText('2 answers submitted so far')).toBeInTheDocument();
    expect(screen.queryByText('Answer 1')).not.toBeInTheDocument(); // Does not spoil answers pre-game
  });

  it('renders in-game turn and revealed answers', async () => {
    (axios.get as any).mockImplementation((url: string) => {
      if (url.endsWith('/entries')) {
        return Promise.resolve({
          data: [
            {entryId: '1', authorName: 'Alice', text: 'Dogs', guessed: true, revealed: true},
            {entryId: '2', authorName: 'Bob', text: 'Cats', guessed: false, revealed: true}
          ]
        });
      }
      if (url.endsWith('/scores')) {
        return Promise.resolve({data: [{playerName: 'Alice', score: 1}]});
      }
      return Promise.resolve({
        data: {
          gameId: 'TEST',
          title: 'Party Game',
          question: 'What is your favorite animal?',
          started: true,
          turnOrder: ['Alice', 'Bob']
        }
      });
    });

    render(
      <MemoryRouter initialEntries={['/TEST/watch']}>
        <Routes>
          <Route path="/:gameId/watch" element={<SpectatorPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText(/Alice's turn to guess/)).toBeInTheDocument();
    expect(screen.getByText('Dogs')).toBeInTheDocument();
    expect(screen.getByText('✓ Written by Alice')).toBeInTheDocument();
    expect(screen.getByText('Cats')).toBeInTheDocument();
  });

  it('shows not-found state for unknown game', async () => {
    (axios.get as any).mockRejectedValueOnce({response: {status: 404}});

    render(
      <MemoryRouter initialEntries={['/NOPE/watch']}>
        <Routes>
          <Route path="/:gameId/watch" element={<SpectatorPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText('Game not found')).toBeInTheDocument();
  });
});
