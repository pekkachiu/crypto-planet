/**
 * 太陽系裡的星球。enabled 的星球可以飛進去看小鎮；其他先顯示「即將開放」。ETF 星要等 etf.json 載入成功才解鎖。
 * radius 為 null 表示依該分類總市值計算。名稱與副標在 i18n：planet.{id}.name / .subtitle
 */
export const PLANETS = Object.freeze([
  { id: 'major', color: '#4cc2ff', enabled: true, orbit: 62, speed: 0.035, phase: 0.6, radius: null },
  { id: 'meme', color: '#ff6ad5', enabled: false, orbit: 98, speed: 0.026, phase: 2.5, radius: 9 },
  { id: 'ai', color: '#8b6cff', enabled: false, orbit: 128, speed: 0.02, phase: 4.2, radius: 8 },
  { id: 'layer1', color: '#3dd6b0', enabled: false, orbit: 158, speed: 0.016, phase: 5.4, radius: 10 },
  { id: 'etf', color: '#f2c14e', enabled: true, orbit: 192, speed: 0.012, phase: 1.3, radius: 11 },
].map(Object.freeze));

export function orbitPosition(planet, t) {
  const angle = planet.phase + planet.speed * t;
  return { x: Math.cos(angle) * planet.orbit, z: Math.sin(angle) * planet.orbit };
}

export function findPlanet(id) {
  return PLANETS.find((p) => p.id === id);
}

export const planetNameKey = (planet) => `planet.${planet.id}.name`;
export const planetSubtitleKey = (planet) => `planet.${planet.id}.subtitle`;
