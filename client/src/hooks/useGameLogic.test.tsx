// src/hooks/useGameLogic.test.tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import confetti from 'canvas-confetti';
import { useGameLogic } from './useGameLogic';
import axios, { socket } from '../gameConfig'; // Import the axios instance we created

// Mock React Router
vi.mock('react-router-dom', () => ({
  useParams: () => ({ gameId: 'test-room-1' }),
}));

// Mock Axios
vi.mock('../gameConfig', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { baseURL: '' }
  },
  socket: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }
}));

describe('useGameLogic Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('got_hostToken_test-room-1', 'secret-token');
    // Default GET response
    (axios.get as any).mockResolvedValue({ data: [] });
  });

  it('initializes and fetches game data', async () => {
    (axios.get as any).mockImplementation((url: string) => {
      if (url.includes('/entries')) return Promise.resolve({ data: [{ entryId: '1', text: 'Test Answer', authorName: 'Bob' }] });
      if (url.includes('/scores')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: { question: 'What is cool?' } });
    });

    const { result } = renderHook(() => useGameLogic());

    await waitFor(() => {
      expect(result.current.gameQuestion).toBe('What is cool?');
      expect(result.current.entries).toHaveLength(1);
    });
  });

  it('addEntry sends post request and updates list', async () => {
    const { result } = renderHook(() => useGameLogic());

    // Setup input
    act(() => {
      result.current.setAuthorName('Alice');
      result.current.setEntryText('My Answer');
    });

    // Mock successful post
    (axios.post as any).mockResolvedValueOnce({});
    (axios.get as any).mockResolvedValueOnce({ data: [] }); // Re-fetch entries

    await act(async () => {
      await result.current.addEntry();
    });

    expect(axios.post).toHaveBeenCalledWith(
        '/api/games/test-room-1/entries',
        { authorName: 'Alice', text: 'My Answer' }
    );
  });

  it('addEntry shows the server validation message', async () => {
    const { result } = renderHook(() => useGameLogic());
    act(() => {
      result.current.setAuthorName('Alice');
      result.current.setEntryText('My Answer');
    });
    (axios.post as any).mockRejectedValueOnce({ response: { data: { error: 'Answer is required' } } });

    await act(async () => {
      await result.current.addEntry();
    });

    expect(result.current.toast).toMatchObject({ message: 'Answer is required', type: 'error' });
  });

  it('startGame triggers the start endpoint', async () => {
    // We need entries to be able to start
    (axios.get as any).mockResolvedValue({ data: [{ entryId: '1', text: 'A' }] });

    const { result } = renderHook(() => useGameLogic());

    await waitFor(() => expect(result.current.entries.length).toBe(1));

    await act(async () => {
      await result.current.startGame();
    });

    expect(axios.post).toHaveBeenCalledWith(
      '/api/games/test-room-1/start', undefined, {headers: {'x-host-token': 'secret-token'}});
  });

  it('is the host only when this device holds the game\'s token', () => {
    const { result, unmount } = renderHook(() => useGameLogic());
    expect(result.current.isHost).toBe(true);
    unmount();
    window.localStorage.removeItem('got_hostToken_test-room-1');
    const { result: other } = renderHook(() => useGameLogic());
    expect(other.current.isHost).toBe(false);
  });
});


// --- Socket events, actions and derived state ---

const game = {question: 'What is cool?', gameOwner: 'Ann'};
const entry = (entryId: string, text: string, authorName: string, extra: object = {}) =>
    ({entryId, text, authorName, revealed: false, ...extra});

/** Serve the three GET endpoints the hook polls; later calls see whatever the fixtures hold now. */
function serve(fixtures: { game?: object; entries?: any[]; scores?: any[] }) {
  (axios.get as any).mockImplementation((url: string) => {
    if (url.endsWith('/entries')) return Promise.resolve({data: fixtures.entries ?? []});
    if (url.endsWith('/scores')) return Promise.resolve({data: fixtures.scores ?? []});
    return Promise.resolve({data: fixtures.game ?? game});
  });
}

/** The handler the hook registered for a socket event. */
function handler(name: string): (payload?: any) => void {
  const call = (socket.on as any).mock.calls.filter(([n]: [string]) => n === name).pop();
  if (!call) throw new Error(`No handler registered for "${name}"`);
  return call[1];
}

