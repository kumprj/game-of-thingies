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
});
