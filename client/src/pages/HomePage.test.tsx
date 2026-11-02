import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MemoryRouter, Route, Routes, useParams} from 'react-router-dom';
import axios from 'axios';
import HomePage from './HomePage';

vi.mock('axios', () => ({default: {post: vi.fn(), defaults: {}}}));

function Game() {
  return <p>In game {useParams().gameId}</p>;
}

function renderHome() {
  return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage/>}/>
          <Route path="/:gameId" element={<Game/>}/>
        </Routes>
      </MemoryRouter>
  );
}

const title = () => screen.getByPlaceholderText('Enter a title for your game');
const question = () => screen.getByPlaceholderText('What question would you like to ask?');
const code = () => screen.getByPlaceholderText('Enter 4-letter game code');
const create = () => screen.getByRole('button', {name: /create game|creating/i});
const join = () => screen.getByRole('button', {name: 'Join Game'});

describe('HomePage', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('creating a game', () => {
    it('needs both a title and a question', async () => {
      const user = userEvent.setup();
      renderHome();
      expect(create()).toBeDisabled();
      await user.type(title(), 'Friday night');
      expect(create()).toBeDisabled();
      await user.type(question(), '   ');
      expect(create()).toBeDisabled();
      await user.clear(question());
      await user.type(question(), 'Worst superpower?');
      expect(create()).toBeEnabled();
    });

    it('sends the trimmed title and question, then opens the new game', async () => {
      (axios.post as any).mockResolvedValueOnce({data: {gameId: 'ABCD'}});
      const user = userEvent.setup();
      renderHome();
      await user.type(title(), '  Friday night ');
      await user.type(question(), ' Worst superpower? ');
      await user.click(create());
      expect(axios.post).toHaveBeenCalledWith('/api/createGame',
          {name: 'Friday night', question: 'Worst superpower?'});
      expect(await screen.findByText('In game ABCD')).toBeInTheDocument();
    });

    it('locks the form while it creates', async () => {
      let finish!: (value: object) => void;
      (axios.post as any).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
      const user = userEvent.setup();
      renderHome();
      await user.type(title(), 'Friday night');
      await user.type(question(), 'Worst superpower?');
      await user.click(create());
      expect(screen.getByText('Creating...')).toBeInTheDocument();
      expect(title()).toBeDisabled();
      expect(join()).toBeDisabled();
      finish({data: {gameId: 'ABCD'}});
      await screen.findByText('In game ABCD');
    });

    it('limits the title and question to the server\'s lengths', () => {
      renderHome();
      expect(title()).toHaveAttribute('maxLength', '50');
      expect(question()).toHaveAttribute('maxLength', '200');
    });

    it('shows the server\'s message when it rejects the game', async () => {
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      (axios.post as any).mockRejectedValueOnce({response: {data: {error: 'Title is required'}}});
      const user = userEvent.setup();
      renderHome();
      await user.type(title(), 'Friday night');
      await user.type(question(), 'Worst superpower?');
      await user.click(create());
      await waitFor(() => expect(alert).toHaveBeenCalledWith('Title is required'));
    });

    it('tells the host when it fails and lets them try again', async () => {
      const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      (axios.post as any).mockRejectedValueOnce(new Error('offline'));
      const user = userEvent.setup();
      renderHome();
      await user.type(title(), 'Friday night');
      await user.type(question(), 'Worst superpower?');
      await user.click(create());
      await waitFor(() => expect(alert).toHaveBeenCalledWith('Failed to create game. Please try again.'));
      expect(screen.queryByText(/In game/)).not.toBeInTheDocument();
      expect(create()).toBeEnabled();
    });
  });

  describe('joining a game', () => {
    it('upper-cases the code and stops at four letters', async () => {
      const user = userEvent.setup();
      renderHome();
      await user.type(code(), 'abcdef');
      expect(code()).toHaveValue('ABCD');
    });

    it.each(['AB', 'AB12', '1234'])('will not join with "%s"', async (text) => {
      const user = userEvent.setup();
      renderHome();
      await user.type(code(), text);
      expect(join()).toBeDisabled();
    });

    it('opens the game once the code is four letters', async () => {
      const user = userEvent.setup();
      renderHome();
      await user.type(code(), 'wxyz');
      expect(join()).toBeEnabled();
      await user.click(join());
      expect(await screen.findByText('In game WXYZ')).toBeInTheDocument();
      expect(axios.post).not.toHaveBeenCalled();
    });
  });
});