async function mount(fixtures: Parameters<typeof serve>[0] = {}) {
  serve(fixtures);
  const hook = renderHook(() => useGameLogic());
  await waitFor(() => expect(hook.result.current.gameQuestion).toBe(fixtures.game
      ? (fixtures.game as any).question : game.question));
  return hook;
}

describe('useGameLogic socket events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('joins the game room and leaves every listener behind on unmount', async () => {
    const {unmount} = await mount();
    expect(socket.emit).toHaveBeenCalledWith('joinGame', 'test-room-1');
    unmount();
    // Each listener is removed by its own handler, never by event name alone
    for (const name of ['entriesUpdated', 'gameStarted', 'wrongAnswer', 'gameReset', 'scoreUpdated', 'nextTurn',
      'connect', 'disconnect']) {
      expect(socket.off).toHaveBeenCalledWith(name, handler(name));
    }
    expect((socket.off as any).mock.calls.every((call: unknown[]) => call.length === 2)).toBe(true);
  });

  it('refetches the answers when someone adds one', async () => {
    const {result} = await mount();
    serve({entries: [entry('1', 'Offside', 'Ben')]});
    await act(async () => handler('entriesUpdated')());
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
  });

  it('shows who goes first when the game starts', async () => {
    const {result} = await mount();
    await act(async () => handler('gameStarted')({turnOrder: ['Ben', 'Ann']}));
    expect(result.current.turnOrder).toEqual(['Ben', 'Ann']);
    expect(result.current.currentPlayer).toBe('Ben');
    expect(result.current.toast).toMatchObject({type: 'success'});
    expect(result.current.toast?.message).toMatch(/game has started/);
  });

  it('moves the turn on', async () => {
    const {result} = await mount();
    act(() => handler('nextTurn')({currentPlayer: 'Cy', turnOrder: ['Cy', 'Ann']}));
    expect(result.current.currentPlayer).toBe('Cy');
    expect(result.current.turnOrder).toEqual(['Cy', 'Ann']);
    act(() => handler('nextTurn')({currentPlayer: null, turnOrder: []}));
    expect(result.current.currentPlayer).toBeNull();
  });

  it('tells everyone about a wrong guess', async () => {
    const {result} = await mount();
    await act(async () => handler('wrongAnswer')({playerName: 'Ann', guess: 'Offside'}));
    expect(result.current.toast).toEqual({
      message: "❌ Ann guessed wrong for 'Offside'!", type: 'error', duration: 3000,
    });
  });

  it('celebrates a right guess and refreshes the scores', async () => {
    const {result} = await mount();
    serve({scores: [{playerName: 'Ann', score: 1}]});
    await act(async () => handler('scoreUpdated')({playerName: 'Ann', authorName: 'Ben', guess: 'Offside'}));
    expect(confetti).toHaveBeenCalled();
    expect(result.current.toast?.message).toBe("🎉 Ann got it right! The answer was 'Offside', written by Ben");
    await waitFor(() => expect(result.current.scores).toEqual([{playerName: 'Ann', score: 1}]));
  });

  it('counts a new round so the page can clear its form', async () => {
    const {result} = await mount();
    expect(result.current.resetCount).toBe(0);
    await act(async () => handler('gameReset')());
    expect(result.current.resetCount).toBe(1);
    expect(result.current.toast?.message).toMatch(/new question/);
  });

  describe('a game that does not exist', () => {
    afterEach(() => vi.useRealTimers());
    const missing = () => Promise.reject({response: {status: 404, data: {error: 'Game not found'}}});

    it('flags the game as not found', async () => {
      (axios.get as any).mockImplementation((url: string) =>
          url.endsWith('/entries') || url.endsWith('/scores') ? Promise.resolve({data: []}) : missing());
      const {result} = renderHook(() => useGameLogic());
      await waitFor(() => expect(result.current.gameNotFound).toBe(true));
    });

    it('stops polling instead of retrying forever', async () => {
      (axios.get as any).mockImplementation((url: string) =>
          url.endsWith('/entries') || url.endsWith('/scores') ? Promise.resolve({data: []}) : missing());
      const {result} = renderHook(() => useGameLogic());
      await waitFor(() => expect(result.current.gameNotFound).toBe(true));
      vi.useFakeTimers();
      (axios.get as any).mockClear();
      act(() => handler('disconnect')());
      await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
      expect(axios.get).not.toHaveBeenCalled();
    });

    it('keeps polling through other failures, like a dropped network', async () => {
      const {result} = await mount();
      vi.useFakeTimers();
      (axios.get as any).mockClear();
      (axios.get as any).mockRejectedValue(new Error('Network Error'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      act(() => handler('disconnect')());
      await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
      expect(axios.get).toHaveBeenCalledWith('/api/games/test-room-1');
      expect(result.current.gameNotFound).toBe(false);
    });
  });

  describe('losing the connection', () => {
    afterEach(() => vi.useRealTimers());

    it('polls until the socket reconnects', async () => {
      const {result} = await mount();
      vi.useFakeTimers();
      (axios.get as any).mockClear();

      act(() => handler('disconnect')());
      expect(result.current.toast).toMatchObject({message: 'Reconnecting...', type: 'error'});

      await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(axios.get).toHaveBeenCalledWith('/api/games/test-room-1/entries');

      (axios.get as any).mockClear();
      await act(async () => handler('connect')());
      expect(result.current.toast).toMatchObject({message: 'Connected!', type: 'success'});
      expect(axios.get).toHaveBeenCalled(); // one last sync

      (axios.get as any).mockClear();
      await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
      expect(axios.get).not.toHaveBeenCalled(); // polling stopped
    });
  });
});

