import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it} from 'vitest';
import TopBar from './TopBar';

describe('TopBar', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark-mode');
  });

  it('shows what it is given next to the theme toggle', () => {
    render(<TopBar><a href="/">‹ Home</a></TopBar>);
    expect(screen.getByRole('link', {name: '‹ Home'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Toggle Dark Mode'})).toBeInTheDocument();
  });

  it('shows the title when provided', () => {
    render(<TopBar title="My Game" />);
    expect(screen.getByText('My Game')).toBeInTheDocument();
  });

  it('works with nothing to show', () => {
    render(<TopBar/>);
    expect(screen.getByRole('button', {name: 'Toggle Dark Mode'})).toBeInTheDocument();
  });

  it('switches the theme and says what the next click does', async () => {
    const user = userEvent.setup();
    render(<TopBar/>);
    const toggle = screen.getByRole('button', {name: 'Toggle Dark Mode'});
    expect(toggle).toHaveAttribute('title', 'Switch to Dark Mode');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('title', 'Switch to Light Mode');
    expect(document.documentElement).toHaveClass('dark-mode');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('title', 'Switch to Dark Mode');
    expect(document.documentElement).not.toHaveClass('dark-mode');
  });

  it('toggles sound on and off and persists to localStorage', async () => {
    const user = userEvent.setup();
    render(<TopBar/>);
    const soundToggle = screen.getByRole('button', {name: 'Mute Sound'});
    expect(soundToggle).toBeInTheDocument();
    expect(soundToggle).toHaveAttribute('title', 'Mute Sound');

    await user.click(soundToggle);
    expect(screen.getByRole('button', {name: 'Enable Sound'})).toBeInTheDocument();
    expect(window.localStorage.getItem('got_sound_enabled')).toBe('false');

    await user.click(screen.getByRole('button', {name: 'Enable Sound'}));
    expect(screen.getByRole('button', {name: 'Mute Sound'})).toBeInTheDocument();
    expect(window.localStorage.getItem('got_sound_enabled')).toBe('true');
  });

  it('respects existing disabled sound setting on mount', () => {
    window.localStorage.setItem('got_sound_enabled', 'false');
    render(<TopBar/>);
    expect(screen.getByRole('button', {name: 'Enable Sound'})).toBeInTheDocument();
  });
});
