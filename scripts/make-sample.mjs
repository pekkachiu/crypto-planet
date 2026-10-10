// 用即時 API 產生一份範例資料，給離線或 API 失敗時使用：node scripts/make-sample.mjs
import { writeFile } from 'node:fs/promises';
import { loadTopCoins } from '../src/data/api.js';

const result = await loadTopCoins();
if (result.source !== 'live') {
  console.error(`抓取失敗，未更新範例資料：${result.error}`);
  process.exit(1);
}
const out = new URL('../src/data/sample.json', import.meta.url);
await writeFile(out, `${JSON.stringify({ updatedAt: result.updatedAt, coins: result.coins }, null, 1)}\n`);
console.log(`已寫入 ${result.coins.length} 個幣種：${result.coins.map((c) => c.symbol).join(', ')}`);

const { loadLiquidations } = await import('../src/data/okx-liquidations.js');
const liqs = await loadLiquidations(result.coins);
if (liqs.source !== 'okx') {
  console.error(`OKX 爆倉抓取失敗，未更新範例：${liqs.error}`);
  process.exit(1);
}
const { source, error, ...liqSample } = liqs;
await writeFile(new URL('../src/data/sample-liquidations.json', import.meta.url), `${JSON.stringify(liqSample, null, 1)}\n`);
console.log(`爆倉範例：多 $${Math.round(liqs.long).toLocaleString()}、空 $${Math.round(liqs.short).toLocaleString()}`);