describe('useGameLogic actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem('got_hostToken_test-room-1', 'secret-token');
  });
  afterEach(() => vi.useRealTimers());

  it('restores the player name and remembers a new one', async () => {
    window.localStorage.setItem('got_authorName', 'Ann');
    const {result} = await mount();
    expect(result.current.authorName).toBe('Ann');
    act(() => result.current.setAuthorName('Ben'));
    expect(window.localStorage.getItem('got_authorName')).toBe('Ben');
  });

  it('ignores a second addEntry while the first is still in flight', async () => {
    const {result} = await mount();
    act(() => {
      result.current.setAuthorName('Ann');
      result.current.setEntryText('Offside');
    });
    let finish!: () => void;
    (axios.post as any).mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));

    // Both calls run in the same render, as a double-tap would
    let first!: Promise<void>;
    await act(async () => {
      first = result.current.addEntry();
      await result.current.addEntry();
    });
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(result.current.addEntryLoading).toBe(true);

    finish();
    await act(async () => { await first; });
    expect(result.current.addEntryLoading).toBe(false);
  });

  it('ignores an answer with no text or no name, or once the game has started', async () => {
    const {result} = await mount();
    await act(async () => { await result.current.addEntry(); });
    act(() => result.current.setAuthorName('Ann'));
    await act(async () => { await result.current.addEntry(); });
    expect(axios.post).not.toHaveBeenCalled();

    const started = await mount({game: {...game, started: true}, entries: [entry('1', 'A', 'Ben')]});
    await waitFor(() => expect(started.result.current.started).toBe(true));
    act(() => { started.result.current.setAuthorName('Ann'); started.result.current.setEntryText('Late'); });
    await act(async () => { await started.result.current.addEntry(); });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('clears the box and confirms after adding an answer', async () => {
    const {result} = await mount();
    act(() => { result.current.setAuthorName('Ann'); result.current.setEntryText('Mine'); });
    (axios.post as any).mockResolvedValueOnce({});
    vi.useFakeTimers();
    await act(async () => {
      const done = result.current.addEntry();
      await vi.advanceTimersByTimeAsync(1000);
      await done;
    });
    expect(result.current.entryText).toBe('');
    expect(result.current.toast).toMatchObject({message: 'Entry added!', type: 'success'});
    expect(result.current.addEntryLoading).toBe(false);
  });

  it('keeps the answer and says so when adding fails', async () => {
    const {result} = await mount();
    act(() => { result.current.setAuthorName('Ann'); result.current.setEntryText('Mine'); });
    (axios.post as any).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.addEntry(); });
    expect(result.current.entryText).toBe('Mine');
    expect(result.current.toast).toMatchObject({message: 'Failed to add entry', type: 'error'});
    expect(result.current.addEntryLoading).toBe(false);
  });

  it('will not start a game with no answers', async () => {
    const {result} = await mount();
    await act(async () => { await result.current.startGame(); });
    expect(axios.post).not.toHaveBeenCalled();
    expect(result.current.toast).toMatchObject({message: 'Add some entries first!', type: 'error'});
  });

  it('reports a failed start and closes the confirmation', async () => {
    const {result} = await mount({entries: [entry('1', 'A', 'Ben')]});
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    act(() => result.current.setShowStartConfirm(true));
    (axios.post as any).mockRejectedValueOnce({response: {status: 500}});
    await act(async () => { await result.current.startGame(); });
    expect(result.current.toast).toMatchObject({message: 'Failed to start game', type: 'error'});
    expect(result.current.showStartConfirm).toBe(false);
    expect(result.current.started).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('shows the server\'s reason when the start is refused', async () => {
    const {result} = await mount({entries: [entry('1', 'A', 'Ben')]});
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    (axios.post as any).mockRejectedValueOnce({response: {status: 400, data: {error: 'Need at least 2 players to start'}}});
    await act(async () => { await result.current.startGame(); });
    expect(result.current.toast).toMatchObject({message: 'Need at least 2 players to start', type: 'error'});
  });

  it('reloads the page when someone else already started the game', async () => {
    const {result} = await mount({entries: [entry('1', 'A', 'Ben')]});
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    const reload = vi.fn();
    const location = window.location;
    Object.defineProperty(window, 'location', {configurable: true, value: {...location, reload}});
    try {
      (axios.post as any).mockRejectedValueOnce({response: {status: 409}});
      vi.useFakeTimers();
      await act(async () => {
        await result.current.startGame();
        await vi.advanceTimersByTimeAsync(1500);
      });
      expect(result.current.toast?.message).toMatch(/already started/);
      expect(reload).toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, 'location', {configurable: true, value: location});
    }
  });

  it('reads whether the game has started from the game, not from the answers', async () => {
    const revealed = await mount({entries: [entry('1', 'A', 'Ben', {revealed: true})]});
    expect(revealed.result.current.started).toBe(false);
    const started = await mount({game: {...game, started: true}});
    await waitFor(() => expect(started.result.current.started).toBe(true));
  });

  it('starts a new round with a trimmed question and a clean slate', async () => {
    const {result} = await mount({game: {...game, started: true}, entries: [entry('1', 'A', 'Ben')]});
    await waitFor(() => expect(result.current.started).toBe(true));
    act(() => result.current.setNewQuestion('  Best pizza?  '));
    (axios.post as any).mockResolvedValueOnce({});
    await act(async () => { await result.current.startNewRound(); });
    expect(axios.post).toHaveBeenCalledWith(
        '/api/games/test-room-1/reset', {question: 'Best pizza?'}, {headers: {'x-host-token': 'secret-token'}});
    expect(result.current.entries).toEqual([]);
    expect(result.current.started).toBe(false);
    expect(result.current.newQuestion).toBe('');
    expect(result.current.startNewRoundLoading).toBe(false);
  });

  it('stops loading when a new round fails', async () => {
    const {result} = await mount();
    (axios.post as any).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.startNewRound(); });
    expect(result.current.startNewRoundLoading).toBe(false);
  });

  describe('guessing', () => {
    const guess = async (result: any, response: object | Error) => {
      if (response instanceof Error) (axios.post as any).mockRejectedValueOnce(response);
      else (axios.post as any).mockResolvedValueOnce({data: response});
      await act(async () => { await result.current.guessAuthor('e1', 'Ben'); });
    };

    it('posts the guess as the current player and celebrates a right one', async () => {
      window.localStorage.setItem('got_authorName', 'Ann');
      const {result} = await mount({entries: [entry('e1', 'Offside', 'Ben')]});
      act(() => result.current.setGuessingEntry(result.current.entries[0]));
      await guess(result, {isCorrect: true});
      expect(axios.post).toHaveBeenCalledWith('/api/games/test-room-1/entries/e1/guess',
          {guesserName: 'Ann', guess: 'Ben'});
      expect(result.current.toast).toMatchObject({message: 'Correct!', type: 'success'});
      expect(result.current.guessingEntry).toBeNull();
      expect(result.current.guessLoading).toBe(false);
    });

    it('refetches the answers after a right guess', async () => {
      const fixtures = {entries: [entry('e1', 'Offside', 'Ben')]};
      const {result} = await mount(fixtures);
      await waitFor(() => expect(result.current.entries).toHaveLength(1));
      expect(result.current.entries[0].guessed).toBeFalsy();
      fixtures.entries = [entry('e1', 'Offside', 'Ben', {guessed: true})];
      await guess(result, {isCorrect: true});
      await waitFor(() => expect(result.current.entries[0]).toMatchObject({guessed: true}));
    });

    it('says so when the guess is wrong', async () => {
      const {result} = await mount({entries: [entry('e1', 'Offside', 'Ben')]});
      await guess(result, {isCorrect: false});
      expect(result.current.toast).toMatchObject({message: 'Wrong answer!', type: 'error', duration: 7000});
    });

    it('shows the server\'s message when a guess is refused', async () => {
      const {result} = await mount({entries: [entry('e1', 'Offside', 'Ben')]});
      await guess(result, Object.assign(new Error('409'), {response: {status: 409, data: {error: "It's not your turn"}}}));
      expect(result.current.toast).toMatchObject({message: "It's not your turn", type: 'error'});
      expect(result.current.guessLoading).toBe(false);
    });

    it('reports an error and lets the player try again', async () => {
      const {result} = await mount({entries: [entry('e1', 'Offside', 'Ben')]});
      await guess(result, new Error('offline'));
      expect(result.current.toast).toMatchObject({message: 'Error submitting guess', type: 'error'});
      expect(result.current.guessLoading).toBe(false);
      expect(result.current.guessingEntry).toBeNull();
    });
  });

  it('clears a toast once its time is up', async () => {
    const {result} = await mount();
    vi.useFakeTimers();
    act(() => result.current.setToast({message: 'Hi', type: 'success', duration: 2000}));
    expect(result.current.toast).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(result.current.toast).toBeNull();
  });
});

