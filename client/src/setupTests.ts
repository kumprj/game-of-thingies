// src/setupTests.ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Canvas Confetti (it crashes in test environments)
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

// Mock ScrollIntoView (used by some browser logic)
window.HTMLElement.prototype.scrollIntoView = vi.fn();

// jsdom has no matchMedia (used by useDarkMode); report no media query matches
window.matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
