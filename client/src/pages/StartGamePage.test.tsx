// src/StartGamePage.test.tsx
import {render, screen, fireEvent, act, within} from '@testing-library/react';
import {beforeEach, describe, it, expect, vi} from 'vitest';
import {BrowserRouter} from 'react-router-dom';
import StartGamePage from './StartGamePage';
import * as GameHook from '../hooks/useGameLogic';

// Mock the hook so we control the state
vi.mock('./hooks/useGameLogic');

describe('StartGamePage', () => {
  const defaultHookValues = {
    gameId: '123',
    gameTitle: 'Test Game',
    entries: [],
    scores: [],
    started: false,
    isHost: true,
    isLoading: false,
    addEntryLoading: false,
    entryText: '',
    authorName: '',
    guessedNames: [],
    notGuessedNames: [],
    turnOrder: [],
    // Mocks for functions
    setEntryText: vi.fn(),
    setAuthorName: vi.fn(),
    addEntry: vi.fn(),
    startGame: vi.fn(),
    setShowStartConfirm: vi.fn(),
    buttonRefs: {current: {}},
    sortedEntriesForDisplay: [],
    uniqueNames: [],
  };

  it('renders input fields when game is NOT started', () => {
    // @ts-ignore
    vi.spyOn(GameHook, 'useGameLogic').mockReturnValue(defaultHookValues);

    render(
        <BrowserRouter>
          <StartGamePage/>
        </BrowserRouter>
    );

    expect(screen.getByPlaceholderText('Your answer')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
    expect(screen.getByText('Add Answer')).toBeInTheDocument();
  });

  it('renders entry list when game IS started', () => {
    // @ts-ignore
    vi.spyOn(GameHook, 'useGameLogic').mockReturnValue({
      ...defaultHookValues,
      started: true,
      sortedEntriesForDisplay: [
        {entryId: '1', text: 'Funny Answer', authorName: 'Bob', guessed: false,
          gameId: 'testGame', createdAt: '2025-12-26T02:56:20.413Z', revealed: true}
      ],
      turnOrder: ['Alice'],
      currentPlayer: 'Alice',
      isMyTurn: true,
    });

    render(
        <BrowserRouter>
          <StartGamePage/>
        </BrowserRouter>
    );

    expect(screen.queryByPlaceholderText('Your answer')).not.toBeInTheDocument();
    expect(screen.getByText('Funny Answer')).toBeInTheDocument();
  });

  it('calls addEntry when button is clicked', async () => {
    const addEntryMock = vi.fn();

    // @ts-ignore
    vi.spyOn(GameHook, 'useGameLogic').mockReturnValue({
      ...defaultHookValues,
      entryText: 'Answer',
      authorName: 'Name',
      addEntry: addEntryMock,
    });

    render(
        <BrowserRouter>
          <StartGamePage/>
        </BrowserRouter>
    );

    const button = screen.getByText('Add Answer');
    await act(async () => {
      fireEvent.click(button);
    });

    expect(addEntryMock).toHaveBeenCalled();
  });

  it('disables Add Answer while the answer is being saved', () => {
    // @ts-ignore
    vi.spyOn(GameHook, 'useGameLogic').mockReturnValue({
      ...defaultHookValues, entryText: 'Answer', authorName: 'Name', addEntryLoading: true,
    });
    render(<BrowserRouter><StartGamePage/></BrowserRouter>);
    expect(screen.getByRole('button', {name: /saving/i})).toBeDisabled();
  });

  it('shows a not-found message with a way home instead of an empty game', () => {
    // @ts-ignore
    vi.spyOn(GameHook, 'useGameLogic').mockReturnValue({...defaultHookValues, gameId: 'ZZZZ', gameNotFound: true});
    render(<BrowserRouter><StartGamePage/></BrowserRouter>);
    expect(screen.getByRole('heading', {name: 'Game not found'})).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Back to Home'})).toHaveAttribute('href', '/');
    expect(screen.queryByPlaceholderText('Your answer')).not.toBeInTheDocument();
  });

  it('shows Start to the host', () => {
    // @ts-ignore
    vi.spyOn(GameHook, 'useGameLogic').mockReturnValue({...defaultHookValues, isHost: true});
    render(<BrowserRouter><StartGamePage/></BrowserRouter>);
    expect(screen.getByRole('button', {name: 'Start'})).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for the host/)).not.toBeInTheDocument();
  });

  it('hides Start from other players and shows waiting text', () => {
    // @ts-ignore
    vi.spyOn(GameHook, 'useGameLogic').mockReturnValue({...defaultHookValues, isHost: false});
    render(<BrowserRouter><StartGamePage/></BrowserRouter>);
    expect(screen.queryByRole('button', {name: 'Start'})).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for the host/)).toBeInTheDocument();
  });

  it('hides Start New Round from other players', () => {
    // @ts-ignore
    vi.spyOn(GameHook, 'useGameLogic').mockReturnValue({
      ...defaultHookValues, isHost: false, started: true, allGuessed: true,
    });
    render(<BrowserRouter><StartGamePage/></BrowserRouter>);
    expect(screen.queryByText('Start New Round')).not.toBeInTheDocument();
  });
});


