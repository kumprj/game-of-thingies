// src/hooks/useGameLogic.test.tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useGameLogic } from './useGameLogic';
import axios from '../gameConfig'; // Import the axios instance we created

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

  it('startGame triggers the start endpoint', async () => {
    // We need entries to be able to start
    (axios.get as any).mockResolvedValue({ data: [{ entryId: '1', text: 'A' }] });

    const { result } = renderHook(() => useGameLogic());

    await waitFor(() => expect(result.current.entries.length).toBe(1));

    await act(async () => {
      await result.current.startGame();
    });

    expect(axios.post).toHaveBeenCalledWith('/api/games/test-room-1/start');
  });
});
