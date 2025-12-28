// src/StartGamePage.test.tsx
import {render, screen, fireEvent} from '@testing-library/react';
import {describe, it, expect, vi} from 'vitest';
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

  it('calls addEntry when button is clicked', () => {
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
    fireEvent.click(button);

    expect(addEntryMock).toHaveBeenCalled();
  });
});