// --- The rest of the page, driven by the state the hook would hand it ---

const answer = (entryId: string, text: string, authorName: string, extra: object = {}) =>
    ({entryId, text, authorName, gameId: '123', revealed: true, guessed: false, ...extra});

const baseHook = {
  gameId: 'ABCD', gameTitle: 'Friday night', gameQuestion: 'Worst superpower?',
  entries: [] as any[], scores: [] as any[], turnOrder: [] as string[], currentPlayer: null as string | null,
  started: false, isHost: true, entryText: '', authorName: '', newQuestion: '', resetCount: 0,
  isLoading: false, addEntryLoading: false, startNewRoundLoading: false, guessLoading: false,
  guessingEntry: null as any, showStartConfirm: false, showHowToPlay: false, showScores: false,
  toast: null as any, guessedNames: [] as string[], notGuessedNames: [] as string[],
  allGuessed: false, isLastEntry: false, isMyTurn: false, uniqueNames: [] as string[],
  sortedEntriesForDisplay: [] as any[], buttonRefs: {current: {}},
};

function renderPage(overrides: object = {}) {
  const actions = {
    setEntryText: vi.fn(), setAuthorName: vi.fn(), setNewQuestion: vi.fn(), setGuessingEntry: vi.fn(),
    setShowStartConfirm: vi.fn(), setShowHowToPlay: vi.fn(), setShowScores: vi.fn(),
    addEntry: vi.fn().mockResolvedValue(undefined), startGame: vi.fn(), startNewRound: vi.fn(),
    guessAuthor: vi.fn(), onEntryClick: vi.fn(),
  };
  // @ts-ignore
  vi.spyOn(GameHook, 'useGameLogic').mockReturnValue({...baseHook, ...actions, ...overrides});
  render(<BrowserRouter><StartGamePage/></BrowserRouter>);
  return actions;
}

/** A game in play: Ann (me) and Ben have each written an answer. */
const playing = (overrides: object = {}) => ({
  started: true, authorName: 'Ann', turnOrder: ['Ann', 'Ben'], currentPlayer: 'Ann', isMyTurn: true,
  uniqueNames: ['Ann', 'Ben'], notGuessedNames: ['Ann', 'Ben'],
  entries: [answer('1', 'Mine', 'Ann'), answer('2', 'Theirs', 'Ben')],
  sortedEntriesForDisplay: [answer('1', 'Mine', 'Ann'), answer('2', 'Theirs', 'Ben')],
  ...overrides,
});

