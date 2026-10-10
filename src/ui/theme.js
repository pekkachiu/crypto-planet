export const THEMES = Object.freeze(['day', 'night']);
export const THEME_STORAGE_KEY = 'crypto-planet:theme';
const DAY_START = 6;
const NIGHT_START = 18;

/** 有記住的選擇就用它；否則依當地時間，6 點到 18 點前是白天 */
export function detectTheme({ stored, hour }) {
  if (THEMES.includes(stored)) return stored;
  return hour >= DAY_START && hour < NIGHT_START ? 'day' : 'night';
}
