/**
 * 抓 SoSoValue 的 ETF 資料，寫成網站要讀的 JSON。
 *   SOSOVALUE_API_KEY=... node scripts/fetch-etf.mjs [輸出路徑，預設 public/data/etf.json]
 * 本機測試可把 Key 放在已被 .gitignore 排除的 .env.local，用 node --env-file=.env.local 執行。
 * 只 import 專案自己的模組、不載入任何 npm 套件，Key 不會經過第三方程式碼。
 * 不論成功失敗都不會印出 Key。
 *   node scripts/fetch-etf.mjs --validate <路徑>   只檢查既有的 etf.json 格式（部署沿用舊檔前使用）
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fetchEtfDataset } from '../src/data/etf-fetch.js';
import { validateEtfDataset } from '../src/data/etf.js';

if (process.argv[2] === '--validate') {
  try {
    if (!validateEtfDataset(JSON.parse(await readFile(process.argv[3], 'utf8')))) throw new Error('格式不正確');
    console.log(`[etf] ${process.argv[3]} 格式正確`);
  } catch (err) {
    console.error(`[etf] 檢查失敗：${err.message}`);
    process.exit(1);
  }
  process.exit(0);
}

const out = resolve(process.argv[2] ?? 'public/data/etf.json');

try {
  const dataset = await fetchEtfDataset({ apiKey: process.env.SOSOVALUE_API_KEY });
  if (!validateEtfDataset(dataset)) throw new Error('抓到的資料沒有通過格式檢查');
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(dataset)}\n`);
  const counts = Object.fromEntries(dataset.assets.map((a) => [a.asset, a.fundCount]));
  console.log(`[etf] 已寫入 ${out}：各幣種 ETF 檔數 ${JSON.stringify(counts)}，資料日期 ${dataset.asOf}`);
} catch (err) {
  console.error(`[etf] 失敗：${err.message}`);
  process.exit(1);
}
