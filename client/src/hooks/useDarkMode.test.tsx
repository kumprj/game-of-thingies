import {act, renderHook} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {useDarkMode} from './useDarkMode';

const systemPrefersDark = (dark: boolean) => (window.matchMedia as any).mockImplementation((query: string) => ({
  matches: dark && query === '(prefers-color-scheme: dark)',
  media: query,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
}));

describe('useDarkMode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark-mode');
    systemPrefersDark(false);
  });

  it('follows the system when nothing is saved', () => {
    systemPrefersDark(true);
    const {result} = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(true);
    expect(document.documentElement).toHaveClass('dark-mode');
  });

  it('is light when the system is and nothing is saved', () => {
    const {result} = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(false);
    expect(document.documentElement).not.toHaveClass('dark-mode');
  });

  it('prefers the saved choice over the system', () => {
    systemPrefersDark(true);
    window.localStorage.setItem('theme', 'light');
    expect(renderHook(() => useDarkMode()).result.current.isDark).toBe(false);
    window.localStorage.setItem('theme', 'dark');
    systemPrefersDark(false);
    expect(renderHook(() => useDarkMode()).result.current.isDark).toBe(true);
  });

  it('toggles, saving the choice and the class on <html>', () => {
    const {result} = renderHook(() => useDarkMode());
    act(() => result.current.toggleTheme());
    expect(result.current.isDark).toBe(true);
    expect(window.localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement).toHaveClass('dark-mode');

    act(() => result.current.toggleTheme());
    expect(result.current.isDark).toBe(false);
    expect(window.localStorage.getItem('theme')).toBe('light');
    expect(document.documentElement).not.toHaveClass('dark-mode');
  });
});