describe('StartGamePage in detail', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('header', () => {
    it('shows the title, code and question', () => {
      renderPage();
      expect(screen.getByRole('heading', {name: 'Friday night'})).toBeInTheDocument();
      expect(screen.getByLabelText('Game code ABCD')).toBeInTheDocument();
      expect(screen.getByText('Worst superpower?')).toBeInTheDocument();
    });

    it('falls back to the code and a placeholder while loading', () => {
      renderPage({gameTitle: null, gameQuestion: null});
      expect(screen.getByRole('heading', {name: 'ABCD'})).toBeInTheDocument();
      expect(screen.getByText('Loading question...')).toBeInTheDocument();
    });

    it('shows the watch link with Watch on a screen label', () => {
      renderPage();
      expect(screen.getByRole('link', {name: 'Watch on a screen'})).toBeInTheDocument();
    });
  });

  describe('before the game starts', () => {
    it('lets me read my own answer but blurs everyone else\'s', () => {
      renderPage({
        authorName: 'Ann', entries: [answer('1', 'Mine', 'Ann'), answer('2', 'Theirs', 'Ben')],
        sortedEntriesForDisplay: [answer('1', 'Mine', 'Ann'), answer('2', 'Theirs', 'Ben')],
      });
      expect(screen.getByText('Mine')).toHaveClass('mine');
      expect(screen.getByLabelText('Hidden answer')).toHaveTextContent('Theirs');
      expect(screen.getByText('Answers (2)')).toBeInTheDocument();
    });

    it('says when nothing has been added', () => {
      renderPage();
      expect(screen.getByText('No entries yet')).toBeInTheDocument();
    });

    it('only lets me add an answer with both a name and text', () => {
      renderPage({entryText: 'Flying', authorName: ''});
      expect(screen.getByText('Add Answer')).toBeDisabled();
    });

    it('locks the form after I submit, and remembers that for this game', async () => {
      const actions = renderPage({entryText: 'Flying', authorName: 'Ann'});
      await act(async () => fireEvent.click(screen.getByText('Add Answer')));
      expect(actions.addEntry).toHaveBeenCalled();
      expect(window.localStorage.getItem('submitted_ABCD')).toBe('true');
      expect(screen.getByText('Submitted!')).toBeDisabled();
      expect(screen.getByPlaceholderText('Your answer')).toBeDisabled();
      expect(screen.getByPlaceholderText('Your name')).toBeDisabled();
    });

    it('stays locked after a reload, until a new round starts', () => {
      window.localStorage.setItem('submitted_ABCD', 'true');
      renderPage({entryText: 'x', authorName: 'Ann'});
      expect(screen.getByPlaceholderText('Your answer')).toBeDisabled();
    });

    it('unlocks and forgets when the server says a new round began', () => {
      window.localStorage.setItem('submitted_ABCD', 'true');
      renderPage({resetCount: 1});
      expect(screen.getByPlaceholderText('Your answer')).toBeEnabled();
      expect(window.localStorage.getItem('submitted_ABCD')).toBeNull();
    });

    it('shows saving and starting progress', () => {
      renderPage({addEntryLoading: true, isLoading: true, entries: [answer('1', 'A', 'Ann')]});
      expect(screen.getByText('Saving...')).toBeInTheDocument();
      expect(screen.getByText('Starting...')).toBeInTheDocument();
    });

    it('cannot start without answers', () => {
      renderPage();
      expect(screen.getByText('Start')).toBeDisabled();
    });

    it('asks everyone is ready before it starts', () => {
      const actions = renderPage({entries: [answer('1', 'A', 'Ann')]});
      fireEvent.click(screen.getByText('Start'));
      expect(actions.setShowStartConfirm).toHaveBeenCalledWith(true);
    });
  });

  describe('start confirmation', () => {
    it('starts the game on yes', () => {
      const actions = renderPage({showStartConfirm: true});
      const dialog = screen.getByRole('alertdialog');
      expect(within(dialog).getByText('Is everyone ready?')).toBeInTheDocument();
      fireEvent.click(within(dialog).getByText('Yes, Start Game!'));
      expect(actions.setShowStartConfirm).toHaveBeenCalledWith(false);
      expect(actions.startGame).toHaveBeenCalled();
    });

    it('closes without starting on "not yet" or a tap outside', () => {
      const actions = renderPage({showStartConfirm: true});
      fireEvent.click(screen.getByText('Wait, Not Yet'));
      fireEvent.click(document.querySelector('.overlay')!);
      expect(actions.setShowStartConfirm).toHaveBeenCalledTimes(2);
      expect(actions.startGame).not.toHaveBeenCalled();
    });
  });

  describe('during play', () => {
    it('says it is my turn and who has not been guessed', () => {
      renderPage(playing({guessedNames: [], notGuessedNames: ['Ann', 'Ben']}));
      expect(screen.getByText('Your turn')).toBeInTheDocument();
      expect(screen.getByText("Ann's turn!")).toBeInTheDocument();
      expect(screen.getByText('No one yet')).toBeInTheDocument();
      expect(screen.getByText('Ann, Ben')).toBeInTheDocument();
      expect(screen.getByText('Players left').nextSibling).toHaveTextContent('2');
    });

    it('says whose turn it is when it is not mine', () => {
      renderPage(playing({isMyTurn: false, currentPlayer: 'Ben'}));
      expect(screen.getByText('Now guessing')).toBeInTheDocument();
      expect(screen.getByText("Ben's turn!")).toBeInTheDocument();
    });

    it('lets me tap an answer written by someone else', () => {
      const actions = renderPage(playing());
      fireEvent.click(screen.getByRole('button', {name: /Theirs/}));
      expect(actions.onEntryClick).toHaveBeenCalledWith(expect.objectContaining({entryId: '2'}));
    });

    it('does not let me guess my own answer while others remain', () => {
      renderPage(playing());
      expect(screen.getByRole('button', {name: /Mine/})).toBeDisabled();
    });

    it('lets me guess my own answer when it is the last one', () => {
      renderPage(playing({isLastEntry: true}));
      expect(screen.getByRole('button', {name: /Mine/})).toBeEnabled();
    });

    it('disables every answer when it is not my turn', () => {
      renderPage(playing({isMyTurn: false, currentPlayer: 'Ben'}));
      expect(screen.getByRole('button', {name: /Theirs/})).toBeDisabled();
    });

    it('shows who wrote an answer once it has been guessed', () => {
      const guessed = answer('2', 'Theirs', 'Ben', {guessed: true});
      renderPage(playing({
        entries: [answer('1', 'Mine', 'Ann'), guessed], sortedEntriesForDisplay: [answer('1', 'Mine', 'Ann'), guessed],
        guessedNames: ['Ben'],
      }));
      const button = screen.getByRole('button', {name: /Theirs/});
      expect(button).toBeDisabled();
      expect(within(button).getByText('Ben')).toBeInTheDocument();
    });

    it('announces when the round is over', () => {
      renderPage(playing({turnOrder: [], currentPlayer: null, allGuessed: true, isMyTurn: false}));
      expect(screen.getByText('Round over')).toBeInTheDocument();
      expect(screen.getByText('All answers guessed!')).toBeInTheDocument();
    });
  });

  describe('guessing', () => {
    const guessing = (overrides: object = {}) => playing({guessingEntry: answer('2', 'Theirs', 'Ben'), ...overrides});

    it('asks who wrote the answer and sends the pick', () => {
      const actions = renderPage(guessing());
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Who wrote this?')).toBeInTheDocument();
      expect(within(dialog).getByText('“Theirs”')).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', {name: 'Ben'}));
      expect(actions.guessAuthor).toHaveBeenCalledWith('2', 'Ben');
    });

    it('rules out people who have already been fully guessed', () => {
      renderPage(guessing({entries: [answer('1', 'Mine', 'Ann', {guessed: true}), answer('2', 'Theirs', 'Ben')]}));
      expect(within(screen.getByRole('dialog')).getByRole('button', {name: 'Ann'})).toBeDisabled();
      expect(within(screen.getByRole('dialog')).getByRole('button', {name: 'Ben'})).toBeEnabled();
    });

    it('locks the choices while a guess is in flight', () => {
      renderPage(guessing({guessLoading: true}));
      expect(screen.getByText('Guessing...')).toBeInTheDocument();
      expect(within(screen.getByRole('dialog')).getByRole('button', {name: 'Ben'})).toBeDisabled();
    });

    it('closes on cancel', () => {
      const actions = renderPage(guessing());
      fireEvent.click(screen.getByText('Cancel'));
      expect(actions.setGuessingEntry).toHaveBeenCalledWith(null);
    });
  });

  describe('next round', () => {
    it('appears only once everything is guessed, and needs a question', () => {
      renderPage({...playing({allGuessed: true, newQuestion: '   '})});
      expect(screen.getByText('Start New Round')).toBeDisabled();
    });

    it('starts a round with the question typed', () => {
      const actions = renderPage(playing({allGuessed: true, newQuestion: 'Best pizza?'}));
      const input = screen.getByLabelText('New question');
      expect(input).toBeInTheDocument();
      fireEvent.change(input, {target: {value: 'Best pizza topping?'}});
      expect(actions.setNewQuestion).toHaveBeenCalledWith('Best pizza topping?');
      fireEvent.click(screen.getByText('Start New Round'));
      expect(actions.startNewRound).toHaveBeenCalled();
    });

    it('is hidden while answers remain', () => {
      renderPage(playing());
      expect(screen.queryByText('Start New Round')).not.toBeInTheDocument();
    });
  });

  describe('scoreboard, help and toast', () => {
    it('has no scoreboard until someone scores', () => {
      renderPage();
      expect(screen.queryByText(/scoreboard/i)).not.toBeInTheDocument();
    });

    it('toggles the scoreboard', () => {
      const actions = renderPage({scores: [{playerName: 'Ann', score: 2}]});
      fireEvent.click(screen.getByText('Show scoreboard'));
      expect(actions.setShowScores).toHaveBeenCalledWith(expect.any(Function));
      expect(actions.setShowScores.mock.calls[0][0](false)).toBe(true);
    });

    it('lists the scores when it is open', () => {
      renderPage({scores: [{playerName: 'Ann', score: 2}], showScores: true});
      expect(screen.getByText('Hide scoreboard')).toBeInTheDocument();
      expect(screen.getByText('Ann')).toBeInTheDocument();
    });

    it('toggles how to play and shows it when open', () => {
      const actions = renderPage({showHowToPlay: true});
      expect(screen.getByRole('button', {name: 'Hide how to play'})).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText(/secretly writes an answer/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', {name: 'Hide how to play'}));
      expect(actions.setShowHowToPlay.mock.calls[0][0](true)).toBe(false);
    });

    it('shows the toast', () => {
      renderPage({toast: {message: 'Entry added!', type: 'success'}});
      expect(screen.getByRole('status')).toHaveTextContent('Entry added!');
    });
  });
});
