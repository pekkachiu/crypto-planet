import { describe, it, expect } from 'vitest';
import { detectTheme, THEMES } from '../src/ui/theme.js';

describe('detectTheme', () => {
  it('有記住的選擇就用它', () => {
    expect(detectTheme({ stored: 'night', hour: 12 })).toBe('night');
    expect(detectTheme({ stored: 'day', hour: 23 })).toBe('day');
  });
  it('否則依當地時間：6 點到 18 點前是白天', () => {
    expect(detectTheme({ stored: null, hour: 6 })).toBe('day');
    expect(detectTheme({ stored: null, hour: 17 })).toBe('day');
    expect(detectTheme({ stored: null, hour: 18 })).toBe('night');
    expect(detectTheme({ stored: null, hour: 2 })).toBe('night');
  });
  it('無效的儲存值會被忽略', () => {
    expect(detectTheme({ stored: 'dusk', hour: 12 })).toBe('day');
    expect(THEMES).toEqual(['day', 'night']);
  });
});
