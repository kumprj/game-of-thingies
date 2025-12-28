// src/setupTests.ts
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Canvas Confetti (it crashes in test environments)
vi.mock('canvas-confetti', () => ({
  default: vi.fn(),
}));

// Mock ScrollIntoView (used by some browser logic)
window.HTMLElement.prototype.scrollIntoView = vi.fn();
