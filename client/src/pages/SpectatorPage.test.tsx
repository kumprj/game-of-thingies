import {render, screen, waitFor, act} from '@testing-library/react';
import {beforeEach, describe, it, expect, vi} from 'vitest';
import {BrowserRouter, MemoryRouter, Route, Routes} from 'react-router-dom';
import SpectatorPage from './SpectatorPage';
import axios, {socket} from '../gameConfig';

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

  it('renders answered names in pre-game lobby when available', async () => {
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
          answeredNames: ['Alice', 'Bob'],
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

    expect(await screen.findByTestId('spectator-answered-names')).toHaveTextContent('Answers in (2): Alice, Bob');
  });

  it('copies game code to clipboard on click', async () => {
    (axios.get as any).mockImplementation((url: string) => {
      if (url.endsWith('/entries')) return Promise.resolve({data: []});
      if (url.endsWith('/scores')) return Promise.resolve({data: []});
      return Promise.resolve({data: {gameId: 'TEST', title: 'Party Game', question: 'Q?', started: false}});
    });

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {clipboard: {writeText}});

    render(
      <MemoryRouter initialEntries={['/TEST/watch']}>
        <Routes>
          <Route path="/:gameId/watch" element={<SpectatorPage />} />
        </Routes>
      </MemoryRouter>
    );

    const codeBtn = await screen.findByRole('button', {name: /game code test/i});
    expect(codeBtn).toHaveTextContent('Code: TEST');

    await act(async () => {
      codeBtn.click();
    });

    expect(writeText).toHaveBeenCalledWith('TEST');
    expect(screen.getByText('✓ Copied!')).toBeInTheDocument();
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

  it('updates turn, answers and scores live as people guess', async () => {
    let entries = [
      {entryId: '1', authorName: 'Alice', text: 'Dogs', guessed: false, revealed: true},
      {entryId: '2', authorName: 'Bob', text: 'Cats', guessed: false, revealed: true}
    ];
    let scores: any[] = [];
    (axios.get as any).mockImplementation((url: string) => {
      if (url.endsWith('/entries')) return Promise.resolve({data: entries});
      if (url.endsWith('/scores')) return Promise.resolve({data: scores});
      return Promise.resolve({data: {gameId: 'TEST', title: 'Party Game', question: 'Q?', started: true,
        turnOrder: ['Alice', 'Bob']}});
    });

    render(
      <MemoryRouter initialEntries={['/TEST/watch']}>
        <Routes>
          <Route path="/:gameId/watch" element={<SpectatorPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(await screen.findByText(/Alice's turn to guess/)).toBeInTheDocument();

    const fire = async (event: string, data?: any) => {
      const handler = (socket.on as any).mock.calls.filter((c: any[]) => c[0] === event).pop()[1];
      await act(async () => { handler(data); });
    };

    // Wrong guess rotates the turn
    await fire('wrongAnswer', {playerName: 'Alice', guess: 'Cats'});
    await fire('nextTurn', {currentPlayer: 'Bob', turnOrder: ['Bob', 'Alice']});
    expect(await screen.findByText(/Bob's turn to guess/)).toBeInTheDocument();

    // Correct guess: entry flips to guessed, score appears, turn order shrinks
    entries = [{...entries[0]}, {...entries[1], guessed: true}];
    scores = [{playerName: 'Alice', score: 1}];
    await fire('scoreUpdated', {playerName: 'Alice', authorName: 'Bob', guess: 'Cats'});
    await fire('entriesUpdated');
    await fire('nextTurn', {currentPlayer: 'Alice', turnOrder: ['Alice']});
    expect(await screen.findByText('✓ Written by Bob')).toBeInTheDocument();
    expect(await screen.findByText(/Alice's turn to guess/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('Alice').length).toBeGreaterThan(0));
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
