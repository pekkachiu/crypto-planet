# 加密星球小鎮（Crypto Planet Town）

把加密貨幣市場畫成一個太陽系：每個分類一顆星球，每個幣種是星球上的一間店。

- **店面大小**：市值
- **路人數量**：24 小時成交額
- **門口右側隊伍（綠）**：24 小時主動買入金額（Taker Buy）
- **門口左側隊伍（紅）**：24 小時主動賣出金額
- **叫號速度**：24 小時成交筆數
- **顏色**：綠漲紅跌

第一版開放「主流星」：排除穩定幣與包裝幣後，在 Binance 有 USDT 交易對的市值前十大。迷因、AI、公鏈、ETF 星球即將開放。

## 資料來源

瀏覽器直接呼叫公開 API，每 60 秒更新。僅供視覺化參考，非投資建議。

- [CoinGecko](https://www.coingecko.com/)：市值、價格、24 小時漲跌
- [Binance](https://data-api.binance.vision/)：用 1 小時 K 線加總出 24 小時成交額、主動買入量、成交筆數

API 失敗時改用 `src/data/sample.json` 範例資料（用 `node scripts/make-sample.mjs` 更新）。

## 開發

```bash
npm install
npm run dev        # 本機開發
npm test           # 單元測試
npm run coverage   # 單元測試＋覆蓋率（門檻 80%）
npm run e2e        # Playwright 端對端測試（桌機＋手機）
npm run build      # 輸出到 dist/
```

## 技術

Three.js（WebGL）、Vite、Vitest、Playwright。部署在 GitHub Pages：push 到 main 後由 GitHub Actions 自動測試並部署。

## 結構

```
src/
├── data/     資料抓取、整理、換算成畫面參數（純邏輯，有單元測試）
├── sim/      人潮模擬、球面幾何、亂數（純邏輯，有單元測試）
├── kit/      3D 素材：店面、招牌、方塊小人
├── scenes/   太陽系、星球小鎮、鏡頭飛行
└── ui/       介面與格式化
```
