/**
 * 恐懼貪婪星的配置（純邏輯，不依賴 Three.js）：儀表刻度角度與雲量。
 */
export const MAX_CLOUDS = 16;
const CALM_CLOUDS = 6;

/** 儀表的五段刻度，分界與 moodLevel 一致（綠漲紅跌：恐懼紅、貪婪綠） */
export const GAUGE_BANDS = Object.freeze([
  { from: 0, to: 25, level: 'extremeFear', color: '#ea3943' },
  { from: 25, to: 46, level: 'fear', color: '#f08a4b' },
  { from: 46, to: 54, level: 'neutral', color: '#f2c14e' },
  { from: 54, to: 75, level: 'greed', color: '#9fd356' },
  { from: 75, to: 100, level: 'extremeGreed', color: '#16c784' },
].map(Object.freeze));

/** 分數 → 半圓儀表上的角度（弧度）：0 分在左邊 π、100 分在右邊 0 */
export function gaugeAngle(value) {
  const v = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 50;
  return Math.PI * (1 - v / 100);
}

/** 天氣強度 → 雲朵數與顏色深淺（0 白雲～1 烏雲） */
export function cloudPlan({ rain, sun }) {
  if (rain > 0) {
    return { count: Math.round(CALM_CLOUDS + (MAX_CLOUDS - CALM_CLOUDS) * rain), darkness: rain };
  }
  return { count: Math.round(CALM_CLOUDS * (1 - sun)), darkness: 0 };
}

/** 恐懼貪婪星的大氣光暈顏色：跟儀表刻度同色，未知等級用中性的黃色 */
export function moodColor(level) {
  return (GAUGE_BANDS.find((b) => b.level === level) ?? GAUGE_BANDS[2]).color;
}