describe('useGameLogic derived state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('sorts answers alphabetically once the game starts so they do not give away who wrote them', async () => {
    const {result} = await mount({game: {...game, started: true},
      entries: [entry('1', 'banana', 'Ann'), entry('2', 'Apple', 'Ben')]});
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(result.current.sortedEntriesForDisplay.map(e => e.text)).toEqual(['Apple', 'banana']);
  });

  it('lists answers in the order they came in until the game starts', async () => {
    const {result} = await mount({entries: [
      entry('1', 'banana', 'Ann', {createdAt: '2026-01-01T00:00:02Z'}),
      entry('2', 'Apple', 'Ben', {createdAt: '2026-01-01T00:00:01Z'}),
    ]});
    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(result.current.sortedEntriesForDisplay.map(e => e.text)).toEqual(['Apple', 'banana']);
  });

  it('works out who has been guessed and who is left', async () => {
    const {result} = await mount({entries: [
      entry('1', 'A', 'Ann', {revealed: true, guessed: true}),
      entry('2', 'B', 'Ben', {revealed: true}),
      entry('3', 'C', 'Ben', {revealed: true}),
    ]});
    await waitFor(() => expect(result.current.entries).toHaveLength(3));
    expect(result.current.guessedNames).toEqual(['Ann']);
    expect(result.current.notGuessedNames).toEqual(['Ben']);
    expect(result.current.uniqueNames).toEqual(['Ann', 'Ben']);
    expect(result.current.allGuessed).toBe(false);
    expect(result.current.isLastEntry).toBe(false);
  });

  it('knows the last answer and a finished round', async () => {
    const last = await mount({entries: [
      entry('1', 'A', 'Ann', {revealed: true, guessed: true}),
      entry('2', 'B', 'Ben', {revealed: true}),
    ]});
    await waitFor(() => expect(last.result.current.entries).toHaveLength(2));
    expect(last.result.current.isLastEntry).toBe(true);

    const done = await mount({entries: [entry('1', 'A', 'Ann', {revealed: true, guessed: true})]});
    await waitFor(() => expect(done.result.current.allGuessed).toBe(true));
  });

  it('knows whose turn it is', async () => {
    window.localStorage.setItem('got_authorName', 'Ann');
    const {result} = await mount({game: {...game, turnOrder: ['Ann', 'Ben']}});
    await waitFor(() => expect(result.current.currentPlayer).toBe('Ann'));
    expect(result.current.isMyTurn).toBe(true);
    act(() => result.current.setAuthorName('Ben'));
    expect(result.current.isMyTurn).toBe(false);
  });
});
