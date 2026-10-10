/**
 * 太陽系裡的星球。enabled 的星球可以飛進去看小鎮；其他先顯示「即將開放」。
 * radius 為 null 表示依該分類總市值計算。
 */
export const PLANETS = Object.freeze([
  { id: 'major', name: '主流星', subtitle: '市值前十大', color: '#4cc2ff', enabled: true, orbit: 62, speed: 0.035, phase: 0.6, radius: null },
  { id: 'meme', name: '迷因星', subtitle: '迷因幣・即將開放', color: '#ff6ad5', enabled: false, orbit: 98, speed: 0.026, phase: 2.5, radius: 9 },
  { id: 'ai', name: 'AI 星', subtitle: 'AI 幣・即將開放', color: '#8b6cff', enabled: false, orbit: 128, speed: 0.02, phase: 4.2, radius: 8 },
  { id: 'layer1', name: '公鏈星', subtitle: 'Layer 1・即將開放', color: '#3dd6b0', enabled: false, orbit: 158, speed: 0.016, phase: 5.4, radius: 10 },
  { id: 'etf', name: 'ETF 星', subtitle: '加密貨幣 ETF・即將開放', color: '#f2c14e', enabled: false, orbit: 192, speed: 0.012, phase: 1.3, radius: 11 },
].map(Object.freeze));

export function orbitPosition(planet, t) {
  const angle = planet.phase + planet.speed * t;
  return { x: Math.cos(angle) * planet.orbit, z: Math.sin(angle) * planet.orbit };
}

export function findPlanet(id) {
  return PLANETS.find((p) => p.id === id);
}
