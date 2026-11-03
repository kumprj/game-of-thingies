import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {isSoundEnabled, setSoundEnabled, playCorrectSound, playTurnSound, playWrongSound, _resetAudioContextForTesting} from './audio';

describe('audio feedback', () => {
  beforeEach(() => {
    window.localStorage.clear();
    _resetAudioContextForTesting();
    delete (window as any).AudioContext;
  });

  afterEach(() => {
    _resetAudioContextForTesting();
  });

  it('defaults to sound enabled', () => {
    expect(isSoundEnabled()).toBe(true);
  });

  it('persists enabled and disabled state', () => {
    setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    expect(window.localStorage.getItem('got_sound_enabled')).toBe('false');

    setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
    expect(window.localStorage.getItem('got_sound_enabled')).toBe('true');
  });

  it('does not throw when AudioContext is missing in test environment', () => {
    expect(() => playCorrectSound()).not.toThrow();
    expect(() => playTurnSound()).not.toThrow();
    expect(() => playWrongSound()).not.toThrow();
  });

  it('creates oscillators and gain nodes when AudioContext is supported', () => {
    const start = vi.fn();
    const stop = vi.fn();
    const connect = vi.fn();
    const setValueAtTime = vi.fn();
    const exponentialRampToValueAtTime = vi.fn();
    const linearRampToValueAtTime = vi.fn();

    class MockAudioContext {
      currentTime = 10;
      state = 'running';
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      createOscillator() {
        return {
          type: 'sine',
          frequency: {setValueAtTime, linearRampToValueAtTime},
          connect,
          start,
          stop
        };
      }
      createGain() {
        return {
          gain: {setValueAtTime, exponentialRampToValueAtTime},
          connect
        };
      }
    }

    (window as any).AudioContext = MockAudioContext;

    setSoundEnabled(true);
    playCorrectSound();
    expect(start).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();

    playTurnSound();
    expect(start).toHaveBeenCalledTimes(3); // 2 from correct chime, 1 from turn chime

    playWrongSound();
    expect(start).toHaveBeenCalledTimes(4);

    // Muted sound skips AudioContext calls
    setSoundEnabled(false);
    playCorrectSound();
    expect(start).toHaveBeenCalledTimes(4); // No new calls
  });
});
